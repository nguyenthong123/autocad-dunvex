// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";
import { analyzeToolImpact } from "./impactAnalysis";
import { stripSelfApproval } from "./selfApproval";
import { absorbForeignNodes, ensureSourceProtection, isSourceProtected } from "./sourceProtection";
import { getActiveTaskProfile, isNodeAllowed, isTaskOwned } from "./taskProfile";
import type { PermissionDecision, ToolImpact } from "./types";

/**
 * Check write permission after normalize/resolve (via impact analysis), immediately before mutation.
 * Model self-approval fields are stripped and ignored.
 */
export function checkToolPermission(
    toolName: string,
    args: Record<string, unknown>,
    doc?: IDocument,
): { decision: PermissionDecision; impact: ToolImpact; cleanArgs: Record<string, unknown> } {
    const cleanArgs = stripSelfApproval(args);
    const active = ensureSourceProtection(doc ?? getDocument());
    const profile = getActiveTaskProfile();
    absorbForeignNodes(profile?.taskOwnedNodeIds ?? [], active);
    const impact = analyzeToolImpact(toolName, cleanArgs, active);

    if (
        impact.kind === "read" ||
        (impact.impacts.length === 0 && impact.creates && !impact.indeterminateReason)
    ) {
        return {
            decision: { allowed: true, code: "ALLOWED", message: "ok" },
            impact,
            cleanArgs,
        };
    }

    if (impact.kind === "indeterminate" || impact.indeterminateReason) {
        return {
            decision: {
                allowed: false,
                code: "INDETERMINATE_IMPACT_BLOCKED",
                message: `INDETERMINATE_IMPACT_BLOCKED: ${impact.indeterminateReason ?? "Cannot determine full write impact"}. Specify concrete node ids before writing.`,
            },
            impact,
            cleanArgs,
        };
    }

    if (impact.kind === "undo" || impact.kind === "redo") {
        // Contiguous undo/redo is enforced in undoTask + governed router.
        return {
            decision: { allowed: true, code: "ALLOWED", message: "ok" },
            impact,
            cleanArgs,
        };
    }

    if (impact.kind === "command") {
        return {
            decision: { allowed: true, code: "ALLOWED", message: "ok" },
            impact,
            cleanArgs,
        };
    }

    if (impact.kind === "material_library") {
        const profile = getActiveTaskProfile();
        if (profile?.status === "active" && profile.allowMaterialLibrary) {
            return {
                decision: { allowed: true, code: "ALLOWED", message: "ok" },
                impact,
                cleanArgs,
            };
        }
        return {
            decision: {
                allowed: false,
                code: "PERMISSION_DENIED",
                message:
                    "PERMISSION_DENIED: Editing the document material library requires an approved plan with allowMaterialLibrary.",
            },
            impact,
            cleanArgs,
        };
    }

    if (impact.kind === "document_variable") {
        const profile = getActiveTaskProfile();
        if (profile?.status === "active" && profile.allowDocumentVariables) {
            return {
                decision: { allowed: true, code: "ALLOWED", message: "ok" },
                impact,
                cleanArgs,
            };
        }
        return {
            decision: {
                allowed: false,
                code: "PERMISSION_DENIED",
                message:
                    "PERMISSION_DENIED: Creating or removing document variables requires an approved plan with allowDocumentVariables. Listing variables is always allowed.",
            },
            impact,
            cleanArgs,
        };
    }

    const denied: string[] = [];
    for (const item of impact.impacts) {
        if (item.batchCreated || isTaskOwned(item.nodeId)) continue;
        if (!isSourceProtected(item.nodeId, active)) continue;

        const kind =
            item.kind === "consume"
                ? "consume"
                : item.kind === "delete"
                  ? "delete"
                  : item.kind === "tree"
                    ? "tree"
                    : "modify";

        if (!isNodeAllowed(item.nodeId, kind)) {
            denied.push(item.nodeId);
        }
    }

    if (denied.length > 0) {
        const uniqueDenied = [...new Set(denied)];
        return {
            decision: {
                allowed: false,
                code: "PERMISSION_DENIED",
                message: `PERMISSION_DENIED: Source node(s) ${uniqueDenied.map((id) => `"${id}"`).join(", ")} are protected. Modify/delete/consume requires rights recorded from a user-approved plan (model/Markdown cannot self-grant).`,
                deniedNodeIds: uniqueDenied,
            },
            impact,
            cleanArgs,
        };
    }

    return {
        decision: { allowed: true, code: "ALLOWED", message: "ok" },
        impact,
        cleanArgs,
    };
}

export function permissionDeniedPayload(decision: PermissionDecision): string {
    return JSON.stringify({
        error: decision.message,
        code: decision.code,
        deniedNodeIds: decision.deniedNodeIds,
        governance: "TASK-40-batch-B",
    });
}
