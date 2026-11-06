// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, I18n, type IShape, Result, ShapeTypes, XYZ } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import { clearRuntimeErrorReports, listRuntimeErrorReports, normalizeStopReason } from "../src/diagnostics";
import {
    type ChatCallbacks,
    endingOf,
    isInformationalQuery,
    MAX_EMPTY_READ_NUDGES,
    NUDGE_AFTER_EMPTY_READ,
    NUDGE_AFTER_EMPTY_READ_INFO,
    NUDGE_AFTER_EMPTY_READ_MODELING,
    NUDGE_AFTER_UNVERIFIED_WRITE,
    runAgent,
} from "../src/llm/agent";
import type { ChatMessage } from "../src/llm/types";
import { clearSessionMemory, getSessionMemory } from "../src/memory";
import { buildTools } from "../src/tools";
import { ScriptedLLMProvider } from "./_helpers/scriptedProvider";

const nullCallbacks: ChatCallbacks = {
    onTextDelta: () => {},
    onThinkingDelta: () => {},
    onToolCall: () => {},
    onUsage: () => {},
};

function setupTestEnvironment() {
    clearSessionMemory();
    clearRuntimeErrorReports();
    const doc = createMockDocument();
    const nodes: any[] = [];
    (doc.modelManager as any).materials = [];
    (doc.modelManager as any).findNodes = (pred?: (n: any) => boolean) =>
        typeof pred === "function" ? nodes.filter(pred) : [...nodes];
    (doc.modelManager as any).addNode = (n: any) => {
        n.boundingBox = () =>
            new BoundingBox(new XYZ({ x: 0, y: 0, z: 0 }), new XYZ({ x: 100, y: 100, z: 100 }));
        nodes.push(n);
        n.parent = { remove: () => nodes.splice(nodes.indexOf(n), 1) };
    };
    (doc.visual as any).update = () => {};

    const solid = {
        shapeType: ShapeTypes.solid,
        boundingBox: () =>
            new BoundingBox(new XYZ({ x: 0, y: 0, z: 0 }), new XYZ({ x: 100, y: 100, z: 100 })),
    };
    const box = () => Result.ok(solid as unknown as IShape);

    const app = createMockApplication({
        shapeProvider: {
            factory: {
                box,
            } as any,
        },
    });
    (app as any).activeView = { document: doc };
    rs.stubGlobal("app", app);

    return { doc, nodes, app, solid };
}

describe("Empty Response Recovery and Diagnostics after Read Tool", () => {
    test("Requirement 1: calling get_document_state alone does NOT create or overwrite lastVerification", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            {
                type: "text",
                text: "Document inspected.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Check document" }];
        await runAgent({
            provider,
            config: { model: "test-model" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const mem = getSessionMemory();
        // Reading document state does NOT mark verified
        expect(mem.lastVerification).toBeUndefined();
    });

    test("Requirement 1: calling get_document_state after a write tool does NOT satisfy verification", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: write op
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: {
                            ops: [{ id: "floor", method: "box", args: { dx: 4000, dy: 8000, dz: 100 } }],
                        },
                    },
                ],
            },
            // Turn 2: read tool
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            // Turn 3: attempt to finish without geometry verification
            {
                type: "text",
                text: "Checked state, done!",
                stopReason: "end_turn",
            },
            // Turn 4: attempt to finish again after nudge
            {
                type: "text",
                text: "Still done without verify.",
                stopReason: "end_turn",
            },
            // Turn 5: attempt to finish again after 2nd nudge -> unverified conclusion
            {
                type: "text",
                text: "Stopping.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Build floor" }];
        await runAgent({
            provider,
            config: { model: "test-model" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        // The model received unverified write nudges because get_document_state did NOT clear the flag
        const verifyNudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        expect(verifyNudges.length).toBe(2);
        const mem = getSessionMemory();
        expect(mem.lastVerification?.verified).toBe(false);
        expect(mem.lastVerification?.summary).toBe("UNVERIFIED");
    });

    test("Requirement 3 & 5: empty response after get_document_state triggers recovery and succeeds on retry", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: model reads document state
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            // Turn 2: model returns empty text (reproducing the issue)
            {
                type: "text",
                text: "",
                stopReason: "end_turn",
            },
            // Turn 3: after recovery nudge, model explains what is needed or executes
            {
                type: "text",
                text: "Dự án dùng đơn vị mm. Vui lòng xác định độ dày 10 là 10mm hay 100mm.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "dựng sàn và vách dày 10" }];
        await runAgent({
            provider,
            config: { model: "claude-opus-5", provider: "anthropic" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        // Synthetic recovery message was injected
        const recoveryNudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_EMPTY_READ_MODELING,
        );
        expect(recoveryNudges.length).toBe(1);

        // Assistant final message contains the explanation
        const lastMsg = messages[messages.length - 1];
        expect(lastMsg.role).toBe("assistant");
        expect(lastMsg.content).toContain("Dự án dùng đơn vị mm");
    });

    test("Requirement 3: informational query -> read tool -> empty turn -> recovery asks only for answer within scope without write tools", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: model reads document state
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            // Turn 2: model returns empty text
            {
                type: "text",
                text: "",
                stopReason: "end_turn",
            },
            // Turn 3: after informational nudge, model answers the question
            {
                type: "text",
                text: "Hiện tại bản vẽ không có đối tượng nào.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [
            { role: "user", content: "Bản vẽ hiện tại có bao nhiêu đối tượng?" },
        ];
        await runAgent({
            provider,
            config: { model: "claude-opus-5", provider: "anthropic" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        // Synthetic recovery message was the informational one
        const recoveryNudges = messages.filter((m) => m.role === "user" && m.synthetic);
        expect(recoveryNudges.length).toBe(1);
        expect(recoveryNudges[0].content).toBe(NUDGE_AFTER_EMPTY_READ_INFO);
        expect(recoveryNudges[0].content).not.toContain("run_program");
        expect(recoveryNudges[0].content).toContain("Do not modify the document");

        // Assistant final message answers the question
        const lastMsg = messages[messages.length - 1];
        expect(lastMsg.role).toBe("assistant");
        expect(lastMsg.content).toContain("Hiện tại bản vẽ không có đối tượng nào.");
    });

    test("Requirement 3 & 5: empty response after get_document_state exhausts recovery -> displays actionable message and records diagnostic", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: read doc state
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            // Turn 2: empty text
            {
                type: "text",
                text: "",
                stopReason: "end_turn",
            },
            // Turn 3: still empty text after nudge
            {
                type: "text",
                text: "",
                stopReason: "end_turn",
            },
        ]);

        const textDeltas: string[] = [];
        const callbacks: ChatCallbacks = {
            ...nullCallbacks,
            onTextDelta: (t) => textDeltas.push(t),
        };

        const messages: ChatMessage[] = [{ role: "user", content: "dựng sàn và vách" }];
        await runAgent({
            provider,
            config: { model: "claude-opus-5", provider: "anthropic" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks,
        });

        // Bounded: only 1 recovery nudge attempted
        const recoveryNudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_EMPTY_READ,
        );
        expect(recoveryNudges.length).toBe(MAX_EMPTY_READ_NUDGES);

        // Actionable message was pushed to onTextDelta
        const actionableExpected = I18n.translate("ai.emptyAfterReadActionable");
        expect(textDeltas.join("")).toContain(actionableExpected);

        // Diagnostics recorded
        const reports = listRuntimeErrorReports();
        const emptyReport = reports.find((r) => r.operation === "empty-response-recovery");
        expect(emptyReport).toBeDefined();
        expect(emptyReport?.errorClass).toBe("ai-planning");
        expect(emptyReport?.diagnostics?.normalizedStopReason).toBe("empty-response");
        expect(emptyReport?.diagnostics?.terminationReason).toBe("empty-after-read-exhausted");
        expect(emptyReport?.diagnostics?.model).toBe("claude-opus-5");
        expect(emptyReport?.diagnostics?.provider).toBe("anthropic");
    });

    test("Cancellation: aborted signal does NOT trigger empty-read recovery or error report", async () => {
        setupTestEnvironment();
        const controller = new AbortController();

        const provider = new ScriptedLLMProvider([
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            (opts) => {
                controller.abort();
                return { type: "text", text: "", stopReason: "end_turn" };
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "dựng sàn" }];
        await runAgent({
            provider,
            config: { model: "claude-opus-5" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
            signal: controller.signal,
        });

        const recoveryNudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_EMPTY_READ,
        );
        expect(recoveryNudges.length).toBe(0);
        const reports = listRuntimeErrorReports();
        expect(reports.filter((r) => r.operation === "empty-response-recovery").length).toBe(0);
    });

    test("Refusal: model refusal does NOT trigger empty-read recovery", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            {
                type: "tool_calls",
                calls: [{ name: "get_document_state", args: {} }],
            },
            {
                type: "text",
                text: "",
                stopReason: "refusal",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "dựng sàn" }];
        await runAgent({
            provider,
            config: { model: "test-model" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const recoveryNudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_EMPTY_READ,
        );
        expect(recoveryNudges.length).toBe(0);
    });

    test("Avoid duplicate writes: if write tool already ran, empty turn does NOT trigger empty-read recovery", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: write tool succeeds
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: { ops: [{ id: "b1", method: "box", args: { dx: 100, dy: 100, dz: 100 } }] },
                    },
                ],
            },
            // Turn 2: model attempts stop with empty text (and unverified write nudge will handle verification, not empty-read)
            {
                type: "text",
                text: "",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Create box" }];
        await runAgent({
            provider,
            config: { model: "test-model" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        // Empty read recovery did NOT fire because write tools already executed
        const emptyReadNudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_EMPTY_READ,
        );
        expect(emptyReadNudges.length).toBe(0);
    });

    test("Requirement 2: normalizeStopReason differentiates stop reasons accurately", () => {
        // Token limits
        expect(normalizeStopReason("max_tokens")).toBe("token-limit");
        expect(normalizeStopReason("length")).toBe("token-limit");
        expect(normalizeStopReason("incomplete")).toBe("token-limit");
        expect(normalizeStopReason(undefined, { error: new Error("context_length_exceeded") })).toBe(
            "token-limit",
        );

        // Empty response
        expect(normalizeStopReason("end_turn", { text: "" })).toBe("empty-response");
        expect(normalizeStopReason("stop", { text: "   " })).toBe("empty-response");

        // Stream parse error
        expect(normalizeStopReason(undefined, { error: new SyntaxError("Unexpected token in JSON") })).toBe(
            "stream-parse-error",
        );
        expect(normalizeStopReason(undefined, { error: new Error("Malformed chunk event-stream") })).toBe(
            "stream-parse-error",
        );

        // Aborted
        expect(normalizeStopReason(undefined, { aborted: true })).toBe("aborted");

        // Provider error
        expect(normalizeStopReason(undefined, { error: new Error("HTTP 500 Internal Server Error") })).toBe(
            "provider-error",
        );

        // Tool calls
        expect(normalizeStopReason("tool_use")).toBe("tool-call");
        expect(normalizeStopReason("tool_calls")).toBe("tool-call");
        expect(normalizeStopReason("stop", { toolCallsCount: 1 })).toBe("tool-call");

        // Refusal
        expect(normalizeStopReason("refusal")).toBe("refusal");
        expect(normalizeStopReason("content_filter")).toBe("refusal");

        // Complete normal text
        expect(normalizeStopReason("end_turn", { text: "Hello CAD" })).toBe("complete");
    });

    test("Requirement 3: isInformationalQuery separates query-only requests from modeling requests", () => {
        expect(isInformationalQuery("Bản vẽ hiện tại có bao nhiêu đối tượng?")).toBe(true);
        expect(isInformationalQuery("Liệt kê các khối trong scene")).toBe(true);
        expect(isInformationalQuery("What nodes exist in the current document?")).toBe(true);
        expect(isInformationalQuery("How many shapes are in the tree?")).toBe(true);

        expect(isInformationalQuery("dựng sàn và vách")).toBe(false);
        expect(isInformationalQuery("tạo một khối hộp 100x100x100")).toBe(false);
        expect(isInformationalQuery("vẽ hình chữ nhật")).toBe(false);
        expect(isInformationalQuery("build a box at origin")).toBe(false);
        expect(isInformationalQuery("extrude the profile by 50mm")).toBe(false);
    });
});
