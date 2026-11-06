// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Tool } from "../llm/types";
import { getDocument } from "../tools/documentContext";
import { approveTaskPlan } from "./taskProfile";
import type { TaskProfile, TaskScope } from "./types";

/** Proposed plan shown to the user before any source rights are granted. */
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

export type PlanApprovalDecision =
    | { approved: true; profile: TaskProfile }
    | { approved: false; reason: string };

/**
 * Trusted UI handler: presents the plan and either calls `approveTaskPlan` on user confirm
 * or rejects. The model never receives a path that can approve without this handler.
 */
export type PlanApprovalHandler = (
    proposal: TaskPlanProposal,
    signal?: AbortSignal,
) => Promise<PlanApprovalDecision>;

let planApprovalHandler: PlanApprovalHandler | undefined;

export function setPlanApprovalHandler(next: PlanApprovalHandler | undefined): void {
    planApprovalHandler = next;
}

export function getPlanApprovalHandler(): PlanApprovalHandler | undefined {
    return planApprovalHandler;
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

/**
 * Tool the model uses to *request* approval. It cannot grant rights itself — only the
 * registered UI handler may call `approveTaskPlan` after the user confirms.
 */
export function buildProposeTaskPlanTool(): Tool {
    return {
        name: "propose_task_plan",
        description:
            "Propose a source-edit plan for the user to review. Lists which existing node ids need modify, delete, consume, or tree rights. Does not grant permissions — the in-app UI must approve. Never invent approved/force flags; they are ignored.",
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
            if (!getDocument()) {
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

            const decision = await handler(proposal, signal);
            if (!decision.approved) {
                return JSON.stringify({
                    approved: false,
                    reason: decision.reason,
                });
            }
            return JSON.stringify({
                approved: true,
                taskId: decision.profile.taskId,
                documentId: decision.profile.documentId,
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

/**
 * Trusted UI confirm path — the only place besides tests that should call approveTaskPlan
 * for a user-visible proposal.
 */
export function confirmProposedPlan(proposal: TaskPlanProposal): TaskProfile {
    return approveTaskPlan(proposalToScope(proposal));
}

function stringIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}
