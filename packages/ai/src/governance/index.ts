// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export { governTool, governTools } from "./governedRouter";
export { analyzeToolImpact } from "./impactAnalysis";
export { checkToolPermission, permissionDeniedPayload } from "./permissionGate";
export {
    type BoundTaskPlanProposal,
    bindTaskPlanProposal,
    buildProposeTaskPlanTool,
    confirmProposedPlan,
    documentStateMark,
    getPendingProposal,
    getPlanApprovalHandler,
    invalidatePendingProposals,
    type PlanApprovalDecision,
    type PlanApprovalHandler,
    parseTaskPlanProposal,
    proposalToScope,
    resetPlanApprovalForTests,
    setPlanApprovalHandler,
    type TaskPlanProposal,
} from "./planApproval";
export {
    clearDesignRulesForTests,
    defaultSafeDesignRules,
    documentRulesKey,
    fingerprintDesignRules,
    formatRulesForPrompt,
    loadAccountDesignRules,
    loadDocumentDesignRules,
    loadEffectiveDesignRules,
    rulesFingerprintFor,
    sanitizeGuidanceMarkdown,
    saveAccountDesignRules,
    saveDocumentDesignRules,
} from "./rulesStore";
export { stripSelfApproval } from "./selfApproval";
export {
    absorbForeignNodes,
    collectSubtreeIds,
    ensureSourceProtection,
    getProtectedNodeIds,
    isSourceProtected,
    listDocumentNodeIds,
    refreshSourceProtection,
    resetSourceProtectionForTests,
} from "./sourceProtection";
export { formatGovernanceStatusLine, getGovernanceStatus } from "./status";
export {
    approveTaskPlan,
    clearTaskProfile,
    detectRulesDrift,
    getActiveTaskProfile,
    getAgentCreatedNodeIds,
    getTaskProfile,
    invalidateTaskProfile,
    isNodeAllowed,
    isTaskOwned,
    markTaskInterleaved,
    RULES_CHANGED_MESSAGE,
    recordTaskHistoryEntry,
    recordTaskOwnedNodes,
    resetTaskProfileForTests,
} from "./taskProfile";
export { BATCH_B_TOOL_MATRIX, type ToolMatrixEntry, type ToolSupport, toolMatrixSummary } from "./toolMatrix";
export type {
    DesignRules,
    GovernanceStatus,
    ImpactKind,
    NodeImpact,
    PermissionCode,
    PermissionDecision,
    TaskProfile,
    TaskScope,
    ToolImpact,
} from "./types";
export {
    checkAgentUndoAllowed,
    detectInterleaving,
    INTERLEAVE_MESSAGE,
    noteGovernedMutation,
    undoActiveTask,
} from "./undoTask";
