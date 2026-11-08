// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { getDocument } from "../../tools/documentContext";
import { rulesFingerprintFor } from "../rulesStore";
import { getTaskProfile } from "../taskProfile";
import { historyMarkOf, subjectsSignatureOf } from "./stateMarker";
import type {
    CriterionEvidence,
    CriterionMeasurement,
    CriterionRow,
    CriterionRunner,
    CriterionSpec,
    TaskCriteriaEvaluation,
} from "./types";

const runners = new Map<string, CriterionRunner>();
const specsByTask = new Map<string, Map<string, CriterionSpec>>();
const evidenceByTask = new Map<string, Map<string, CriterionEvidence>>();
const listeners = new Set<() => void>();

function notify(): void {
    for (const fn of listeners) {
        fn();
    }
}

/** Subscribe the UI to any record/invalidate/registration change. Returns unsubscribe. */
export function onTaskEvidenceChanged(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function registerCriterionRunner(runner: CriterionRunner): void {
    runners.set(runner.kind, runner);
    notify();
}

export function getCriterionRunner(kind: string): CriterionRunner | undefined {
    return runners.get(kind);
}

export function isAnyCriterionRunnerRegistered(): boolean {
    return runners.size > 0;
}

export function getRegisteredCriterionKinds(): string[] {
    return [...runners.keys()];
}

/** Task-profile criteria (§5 "Tiêu chí"): declared from the user requirement before checks run. */
export function defineTaskCriteria(taskId: string, specs: readonly CriterionSpec[]): void {
    const map = new Map(specs.map((spec) => [spec.id, spec]));
    specsByTask.set(taskId, map);
    notify();
}

export function getTaskCriteria(taskId: string): CriterionSpec[] {
    return [...(specsByTask.get(taskId)?.values() ?? [])];
}

export interface EvidenceInput {
    taskId: string;
    criterionId: string;
    kind: string;
    subjectNodeIds: string[];
    status: CriterionEvidence["status"];
    reason: string;
    measured?: Record<string, number[]>;
    supportNotes?: string;
    historyMark?: string;
}

/**
 * Record binds the evidence to the CURRENT document, rules fingerprint and time —
 * so later drift shows up as staleness instead of a silent pass (§6 "Ghi và kiểm tra").
 */
export function recordCriterionEvidence(input: EvidenceInput): CriterionEvidence {
    const doc = getDocument();
    if (!doc) {
        throw new Error("Cannot record criterion evidence without an open document");
    }
    const evidence: CriterionEvidence = {
        ...input,
        documentId: doc.id,
        rulesFingerprint: rulesFingerprintFor(doc.id),
        // Reviewer C1 follow-up: bind the proof to a document state the app can
        // re-verify on read (history position + subject bbox signature), so edits
        // made outside the governed agent path still invalidate at next evaluation.
        historyMark: input.historyMark ?? historyMarkOf(doc),
        stateSignature: subjectsSignatureOf(doc, input.subjectNodeIds),
        recordedAt: Date.now(),
    };
    let byCriterion = evidenceByTask.get(input.taskId);
    if (!byCriterion) {
        byCriterion = new Map();
        evidenceByTask.set(input.taskId, byCriterion);
    }
    byCriterion.set(input.criterionId, evidence);
    notify();
    return evidence;
}

/** Geometry for these subjects changed: their evidence loses validity (never reused). */
export function invalidateEvidenceForNodeIds(nodeIds: readonly string[], reason: string): number {
    const touched = new Set(nodeIds);
    let count = 0;
    for (const byCriterion of evidenceByTask.values()) {
        for (const evidence of byCriterion.values()) {
            if (evidence.invalidatedAt) {
                continue;
            }
            if (evidence.subjectNodeIds.some((id) => touched.has(id))) {
                evidence.invalidatedAt = Date.now();
                evidence.invalidatedReason = reason;
                count++;
            }
        }
    }
    if (count > 0) {
        notify();
    }
    return count;
}

export function invalidateAllTaskEvidence(taskId: string, reason: string): number {
    let count = 0;
    for (const evidence of evidenceByTask.get(taskId)?.values() ?? []) {
        if (!evidence.invalidatedAt) {
            evidence.invalidatedAt = Date.now();
            evidence.invalidatedReason = reason;
            count++;
        }
    }
    if (count > 0) {
        notify();
    }
    return count;
}

export function getLatestEvidence(taskId: string, criterionId: string): CriterionEvidence | undefined {
    return evidenceByTask.get(taskId)?.get(criterionId);
}

export function getTaskEvidence(taskId: string): CriterionEvidence[] {
    return [...(evidenceByTask.get(taskId)?.values() ?? [])];
}

/**
 * Fresh = same document, same rules version, AND the state marker still matches.
 * The marker check is what catches changes made without going through the agent
 * router (ribbon UI, direct command execution, another panel) — the app re-verifies
 * the marker on every read instead of trusting the recorded pass.
 */
function isFresh(evidence: CriterionEvidence, doc: IDocument): boolean {
    if (evidence.invalidatedAt) {
        return false;
    }
    if (evidence.documentId !== doc.id) {
        return false;
    }
    if (evidence.rulesFingerprint !== rulesFingerprintFor(doc.id)) {
        return false;
    }
    if (evidence.historyMark && evidence.historyMark !== historyMarkOf(doc)) {
        return false;
    }
    if (
        evidence.stateSignature &&
        evidence.stateSignature !== subjectsSignatureOf(doc, evidence.subjectNodeIds)
    ) {
        return false;
    }
    return true;
}

function staleReason(evidence: CriterionEvidence | undefined, doc: IDocument): string {
    if (!evidence) {
        return "no-valid-evidence";
    }
    if (evidence.invalidatedAt) {
        return `invalidated: ${evidence.invalidatedReason ?? "hình học/đối tượng đã thay đổi"}`;
    }
    if (evidence.documentId !== doc.id) {
        return "document-changed";
    }
    if (evidence.rulesFingerprint !== rulesFingerprintFor(doc.id)) {
        return "rules-changed";
    }
    if (evidence.historyMark && evidence.historyMark !== historyMarkOf(doc)) {
        return "history-changed: tài liệu đã có lệnh mới (UI hoặc ngoài agent) sau khi đo";
    }
    if (
        evidence.stateSignature &&
        evidence.stateSignature !== subjectsSignatureOf(doc, evidence.subjectNodeIds)
    ) {
        return "state-changed: hình học đối tượng đã khác so với lúc ghi bằng chứng";
    }
    return "rules-changed";
}

/**
 * Evaluate every declared criterion. A criterion with no valid evidence reads
 * `unknown` — absence of proof is never proof, and an optional fail does not
 * block completion while any required non-pass does (§3.9, §7).
 */
export function evaluateTaskCriteria(taskId: string, doc?: IDocument): TaskCriteriaEvaluation {
    const active = doc ?? getDocument();
    const specs = getTaskCriteria(taskId);
    const rows: CriterionRow[] = specs.map((spec) => {
        const evidence = getLatestEvidence(taskId, spec.id);
        if (!active) {
            return { spec, status: "unknown", reason: "no-document", stale: false };
        }
        if (!evidence) {
            return { spec, status: "unknown", reason: "no-valid-evidence", stale: false };
        }
        if (!isFresh(evidence, active)) {
            return {
                spec,
                status: "unknown",
                reason: staleReason(evidence, active),
                measured: evidence.measured,
                evidence,
                stale: true,
            };
        }
        return {
            spec,
            status: evidence.status,
            reason: evidence.reason,
            measured: evidence.measured,
            evidence,
            stale: false,
        };
    });
    const counts = {
        pass: rows.filter((r) => r.status === "pass").length,
        fail: rows.filter((r) => r.status === "fail").length,
        unknown: rows.filter((r) => r.status === "unknown").length,
    };
    const requiredRows = rows.filter((r) => r.spec.required);
    const failingRequiredIds = requiredRows.filter((r) => r.status === "fail").map((r) => r.spec.id);
    const outstandingRequiredIds = requiredRows.filter((r) => r.status !== "pass").map((r) => r.spec.id);
    const profile = getTaskProfile();
    let blockReason: string | undefined;
    if (profile?.status !== "active" || profile.taskId !== taskId) {
        blockReason = "plan_not_active";
    } else if (specs.length === 0) {
        blockReason = "no_criteria_defined";
    } else if (requiredRows.length === 0) {
        blockReason = "no_required_criteria";
    }
    const completable = blockReason === undefined && outstandingRequiredIds.length === 0;
    return {
        taskId,
        rows,
        requiredTotal: requiredRows.length,
        failingRequiredIds,
        outstandingRequiredIds,
        completable,
        blockReason,
        counts,
    };
}

/** Trusted execution: runs every registered runner for the task's declared criteria. */
export async function runTaskCriterionChecks(
    taskId: string,
    doc?: IDocument,
): Promise<TaskCriteriaEvaluation> {
    const active = doc ?? getDocument();
    for (const spec of getTaskCriteria(taskId)) {
        const runner = runners.get(spec.kind);
        if (!runner) {
            recordCriterionEvidence({
                taskId,
                criterionId: spec.id,
                kind: spec.kind,
                subjectNodeIds: spec.subjectNodeIds,
                status: "unknown",
                reason: `runner-not-registered: chưa có bộ kiểm cho loại "${spec.kind}"`,
            });
            continue;
        }
        let measurement: CriterionMeasurement = {
            status: "unknown",
            reason: "runner-threw",
        };
        try {
            measurement = await runner.measure(spec, active);
        } catch (error) {
            measurement = { status: "unknown", reason: `runner-threw: ${String(error)}` };
        }
        recordCriterionEvidence({
            taskId,
            criterionId: spec.id,
            kind: spec.kind,
            subjectNodeIds: spec.subjectNodeIds,
            status: measurement.status,
            measured: measurement.measured,
            reason: measurement.reason,
            supportNotes: runner.supportNotes,
        });
    }
    return evaluateTaskCriteria(taskId, active);
}

export function resetVerificationForTests(): void {
    runners.clear();
    specsByTask.clear();
    evidenceByTask.clear();
    listeners.clear();
}
