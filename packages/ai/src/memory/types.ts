// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export interface ActiveNodeRef {
    id: string;
    name: string;
    role?: string;
}

export interface SessionRecentError {
    toolName: string;
    operation?: string;
    errorMessage: string;
    timestamp: number;
}

export interface SessionVerificationInfo {
    timestamp: number;
    toolName: string;
    summary: string;
    verified: boolean;
}

export interface SessionMemory {
    goal: string;
    currentPlan: string[];
    completedSteps: string[];
    pendingSteps: string[];
    userConstraints: Record<string, unknown>;
    activeNodes: ActiveNodeRef[];
    removedNodeIds: string[];
    recentErrors: SessionRecentError[];
    lastVerification?: SessionVerificationInfo;
}

export type SessionMemoryPatch = Partial<Omit<SessionMemory, "userConstraints">> & {
    userConstraints?: Record<string, unknown>;
};
