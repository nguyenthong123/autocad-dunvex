// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { LLMProvider, StreamChatOptions, StreamEvent } from "../src/llm/types";
import type { ScenarioRecording } from "./types";

export class ReplayProvider implements LLMProvider {
    readonly id = "replay-provider";
    private turnIndex = 0;

    constructor(private readonly recording: ScenarioRecording) {}

    async *streamChat(_opts: StreamChatOptions): AsyncIterable<StreamEvent> {
        if (this.turnIndex >= this.recording.turns.length) {
            yield { type: "text", text: "Conversation finished." };
            yield { type: "done", stopReason: "end_turn" };
            return;
        }

        const turn = this.recording.turns[this.turnIndex++];
        for (const event of turn.events) {
            yield event;
        }
    }
}
