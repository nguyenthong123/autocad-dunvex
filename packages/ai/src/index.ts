// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export { bridgePortFromUrl, connectBridge, DEFAULT_BRIDGE_PORT } from "./bridge";
export { ChatPanel } from "./chatPanel";
export {
    classifyError,
    clearRuntimeErrorReports,
    type ErrorClass,
    exportRuntimeErrorReports,
    isStreamParseError,
    listRuntimeErrorReports,
    type NormalizedStopReason,
    normalizeStopReason,
    type RecordRuntimeErrorOptions,
    type RuntimeErrorDocumentSummary,
    type RuntimeErrorNodeSummary,
    type RuntimeErrorReport,
    recordRuntimeError,
    sanitizeArgs,
    type TurnDiagnostics,
} from "./diagnostics";
export {
    approveTaskPlan,
    BATCH_B_TOOL_MATRIX,
    checkToolPermission,
    clearTaskProfile,
    type DesignRules,
    formatGovernanceStatusLine,
    formatRulesForPrompt,
    type GovernanceStatus,
    getActiveTaskProfile,
    getGovernanceStatus,
    governTools,
    loadEffectiveDesignRules,
    type PermissionDecision,
    saveAccountDesignRules,
    saveDocumentDesignRules,
    stripSelfApproval,
    type TaskProfile,
    type TaskScope,
    toolMatrixSummary,
    undoActiveTask,
} from "./governance";
export {
    type ActiveNodeRef,
    clearSessionMemory,
    formatSessionMemorySummary,
    getSessionMemory,
    onNodeRenamed,
    onNodesCreated,
    onNodesRemoved,
    onRecentError,
    onUserConstraint,
    onVerificationCompleted,
    SESSION_MEMORY_MAX_SUMMARY_CHARS,
    type SessionMemory,
    type SessionMemoryPatch,
    type SessionRecentError,
    type SessionVerificationInfo,
    syncSessionMemoryWithDocument,
    updateSessionMemory,
} from "./memory";
export {
    COMMAND_GUIDE_CARDS,
    type CommandGuideCard,
    commandGuide,
    findCommandGuide,
    type Skill,
    SkillStore,
    searchCommandGuides,
} from "./skills";
export {
    type BomReportItem,
    type BomReportSummary,
    buildBomTools,
    classifyForm,
    type MaterialClassification,
    type MaterialForm,
} from "./tools/bomTools";
export {
    buildCommandTools,
    resolveCommandKey,
    SAFE_DIRECT_COMMANDS,
} from "./tools/commandTools";
