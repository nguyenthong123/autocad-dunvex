// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { LLMProvider, StreamChatOptions, StreamEvent } from "../../src/llm/types";

export type ScriptedTurnAction =
    | {
          type: "tool_calls";
          calls: Array<{ id?: string; name: string; args: Record<string, unknown> | string }>;
      }
    | { type: "text"; text: string; stopReason?: string };

/**
 * Scripted LLM provider for deterministic offline testing of agent loops,
 * tool registries, and verification gates without live LLM network calls.
 */
export class ScriptedLLMProvider implements LLMProvider {
    readonly id = "scripted-offline";
    private readonly script: ScriptedTurnAction[];
    private turnIndex = 0;
    readonly recordedTurns: StreamChatOptions[] = [];

    constructor(script: ScriptedTurnAction[]) {
        this.script = script;
    }

    async *streamChat(opts: StreamChatOptions): AsyncIterable<StreamEvent> {
        this.recordedTurns.push(opts);
        const action = this.script[this.turnIndex];
        this.turnIndex++;

        if (!action) {
            yield { type: "text", text: "Offline test turn completed." };
            yield { type: "done", stopReason: "end_turn" };
            return;
        }

        if (action.type === "tool_calls") {
            for (let i = 0; i < action.calls.length; i++) {
                const call = action.calls[i];
                yield {
                    type: "tool_call",
                    id: call.id ?? `call-${this.turnIndex}-${i + 1}`,
                    name: call.name,
                    arguments: typeof call.args === "string" ? call.args : JSON.stringify(call.args),
                };
            }
            yield { type: "done", stopReason: "tool_use" };
        } else {
            yield { type: "text", text: action.text };
            yield { type: "done", stopReason: action.stopReason ?? "end_turn" };
        }
    }
}
