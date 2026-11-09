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
    /**
     * C2 runtime: criteria are declared BEFORE the result object exists (the agent builds it
     * inside the approved plan). At finalize time the hint resolves against nodes the task
     * CREATED (last match wins = result of the last write). Nothing resolves → the criterion
     * keeps no subjects and reads unknown — never a silent pass.
     */
    subjectHint?: string;
    /** Runner-defined expectation keys, e.g. { sizeMm: [800, 600, 300] }. */
    expected: Record<string, number[]>;
    /** Per-axis tolerance in mm from the task requirement; missing → unknown. */
    toleranceMm?: number[];
    /** Quote/location of the originating user requirement, for audit. */
    source?: string;
    /** Note set during finalize time if subject resolution failed or was ambiguous. */
    resolutionNote?: string;
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
    deltas?: CriterionStructuredDelta[];
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
    deltas?: CriterionStructuredDelta[];
    reason: string;
}

/** C3 structured delta per criterion and axis. */
export interface CriterionStructuredDelta {
    criterionId: string;
    subjectNodeId: string;
    kind: string;
    axis: "X" | "Y" | "Z";
    axisIndex: number;
    measuredMm: number;
    expectedMm: number;
    deltaMm: number; // measuredMm - expectedMm
    toleranceMm: number;
}

/** Immutable one-time repair proposal bound to exact document and state marker. */
export interface RepairProposal {
    proposalId: string;
    taskId: string;
    documentId: string;
    historyMark: string;
    rulesFingerprint: string;
    stateSignature: string;
    subjectNodeIds: readonly string[];
    toolName: "set_node_properties" | "transform_node";
    toolArgs: Readonly<Record<string, unknown>>;
    displayDescription: string;
    phase: "size" | "position";
    attemptIndex: number;
    deltas: readonly CriterionStructuredDelta[];
    executed: boolean;
    invalidated?: boolean;
    invalidationReason?: string;
    createdAt: number;
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
    /** Human label for the UI. Bounding-box-based checks MUST name the box ("bao"). */
    label?: string;
    supportNotes: string;
    measure(spec: CriterionSpec, doc?: IDocument): Promise<CriterionMeasurement>;
}

/** One criterion's current standing for a task, after staleness filtering. */
export interface CriterionRow {
    spec: CriterionSpec;
    status: CriterionStatus;
    reason: string;
    measured?: Record<string, number[]>;
    deltas?: CriterionStructuredDelta[];
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
    activeProposal?: RepairProposal;
    proposalStopReason?: string;
    executedRepairs?: number;
}
