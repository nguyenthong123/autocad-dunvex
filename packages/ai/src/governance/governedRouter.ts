// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Tool, ToolResult } from "../llm/types";
import { getDocument } from "../tools/documentContext";
import { analyzeToolImpact } from "./impactAnalysis";
import { checkToolPermission, permissionDeniedPayload } from "./permissionGate";
import { ensureSourceProtection } from "./sourceProtection";
import { getActiveTaskProfile, recordTaskOwnedNodes } from "./taskProfile";
import { checkAgentUndoAllowed, detectInterleaving, noteGovernedMutation } from "./undoTask";
import { invalidateAllTaskEvidence, invalidateEvidenceForNodeIds } from "./verification";

const WRITE_TOOLS = new Set([
    "run_program",
    "run_parametric",
    "apply_array",
    "delete_node",
    "transform_node",
    "set_node_properties",
    "set_material",
    "move_nodes",
    "create_folder",
    "set_node_visible",
    "set_material_properties",
    "document_variables",
    "run_command",
    "undo",
    "new_document",
]);

/**
 * Common execution control path for ChatPanel and bridge.
 * Wraps every tool handler so both surfaces share the same permission gate.
 */
export function governTools(tools: Tool[]): Tool[] {
    return tools.map(governTool);
}

export function governTool(tool: Tool): Tool {
    const inner = tool.handler;
    return {
        ...tool,
        handler: async (args, signal) => {
            ensureSourceProtection(getDocument());
            detectInterleaving(getDocument());

            const { decision, cleanArgs } = checkToolPermission(tool.name, args ?? {});

            if (tool.name === "undo") {
                const undoCheck = checkAgentUndoAllowed(getDocument());
                if (!undoCheck.allowed) {
                    return permissionDeniedPayload(undoCheck);
                }
            }

            if (!decision.allowed) {
                return permissionDeniedPayload(decision);
            }

            const result = await inner(cleanArgs, signal);
            if (WRITE_TOOLS.has(tool.name)) {
                afterSuccessfulWrite(tool.name, cleanArgs, result);
            }
            return result;
        },
    };
}

/** Test-only seam: exercise post-success bookkeeping without re-running the permission gate. */
export function applySuccessfulWriteForTests(
    toolName: string,
    args: Record<string, unknown>,
    resultText: string,
): void {
    afterSuccessfulWrite(toolName, args, resultText);
}

function afterSuccessfulWrite(
    toolName: string,
    cleanArgs: Record<string, unknown>,
    result: string | ToolResult,
): void {
    const text = typeof result === "string" ? result : result.content;
    if (looksLikeError(text)) return;

    const createdIds = extractCreatedNodeIds(text);
    if (createdIds.length > 0) {
        recordTaskOwnedNodes(createdIds);
    }

    if (toolName === "undo") {
        const profile = getActiveTaskProfile();
        if (profile && profile.taskHistoryRecords.length > 0) {
            profile.taskHistoryRecords.pop();
        }
        // Undo rewinds document geometry as a whole: every recorded criterion result of the
        // task is stale — re-run the checks after redo/repair before claiming completion.
        if (profile) {
            invalidateAllTaskEvidence(
                profile.taskId,
                "undo đã tua hình học — bằng chứng cũ không còn hiệu lực",
            );
        }
        return;
    }

    // Any write touching geometry invalidates evidence bound to the affected
    // subjects, so an old pass can never stand in for an unmeasured new state.
    const affected = affectedNodeIds(toolName, cleanArgs);
    if (affected === null) {
        // Reviewer C1 follow-up: when the impacted subjects cannot be determined,
        // invalidate CONSERVATIVELY — the whole task's evidence, not nothing.
        const profile = getActiveTaskProfile();
        if (profile) {
            invalidateAllTaskEvidence(
                profile.taskId,
                `${toolName}: không xác định được đối tượng bị ảnh hưởng — vô hiệu hóa bảo thủ toàn bộ bằng chứng task`,
            );
        }
    } else {
        invalidateEvidenceForNodeIds(affected, `${toolName} changed the geometry`);
    }

    noteGovernedMutation(getDocument());
}

/**
 * Node ids a successful write modified/deleted/consumed/moved (create excluded — nothing
 * to invalidate yet). `null` means impact could not be determined — the caller must then
 * invalidate conservatively (Reviewer 08/11: unknown subjects must not leave old passes standing).
 */
function affectedNodeIds(toolName: string, cleanArgs: Record<string, unknown>): string[] | null {
    try {
        const impact = analyzeToolImpact(toolName, cleanArgs);
        if (impact.kind === "indeterminate" || impact.kind === "document_variable") {
            // Impact analysed but deliberately unspecified — the affected subjects are
            // unknown by design, so the conservative rule applies.
            return null;
        }
        return impact.impacts
            .filter((i) => !i.batchCreated)
            .map((i) => i.nodeId)
            .filter((id) => typeof id === "string" && id.length > 0);
    } catch {
        return null;
    }
}

function looksLikeError(text: string): boolean {
    try {
        const parsed = JSON.parse(text) as { error?: unknown; success?: boolean; code?: string };
        if (typeof parsed.error === "string") return true;
        if (parsed.success === false) return true;
        if (typeof parsed.code === "string" && parsed.code !== "ALLOWED" && parsed.code.endsWith("_DENIED")) {
            return true;
        }
    } catch {
        // non-JSON success payloads are fine
    }
    return false;
}

function extractCreatedNodeIds(text: string): string[] {
    try {
        const parsed = JSON.parse(text) as {
            created?: Array<{ nodeId?: string; id?: string }>;
            id?: string;
            nodes?: Array<{ id?: string; nodeId?: string }>;
        };
        const ids: string[] = [];
        if (Array.isArray(parsed.created)) {
            for (const row of parsed.created) {
                if (row?.nodeId) ids.push(row.nodeId);
            }
        }
        if (typeof parsed.id === "string") ids.push(parsed.id);
        if (Array.isArray(parsed.nodes)) {
            for (const row of parsed.nodes) {
                if (row?.nodeId) ids.push(row.nodeId);
                else if (row?.id) ids.push(row.id);
            }
        }
        return ids;
    } catch {
        return [];
    }
}
