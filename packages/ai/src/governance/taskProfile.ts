// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { Id } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";
import { refreshSourceProtection } from "./sourceProtection";
import type { TaskProfile, TaskScope } from "./types";

let activeProfile: TaskProfile | undefined;

/**
 * Approve a task plan from a trusted UI path. Model payloads and Markdown never call this.
 * Self-grant fields inside a plan object are ignored — only the listed id sets matter.
 */
export function approveTaskPlan(
    input: Partial<TaskScope> & { documentId?: string; goal?: string },
    doc?: IDocument,
): TaskProfile {
    const active = doc ?? getDocument();
    if (!active) {
        throw new Error("Cannot approve a task plan without an open document");
    }
    refreshSourceProtection(active);
    const profile: TaskProfile = {
        taskId: input.taskId ?? Id.generate(),
        documentId: input.documentId ?? active.id,
        goal: input.goal,
        allowedModifiedNodeIds: unique(input.allowedModifiedNodeIds),
        allowedDeletedNodeIds: unique(input.allowedDeletedNodeIds),
        allowedConsumedNodeIds: unique(input.allowedConsumedNodeIds),
        allowedTreeNodeIds: unique(input.allowedTreeNodeIds),
        allowMaterialLibrary: Boolean(input.allowMaterialLibrary),
        allowDocumentVariables: Boolean(input.allowDocumentVariables),
        approvedAtMark: markIdentity(active.history.undoTop()),
        status: "active",
        taskOwnedNodeIds: [],
        preTaskUndoTop: active.history.undoTop(),
        taskHistoryRecords: [],
        interleaved: false,
    };
    activeProfile = profile;
    return profile;
}

export function getActiveTaskProfile(): TaskProfile | undefined {
    return activeProfile;
}

export function clearTaskProfile(): void {
    activeProfile = undefined;
}

export function invalidateTaskProfile(reason: string): void {
    if (!activeProfile) return;
    activeProfile = {
        ...activeProfile,
        status: "invalidated",
        haltReason: reason,
    };
}

export function recordTaskOwnedNodes(nodeIds: string[]): void {
    if (!activeProfile || activeProfile.status !== "active") {
        // Still track ownership under a synthetic ambient task so agent-created
        // geometry can be edited without a formal plan, without unlocking sources.
        ensureAmbientProfile();
    }
    if (!activeProfile) return;
    const owned = new Set(activeProfile.taskOwnedNodeIds);
    for (const id of nodeIds) {
        if (id) owned.add(id);
    }
    activeProfile = { ...activeProfile, taskOwnedNodeIds: [...owned] };
}

export function isTaskOwned(nodeId: string): boolean {
    return Boolean(activeProfile?.taskOwnedNodeIds.includes(nodeId));
}

export function markTaskInterleaved(reason: string): void {
    if (!activeProfile) return;
    activeProfile = {
        ...activeProfile,
        interleaved: true,
        haltReason: reason,
    };
}

export function recordTaskHistoryEntry(record: IHistoryRecord | object | undefined): void {
    if (!activeProfile || !record || activeProfile.status !== "active") return;
    activeProfile = {
        ...activeProfile,
        taskHistoryRecords: [...activeProfile.taskHistoryRecords, record],
    };
}

/** Whether `nodeId` may receive the given impact under the active plan / ownership. */
export function isNodeAllowed(nodeId: string, kind: "modify" | "delete" | "consume" | "tree"): boolean {
    if (isTaskOwned(nodeId)) return true;
    const profile = activeProfile;
    if (!profile || profile.status !== "active") return false;
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

function ensureAmbientProfile(): void {
    if (activeProfile) return;
    const doc = getDocument();
    if (!doc) return;
    activeProfile = {
        taskId: `ambient-${doc.id}`,
        documentId: doc.id,
        allowedModifiedNodeIds: [],
        allowedDeletedNodeIds: [],
        allowedConsumedNodeIds: [],
        allowedTreeNodeIds: [],
        status: "active",
        taskOwnedNodeIds: [],
        preTaskUndoTop: doc.history.undoTop(),
        taskHistoryRecords: [],
        interleaved: false,
    };
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
}
