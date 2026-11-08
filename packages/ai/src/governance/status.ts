// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { getDocument } from "../tools/documentContext";
import { loadEffectiveDesignRules } from "./rulesStore";
import { getProtectedNodeIds } from "./sourceProtection";
import { getActiveTaskProfile, getTaskProfile } from "./taskProfile";
import type { GovernanceStatus } from "./types";
import {
    evaluateTaskCriteria,
    getRegisteredCriterionKinds,
    isAnyCriterionRunnerRegistered,
} from "./verification";

/** Accurate status for UI — Batch B mechanisms always named; Batch C only if runners registered. */
export function getGovernanceStatus(): GovernanceStatus {
    const doc = getDocument();
    const { missingLink, scope } = loadEffectiveDesignRules(doc?.id);
    const profile = getActiveTaskProfile(doc) ?? getTaskProfile();
    const runnerKinds = getRegisteredCriterionKinds();
    return {
        batch: "B",
        sourceProtection: "active",
        permissionGate: "active",
        contiguousUndoTask: "active",
        // Đợt C spec C1.4: "active" only while at least one criterion runner is registered.
        criteriaVerification: runnerKinds.length > 0 ? "active" : "deferred",
        toleranceTable: "not_applied",
        activeTaskId: profile?.status === "active" ? profile.taskId : undefined,
        protectedNodeCount: getProtectedNodeIds(doc).size,
        rulesScope: scope,
        rulesMissingLink: missingLink,
        runnerKinds,
    };
}

export function formatGovernanceStatusLine(): string {
    const status = getGovernanceStatus();
    const parts = ["🛡️ Đợt B: bảo vệ nguồn", "cổng quyền", "Undo chuỗi liên tiếp"];
    if (status.criteriaVerification === "active") {
        parts.push(`🔎 Đợt C: hậu kiểm tiêu chí đang bật (${status.runnerKinds?.length ?? 0} bộ kiểm)`);
    } else {
        parts.push("chưa có hậu kiểm tiêu chí (Đợt C)");
    }
    parts.push("chưa áp bảng dung sai");
    if (status.rulesMissingLink) {
        parts.push("quy tắc: default-safe");
    } else if (status.rulesScope) {
        parts.push(`quy tắc: ${status.rulesScope}`);
    }
    if (status.activeTaskId) {
        parts.push(`task ${status.activeTaskId.slice(0, 8)}`);
        const evaluation = evaluateTaskCriteria(status.activeTaskId);
        parts.push(
            evaluation.completable
                ? "✔ đủ tiêu chí bắt buộc"
                : `⏳ còn ${evaluation.outstandingRequiredIds.length}/${evaluation.requiredTotal} tiêu chí bắt buộc chưa đạt`,
        );
    }
    parts.push(`protected=${status.protectedNodeCount}`);
    return parts.join(" · ");
}
