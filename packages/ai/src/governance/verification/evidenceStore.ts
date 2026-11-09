// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";
import { getDocument } from "../../tools/documentContext";
import { rulesFingerprintFor } from "../rulesStore";
import { getTaskProfile } from "../taskProfile";
import { clearProposalSnapshotsForTests, generateRepairProposal } from "./repairEngine";
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
    deltas?: import("./types").CriterionStructuredDelta[];
    supportNotes?: string;
    historyMark?: string;
    documentId?: string;
    rulesFingerprint?: string;
    stateSignature?: string;
    doc?: IDocument;
}

/**
 * Record binds the evidence to the target document, rules fingerprint and time —
 * so later drift shows up as staleness instead of a silent pass (§6 "Ghi và kiểm tra").
 */
export function recordCriterionEvidence(input: EvidenceInput): CriterionEvidence {
    const doc = input.doc ?? getDocument();
    const docId = input.documentId ?? doc?.id;
    if (!docId) {
        throw new Error("Cannot record criterion evidence without an open document");
    }
    const evidence: CriterionEvidence = {
        taskId: input.taskId,
        criterionId: input.criterionId,
        kind: input.kind,
        subjectNodeIds: input.subjectNodeIds,
        status: input.status,
        measured: input.measured,
        deltas: input.deltas,
        reason: input.reason,
        supportNotes: input.supportNotes,
        documentId: docId,
        rulesFingerprint: input.rulesFingerprint ?? (doc ? rulesFingerprintFor(docId) : ""),
        historyMark: input.historyMark ?? (doc ? historyMarkOf(doc) : undefined),
        stateSignature:
            input.stateSignature ?? (doc ? subjectsSignatureOf(doc, input.subjectNodeIds) : undefined),
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
 * A proof-requiring runner's evidence is only trustworthy when its subject marker is
 * itself verifiable NOW: absent signature, empty subject list, or any subject reading
 * `unreadable`/`handle-err` means the app cannot prove the measured state at read time
 * (Reviewer C1.3: unreadable chains that stay identical across reads must NOT preserve
 * an old pass). Such rows downgrade to unknown — completion drops with them.
 */
function subjectMarkerUnverifiable(evidence: CriterionEvidence): boolean {
    const sig = evidence.stateSignature;
    if (!sig) {
        return true;
    }
    return sig === "no-subjects" || sig.includes(":unreadable") || sig.includes("handle-err");
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
                deltas: evidence.deltas,
                evidence,
                stale: true,
            };
        }
        const runner = runners.get(evidence.kind);
        if (
            runner?.requiresSubjectProof &&
            evidence.status !== "unknown" &&
            subjectMarkerUnverifiable(evidence)
        ) {
            return {
                spec,
                status: "unknown",
                reason: `state-unverifiable: chủ thể không đọc được ở lần đọc lại — tiêu chí cần phép đo không được giữ ${evidence.status}`,
                measured: evidence.measured,
                deltas: evidence.deltas,
                evidence,
                stale: false,
            };
        }
        return {
            spec,
            status: evidence.status,
            reason: evidence.reason,
            measured: evidence.measured,
            deltas: evidence.deltas,
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
    const evaluation: TaskCriteriaEvaluation = {
        taskId,
        rows,
        requiredTotal: requiredRows.length,
        failingRequiredIds,
        outstandingRequiredIds,
        completable,
        blockReason,
        counts,
        executedRepairs: profile?.executedRepairs ?? 0,
    };

    if (
        !completable &&
        active &&
        specs.length > 0 &&
        profile?.status === "active" &&
        profile.taskId === taskId
    ) {
        const repair = generateRepairProposal(evaluation, active);
        evaluation.activeProposal = repair.proposal;
        evaluation.proposalStopReason = repair.stopReason;
        profile.activeProposal = repair.proposal;
    }

    return evaluation;
}

/** Trusted execution: runs every registered runner for the task's declared criteria. */
export async function runTaskCriterionChecks(
    taskId: string,
    doc?: IDocument,
): Promise<TaskCriteriaEvaluation> {
    const preOpenDoc = getDocument();
    const target = doc ?? preOpenDoc;
    for (const spec of getTaskCriteria(taskId)) {
        const runner = runners.get(spec.kind);
        if (!runner) {
            recordCriterionEvidence({
                taskId,
                criterionId: spec.id,
                kind: spec.kind,
                subjectNodeIds: spec.subjectNodeIds,
                status: "unknown",
                reason:
                    spec.resolutionNote ?? `runner-not-registered: chưa có bộ kiểm cho loại "${spec.kind}"`,
                doc: target,
                documentId: target?.id,
            });
            continue;
        }

        // Reviewer C2: Chụp mốc tài liệu được đo, tài liệu đang mở, hình học, task và quy tắc TRƯỚC khi đo
        const preDocId = target?.id;
        const preOpenDocId = preOpenDoc?.id;
        const preHistoryMark = target ? historyMarkOf(target) : undefined;
        const preRulesFingerprint = target ? rulesFingerprintFor(target.id) : undefined;
        const preProfile = getTaskProfile();
        const preTaskStatus = preProfile?.status;
        const preTaskId = preProfile?.taskId;
        const preSubjectsSignature = target ? subjectsSignatureOf(target, spec.subjectNodeIds) : undefined;

        let measurement: CriterionMeasurement = {
            status: "unknown",
            reason: "runner-threw",
        };
        try {
            measurement = await runner.measure(spec, target);
        } catch (error) {
            measurement = { status: "unknown", reason: `runner-threw: ${String(error)}` };
        }

        // Post-measure: đọc lại tài liệu đang mở (qua getDocument()) và đối chiếu với tài liệu đã chụp lúc bắt đầu
        const currentlyOpenDoc = getDocument();
        const currentProfile = getTaskProfile();
        let driftReason: string | undefined;
        let isFatalDrift = false;

        const openDocChanged =
            preOpenDoc !== currentlyOpenDoc ||
            preOpenDocId !== currentlyOpenDoc?.id ||
            (target && currentlyOpenDoc && (currentlyOpenDoc !== target || currentlyOpenDoc.id !== preDocId));

        if (openDocChanged) {
            driftReason = "tài liệu đang mở đã thay đổi hoặc đóng trong lúc chờ đo";
            isFatalDrift = true;
        } else if (
            !currentProfile ||
            currentProfile.status !== preTaskStatus ||
            currentProfile.taskId !== preTaskId
        ) {
            driftReason = "tác vụ đã đổi hoặc mất hiệu lực trong lúc chờ đo";
            isFatalDrift = true;
        } else if (target && rulesFingerprintFor(target.id) !== preRulesFingerprint) {
            driftReason = "quy tắc thiết kế đã đổi trong lúc chờ đo";
        } else if (target && historyMarkOf(target) !== preHistoryMark) {
            driftReason = "tài liệu đã có thao tác chỉnh sửa mới trong lúc chờ đo";
        } else if (target && subjectsSignatureOf(target, spec.subjectNodeIds) !== preSubjectsSignature) {
            driftReason = "hình học đối tượng đã thay đổi trong lúc chờ đo";
        }

        let statusToRecord = measurement.status;
        let measuredToRecord = measurement.measured;
        let reasonToRecord = measurement.reason;

        if (driftReason) {
            // Khi đổi tài liệu, tác vụ mất hiệu lực, hoặc hình học thay đổi trong lúc chờ → bỏ kết quả cũ, giữ trạng thái chưa kiểm chứng
            statusToRecord = "unknown";
            measuredToRecord = undefined;
            reasonToRecord = `state-drift-during-measurement: ${driftReason} — bỏ kết quả đo cũ, giữ trạng thái chưa kiểm chứng`;
        }

        recordCriterionEvidence({
            taskId,
            criterionId: spec.id,
            kind: spec.kind,
            subjectNodeIds: spec.subjectNodeIds,
            status: statusToRecord,
            measured: measuredToRecord,
            deltas: driftReason ? undefined : measurement.deltas,
            reason: reasonToRecord,
            supportNotes: runner.supportNotes,
            doc: target,
            documentId: preDocId,
            rulesFingerprint: target ? rulesFingerprintFor(target.id) : preRulesFingerprint,
            historyMark: target ? historyMarkOf(target) : preHistoryMark,
            stateSignature: target ? subjectsSignatureOf(target, spec.subjectNodeIds) : preSubjectsSignature,
        });

        if (isFatalDrift) {
            break;
        }
    }
    return evaluateTaskCriteria(taskId, target);
}

export function resetVerificationForTests(): void {
    runners.clear();
    specsByTask.clear();
    evidenceByTask.clear();
    listeners.clear();
    clearProposalSnapshotsForTests();
}
