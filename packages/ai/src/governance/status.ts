// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { getDocument } from "../tools/documentContext";
import { loadEffectiveDesignRules } from "./rulesStore";
import { getProtectedNodeIds } from "./sourceProtection";
import { getActiveTaskProfile, getTaskProfile } from "./taskProfile";
import type { GovernanceStatus } from "./types";

/** Accurate Batch B status for UI — does not claim Batch C verification or tolerance tables. */
export function getGovernanceStatus(): GovernanceStatus {
    const doc = getDocument();
    const { missingLink, scope } = loadEffectiveDesignRules(doc?.id);
    const profile = getActiveTaskProfile(doc) ?? getTaskProfile();
    return {
        batch: "B",
        sourceProtection: "active",
        permissionGate: "active",
        contiguousUndoTask: "active",
        criteriaVerification: "deferred",
        toleranceTable: "not_applied",
        activeTaskId: profile?.status === "active" ? profile.taskId : undefined,
        protectedNodeCount: getProtectedNodeIds(doc).size,
        rulesScope: scope,
        rulesMissingLink: missingLink,
    };
}

export function formatGovernanceStatusLine(): string {
    const status = getGovernanceStatus();
    const parts = [
        "🛡️ Đợt B: bảo vệ nguồn",
        "cổng quyền",
        "Undo chuỗi liên tiếp",
        "chưa có hậu kiểm tiêu chí (Đợt C)",
        "chưa áp bảng dung sai",
    ];
    if (status.rulesMissingLink) {
        parts.push("quy tắc: default-safe");
    } else if (status.rulesScope) {
        parts.push(`quy tắc: ${status.rulesScope}`);
    }
    if (status.activeTaskId) {
        parts.push(`task ${status.activeTaskId.slice(0, 8)}`);
    }
    parts.push(`protected=${status.protectedNodeCount}`);
    return parts.join(" · ");
}
