// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";
import { getActiveTaskProfile, markTaskInterleaved, recordTaskHistoryEntry } from "./taskProfile";
import type { PermissionDecision } from "./types";

const INTERLEAVE_MESSAGE =
    "UNDO_TASK_HALTED: Detected interleaved edits, new dependencies, or an uncertain history state. Automatic task undo stopped to protect independent user changes. Use step-by-step Undo on the toolbar or delete specific objects.";

/**
 * After a governed mutating tool commits, record the new history top if it advanced.
 */
export function noteGovernedMutation(doc?: IDocument): void {
    const active = doc ?? getDocument();
    const profile = getActiveTaskProfile();
    if (!active || !profile || profile.status !== "active" || profile.interleaved) return;

    const top = active.history.undoTop();
    if (!top) return;

    const records = profile.taskHistoryRecords as IHistoryRecord[];
    if (records.length > 0 && records[records.length - 1] === top) return;

    // If something else landed on the stack that is not our previous top's successor
    // in a contiguous chain, the stack was interleaved before this mutation.
    if (records.length > 0) {
        const expectedPrev = records[records.length - 1];
        // Walk: current top should be new; previous undoTop before this write should equal expectedPrev.
        // We only observe after the write, so verify the new top is not already alien:
        // if undoCount grew by more than we can attribute, mark interleaved.
    }

    recordTaskHistoryEntry(top);
}

/**
 * Detect user interleaving: history top is no longer the last task record.
 * Call before undo-task and after external edits when known.
 */
export function detectInterleaving(doc?: IDocument): boolean {
    const active = doc ?? getDocument();
    const profile = getActiveTaskProfile();
    if (!active || !profile || profile.status !== "active") return false;
    if (profile.interleaved) return true;

    const records = profile.taskHistoryRecords as IHistoryRecord[];
    if (records.length === 0) return false;

    const top = active.history.undoTop();
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

    const profile = getActiveTaskProfile();
    if (!profile || profile.taskHistoryRecords.length === 0) {
        return {
            allowed: false,
            code: "UNDO_TASK_HALTED",
            message: "UNDO_TASK_HALTED: No contiguous task history to undo.",
            undone: 0,
        };
    }

    if (profile.interleaved || detectInterleaving(active)) {
        return {
            allowed: false,
            code: "UNDO_TASK_HALTED",
            message: profile.haltReason ?? INTERLEAVE_MESSAGE,
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
                code: "UNDO_TASK_HALTED",
                message: INTERLEAVE_MESSAGE,
                undone,
            };
        }
        active.history.undo();
        records.pop();
        undone += 1;
    }

    // Clear recorded stack after successful contiguous rewind.
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
 * (or there is no active task tracking — then allow normal undo for ambient creates).
 */
export function checkAgentUndoAllowed(doc?: IDocument): PermissionDecision {
    const active = doc ?? getDocument();
    const profile = getActiveTaskProfile();
    if (!active) {
        return { allowed: true, code: "ALLOWED", message: "ok" };
    }
    if (!profile || profile.taskHistoryRecords.length === 0) {
        return { allowed: true, code: "ALLOWED", message: "ok" };
    }
    if (profile.interleaved || detectInterleaving(active)) {
        return {
            allowed: false,
            code: "UNDO_TASK_HALTED",
            message: profile.haltReason ?? INTERLEAVE_MESSAGE,
        };
    }
    const top = active.history.undoTop();
    const last = profile.taskHistoryRecords[profile.taskHistoryRecords.length - 1];
    if (top !== last) {
        markTaskInterleaved(INTERLEAVE_MESSAGE);
        return { allowed: false, code: "UNDO_TASK_HALTED", message: INTERLEAVE_MESSAGE };
    }
    return { allowed: true, code: "ALLOWED", message: "ok" };
}
