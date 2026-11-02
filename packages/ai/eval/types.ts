// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { StreamEvent, TokenUsage } from "../src/llm/types";

export interface ScenarioExpect {
    countNodes?: {
        name?: string;
        kind?: string;
        equals?: number;
        min?: number;
        max?: number;
    };
    nodeProperties?: {
        id?: string;
        name?: string;
        dimensions?: [number, number, number];
        position?: [number, number, number];
        materialId?: string;
    };
    boundsWithin?: {
        min?: [number, number, number];
        max?: [number, number, number];
        region?: string;
        mm?: number;
    };
    askUserCalled?: boolean;
    refusal?: boolean;
    noOverlap?: boolean;
    toolCalled?: string[];
}

export interface ScenarioBudget {
    maxToolCalls: number;
    maxSeconds: number;
}

export interface Scenario {
    id: string;
    prompt: string;
    fixture: string;
    expect: ScenarioExpect;
    budget: ScenarioBudget;
    status?: "active" | "pending-TASK-21" | "needs-review";
    description?: string;
}

export interface ScenarioRecording {
    scenarioId: string;
    source: "synthetic-hand-written" | "model-recorded";
    turns: Array<{
        turnIndex: number;
        events: StreamEvent[];
    }>;
}

export interface ScenarioResult {
    id: string;
    status: "pass" | "fail" | "pending" | "needs-review" | "no-recording";
    durationMs: number;
    toolCallsCount: number;
    toolCalls?: Array<{ name: string; arguments: string; result?: string }>;
    tokenUsage: TokenUsage;
    errors: string[];
    pendingReason?: string;
    reviewReason?: string;
}

export interface EvalReport {
    timestamp: string;
    label: string;
    mode: "replay-synthetic" | "replay-recorded" | "live";
    warning?: string;
    summary: {
        total: number;
        passed: number;
        failed: number;
        pending: number;
        needsReview: number;
        avgToolCalls: number;
        avgDurationMs: number;
        passRatePercent: number;
    };
    results: ScenarioResult[];
}
