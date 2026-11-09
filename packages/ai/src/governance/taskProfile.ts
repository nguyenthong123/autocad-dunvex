// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { Id } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";
import { rulesFingerprintFor } from "./rulesStore";
import { refreshSourceProtection } from "./sourceProtection";
import type { TaskProfile, TaskScope } from "./types";

export const RULES_CHANGED_MESSAGE =
    "PLAN_INVALIDATED: Design rules changed since this plan was approved. Prior plan rights are revoked. Re-read the document and call propose_task_plan again for the needed scope.";

let activeProfile: TaskProfile | undefined;

/**
 * Nodes the agent created in the current browser session, keyed by document id.
 * These are exempt from foreign-node absorption into the protected snapshot, but they do
 * NOT grant modify/delete/consume rights on protected sources after a profile is invalidated
 * or the document changes — that requires an active approved profile (`isTaskOwned`).
 */
const agentCreatedByDocument = new Map<string, Set<string>>();

/**
 * Approve a task plan from a trusted UI path only. Model tools must never call this.
 * Self-grant fields inside a plan object are ignored — only the listed id sets matter.
 */
export function approveTaskPlan(
    input: Partial<TaskScope> & {
        documentId?: string;
        goal?: string;
        criteria?: import("./verification/types").CriterionSpec[];
    },
    doc?: IDocument,
): TaskProfile {
    const active = doc ?? getDocument();
    if (!active) {
        throw new Error("Cannot approve a task plan without an open document");
    }
    // Never grant against a substituted document when the caller bound a specific id.
    if (input.documentId !== undefined && input.documentId !== active.id) {
        throw new Error(
            `DOCUMENT_MISMATCH: Cannot approve plan for document "${input.documentId}" while "${active.id}" is open.`,
        );
    }
    refreshSourceProtection(active);
    // Always snapshot current ObjectStorage contents (other tabs may have written).
    const rulesFingerprint = input.rulesFingerprint ?? rulesFingerprintFor(active.id);
    const profile: TaskProfile = {
        taskId: input.taskId ?? Id.generate(),
        documentId: active.id,
        goal: input.goal,
        allowedModifiedNodeIds: unique(input.allowedModifiedNodeIds),
        allowedDeletedNodeIds: unique(input.allowedDeletedNodeIds),
        allowedConsumedNodeIds: unique(input.allowedConsumedNodeIds),
        allowedTreeNodeIds: unique(input.allowedTreeNodeIds),
        allowMaterialLibrary: Boolean(input.allowMaterialLibrary),
        allowDocumentVariables: Boolean(input.allowDocumentVariables),
        approvedAtMark: markIdentity(active.history.undoTop()),
        rulesFingerprint,
        status: "active",
        taskOwnedNodeIds: [],
        preTaskUndoTop: active.history.undoTop(),
        taskHistoryRecords: [],
        interleaved: false,
        criteria: input.criteria?.length ? [...input.criteria] : undefined,
        executedRepairs: 0,
        isRepairExecuting: false,
    };
    activeProfile = profile;
    return profile;
}

/** Raw profile including invalidated ones (for UI / diagnostics). */
export function getTaskProfile(): TaskProfile | undefined {
    return activeProfile;
}

/**
 * Active approved profile for the current document only.
 * Document mismatch or rules-content drift auto-invalidates; invalidated profiles never grant rights.
 */
export function getActiveTaskProfile(doc?: IDocument): TaskProfile | undefined {
    if (!activeProfile) return undefined;
    if (activeProfile.status !== "active") return undefined;

    const active = doc ?? getDocument();
    if (!active || active.id !== activeProfile.documentId) {
        invalidateTaskProfile(
            `DOCUMENT_CHANGED: Task plan was approved for document "${activeProfile.documentId}" but the active document is "${active?.id ?? "none"}".`,
        );
        return undefined;
    }
    if (detectRulesDrift(active)) {
        return undefined;
    }
    return activeProfile;
}

/**
 * Re-read effective rules from ObjectStorage and compare to the fingerprint stored at approval.
 * When rules changed (including same-length Markdown or other-tab writes), revoke rights.
 */
export function detectRulesDrift(doc?: IDocument): boolean {
    if (!activeProfile || activeProfile.status !== "active") return false;
    const documentId = activeProfile.documentId;
    const expected = activeProfile.rulesFingerprint;
    if (!expected) {
        // Legacy / incomplete profiles without a snapshot cannot keep write rights.
        invalidateTaskProfile(RULES_CHANGED_MESSAGE);
        return true;
    }
    const active = doc ?? getDocument();
    if (active && active.id !== documentId) {
        // Document mismatch is handled by getActiveTaskProfile; do not treat as rules drift here.
        return false;
    }
    const current = rulesFingerprintFor(documentId);
    if (current !== expected) {
        invalidateTaskProfile(RULES_CHANGED_MESSAGE);
        return true;
    }
    return false;
}

export function clearTaskProfile(): void {
    activeProfile = undefined;
}

export function invalidateTaskProfile(reason: string): void {
    if (!activeProfile) return;
    if (activeProfile.status === "invalidated" && activeProfile.haltReason === reason) return;
    activeProfile = {
        ...activeProfile,
        status: "invalidated",
        haltReason: reason,
    };
}

/**
 * Record nodes created by the agent. Always tracks absorb-exemption; task-owned rights
 * are recorded only while an active approved profile matches the document.
 */
export function recordTaskOwnedNodes(nodeIds: string[], doc?: IDocument): void {
    const active = doc ?? getDocument();
    if (!active) return;

    const created = agentCreatedByDocument.get(active.id) ?? new Set<string>();
    for (const id of nodeIds) {
        if (id) created.add(id);
    }
    agentCreatedByDocument.set(active.id, created);

    const profile = getActiveTaskProfile(active);
    if (!profile) return;

    const owned = new Set(profile.taskOwnedNodeIds);
    for (const id of nodeIds) {
        if (id) owned.add(id);
    }
    profile.taskOwnedNodeIds = [...owned];
}

export function getAgentCreatedNodeIds(doc?: IDocument): ReadonlySet<string> {
    const active = doc ?? getDocument();
    if (!active) return new Set();
    return agentCreatedByDocument.get(active.id) ?? new Set();
}

/**
 * Task-owned rights only while the profile is active, approved, and bound to this document.
 * Invalidated plans and document switches never grant via this path.
 */
export function isTaskOwned(nodeId: string, doc?: IDocument): boolean {
    const profile = getActiveTaskProfile(doc);
    return Boolean(profile?.taskOwnedNodeIds.includes(nodeId));
}

export function markTaskInterleaved(reason: string): void {
    if (!activeProfile || activeProfile.status !== "active") return;
    const message = `${reason} Re-read the document and call propose_task_plan again for the needed scope.`;
    activeProfile = {
        ...activeProfile,
        status: "invalidated",
        interleaved: true,
        haltReason: message,
    };
}

export function recordTaskHistoryEntry(record: IHistoryRecord | object | undefined, doc?: IDocument): void {
    const profile = getActiveTaskProfile(doc);
    if (!profile || !record) return;
    profile.taskHistoryRecords.push(record);
}

/** Whether `nodeId` may receive the given impact under the active plan / ownership. */
export function isNodeAllowed(
    nodeId: string,
    kind: "modify" | "delete" | "consume" | "tree",
    doc?: IDocument,
): boolean {
    if (isTaskOwned(nodeId, doc)) return true;
    const profile = getActiveTaskProfile(doc);
    if (!profile) return false;
    switch (kind) {
        case "modify":
            return profile.allowedModifiedNodeIds.includes(nodeId);
        case "delete":
            return profile.allowedDeletedNodeIds.includes(nodeId);
        case "consume":
            return (
                profile.allowedConsumedNodeIds.includes(nodeId) ||
                profile.allowedDeletedNodeIds.includes(nodeId)
            );
        case "tree":
            return (
                profile.allowedTreeNodeIds.includes(nodeId) || profile.allowedModifiedNodeIds.includes(nodeId)
            );
    }
}

function unique(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).filter(Boolean))];
}

function markIdentity(mark: IHistoryRecord | undefined): string | undefined {
    if (!mark) return undefined;
    return `${mark.name}:${Object.prototype.toString.call(mark)}`;
}

/** Test helper. */
export function resetTaskProfileForTests(): void {
    activeProfile = undefined;
    agentCreatedByDocument.clear();
}
