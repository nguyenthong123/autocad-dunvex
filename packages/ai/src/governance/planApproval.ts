// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IHistoryRecord } from "@chili3d/core";
import { Id } from "@chili3d/core";
import type { Tool } from "../llm/types";
import { getDocument } from "../tools/documentContext";
import { rulesFingerprintFor } from "./rulesStore";
import { approveTaskPlan } from "./taskProfile";
import type { TaskProfile, TaskScope } from "./types";

/** Proposed plan fields before document/rules binding. */
export interface TaskPlanProposal {
    goal?: string;
    allowedModifiedNodeIds: string[];
    allowedDeletedNodeIds: string[];
    allowedConsumedNodeIds: string[];
    allowedTreeNodeIds: string[];
    allowMaterialLibrary?: boolean;
    allowDocumentVariables?: boolean;
    summary?: string;
}

/**
 * Proposal captured against a specific document + history/rules mark at creation time.
 * Approving always validates against this binding — never against a substituted open document.
 */
export interface BoundTaskPlanProposal extends TaskPlanProposal {
    proposalId: string;
    documentId: string;
    /** History undoTop identity when the proposal was created. */
    createdAtMark: string | undefined;
    /** Fingerprint of effective design rules at creation. */
    rulesFingerprint: string;
    /** Bumped whenever a newer proposal supersedes pending cards. */
    generation: number;
}

export type PlanApprovalDecision =
    | { approved: true; profile: TaskProfile }
    | { approved: false; reason: string };

/**
 * Trusted UI handler: presents the bound plan and either confirms or rejects.
 * The model never receives a path that can approve without this handler.
 */
export type PlanApprovalHandler = (
    proposal: BoundTaskPlanProposal,
    signal?: AbortSignal,
) => Promise<PlanApprovalDecision>;

let planApprovalHandler: PlanApprovalHandler | undefined;
let pendingProposal: BoundTaskPlanProposal | undefined;
let proposalGeneration = 0;

export function setPlanApprovalHandler(next: PlanApprovalHandler | undefined): void {
    planApprovalHandler = next;
}

export function getPlanApprovalHandler(): PlanApprovalHandler | undefined {
    return planApprovalHandler;
}

export function getPendingProposal(): BoundTaskPlanProposal | undefined {
    return pendingProposal;
}

/** Normalize proposal fields; ignore any model-supplied approved/force flags. */
export function parseTaskPlanProposal(raw: Record<string, unknown>): TaskPlanProposal {
    return {
        goal: typeof raw["goal"] === "string" ? raw["goal"] : undefined,
        summary: typeof raw["summary"] === "string" ? raw["summary"] : undefined,
        allowedModifiedNodeIds: stringIds(raw["allowedModifiedNodeIds"]),
        allowedDeletedNodeIds: stringIds(raw["allowedDeletedNodeIds"]),
        allowedConsumedNodeIds: stringIds(raw["allowedConsumedNodeIds"]),
        allowedTreeNodeIds: stringIds(raw["allowedTreeNodeIds"]),
        allowMaterialLibrary: Boolean(raw["allowMaterialLibrary"]),
        allowDocumentVariables: Boolean(raw["allowDocumentVariables"]),
    };
}

export function proposalToScope(proposal: TaskPlanProposal): Partial<TaskScope> {
    return {
        goal: proposal.goal,
        allowedModifiedNodeIds: proposal.allowedModifiedNodeIds,
        allowedDeletedNodeIds: proposal.allowedDeletedNodeIds,
        allowedConsumedNodeIds: proposal.allowedConsumedNodeIds,
        allowedTreeNodeIds: proposal.allowedTreeNodeIds,
        allowMaterialLibrary: proposal.allowMaterialLibrary,
        allowDocumentVariables: proposal.allowDocumentVariables,
    };
}

export function documentStateMark(doc: IDocument): string | undefined {
    return markIdentity(doc.history.undoTop());
}

// Re-export content fingerprint so plan callers keep a single import path.
export { rulesFingerprintFor } from "./rulesStore";

/**
 * Bind a proposal to the open document and current history/rules marks.
 * Supersedes any previous pending card (old Approve clicks must fail).
 */
export function bindTaskPlanProposal(proposal: TaskPlanProposal, doc?: IDocument): BoundTaskPlanProposal {
    const active = doc ?? getDocument();
    if (!active) {
        throw new Error("Cannot bind a task plan proposal without an open document");
    }
    proposalGeneration += 1;
    const bound: BoundTaskPlanProposal = {
        ...proposal,
        proposalId: Id.generate(),
        documentId: active.id,
        createdAtMark: documentStateMark(active),
        rulesFingerprint: rulesFingerprintFor(active.id),
        generation: proposalGeneration,
    };
    pendingProposal = bound;
    return bound;
}

/** Invalidate pending cards (document switch, turn cancel, newer proposal). */
export function invalidatePendingProposals(_reason?: string): void {
    pendingProposal = undefined;
    proposalGeneration += 1;
}

/**
 * Validate a pending card is still the current proposal, for the same document/state,
 * before granting rights. Never approves against a different open document.
 */
export function confirmProposedPlan(
    proposal: BoundTaskPlanProposal,
    options?: { signal?: AbortSignal; document?: IDocument },
): TaskProfile {
    if (options?.signal?.aborted) {
        throw new Error("PROPOSAL_STALE: Approval turn was cancelled before confirm.");
    }
    if (!pendingProposal) {
        throw new Error("PROPOSAL_STALE: No pending plan card (superseded, cancelled, or already settled).");
    }
    if (
        pendingProposal.proposalId !== proposal.proposalId ||
        pendingProposal.generation !== proposal.generation
    ) {
        throw new Error(
            "PROPOSAL_STALE: This plan card is no longer current. Re-read the document and propose_task_plan again.",
        );
    }
    if (proposal.documentId !== pendingProposal.documentId) {
        throw new Error("PROPOSAL_STALE: Proposal document binding mismatch.");
    }

    const active = options?.document ?? getDocument();
    if (!active) {
        throw new Error("PROPOSAL_STALE: No document is open; cannot approve a bound proposal.");
    }
    // Never substitute a different open document for the proposal's binding.
    if (active.id !== proposal.documentId) {
        throw new Error(
            `DOCUMENT_MISMATCH: Proposal was created for document "${proposal.documentId}" but the open document is "${active.id}". Open the original document and propose again.`,
        );
    }

    const currentMark = documentStateMark(active);
    if (currentMark !== proposal.createdAtMark) {
        invalidatePendingProposals("document state drifted");
        throw new Error(
            "PROPOSAL_STALE: Document changed since this plan card was shown. Re-read the document and propose_task_plan again.",
        );
    }

    const currentRules = rulesFingerprintFor(active.id);
    if (currentRules !== proposal.rulesFingerprint) {
        invalidatePendingProposals("rules changed");
        throw new Error(
            "PROPOSAL_STALE: Design rules changed since this plan card was shown. Re-read and propose_task_plan again.",
        );
    }

    const profile = approveTaskPlan(
        {
            ...proposalToScope(proposal),
            documentId: proposal.documentId,
            // Snapshot the fingerprint that just validated — later writes re-read storage.
            rulesFingerprint: proposal.rulesFingerprint,
        },
        active,
    );
    pendingProposal = undefined;
    return profile;
}

/**
 * Tool the model uses to *request* approval. It cannot grant rights itself — only the
 * registered UI handler may call `confirmProposedPlan` after the user confirms.
 */
export function buildProposeTaskPlanTool(): Tool {
    return {
        name: "propose_task_plan",
        description:
            "Propose a source-edit plan for the user to review. Lists which existing node ids need modify, delete, consume, or tree rights. Does not grant permissions — the in-app UI must approve. Bound to the current document and history mark at proposal time; a later Approve on a stale card does nothing. If a plan is invalidated by interleaved edits, re-read the document and propose again. Never invent approved/force flags; they are ignored.",
        parameters: {
            type: "object",
            properties: {
                goal: { type: "string", description: "Short goal of the plan" },
                summary: {
                    type: "string",
                    description: "Human-readable summary of intended changes",
                },
                allowedModifiedNodeIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Existing node ids that may be modified if the user approves",
                },
                allowedDeletedNodeIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Existing node ids that may be deleted if the user approves",
                },
                allowedConsumedNodeIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Existing node ids that may be consumed (e.g. boolean) if approved",
                },
                allowedTreeNodeIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Existing node ids that may move in the tree if approved",
                },
                allowMaterialLibrary: {
                    type: "boolean",
                    description: "Request permission to edit document materials",
                },
                allowDocumentVariables: {
                    type: "boolean",
                    description: "Request permission to set/remove document variables",
                },
            },
        },
        handler: async (args, signal) => {
            const doc = getDocument();
            if (!doc) {
                return JSON.stringify({ error: "no document is open", approved: false });
            }
            const proposal = parseTaskPlanProposal(args ?? {});
            const hasScope =
                proposal.allowedModifiedNodeIds.length > 0 ||
                proposal.allowedDeletedNodeIds.length > 0 ||
                proposal.allowedConsumedNodeIds.length > 0 ||
                proposal.allowedTreeNodeIds.length > 0 ||
                proposal.allowMaterialLibrary ||
                proposal.allowDocumentVariables;
            if (!hasScope) {
                return JSON.stringify({
                    error: "propose_task_plan requires at least one scope entry (node ids or library/variable flags)",
                    approved: false,
                });
            }

            const handler = planApprovalHandler;
            if (!handler) {
                return JSON.stringify({
                    error: "no trusted plan-approval UI is available (ChatPanel required)",
                    approved: false,
                });
            }

            const bound = bindTaskPlanProposal(proposal, doc);
            const decision = await handler(bound, signal);
            if (!decision.approved) {
                return JSON.stringify({
                    approved: false,
                    reason: decision.reason,
                    proposalId: bound.proposalId,
                    documentId: bound.documentId,
                });
            }
            return JSON.stringify({
                approved: true,
                taskId: decision.profile.taskId,
                documentId: decision.profile.documentId,
                proposalId: bound.proposalId,
                allowedModifiedNodeIds: decision.profile.allowedModifiedNodeIds,
                allowedDeletedNodeIds: decision.profile.allowedDeletedNodeIds,
                allowedConsumedNodeIds: decision.profile.allowedConsumedNodeIds,
                allowedTreeNodeIds: decision.profile.allowedTreeNodeIds,
                allowMaterialLibrary: decision.profile.allowMaterialLibrary,
                allowDocumentVariables: decision.profile.allowDocumentVariables,
            });
        },
    };
}

function stringIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function markIdentity(mark: IHistoryRecord | undefined): string | undefined {
    if (!mark) return undefined;
    return `${mark.name}:${Object.prototype.toString.call(mark)}`;
}

/** Test helper. */
export function resetPlanApprovalForTests(): void {
    pendingProposal = undefined;
    proposalGeneration = 0;
    planApprovalHandler = undefined;
}
