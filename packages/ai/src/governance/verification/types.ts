// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "@chili3d/core";

/** Honest three-state criterion result — never a bare boolean (Đợt C spec §7). */
export type CriterionStatus = "pass" | "fail" | "unknown";

/**
 * A verification criterion defined from the USER REQUIREMENT of the task:
 * expected values and tolerances come from the task itself. There is deliberately
 * no default/global tolerance table — a spec without them yields `unknown`, not a
 * guessed pass (Reviewer decision C4-C).
 */
export interface CriterionSpec {
    /** Criterion id, unique within the task. */
    id: string;
    /** Registered runner kind, e.g. "dimension_match". */
    kind: string;
    /** Mandatory criteria gate the completion indicator. */
    required: boolean;
    /** Exact subject nodes the evidence is bound to — ids, never names-by-guess. */
    subjectNodeIds: string[];
    /** Runner-defined expectation keys, e.g. { sizeMm: [800, 600, 300] }. */
    expected: Record<string, number[]>;
    /** Per-axis tolerance in mm from the task requirement; missing → unknown. */
    toleranceMm?: number[];
    /** Quote/location of the originating user requirement, for audit. */
    source?: string;
}

/** Evidence recorded by a runner, bound to task + document + rules + subjects. */
export interface CriterionEvidence {
    taskId: string;
    criterionId: string;
    kind: string;
    subjectNodeIds: string[];
    /** Bound at record time — stale when the open document differs. */
    documentId: string;
    /** Bound at record time — stale when effective design rules drifted. */
    rulesFingerprint: string;
    /** History undo-top identity (record object + depth) at record time — re-checked on every read. */
    historyMark?: string;
    /** World-bbox signature of the subjects at record time — re-checked on every read. */
    stateSignature?: string;
    status: CriterionStatus;
    measured?: Record<string, number[]>;
    reason: string;
    supportNotes?: string;
    recordedAt: number;
    /** Set by invalidation; the row re-reads as unknown, never as the old pass. */
    invalidatedAt?: number;
    invalidatedReason?: string;
}

export interface CriterionMeasurement {
    status: CriterionStatus;
    measured?: Record<string, number[]>;
    reason: string;
}

/** A published-scope geometric check. `supportNotes` must state what it cannot prove. */
export interface CriterionRunner {
    kind: string;
    /**
     * Reviewer C1.2/1.3: the runner's verdict MEASURES the subjects' geometry. Evidence
     * for such a runner must carry a verifiable subject marker — if the subject cannot be
     * read at evaluation time (unreadable/missing/no-subjects), a recorded pass/fail is
     * downgraded to `unknown` on every read, even when the unreadable chain is stable.
     * Runners that do not touch the subjects (test stubs) leave this unset.
     */
    requiresSubjectProof?: boolean;
    supportNotes: string;
    measure(spec: CriterionSpec, doc?: IDocument): Promise<CriterionMeasurement>;
}

/** One criterion's current standing for a task, after staleness filtering. */
export interface CriterionRow {
    spec: CriterionSpec;
    status: CriterionStatus;
    reason: string;
    measured?: Record<string, number[]>;
    evidence?: CriterionEvidence;
    /** True when recorded evidence exists but lost validity (node/rules/doc drift). */
    stale: boolean;
}

export interface TaskCriteriaEvaluation {
    taskId: string;
    rows: CriterionRow[];
    requiredTotal: number;
    failingRequiredIds: string[];
    /** Required criteria that are not a valid pass (fail or unknown). */
    outstandingRequiredIds: string[];
    /** True only when an active approved plan exists AND every required criterion has valid pass evidence. */
    completable: boolean;
    blockReason?: string;
    counts: { pass: number; fail: number; unknown: number };
}
