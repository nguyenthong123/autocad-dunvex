// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/** How a write op acts on a node or document resource. */
export type ImpactKind =
    | "create"
    | "modify"
    | "delete"
    | "consume"
    | "tree"
    | "material_library"
    | "document_variable"
    | "undo"
    | "redo"
    | "command"
    | "read"
    | "indeterminate";

export interface NodeImpact {
    nodeId: string;
    kind: Exclude<ImpactKind, "create" | "read" | "indeterminate" | "undo" | "redo" | "command">;
    /** True when the id was created by an earlier op in the same batch. */
    batchCreated?: boolean;
}

export interface ToolImpact {
    toolName: string;
    impacts: NodeImpact[];
    /** Tool creates geometry without targeting an existing protected node. */
    creates?: boolean;
    kind?: ImpactKind;
    /** Human-readable reason when impact cannot be fully determined. */
    indeterminateReason?: string;
    /** Command key for run_command, when applicable. */
    commandKey?: string;
}

export type PermissionCode =
    | "ALLOWED"
    | "PERMISSION_DENIED"
    | "INDETERMINATE_IMPACT_BLOCKED"
    | "ASYNC_PATH_UNSUPPORTED"
    | "UNDO_TASK_HALTED"
    | "DOCUMENT_DRIFT"
    | "PLAN_INVALIDATED"
    | "PROPOSAL_STALE";

export interface PermissionDecision {
    allowed: boolean;
    code: PermissionCode;
    message: string;
    deniedNodeIds?: string[];
}

/**
 * Scope recorded from a user-approved plan. Model- or Markdown-supplied flags never populate this.
 * Only application UI approval paths may call `approveTaskPlan`.
 */
export interface TaskScope {
    taskId: string;
    documentId: string;
    goal?: string;
    allowedModifiedNodeIds: string[];
    allowedDeletedNodeIds: string[];
    allowedConsumedNodeIds: string[];
    allowedTreeNodeIds: string[];
    allowMaterialLibrary?: boolean;
    allowDocumentVariables?: boolean;
    /** Document revision (history undo count + top identity) when the plan was approved. */
    approvedAtMark?: string;
    /**
     * Content fingerprint of effective design rules at approval.
     * Re-checked before every write; drift invalidates the plan.
     */
    rulesFingerprint?: string;
}

export interface TaskProfile extends TaskScope {
    status: "active" | "invalidated";
    /** Nodes created by the agent after this profile became active. */
    taskOwnedNodeIds: string[];
    /** History mark identity at task start (undoTop), for contiguous undo. */
    preTaskUndoTop?: object;
    /** History records produced by this task, in order (identity refs). */
    taskHistoryRecords: object[];
    interleaved: boolean;
    haltReason?: string;
}

/** Minimal structured design rules for Batch B (no approved tolerance table). */
export interface DesignRules {
    version: number;
    scope: "account" | "document";
    documentId?: string;
    /** Free-text guidance loaded into the system prompt; not an enforcement surface. */
    guidanceMarkdown?: string;
    /** Explicit protected tags or ids the user applied; empty means default-protect-all-sources. */
    protectedNodeIds?: string[];
    /**
     * Monotonic content revision bumped on every save (survives same-millisecond updates).
     * Fingerprints still hash full guidance + protected ids; this is not a Date.now stand-in.
     */
    contentRevision: number;
    /** When true, missing link / uncertain binding activates default source protection. */
    missingLinkFallback: true;
    /**
     * Sanitization note for consumers: stripping HTML/scripts reduces XSS risk in UI display
     * but is NOT a guarantee against prompt injection.
     */
    sanitizationIsNotInjectionProof: true;
    updatedAt: number;
}

export interface GovernanceStatus {
    batch: "B";
    sourceProtection: "active";
    permissionGate: "active";
    contiguousUndoTask: "active";
    /** Đợt C spec C1.4: "active" only while at least one criterion runner is registered. */
    criteriaVerification: "deferred" | "active";
    /** Proposed tolerance table from Đợt A — not adopted until the Reviewer picks A/B/C. */
    toleranceTable: "not_applied";
    activeTaskId?: string;
    protectedNodeCount: number;
    rulesScope?: "account" | "document" | "default_safe";
    rulesMissingLink: boolean;
    /** Registered criterion runner kinds, e.g. ["dimension_match", "position_match"]. */
    runnerKinds?: string[];
}
