// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { getDocument } from "../../tools/documentContext";
import { getActiveTaskProfile } from "../taskProfile";
import { defineTaskCriteria, runTaskCriterionChecks } from "./evidenceStore";
import type { CriterionSpec, TaskCriteriaEvaluation } from "./types";

/**
 * Resolve a criterion's subjects at finalize time.
 * - Khi có ID kết quả xác định được (explicit `subjectNodeIds`, hoặc `subjectHint` là ID thật): dùng ID đó.
 * - Khi chỉ có tên gợi ý (`subjectHint`): tìm trong các node do task tạo.
 *   + Nếu đúng 1 node khớp: dùng ID node đó.
 *   + Nếu nhiều node cùng khớp: không đoán mò / không chọn bừa (tránh xác nhận nhầm) → trả `unknown`
 *     (subjectNodeIds: [], resolutionNote ghi rõ cần làm rõ đối tượng).
 *   + Nếu không có node nào khớp: trả unknown (subjectNodeIds: [], resolutionNote ghi rõ không tìm thấy).
 */
function resolveSpecSubjects(
    spec: CriterionSpec,
    ownedNodeIds: readonly string[],
    doc: IDocument,
): { subjectNodeIds: string[]; resolutionNote?: string } {
    if (spec.subjectNodeIds.length > 0) {
        return { subjectNodeIds: spec.subjectNodeIds };
    }
    const hint = spec.subjectHint?.trim();
    if (!hint) {
        return {
            subjectNodeIds: [],
            resolutionNote: "tiêu chí chưa có ID và chưa có tên gợi ý (subjectHint)",
        };
    }

    // Nếu subjectHint chính là ID của một node trong task hoặc trong document
    if (ownedNodeIds.includes(hint) || doc.modelManager.findNodes((n) => n.id === hint).length > 0) {
        return { subjectNodeIds: [hint] };
    }

    const hintLower = hint.toLowerCase();
    const exactMatches: string[] = [];
    const substringMatches: string[] = [];

    for (const id of ownedNodeIds) {
        const node = doc.modelManager.findNodes((n) => n.id === id)[0];
        if (!node) continue;
        const name = (node.name ?? "").trim().toLowerCase();
        if (name === hintLower) {
            exactMatches.push(id);
        } else if (name.includes(hintLower)) {
            substringMatches.push(id);
        }
    }

    const matches = exactMatches.length > 0 ? exactMatches : substringMatches;
    if (matches.length === 1) {
        return { subjectNodeIds: [matches[0]] };
    }
    if (matches.length > 1) {
        return {
            subjectNodeIds: [],
            resolutionNote: `có ${matches.length} đối tượng cùng khớp với gợi ý "${spec.subjectHint}" (${matches.join(", ")}) — cần làm rõ đối tượng`,
        };
    }
    return {
        subjectNodeIds: [],
        resolutionNote: `không tìm thấy đối tượng khớp với gợi ý "${spec.subjectHint}"`,
    };
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
    const specs: CriterionSpec[] = profile.criteria.map((spec) => {
        if (spec.resolutionNote) {
            return spec;
        }
        const resolved = resolveSpecSubjects(spec, profile.taskOwnedNodeIds, active);
        return {
            ...spec,
            subjectNodeIds: resolved.subjectNodeIds,
            resolutionNote: resolved.resolutionNote,
        };
    });
    defineTaskCriteria(profile.taskId, specs);
    return runTaskCriterionChecks(profile.taskId, active);
}
