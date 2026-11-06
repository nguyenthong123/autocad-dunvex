// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { queryCapabilities } from "../tools/capabilities.generated";
import { EDIT_METHODS, lookupSessionRefNodeId, normalizeOpArgs } from "../tools/capabilityEngine";
import { resolveCommandKey, SAFE_DIRECT_COMMANDS } from "../tools/commandTools";
import { findNode, getDocument } from "../tools/documentContext";
import { collectSubtreeIds } from "./sourceProtection";
import type { NodeImpact, ToolImpact } from "./types";

const MUTATE_QUERY_METHODS = new Set(
    queryCapabilities.filter((cap) => cap.returnKind === "mutate").map((cap) => cap.method),
);

const QUERY_METHODS = new Set(queryCapabilities.map((cap) => cap.method));

const READ_TOOLS = new Set([
    "get_document_state",
    "get_selection",
    "get_node_properties",
    "get_ribbon",
    "list_materials",
    "get_material",
    "capture_screenshot",
    "capture_views",
    "bom_report",
    "classify_material",
    "load_skill",
    "ask_user",
    "propose_task_plan",
    "plan_array",
    "export_runtime_error_reports",
    "list_runtime_errors",
    "get_session_memory",
    "select_nodes",
    "fit_content",
    "click_view",
    "set_camera",
    "document_variables", // list action handled specially
]);

const CREATE_ONLY_PROGRAM_METHODS = new Set([
    "box",
    "cylinder",
    "cone",
    "sphere",
    "pyramid",
    "rect",
    "circle",
    "line",
    "arc",
    "wire",
    "face",
    "shell",
    "solid",
    "text",
    "transformedMul",
    "prism",
    "revolve",
    "sweep",
    "loft",
    "pipe",
]);

/**
 * Analyze the write impact of a tool call after self-approval stripping.
 * For run_program, walks ops in order so batch create-then-reference is supported.
 */
export function analyzeToolImpact(
    toolName: string,
    args: Record<string, unknown>,
    doc?: IDocument,
): ToolImpact {
    const active = doc ?? getDocument();

    if (toolName === "run_program") {
        return analyzeRunProgram(args, active);
    }
    if (toolName === "run_parametric") {
        return analyzeRunParametric(args, active);
    }
    if (toolName === "delete_node") {
        return analyzeNodeIds(toolName, [String(args["id"] ?? "")], "delete", active);
    }
    if (toolName === "transform_node" || toolName === "set_node_properties" || toolName === "set_material") {
        return analyzeNodeIds(toolName, [String(args["id"] ?? "")], "modify", active);
    }
    if (toolName === "set_node_visible") {
        // Visibility is observational; treat as modify of tree presentation when protected.
        return analyzeNodeIds(toolName, [String(args["id"] ?? "")], "modify", active);
    }
    if (toolName === "move_nodes") {
        const ids = asStringArray(args["nodeIds"]);
        return analyzeNodeIds(toolName, ids, "tree", active);
    }
    if (toolName === "create_folder") {
        const parentId = args["parentId"];
        const nodeIds = asStringArray(args["nodeIds"]);
        if (typeof parentId === "string" && parentId) {
            return analyzeNodeIds(toolName, [parentId, ...nodeIds], "tree", active);
        }
        if (nodeIds.length > 0) {
            return analyzeNodeIds(toolName, nodeIds, "tree", active);
        }
        return { toolName, impacts: [], creates: true, kind: "create" };
    }
    if (toolName === "apply_array") {
        const sourceId = String(args["sourceNodeId"] ?? args["nodeId"] ?? "");
        // Array reads source geometry; does not modify the source itself.
        if (!sourceId) {
            return {
                toolName,
                impacts: [],
                kind: "indeterminate",
                indeterminateReason: "apply_array missing sourceNodeId",
            };
        }
        return { toolName, impacts: [], creates: true, kind: "create" };
    }
    if (toolName === "set_material_properties") {
        return {
            toolName,
            impacts: [],
            kind: "material_library",
        };
    }
    if (toolName === "document_variables") {
        const action = String(args["action"] ?? "list");
        if (action === "list") {
            return { toolName, impacts: [], kind: "read" };
        }
        return { toolName, impacts: [], kind: "document_variable" };
    }
    if (toolName === "undo") {
        return { toolName, impacts: [], kind: "undo" };
    }
    if (toolName === "redo") {
        return { toolName, impacts: [], kind: "redo" };
    }
    if (toolName === "run_command") {
        return analyzeRunCommand(args);
    }
    if (toolName === "new_document") {
        return { toolName, impacts: [], kind: "create", creates: true };
    }
    if (
        READ_TOOLS.has(toolName) ||
        toolName.startsWith("get_") ||
        toolName.startsWith("list_") ||
        toolName.startsWith("measure_") ||
        toolName.startsWith("export_") ||
        toolName.startsWith("clear_") ||
        toolName.startsWith("load_")
    ) {
        return { toolName, impacts: [], kind: "read" };
    }

    // Unknown tools default to read/allow in Batch B. New write surfaces must be
    // classified explicitly before they can mutate under the gate.
    return { toolName, impacts: [], kind: "read" };
}

function analyzeRunCommand(args: Record<string, unknown>): ToolImpact {
    const raw = String(args["command"] ?? args["commandKey"] ?? "");
    const commandKey = resolveCommandKey(raw);
    if (!raw.trim()) {
        return {
            toolName: "run_command",
            impacts: [],
            kind: "indeterminate",
            indeterminateReason: "run_command missing command",
            commandKey,
        };
    }
    // Dialog / interactive / duplicate commands are handled inside the tool; gate only
    // needs to know whether a mutating safe command is in the supported set.
    if (
        commandKey === "measure.bom" ||
        commandKey === "app.manual" ||
        commandKey === "edit.undo" ||
        commandKey === "edit.redo" ||
        commandKey === "modify.deleteNode" ||
        commandKey === "doc.save"
    ) {
        return { toolName: "run_command", impacts: [], kind: "read", commandKey };
    }
    if (!SAFE_DIRECT_COMMANDS.has(commandKey)) {
        return {
            toolName: "run_command",
            impacts: [],
            kind: "indeterminate",
            indeterminateReason: `Command "${commandKey}" is interactive or unsupported for governed async write`,
            commandKey,
        };
    }
    return { toolName: "run_command", impacts: [], kind: "command", commandKey };
}

function analyzeRunProgram(args: Record<string, unknown>, doc: IDocument | undefined): ToolImpact {
    const ops = args["ops"];
    if (!Array.isArray(ops)) {
        return {
            toolName: "run_program",
            impacts: [],
            kind: "indeterminate",
            indeterminateReason: "run_program ops must be an array",
        };
    }

    const batchCreated = new Set<string>();
    const impacts: NodeImpact[] = [];
    let creates = false;

    for (const rawOp of ops) {
        if (!rawOp || typeof rawOp !== "object") {
            return {
                toolName: "run_program",
                impacts,
                kind: "indeterminate",
                indeterminateReason: "run_program contains a non-object op",
            };
        }
        const op = rawOp as Record<string, unknown>;
        const method = String(op["method"] ?? "");
        if (!method) {
            return {
                toolName: "run_program",
                impacts,
                kind: "indeterminate",
                indeterminateReason: "run_program op missing method",
            };
        }

        const rawArgs = (op["args"] as Record<string, unknown>) ?? {};
        const normalized = normalizeOpArgs({ method, args: rawArgs });
        const opId = typeof op["id"] === "string" ? op["id"] : undefined;

        // Mutation queries (curve.reverse, trimmedCurve.setTrim, …): capability metadata,
        // not "method contains a dot". Resolve the source node and require modify rights.
        if (MUTATE_QUERY_METHODS.has(method)) {
            const targetRef = queryTargetRef(op, rawArgs);
            if (!targetRef) {
                return {
                    toolName: "run_program",
                    impacts,
                    creates,
                    kind: "indeterminate",
                    indeterminateReason: `Mutation query "${method}" requires a target ref`,
                };
            }
            const resolved = resolveImpactRef(targetRef, doc, batchCreated);
            if (resolved === "indeterminate") {
                return {
                    toolName: "run_program",
                    impacts,
                    creates,
                    kind: "indeterminate",
                    indeterminateReason: `Cannot resolve mutation target "${targetRef}" for "${method}"`,
                };
            }
            if (resolved !== "batch") {
                impacts.push({ nodeId: resolved, kind: "modify", batchCreated: false });
            }
            if (opId) batchCreated.add(opId);
            continue;
        }

        // Non-mutating query ops: register result ids only.
        if (QUERY_METHODS.has(method)) {
            if (opId) batchCreated.add(opId);
            continue;
        }

        if (CREATE_ONLY_PROGRAM_METHODS.has(method) && !EDIT_METHODS.has(method)) {
            creates = true;
            if (opId) batchCreated.add(opId);
            // Derive ops may reference existing shapes without consuming them.
            const readRefs = collectShapeRefs(method, normalized);
            for (const ref of readRefs) {
                const resolved = resolveImpactRef(ref, doc, batchCreated);
                if (resolved === "indeterminate") {
                    return {
                        toolName: "run_program",
                        impacts,
                        creates,
                        kind: "indeterminate",
                        indeterminateReason: `Cannot resolve ref "${ref}" for op "${method}"`,
                    };
                }
            }
            continue;
        }

        if (EDIT_METHODS.has(method)) {
            const refs = collectShapeRefs(method, normalized);
            if (refs.length === 0) {
                return {
                    toolName: "run_program",
                    impacts,
                    creates,
                    kind: "indeterminate",
                    indeterminateReason: `Edit op "${method}" has no resolvable shape targets`,
                };
            }
            for (const ref of refs) {
                const resolved = resolveImpactRef(ref, doc, batchCreated);
                if (resolved === "indeterminate") {
                    return {
                        toolName: "run_program",
                        impacts,
                        creates,
                        kind: "indeterminate",
                        indeterminateReason: `Cannot resolve ref "${ref}" for consume op "${method}"`,
                    };
                }
                if (resolved === "batch") continue;
                impacts.push({ nodeId: resolved, kind: "consume", batchCreated: false });
            }
            creates = true;
            if (opId) batchCreated.add(opId);
            continue;
        }

        // Unknown method family — fail closed rather than guess.
        return {
            toolName: "run_program",
            impacts,
            creates,
            kind: "indeterminate",
            indeterminateReason: `Op "${method}" impact is not classified for Batch B`,
        };
    }

    return {
        toolName: "run_program",
        impacts,
        creates,
        kind: creates && impacts.length === 0 ? "create" : undefined,
    };
}

function analyzeRunParametric(args: Record<string, unknown>, doc: IDocument | undefined): ToolImpact {
    const ops = args["ops"];
    if (!Array.isArray(ops)) {
        return {
            toolName: "run_parametric",
            impacts: [],
            kind: "indeterminate",
            indeterminateReason: "run_parametric ops must be an array",
        };
    }

    const batchCreated = new Set<string>();
    const impacts: NodeImpact[] = [];
    let creates = false;

    for (const rawOp of ops) {
        if (!rawOp || typeof rawOp !== "object") {
            return {
                toolName: "run_parametric",
                impacts,
                kind: "indeterminate",
                indeterminateReason: "run_parametric contains a non-object op",
            };
        }
        const op = rawOp as Record<string, unknown>;
        const kind = String(op["op"] ?? "");
        const opId = typeof op["id"] === "string" ? op["id"] : undefined;

        if (
            kind === "sketch" ||
            kind === "extrude" ||
            kind === "revolve" ||
            kind === "fillet" ||
            kind === "chamfer"
        ) {
            creates = true;
            if (opId) batchCreated.add(opId);
            const body = op["body"] ?? op["sketch"];
            if (typeof body === "string" && body) {
                const resolved = resolveImpactRef(body, doc, batchCreated);
                if (resolved === "indeterminate") {
                    return {
                        toolName: "run_parametric",
                        impacts,
                        creates,
                        kind: "indeterminate",
                        indeterminateReason: `Cannot resolve parametric ref "${body}"`,
                    };
                }
                if (
                    resolved !== "batch" &&
                    (kind === "fillet" || kind === "chamfer" || kind === "extrude" || kind === "revolve")
                ) {
                    // Feature edits / builds on an existing body modify that body.
                    if (kind === "fillet" || kind === "chamfer") {
                        impacts.push({ nodeId: resolved, kind: "modify" });
                    }
                }
            }
            continue;
        }

        if (kind === "boolean") {
            const body = String(op["body"] ?? "");
            const tools = asStringArray(op["tools"]);
            for (const ref of [body, ...tools].filter(Boolean)) {
                const resolved = resolveImpactRef(ref, doc, batchCreated);
                if (resolved === "indeterminate") {
                    return {
                        toolName: "run_parametric",
                        impacts,
                        creates,
                        kind: "indeterminate",
                        indeterminateReason: `Cannot resolve boolean ref "${ref}"`,
                    };
                }
                if (resolved === "batch") continue;
                impacts.push({
                    nodeId: resolved,
                    kind: tools.includes(ref) || ref !== body ? "consume" : "modify",
                });
            }
            // tools are consumed; body is modified.
            if (body) {
                const bodyResolved = resolveImpactRef(body, doc, batchCreated);
                if (bodyResolved !== "indeterminate" && bodyResolved !== "batch") {
                    // Ensure body is modify, tools consume (re-tag).
                    for (const impact of impacts) {
                        if (impact.nodeId === bodyResolved) impact.kind = "modify";
                    }
                    for (const toolRef of tools) {
                        const t = resolveImpactRef(toolRef, doc, batchCreated);
                        if (t !== "indeterminate" && t !== "batch") {
                            impacts.push({ nodeId: t, kind: "consume" });
                        }
                    }
                }
            }
            creates = true;
            if (opId) batchCreated.add(opId);
            continue;
        }

        if (kind === "editFeature" || kind === "features") {
            const body = String(op["body"] ?? "");
            if (!body) {
                return {
                    toolName: "run_parametric",
                    impacts,
                    kind: "indeterminate",
                    indeterminateReason: `${kind} missing body`,
                };
            }
            const resolved = resolveImpactRef(body, doc, batchCreated);
            if (resolved === "indeterminate") {
                return {
                    toolName: "run_parametric",
                    impacts,
                    kind: "indeterminate",
                    indeterminateReason: `Cannot resolve body "${body}"`,
                };
            }
            if (resolved !== "batch") {
                impacts.push({ nodeId: resolved, kind: "modify" });
            }
            continue;
        }

        return {
            toolName: "run_parametric",
            impacts,
            creates,
            kind: "indeterminate",
            indeterminateReason: `Parametric op "${kind}" is not classified for Batch B`,
        };
    }

    return { toolName: "run_parametric", impacts, creates };
}

function analyzeNodeIds(
    toolName: string,
    ids: string[],
    kind: NodeImpact["kind"],
    doc: IDocument | undefined,
): ToolImpact {
    const impacts: NodeImpact[] = [];
    for (const id of ids) {
        if (!id) {
            return {
                toolName,
                impacts,
                kind: "indeterminate",
                indeterminateReason: `${toolName} missing target id`,
            };
        }
        if (!doc) {
            // No document — let the tool return its own no-document error.
            return { toolName, impacts: [], kind: "read" };
        }
        const node = findNode(doc, id);
        if (!node) {
            // Missing targets are not protected sources; handler reports not-found.
            continue;
        }
        const subtree = kind === "delete" || kind === "tree" ? collectSubtreeIds(node) : [node.id];
        for (const nodeId of subtree) {
            impacts.push({ nodeId, kind });
        }
    }
    return { toolName, impacts, kind };
}

function collectShapeRefs(method: string, args: Record<string, unknown>): string[] {
    const keys: string[] = [];
    if (method === "booleanCut" || method === "booleanFuse" || method === "booleanCommon") {
        keys.push("shape1", "shape2");
    } else if (
        method === "fillet" ||
        method === "chamfer" ||
        method === "fillet2d" ||
        method === "chamfer2d" ||
        method === "makeThickSolidByJoin" ||
        method === "makeThickSolidBySimple" ||
        method === "pushPull" ||
        method === "removeFeature" ||
        method === "removeFillet" ||
        method === "removeSubShape" ||
        method === "replaceSubShapes" ||
        method === "simplifyShape"
    ) {
        keys.push("shape");
    } else if (method === "prism" || method === "transformedMul") {
        keys.push("shape");
    } else if (method === "revolve") {
        keys.push("profile");
    } else {
        keys.push("shape", "shape1", "shape2", "profile", "wire", "shells");
    }

    const refs: string[] = [];
    for (const key of keys) {
        const value = args[key];
        if (typeof value === "string" && value) refs.push(value);
        else if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === "string" && item) refs.push(item);
            }
        }
    }
    return refs;
}

function resolveImpactRef(
    ref: string,
    doc: IDocument | undefined,
    batchCreated: Set<string>,
): string | "batch" | "indeterminate" {
    if (batchCreated.has(ref)) return "batch";
    // Sub-ref of a batch op (e.g. face0 from findSubShapes) — treat parent batch id as local.
    const hash = ref.indexOf("#");
    if (hash > 0 && batchCreated.has(ref.slice(0, hash))) return "batch";

    if (!doc) return "indeterminate";

    const sessionNodeId = lookupSessionRefNodeId(doc, ref);
    if (sessionNodeId) {
        if (batchCreated.has(sessionNodeId)) return "batch";
        return sessionNodeId;
    }

    const node = findNode(doc, ref);
    if (node) return node.id;

    return "indeterminate";
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/** Target of a query op: top-level `target`, else common arg aliases used by the engine. */
function queryTargetRef(op: Record<string, unknown>, args: Record<string, unknown>): string | undefined {
    const candidates = [op["target"], args["target"], args["shape"], args["nodeId"], args["body"]];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
    }
    return undefined;
}
