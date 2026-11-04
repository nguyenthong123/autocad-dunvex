// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, EditableShapeNode, type IShape, Matrix4, Result, ShapeTypes, XYZ } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { describe, expect, rs, test } from "@rstest/core";
import { type ChatCallbacks, NUDGE_AFTER_UNVERIFIED_WRITE, runAgent } from "../src/llm/agent";
import type { ChatMessage } from "../src/llm/types";
import { clearSessionMemory, getSessionMemory } from "../src/memory/sessionMemory";
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

    const transformedMul = () => ({ shapeType: ShapeTypes.solid });
    const solid = {
        shapeType: ShapeTypes.solid,
        transformedMul,
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

    return { doc, nodes, app };
}

describe("TASK-38: Offline Agent Loop & Verification Gate Harness", () => {
    test("Scenario 1: run_program creates box -> model attempts stop -> nudged exactly 2 times -> finishes unverified", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: Write op creates box
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: { ops: [{ method: "box", args: { dx: 100, dy: 100, dz: 100 } }] },
                    },
                ],
            },
            // Turn 2: Attempt to conclude without verifying
            {
                type: "text",
                text: "Box created. Done!",
                stopReason: "end_turn",
            },
            // Turn 3: Attempt to conclude without verifying again
            {
                type: "text",
                text: "I repeat, I am done.",
                stopReason: "end_turn",
            },
            // Turn 4: Final attempt to stop after max nudges reached
            {
                type: "text",
                text: "Done finally.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Create a 100mm cube" }];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        // Nudges are synthetic user messages
        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        expect(nudges.length).toBe(2);

        // Verification state in session memory should be marked unverified
        const mem = getSessionMemory();
        expect(mem.lastVerification).toBeDefined();
        expect(mem.lastVerification?.verified).toBe(false);
        expect(mem.lastVerification?.summary).toBe("UNVERIFIED");
    });

    test("Scenario 2: run_program creates box -> model calls measure_nodes -> NO nudges", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: Write op creates box
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: {
                            ops: [
                                { id: "b1", name: "b1", method: "box", args: { dx: 100, dy: 100, dz: 100 } },
                            ],
                        },
                    },
                ],
            },
            // Turn 2: Verification tool measure_nodes
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "measure_nodes",
                        args: { nodeIds: ["b1"] },
                    },
                ],
            },
            // Turn 3: Conclude after verification
            {
                type: "text",
                text: "Created and verified successfully.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Create a 100mm cube" }];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        expect(nudges.length).toBe(0);

        const mem = getSessionMemory();
        expect(mem.lastVerification).toBeDefined();
        expect(mem.lastVerification?.verified).toBe(true);
        expect(mem.lastVerification?.toolName).toBe("measure_nodes");
    });

    test("Scenario 3: run_program -> get_document_state -> STILL nudged (confirms get_document_state does NOT clear flag)", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: Write op creates box
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: {
                            ops: [
                                { id: "b1", name: "b1", method: "box", args: { dx: 100, dy: 100, dz: 100 } },
                            ],
                        },
                    },
                ],
            },
            // Turn 2: Call get_document_state (read tool, NOT in VERIFY_TOOLS)
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "get_document_state",
                        args: {},
                    },
                ],
            },
            // Turn 3: Attempt to conclude -> should receive nudge
            {
                type: "text",
                text: "Checked doc state, done!",
                stopReason: "end_turn",
            },
            // Turn 4: Verify via measure_nodes after nudge
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "measure_nodes",
                        args: { nodeIds: ["b1"] },
                    },
                ],
            },
            // Turn 5: Conclude
            {
                type: "text",
                text: "Now truly verified and done.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Create and check" }];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        // Had 1 nudge between Turn 3 and Turn 4
        expect(nudges.length).toBe(1);

        const mem = getSessionMemory();
        expect(mem.lastVerification?.verified).toBe(true);
        expect(mem.lastVerification?.toolName).toBe("measure_nodes");
    });

    test("Scenario 4: run_program errors -> flag NOT set, NO nudges", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: Invalid op causing error
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: { ops: [{ method: "invalid_unknown_op_xyz" }] },
                    },
                ],
            },
            // Turn 2: Conclude
            {
                type: "text",
                text: "Operation failed, cannot continue.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Do invalid op" }];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        expect(nudges.length).toBe(0);

        const mem = getSessionMemory();
        // Since no write succeeded, no unverified flag was set
        expect(mem.lastVerification?.verified).not.toBe(false);
    });

    test("Regression Case 1: creating node A then measuring node B still requires verification (nudged and unverified)", async () => {
        const { doc } = setupTestEnvironment();
        // Pre-create existing node B in document
        const existingNodeB = new EditableShapeNode({ document: doc } as any);
        existingNodeB.name = "nodeB";
        doc.modelManager.addNode(existingNodeB);

        const provider = new ScriptedLLMProvider([
            // Turn 1: Model creates nodeA
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: {
                            ops: [
                                {
                                    id: "nodeA",
                                    name: "nodeA",
                                    method: "box",
                                    args: { dx: 100, dy: 100, dz: 100 },
                                },
                            ],
                        },
                    },
                ],
            },
            // Turn 2: Model measures nodeB instead of nodeA
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "measure_nodes",
                        args: { nodeIds: ["nodeB"] },
                    },
                ],
            },
            // Turn 3: Model attempts to stop without verifying nodeA
            {
                type: "text",
                text: "I measured nodeB and I am done.",
                stopReason: "end_turn",
            },
            // Turn 4: Agent nudges (1/2), model attempts to stop again
            {
                type: "text",
                text: "Still not measuring nodeA, attempting to stop again.",
                stopReason: "end_turn",
            },
            // Turn 5: Agent nudges (2/2), model finishes unverified
            {
                type: "text",
                text: "Stopping now without verifying nodeA.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Create nodeA and measure" }];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        // Must be nudged 2 times because measuring nodeB cannot verify nodeA!
        expect(nudges.length).toBe(2);

        const mem = getSessionMemory();
        expect(mem.lastVerification?.verified).toBe(false);
        expect(mem.lastVerification?.summary).toBe("UNVERIFIED");
    });

    test("Regression Case 2: creating node A then measuring node A with valid result confirms verification", async () => {
        setupTestEnvironment();
        const provider = new ScriptedLLMProvider([
            // Turn 1: Model creates nodeA
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: {
                            ops: [
                                {
                                    id: "nodeA",
                                    name: "nodeA",
                                    method: "box",
                                    args: { dx: 100, dy: 100, dz: 100 },
                                },
                            ],
                        },
                    },
                ],
            },
            // Turn 2: Model measures nodeA
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "measure_nodes",
                        args: { nodeIds: ["nodeA"] },
                    },
                ],
            },
            // Turn 3: Model concludes after valid verification of nodeA
            {
                type: "text",
                text: "Created nodeA and verified its dimensions successfully.",
                stopReason: "end_turn",
            },
        ]);

        const messages: ChatMessage[] = [{ role: "user", content: "Create nodeA and measure it" }];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        // Exactly 0 nudges because nodeA was properly verified!
        expect(nudges.length).toBe(0);

        const mem = getSessionMemory();
        expect(mem.lastVerification?.verified).toBe(true);
        expect(mem.lastVerification?.toolName).toBe("measure_nodes");
    });

    test("Regression Case 3: BOM requested for nodeA and nodeB but output only has nodeB -> nodeA must continue waiting for verification", async () => {
        const { doc, nodes } = setupTestEnvironment();

        const provider = new ScriptedLLMProvider([
            // Turn 1: Write op modifies/creates nodeA and nodeB
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_program",
                        args: {
                            ops: [
                                {
                                    id: "nodeA",
                                    name: "nodeA",
                                    method: "box",
                                    args: { dx: 100, dy: 50, dz: 20 },
                                },
                                {
                                    id: "nodeB",
                                    name: "nodeB",
                                    method: "box",
                                    args: { dx: 100, dy: 50, dz: 20 },
                                },
                            ],
                        },
                    },
                ],
            },
            // Turn 2: Model requests BOM for both nodeA and nodeB, but nodeA has been removed / omitted from results
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "bom_report",
                        args: { nodeIds: ["nodeA", "nodeB"] },
                    },
                ],
            },
            // Turn 3: Model tries to conclude, but nodeA was not in BOM evidence
            {
                type: "text",
                text: "Requested BOM for nodeA and nodeB, I am done.",
                stopReason: "end_turn",
            },
            // Turn 4: Nudge 1
            {
                type: "text",
                text: "Trying to stop again without nodeA verified.",
                stopReason: "end_turn",
            },
            // Turn 5: Nudge 2 -> finish unverified
            {
                type: "text",
                text: "Stopping now.",
                stopReason: "end_turn",
            },
        ]);

        // Wrap addNode so after nodeA is created, we simulate nodeA missing from document before BOM
        const origAdd = (doc.modelManager as any).addNode;
        (doc.modelManager as any).addNode = (n: any) => {
            origAdd(n);
            if (n.name === "nodeA" || (n as any).id === "nodeA") {
                // Remove nodeA from active nodes so collectLeafNodes will only find nodeB
                setTimeout(() => {
                    const idx = nodes.indexOf(n);
                    if (idx >= 0) nodes.splice(idx, 1);
                }, 0);
            }
        };

        const messages: ChatMessage[] = [
            { role: "user", content: "Create nodeA and nodeB, then BOM report" },
        ];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools: buildTools(),
            callbacks: nullCallbacks,
        });

        // nodeA was not verified, so model must be nudged
        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        expect(nudges.length).toBe(2);

        const mem = getSessionMemory();
        expect(mem.lastVerification?.verified).toBe(false);
        expect(mem.lastVerification?.summary).toBe("UNVERIFIED");
    });

    test("Regression Case 4: unknown write target followed by inspecting arbitrary object -> status must remain unverified", async () => {
        const { doc, nodes } = setupTestEnvironment();
        const arbitraryBox = new EditableShapeNode({ document: doc });
        (arbitraryBox as any).id = "arbitrary-box";
        arbitraryBox.name = "arbitrary-box";
        arbitraryBox.boundingBox = () =>
            new BoundingBox(new XYZ({ x: 0, y: 0, z: 0 }), new XYZ({ x: 80, y: 80, z: 80 }));
        nodes.push(arbitraryBox);

        // Custom write tool with unknown target (name is in WRITE_TOOLS, but returns no targets in output or args)
        const mockWriteTool = {
            name: "run_parametric",
            description: "Parametric op",
            parameters: { type: "object", properties: {} },
            handler: async () => JSON.stringify({ success: true, count: 1 }),
        };

        const provider = new ScriptedLLMProvider([
            // Turn 1: Write op with unknown targets
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "run_parametric",
                        args: {},
                    },
                ],
            },
            // Turn 2: Model measures an arbitrary object (arbitrary-box)
            {
                type: "tool_calls",
                calls: [
                    {
                        name: "measure_nodes",
                        args: { nodeIds: ["arbitrary-box"] },
                    },
                ],
            },
            // Turn 3: Model tries to conclude claiming arbitrary inspection verified the write
            {
                type: "text",
                text: "I checked an arbitrary object so I am done.",
                stopReason: "end_turn",
            },
            // Turn 4: Nudge 1
            {
                type: "text",
                text: "Still trying to finish.",
                stopReason: "end_turn",
            },
            // Turn 5: Nudge 2 -> finish unverified
            {
                type: "text",
                text: "Finishing unverified.",
                stopReason: "end_turn",
            },
        ]);

        const tools = [...buildTools().filter((t) => t.name !== "run_parametric"), mockWriteTool];
        const messages: ChatMessage[] = [
            { role: "user", content: "Do unknown modification and measure arbitrary" },
        ];
        await runAgent({
            provider,
            config: { model: "scripted" } as any,
            system: { stable: "system-test", volatile: "" },
            messages,
            tools,
            callbacks: nullCallbacks,
        });

        const nudges = messages.filter(
            (m) => m.role === "user" && m.content === NUDGE_AFTER_UNVERIFIED_WRITE,
        );
        expect(nudges.length).toBe(2);

        const mem = getSessionMemory();
        expect(mem.lastVerification?.verified).toBe(false);
        expect(mem.lastVerification?.summary).toBe("UNVERIFIED");
    });
});
