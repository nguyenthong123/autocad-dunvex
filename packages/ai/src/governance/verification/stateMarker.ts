// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { readSubjectShapeProbe } from "./measure";

/**
 * Reviewer 08/11 (C1 follow-up): evidence must carry a marker the app itself can
 * re-verify on EVERY read — history position plus a coarse geometry signature —
 * so a change made OUTSIDE the governed agent path (ribbon UI, direct command,
 * another tab) still turns the stored proof stale at read time.
 *
 * Identity of history records: planApproval's markIdentity compares record names,
 * which cannot distinguish two records that share a name (two identical UI moves).
 * Here the marker keys on the record OBJECT itself (WeakMap id) plus the undo
 * stack depth — object identity changes whenever the top record changes, even for
 * same-name edits; the depth catches limit-shift churn that keeps the top object.
 */
const recordIds = new WeakMap<object, number>();
let nextRecordId = 1;

function identityOf(mark: unknown): string {
    if (mark === undefined || mark === null) {
        return "none";
    }
    if (typeof mark === "object") {
        let id = recordIds.get(mark as object);
        if (id === undefined) {
            id = nextRecordId++;
            recordIds.set(mark as object, id);
        }
        return `#${id}`;
    }
    // Primitive stubs in tests: stringify is the only stable handle.
    return `s:${String(mark)}`;
}

/** Snapshot of the document's undo position; stable while the history is untouched. */
export function historyMarkOf(doc: IDocument): string {
    const history = (doc as unknown as { history?: { undoTop?: () => unknown; undoCount?: () => number } })
        .history;
    if (!history || typeof history.undoTop !== "function") {
        return "no-history";
    }
    const top = history.undoTop();
    const count = typeof history.undoCount === "function" ? history.undoCount() : -1;
    return `${identityOf(top)}|${count}`;
}

/** 1/1000 mm grid — stable against float noise while catching real movement/resizing. */
function mm(v: number): string {
    return (Math.round(v * 1000) / 1000).toFixed(3);
}

/**
 * Per-subject signature: world-bbox (size + center) + shape volume + the identity of
 * the node's CACHED shape object. Rebuilding geometry — e.g. moving a hole that keeps
 * the outer bounding box untouched — swaps the cached object, so the marker flips even
 * when every measured extent is unchanged. Volume additionally catches rebuilds that
 * somehow reuse the handle. Unreadable or missing nodes contribute a STABLE tag so the
 * signature never flips between quiet reads; and a criterion whose subjects cannot be
 * probed at all never gains a "proven fresh" binding from this function.
 */
export function subjectsSignatureOf(doc: IDocument, nodeIds: readonly string[]): string {
    if (nodeIds.length === 0) {
        return "no-subjects";
    }
    const parts: string[] = [];
    for (const id of nodeIds) {
        const probe = readSubjectShapeProbe(doc, id);
        if (!probe.found || !probe.box) {
            parts.push(`${id}:unreadable`);
            continue;
        }
        const { sizeMm, centerMm } = probe.box;
        const vol = probe.volumeMm3 === undefined ? "vol-err" : mm(probe.volumeMm3);
        const handle = probe.shapeHandle === undefined ? "handle-err" : `h${identityOf(probe.shapeHandle)}`;
        parts.push(
            `${id}:${mm(sizeMm[0])},${mm(sizeMm[1])},${mm(sizeMm[2])}|${mm(centerMm[0])},${mm(centerMm[1])},${mm(centerMm[2])}|${vol}|${handle}`,
        );
    }
    return parts.join(";");
}
