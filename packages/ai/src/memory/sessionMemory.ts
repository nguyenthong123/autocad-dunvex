// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { ActiveNodeRef, SessionMemory, SessionMemoryPatch, SessionRecentError } from "./types";

export const SESSION_MEMORY_MAX_SUMMARY_CHARS = 1500;
const MAX_RECENT_ERRORS = 5;
const MAX_ACTIVE_NODES = 25;
const MAX_REMOVED_NODES = 50;

function createInitialMemory(): SessionMemory {
    return {
        goal: "",
        currentPlan: [],
        completedSteps: [],
        pendingSteps: [],
        userConstraints: {},
        activeNodes: [],
        removedNodeIds: [],
        recentErrors: [],
    };
}

let currentMemory: SessionMemory = createInitialMemory();

/**
 * Returns a clone of the current session memory.
 */
export function getSessionMemory(): SessionMemory {
    return {
        goal: currentMemory.goal,
        currentPlan: [...currentMemory.currentPlan],
        completedSteps: [...currentMemory.completedSteps],
        pendingSteps: [...currentMemory.pendingSteps],
        userConstraints: { ...currentMemory.userConstraints },
        activeNodes: currentMemory.activeNodes.map((n) => ({ ...n })),
        removedNodeIds: [...currentMemory.removedNodeIds],
        recentErrors: currentMemory.recentErrors.map((e) => ({ ...e })),
        lastVerification: currentMemory.lastVerification ? { ...currentMemory.lastVerification } : undefined,
    };
}

/**
 * Updates the session memory with the provided patch.
 */
export function updateSessionMemory(patch: SessionMemoryPatch): SessionMemory {
    if (patch.goal !== undefined) currentMemory.goal = patch.goal.trim();
    if (patch.currentPlan !== undefined) currentMemory.currentPlan = [...patch.currentPlan];
    if (patch.completedSteps !== undefined) currentMemory.completedSteps = [...patch.completedSteps];
    if (patch.pendingSteps !== undefined) currentMemory.pendingSteps = [...patch.pendingSteps];
    if (patch.userConstraints !== undefined) {
        currentMemory.userConstraints = {
            ...currentMemory.userConstraints,
            ...patch.userConstraints,
        };
    }
    if (patch.activeNodes !== undefined) {
        currentMemory.activeNodes = [...patch.activeNodes].slice(-MAX_ACTIVE_NODES);
    }
    if (patch.removedNodeIds !== undefined) {
        currentMemory.removedNodeIds = Array.from(
            new Set([...currentMemory.removedNodeIds, ...patch.removedNodeIds]),
        ).slice(-MAX_REMOVED_NODES);
    }
    if (patch.recentErrors !== undefined) {
        currentMemory.recentErrors = [...patch.recentErrors].slice(-MAX_RECENT_ERRORS);
    }
    if (patch.lastVerification !== undefined) {
        currentMemory.lastVerification = patch.lastVerification ? { ...patch.lastVerification } : undefined;
    }
    return getSessionMemory();
}

/**
 * Resets the session memory to its initial empty state.
 */
export function clearSessionMemory(): void {
    currentMemory = createInitialMemory();
}

/**
 * Lifecycle hook: called when nodes are created by modeling tools.
 */
export function onNodesCreated(nodes: Array<{ id: string; name?: string; role?: string }>): void {
    if (!nodes || nodes.length === 0) return;
    const existingMap = new Map(currentMemory.activeNodes.map((n) => [n.id, n]));
    for (const node of nodes) {
        if (!node.id) continue;
        existingMap.set(node.id, {
            id: node.id,
            name: node.name || node.id,
            role: node.role,
        });
        // If node was previously marked as removed, un-mark it (e.g. restored or recreated)
        currentMemory.removedNodeIds = currentMemory.removedNodeIds.filter((id) => id !== node.id);
    }
    currentMemory.activeNodes = Array.from(existingMap.values()).slice(-MAX_ACTIVE_NODES);
}

/**
 * Lifecycle hook: called when nodes are consumed or deleted.
 * Consumed node ids are permanently added to removedNodeIds and evicted from activeNodes.
 */
export function onNodesRemoved(nodeIds: string[]): void {
    if (!nodeIds || nodeIds.length === 0) return;
    const removedSet = new Set(nodeIds);
    currentMemory.activeNodes = currentMemory.activeNodes.filter((n) => !removedSet.has(n.id));
    currentMemory.removedNodeIds = Array.from(new Set([...currentMemory.removedNodeIds, ...nodeIds])).slice(
        -MAX_REMOVED_NODES,
    );
}

/**
 * Lifecycle hook: called when a node is renamed.
 */
export function onNodeRenamed(id: string, name: string): void {
    const node = currentMemory.activeNodes.find((n) => n.id === id);
    if (node) {
        node.name = name;
    }
}

/**
 * Lifecycle hook: called when a user decision / constraint is established (e.g. from ask_user).
 */
export function onUserConstraint(key: string, value: unknown): void {
    currentMemory.userConstraints[key] = value;
}

/**
 * Lifecycle hook: called when a tool or operation encounters a runtime error.
 */
export function onRecentError(err: { toolName: string; operation?: string; errorMessage: string }): void {
    const entry: SessionRecentError = {
        toolName: err.toolName,
        operation: err.operation,
        errorMessage: err.errorMessage.slice(0, 150),
        timestamp: Date.now(),
    };
    currentMemory.recentErrors = [entry, ...currentMemory.recentErrors].slice(0, MAX_RECENT_ERRORS);
}

/**
 * Lifecycle hook: called when a verification tool (e.g. measure_nodes, get_document_state)
 * verifies the post-write geometry state.
 */
export function onVerificationCompleted(toolName: string, summary: string): void {
    currentMemory.lastVerification = {
        timestamp: Date.now(),
        toolName,
        summary: summary.slice(0, 200),
        verified: true,
    };
}

/**
 * Formats a compact summary of session memory for inclusion in the volatile system prompt.
 * Guaranteed to stay <= SESSION_MEMORY_MAX_SUMMARY_CHARS (1500 chars).
 */
export function formatSessionMemorySummary(mem: SessionMemory = currentMemory): string {
    const parts: string[] = [];

    if (mem.goal) {
        parts.push(`- Goal: ${mem.goal}`);
    }

    if (mem.currentPlan.length > 0) {
        parts.push(`- Plan: ${mem.currentPlan.join(" -> ")}`);
    }

    if (mem.completedSteps.length > 0) {
        parts.push(`- Completed: ${mem.completedSteps.join(", ")}`);
    }

    if (mem.pendingSteps.length > 0) {
        parts.push(`- Pending: ${mem.pendingSteps.join(", ")}`);
    }

    const constraintEntries = Object.entries(mem.userConstraints);
    if (constraintEntries.length > 0) {
        const text = constraintEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
        parts.push(`- User decisions: ${text}`);
    }

    if (mem.activeNodes.length > 0) {
        const nodesList = mem.activeNodes
            .map((n) => `${n.id}${n.name && n.name !== n.id ? `("${n.name}")` : ""}`)
            .join(", ");
        parts.push(`- Active nodes: [${nodesList}]`);
    }

    if (mem.removedNodeIds.length > 0) {
        parts.push(
            `- Removed/Consumed nodes (FORBIDDEN to reuse/reference): [${mem.removedNodeIds.join(", ")}]`,
        );
    }

    if (mem.lastVerification) {
        parts.push(
            `- Last verification: via ${mem.lastVerification.toolName} ("${mem.lastVerification.summary}")`,
        );
    }

    if (mem.recentErrors.length > 0) {
        const errList = mem.recentErrors
            .map((e) => `${e.toolName}${e.operation ? `.${e.operation}` : ""}: "${e.errorMessage}"`)
            .join("; ");
        parts.push(`- Recent errors: ${errList}`);
    }

    if (parts.length === 0) return "";

    let summary = `## Active Session Memory\n${parts.join("\n")}`;
    if (summary.length > SESSION_MEMORY_MAX_SUMMARY_CHARS) {
        summary = `${summary.slice(0, SESSION_MEMORY_MAX_SUMMARY_CHARS - 15)}… (truncated)`;
    }
    return summary;
}
