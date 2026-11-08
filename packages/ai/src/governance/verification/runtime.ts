// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { findNode, getDocument } from "../../tools/documentContext";
import { getActiveTaskProfile } from "../taskProfile";
import { defineTaskCriteria, runTaskCriterionChecks } from "./evidenceStore";
import type { CriterionSpec, TaskCriteriaEvaluation } from "./types";

/**
 * Resolve a criterion's subjects at finalize time. Explicit ids win; otherwise the
 * hint is matched against nodes the task CREATED (last match = result of the last
 * write). An unresolved hint yields no subjects — the unverifiable-marker rule then
 * reads the row `unknown` instead of trusting a stale binding.
 */
function resolveSpecSubjects(spec: CriterionSpec, ownedNodeIds: readonly string[], doc: IDocument): string[] {
    if (spec.subjectNodeIds.length > 0) {
        return spec.subjectNodeIds;
    }
    const hint = spec.subjectHint?.trim().toLowerCase();
    if (!hint) {
        return [];
    }
    let match: string | undefined;
    for (const id of ownedNodeIds) {
        const node = findNode(doc, id);
        const name = (node?.name ?? "").trim().toLowerCase();
        if (name === hint || name.includes(hint)) {
            match = id; // later owned node wins — newest write is the result
        }
    }
    return match ? [match] : [];
}

/**
 * C2 runtime entry: after the agent's LAST write in a turn, measure the criteria the
 * user approved. Reads the REAL current geometry state through the registered runners
 * and binds fresh evidence (document/rules/history/geometry markers). Never grants any
 * permission — measuring is not writing (Reviewer scope guard: C2 measures, C3 repairs).
 */
export async function finalizeTaskVerification(doc?: IDocument): Promise<TaskCriteriaEvaluation | undefined> {
    const active = doc ?? getDocument();
    const profile = getActiveTaskProfile();
    if (!active || !profile || profile.status !== "active" || !profile.criteria?.length) {
        return undefined;
    }
    const specs: CriterionSpec[] = profile.criteria.map((spec) => ({
        ...spec,
        subjectNodeIds: resolveSpecSubjects(spec, profile.taskOwnedNodeIds, active),
    }));
    defineTaskCriteria(profile.taskId, specs);
    return runTaskCriterionChecks(profile.taskId, active);
}
