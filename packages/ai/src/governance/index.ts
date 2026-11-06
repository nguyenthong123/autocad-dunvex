// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export { governTool, governTools } from "./governedRouter";
export { analyzeToolImpact } from "./impactAnalysis";
export { checkToolPermission, permissionDeniedPayload } from "./permissionGate";
export {
    clearDesignRulesForTests,
    defaultSafeDesignRules,
    documentRulesKey,
    formatRulesForPrompt,
    loadAccountDesignRules,
    loadDocumentDesignRules,
    loadEffectiveDesignRules,
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
    getActiveTaskProfile,
    invalidateTaskProfile,
    isNodeAllowed,
    isTaskOwned,
    markTaskInterleaved,
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
    noteGovernedMutation,
    undoActiveTask,
} from "./undoTask";
