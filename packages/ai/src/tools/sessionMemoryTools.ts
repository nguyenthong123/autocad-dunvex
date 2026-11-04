// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Tool } from "../llm/types";
import { clearSessionMemory, getSessionMemory, updateSessionMemory } from "../memory";

export function buildSessionMemoryTools(): Tool[] {
    return [
        {
            name: "get_session_memory",
            description:
                "Read the structured short-term session memory of the assistant: current goal, execution plan, completed/pending steps, established user constraints, active nodes, consumed/removed node ids, and recent errors.",
            parameters: {
                type: "object",
                properties: {},
            },
            handler: () => {
                return Promise.resolve(JSON.stringify(getSessionMemory()));
            },
        },
        {
            name: "update_session_memory",
            description:
                "Update the assistant's structured short-term session memory with current goal, steps, or user constraints. Automatically updates the active prompt.",
            parameters: {
                type: "object",
                properties: {
                    goal: {
                        type: "string",
                        description: "The overarching goal of the current modeling session.",
                    },
                    currentPlan: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of planned steps for achieving the goal.",
                    },
                    completedSteps: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of steps completed so far.",
                    },
                    pendingSteps: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of remaining steps to perform.",
                    },
                    userConstraints: {
                        type: "object",
                        description: "Key-value map of explicit user decisions, dimensions, and constraints.",
                    },
                },
            },
            handler: (args) => {
                const updated = updateSessionMemory({
                    goal: typeof args["goal"] === "string" ? (args["goal"] as string) : undefined,
                    currentPlan: Array.isArray(args["currentPlan"])
                        ? (args["currentPlan"] as string[])
                        : undefined,
                    completedSteps: Array.isArray(args["completedSteps"])
                        ? (args["completedSteps"] as string[])
                        : undefined,
                    pendingSteps: Array.isArray(args["pendingSteps"])
                        ? (args["pendingSteps"] as string[])
                        : undefined,
                    userConstraints:
                        args["userConstraints"] && typeof args["userConstraints"] === "object"
                            ? (args["userConstraints"] as Record<string, unknown>)
                            : undefined,
                });
                return Promise.resolve(JSON.stringify({ updated: true, memory: updated }));
            },
        },
        {
            name: "clear_session_memory",
            description: "Clear and reset the assistant's short-term session memory to an empty state.",
            parameters: {
                type: "object",
                properties: {},
            },
            handler: () => {
                clearSessionMemory();
                return Promise.resolve(JSON.stringify({ cleared: true }));
            },
        },
    ];
}
