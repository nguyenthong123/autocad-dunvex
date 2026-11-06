// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";
import {
    getActiveTaskProfile,
    getTaskProfile,
    markTaskInterleaved,
    recordTaskHistoryEntry,
} from "./taskProfile";
import type { PermissionDecision } from "./types";

export const INTERLEAVE_MESSAGE =
    "PLAN_INVALIDATED: Detected interleaved edits, new dependencies, or an uncertain history state. Prior plan rights are revoked. Re-read the document and call propose_task_plan again for the needed scope.";

/**
 * After a governed mutating tool commits, record the new history top if it advanced.
 */
export function noteGovernedMutation(doc?: IDocument): void {
    const active = doc ?? getDocument();
    const profile = getActiveTaskProfile(active);
    if (!active || !profile || profile.interleaved) return;

    const top = active.history.undoTop();
    if (!top) return;

    const records = profile.taskHistoryRecords as IHistoryRecord[];
    if (records.length > 0 && records[records.length - 1] === top) return;

    recordTaskHistoryEntry(top, active);
}

/**
 * Detect user interleaving: history top drifted from the task's contiguous chain
 * (or from preTaskUndoTop before the first agent write). Invalidates the plan so
 * subsequent writes cannot use the old rights.
 */
export function detectInterleaving(doc?: IDocument): boolean {
    const active = doc ?? getDocument();
    const profile = getTaskProfile();
    if (!active || !profile || profile.status !== "active") return Boolean(profile?.interleaved);
    if (profile.documentId !== active.id) {
        markTaskInterleaved(
            `DOCUMENT_CHANGED: Plan was for "${profile.documentId}" but active document is "${active.id}".`,
        );
        return true;
    }
    if (profile.interleaved) return true;

    const top = active.history.undoTop();
    const records = profile.taskHistoryRecords as IHistoryRecord[];
    if (records.length === 0) {
        if (top !== profile.preTaskUndoTop) {
            markTaskInterleaved(INTERLEAVE_MESSAGE);
            return true;
        }
        return false;
    }

    const last = records[records.length - 1];
    if (top !== last) {
        markTaskInterleaved(INTERLEAVE_MESSAGE);
        return true;
    }
    return false;
}

/**
 * Undo only the contiguous non-conflicting task sequence at the history top.
 * Halts when interleaved, uncertain, or new dependencies are suspected.
 */
export function undoActiveTask(doc?: IDocument): PermissionDecision & { undone: number } {
    const active = doc ?? getDocument();
    if (!active) {
        return {
            allowed: false,
            code: "UNDO_TASK_HALTED",
            message: "UNDO_TASK_HALTED: No open document.",
            undone: 0,
        };
    }

    if (detectInterleaving(active)) {
        const halted = getTaskProfile();
        return {
            allowed: false,
            code: "PLAN_INVALIDATED",
            message: halted?.haltReason ?? INTERLEAVE_MESSAGE,
            undone: 0,
        };
    }

    const profile = getActiveTaskProfile(active);
    if (!profile || profile.taskHistoryRecords.length === 0) {
        return {
            allowed: false,
            code: "UNDO_TASK_HALTED",
            message: "UNDO_TASK_HALTED: No contiguous task history to undo.",
            undone: 0,
        };
    }

    const records = [...(profile.taskHistoryRecords as IHistoryRecord[])];
    let undone = 0;

    while (records.length > 0) {
        const expected = records[records.length - 1];
        const top = active.history.undoTop();
        if (top !== expected) {
            markTaskInterleaved(INTERLEAVE_MESSAGE);
            return {
                allowed: false,
                code: "PLAN_INVALIDATED",
                message: INTERLEAVE_MESSAGE,
                undone,
            };
        }
        active.history.undo();
        records.pop();
        undone += 1;
    }

    profile.taskHistoryRecords.length = 0;
    active.visual.update();

    return {
        allowed: true,
        code: "ALLOWED",
        message: `Undid ${undone} contiguous task change(s).`,
        undone,
    };
}

/**
 * Single-step agent `undo` tool: only allowed when the top record belongs to the task
 * (or there is no active task tracking).
 */
export function checkAgentUndoAllowed(doc?: IDocument): PermissionDecision {
    const active = doc ?? getDocument();
    if (!active) {
        return { allowed: true, code: "ALLOWED", message: "ok" };
    }
    if (detectInterleaving(active)) {
        const halted = getTaskProfile();
        return {
            allowed: false,
            code: "PLAN_INVALIDATED",
            message: halted?.haltReason ?? INTERLEAVE_MESSAGE,
        };
    }
    const profile = getActiveTaskProfile(active);
    if (!profile || profile.taskHistoryRecords.length === 0) {
        return { allowed: true, code: "ALLOWED", message: "ok" };
    }
    const top = active.history.undoTop();
    const last = profile.taskHistoryRecords[profile.taskHistoryRecords.length - 1];
    if (top !== last) {
        markTaskInterleaved(INTERLEAVE_MESSAGE);
        return { allowed: false, code: "PLAN_INVALIDATED", message: INTERLEAVE_MESSAGE };
    }
    return { allowed: true, code: "ALLOWED", message: "ok" };
}
