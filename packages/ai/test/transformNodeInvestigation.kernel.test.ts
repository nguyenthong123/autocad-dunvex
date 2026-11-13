// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
    EditableShapeNode,
    GeometryUtils,
    type IDocument,
    type IFace,
    type IShape,
    Matrix4,
    ParameterShapeNode,
    Plane,
    property,
    type Result,
    serializable,
    serialize,
    Transaction,
    XYZ,
} from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { afterEach, beforeAll, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { buildThreeWaveProfileFace } from "../../../plugins/component-library/src/geometry/profileBuilder";
import {
    clearTaskProfile,
    ensureSourceProtection,
    governTool,
    recordTaskOwnedNodes,
    resetSourceProtectionForTests,
    resetTaskProfileForTests,
    resetVerificationForTests,
} from "../src/governance";
import { runAgent } from "../src/llm/agent";
import type { LLMProvider, StreamEvent } from "../src/llm/types";
import { buildNodeTools } from "../src/tools/nodeTools";
import { buildPropertyTools } from "../src/tools/propertyTools";

const WASM_PATH = path.resolve(__dirname, "../../wasm/lib/chili-wasm.wasm");
const WASM_BINARY = readFileSync(WASM_PATH);

describe("Transform Node Error Investigation & LS-3S-150 Shorten/Cut Scenarios", () => {
    let doc: TestDocument;
    let factory: ShapeFactory;

    @serializable()
    class TestExtrudeNode extends ParameterShapeNode {
        override display(): any {
            return "body.extrude";
        }

        @serialize()
        get section(): IFace {
            return this.getPrivateValue("section");
        }
        set section(v: IFace) {
            this.setPropertyEmitShapeChanged("section", v);
        }

        @serialize()
        @property("common.length")
        get length(): number {
            return this.getPrivateValue("length");
        }
        set length(v: number) {
            this.setPropertyEmitShapeChanged("length", v);
        }

        constructor(options: {
            document: IDocument;
            section: IFace;
            length: number;
            name?: string;
            id?: string;
        }) {
            super(options);
            this.setPrivateValue("section", options.section);
            this.setPrivateValue("length", options.length);
            if (options.name) this.name = options.name;
            if (options.id) (this as any)._id = options.id;
        }

        override generateShape(): Result<IShape> {
            const normal = GeometryUtils.normal(this.section as any);
            const vec = normal.multiply(this.length);
            return factory.prism(this.section, vec);
        }
    }
    Object.defineProperty(TestExtrudeNode, "name", { value: "ExtrudeNode" });

    beforeAll(async () => {
        await initWasm({ wasmBinary: WASM_BINARY });
        factory = new ShapeFactory();
    });

    beforeEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetSourceProtectionForTests();
        clearTaskProfile();
        doc = new TestDocument({
            selection: { clearSelection: rs.fn(), getSelectedNodes: () => [] } as any,
        });
        (doc.visual as any).update = rs.fn();
        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        rs.stubGlobal("app", app);
    });

    afterEach(() => {
        resetVerificationForTests();
        resetTaskProfileForTests();
        resetSourceProtectionForTests();
        rs.unstubAllGlobals();
    });

    function createLS3S150SectionFace(anchor: XYZ): IFace {
        // Wall facing +Y (normalDir = +Y), width along +X, length along +Z (vertical)
        const res = buildThreeWaveProfileFace(
            factory,
            anchor,
            new XYZ(1, 0, 0),
            new XYZ(0, 1, 0),
            new XYZ(0, 0, 1),
        );
        if (!res.isOk) throw new Error(res.error);
        return res.value;
    }

    function measureSolidBounds(shape: IShape) {
        const mesh = shape.mesh.faces;
        const pos = mesh.position;
        let minX = Infinity,
            minY = Infinity,
            minZ = Infinity;
        let maxX = -Infinity,
            maxY = -Infinity,
            maxZ = -Infinity;
        for (let i = 0; i < pos.length; i += 3) {
            const x = pos[i];
            const y = pos[i + 1];
            const z = pos[i + 2];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
        }
        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ },
            size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
            vertexFloatCount: pos.length,
        };
    }

    // =========================================================================
    // 1. Đối chiếu Schema gửi đi, tham số đúng kiểu, tham số chuỗi, và cổng bảo vệ
    // =========================================================================
    test("1a. Schema của transform_node định nghĩa rõ kiểu anyOf (number | Vec3) cho scale và xử lý đúng kiểu", async () => {
        ensureSourceProtection(doc);
        const node = { id: "copy-1", name: "Thanh bản sao", transform: Matrix4.identity() };
        (doc.modelManager as any).findNodes = rs.fn(() => [node]);
        recordTaskOwnedNodes(["copy-1"], doc);

        const rawTool = buildNodeTools().find((t) => t.name === "transform_node")!;
        const scaleSchema = (rawTool.parameters as any).properties.scale;
        expect(scaleSchema.anyOf).toBeDefined();
        expect(scaleSchema.anyOf[0].type).toBe("number");
        expect(scaleSchema.anyOf[1].type).toBe("object");
        expect(scaleSchema.anyOf[1].required).toEqual(["x", "y", "z"]);

        const governed = governTool(rawTool);

        const resObj = JSON.parse(
            (await governed.handler({
                id: "copy-1",
                scale: { x: 1, y: 0.6666666666666666, z: 1 },
            })) as string,
        );
        expect(resObj.error).toBeUndefined();
        expect(resObj.id).toBe("copy-1");
        expect(node.transform.toArray()[5]).toBeCloseTo(2 / 3, 6);

        const resNum = JSON.parse(
            (await governed.handler({
                id: "copy-1",
                scale: 1.5,
            })) as string,
        );
        expect(resNum.error).toBeUndefined();
        expect(node.transform.toArray()[0]).toBeCloseTo(1.5, 6);
        expect(node.transform.toArray()[5]).toBeCloseTo(1.0, 6);
    });

    test("1b. transform_node xử lý an toàn tham số chuỗi JSON và chuỗi số từ báo cáo lỗi thực tế", async () => {
        ensureSourceProtection(doc);
        const node = { id: "copy-str", name: "Thanh bản sao", transform: Matrix4.identity() };
        (doc.modelManager as any).findNodes = rs.fn(() => [node]);
        recordTaskOwnedNodes(["copy-str"], doc);

        const rawTool = buildNodeTools().find((t) => t.name === "transform_node")!;
        const governed = governTool(rawTool);

        // Chuỗi JSON y hệt err_1794571431142_xvne1a
        const resJsonStr = JSON.parse(
            (await governed.handler({
                id: "copy-str",
                scale: '{"x": 1, "y": 0.6666666666666666, "z": 1}',
            })) as string,
        );
        expect(resJsonStr.error).toBeUndefined();
        expect(node.transform.toArray()[5]).toBeCloseTo(2 / 3, 6);

        // Chuỗi số vô hướng y hệt err_1794571426896_k6nuhw
        const resScalarStr = JSON.parse(
            (await governed.handler({
                id: "copy-str",
                scale: "0.6666666666666666",
            })) as string,
        );
        expect(resScalarStr.error).toBeUndefined();
        expect(node.transform.toArray()[0]).toBeCloseTo(2 / 3, 6);

        // Chuỗi không hợp lệ (biểu thức phân số "2/3" từ err_1794571412823_f5sdw2) trả về lỗi rõ ràng
        const resInvalidStr = JSON.parse(
            (await governed.handler({
                id: "copy-str",
                scale: '{"x": 1, "y": 2/3, "z": 1}',
            })) as string,
        );
        expect(resInvalidStr.error).toContain("scale must be an object {x, y, z}");
    });

    test("1c. Cổng bảo vệ đối tượng gốc chặn thao tác trên node chưa được cấp quyền (PERMISSION_DENIED)", async () => {
        const protectedNode = {
            id: "NylPgf-CZVa_VEhpnUpJa",
            name: "Tấm ốp lam 3 sóng 150×15 (gốc)",
            transform: Matrix4.identity(),
        };
        doc.modelManager.addNode(protectedNode as any);
        ensureSourceProtection(doc);

        const rawTool = buildNodeTools().find((t) => t.name === "transform_node")!;
        const governed = governTool(rawTool);

        const resDenied = JSON.parse(
            (await governed.handler({
                id: "NylPgf-CZVa_VEhpnUpJa",
                scale: { x: 1, y: 0.6666666666666666, z: 1 },
            })) as string,
        );

        expect(resDenied.code).toBe("PERMISSION_DENIED");
        expect(resDenied.error).toContain(
            'PERMISSION_DENIED: Source node(s) "NylPgf-CZVa_VEhpnUpJa" are protected',
        );
        expect(resDenied.deniedNodeIds).toEqual(["NylPgf-CZVa_VEhpnUpJa"]);
    });

    test("1d. Agent tự động dừng khi lặp lại cùng một lỗi kiểu dữ liệu (tránh lặp 10 lần)", async () => {
        const node = { id: "copy-loop", name: "Thanh bản sao", transform: Matrix4.identity() };
        (doc.modelManager as any).findNodes = rs.fn(() => [node]);

        const tool = buildNodeTools().find((t) => t.name === "transform_node")!;
        let providerCallCount = 0;

        const mockProvider: LLMProvider = {
            id: "mock",
            name: "Mock",
            async *streamChat(): AsyncGenerator<StreamEvent> {
                providerCallCount++;
                yield {
                    type: "tool_call",
                    id: `call_${providerCallCount}`,
                    name: "transform_node",
                    arguments: JSON.stringify({
                        id: "copy-loop",
                        scale: `{"x": 1, "y": 2/3, "z": ${providerCallCount}}`,
                    }),
                };
                yield { type: "done", stopReason: "tool_use" };
            },
        };

        let outputText = "";
        await runAgent({
            provider: mockProvider,
            config: { provider: "openai", model: "gpt-4o", apiKey: "test" },
            system: "Test system",
            messages: [{ role: "user", content: "Rút ngắn thanh" }],
            tools: [tool],
            callbacks: {
                onTextDelta: (t) => {
                    outputText += t;
                },
                onThinkingDelta: () => {},
                onToolCall: () => {},
                onUsage: () => {},
            },
        });

        expect(providerCallCount).toBe(3);
        expect(outputText).toContain("[Dừng do lỗi lặp lại]");
    });

    // =========================================================================
    // 2. Tình huống 1 trên bản sao LS-3S-150 thật (qua luồng Agent / ChatPanel):
    //    Rút ngắn từ 3.000 xuống 2.000 mm, giữ đầu cố định và giữ tiết diện 3 sóng
    // =========================================================================
    test("2. Tình huống 1 (trên bản sao LS-3S-150): Qua luồng Agent, đọc thuộc tính -> sửa chiều dài 3000 -> 2000 mm -> bảo toàn đầu cố định và tiết diện 3 sóng", async () => {
        const anchor = new XYZ(100, 200, 0);
        const sourceSection = createLS3S150SectionFace(anchor);
        const sourceBar = new TestExtrudeNode({
            document: doc,
            id: "ls3s150-source",
            name: "Tấm ốp lam 3 sóng 150×15",
            section: sourceSection,
            length: 3000,
        });
        doc.modelManager.addNode(sourceBar);
        ensureSourceProtection(doc);

        // Tạo bản sao thanh LS-3S-150 được chèn từ plugin
        const copySection = createLS3S150SectionFace(anchor);
        const copyBar = new TestExtrudeNode({
            document: doc,
            id: "ls3s150-copy-shorten",
            name: "Tấm ốp lam 3 sóng 150×15 (bản sao)",
            section: copySection,
            length: 3000,
        });
        doc.modelManager.addNode(copyBar);
        recordTaskOwnedNodes([copyBar.id], doc);

        // Đo hình học và mặt cắt 3 sóng TRƯỚC khi rút ngắn
        const sectionBoundsBefore = measureSolidBounds(copyBar.section);
        const solidBoundsBefore = measureSolidBounds(copyBar.shape.value);
        expect(solidBoundsBefore.min.x).toBeCloseTo(100, 2);
        expect(solidBoundsBefore.min.y).toBeCloseTo(200, 2);
        expect(solidBoundsBefore.min.z).toBeCloseTo(0, 2);
        expect(solidBoundsBefore.size.x).toBeCloseTo(150, 2);
        expect(solidBoundsBefore.size.y).toBeCloseTo(15, 2);
        expect(solidBoundsBefore.size.z).toBeCloseTo(3000, 2);

        // Chạy qua luồng runAgent (cùng engine với ChatPanel.runTurn)
        const tools = [...buildPropertyTools(), ...buildNodeTools()].map(governTool);
        const calledTools: { name: string; args: any; result: any }[] = [];
        let turnStep = 0;

        const agentProvider: LLMProvider = {
            id: "mock-chatpanel",
            name: "MockChatPanel",
            async *streamChat(): AsyncGenerator<StreamEvent> {
                turnStep++;
                if (turnStep === 1) {
                    yield {
                        type: "tool_call",
                        id: "tc_read_props",
                        name: "get_node_properties",
                        arguments: JSON.stringify({ ids: [copyBar.id] }),
                    };
                    yield { type: "done", stopReason: "tool_use" };
                } else if (turnStep === 2) {
                    yield {
                        type: "tool_call",
                        id: "tc_set_length",
                        name: "set_node_properties",
                        arguments: JSON.stringify({
                            id: copyBar.id,
                            properties: { length: 2000 },
                        }),
                    };
                    yield { type: "done", stopReason: "tool_use" };
                } else if (turnStep === 3) {
                    yield {
                        type: "tool_call",
                        id: "tc_verify_props",
                        name: "get_node_properties",
                        arguments: JSON.stringify({ ids: [copyBar.id] }),
                    };
                    yield { type: "done", stopReason: "tool_use" };
                } else {
                    yield {
                        type: "text",
                        text: "Đã rút ngắn bản sao thanh LS-3S-150 từ 3000 mm xuống 2000 mm, giữ nguyên đầu cố định Z=0 và biên dạng 3 sóng 150×15 mm.",
                    };
                    yield { type: "done", stopReason: "end_turn" };
                }
            },
        };

        await runAgent({
            provider: agentProvider,
            config: { provider: "openai", model: "gpt-4o", apiKey: "test" },
            system: "System prompt",
            messages: [
                {
                    role: "user",
                    content:
                        "Rút ngắn bản sao thanh LS-3S-150 (id: ls3s150-copy-shorten) từ 3.000 xuống 2.000 mm, giữ đầu cố định tại Z=0 và giữ nguyên tiết diện.",
                },
            ],
            tools,
            callbacks: {
                onTextDelta: () => {},
                onThinkingDelta: () => {},
                onToolCall: (c) => {
                    calledTools.push({
                        name: c.name,
                        args: JSON.parse(c.arguments),
                        result: JSON.parse(c.result),
                    });
                },
                onUsage: () => {},
            },
        });

        // Kiểm tra đúng trình tự tool Agent đã gọi
        expect(calledTools.map((c) => c.name)).toEqual([
            "get_node_properties",
            "set_node_properties",
            "get_node_properties",
        ]);
        expect(calledTools[0].result.nodes[0].type).toBe("ExtrudeNode");
        expect(calledTools[1].result.updated[0].value).toBe(2000);

        // Đo lại hình học và đối chiếu biên dạng mặt cắt SAU khi rút ngắn
        const sectionBoundsAfter = measureSolidBounds(copyBar.section);
        const solidBoundsAfter = measureSolidBounds(copyBar.shape.value);

        // 1. Chiều dài mới đúng 2000.00 mm (Z từ 0 đến 2000)
        expect(solidBoundsAfter.size.z).toBeCloseTo(2000, 2);
        expect(solidBoundsAfter.max.z).toBeCloseTo(2000, 2);
        // 2. Đầu cố định tại (100, 200, 0) giữ nguyên tuyệt đối
        expect(solidBoundsAfter.min.x).toBeCloseTo(100, 2);
        expect(solidBoundsAfter.min.y).toBeCloseTo(200, 2);
        expect(solidBoundsAfter.min.z).toBeCloseTo(0, 2);
        // 3. Biên dạng mặt cắt 3 sóng (150 x 15 mm và số lượng đỉnh lưới) trùng khớp 100% trước và sau
        expect(solidBoundsAfter.size.x).toBeCloseTo(150, 2);
        expect(solidBoundsAfter.size.y).toBeCloseTo(15, 2);
        expect(sectionBoundsAfter.size.x).toBeCloseTo(sectionBoundsBefore.size.x, 4);
        expect(sectionBoundsAfter.size.y).toBeCloseTo(sectionBoundsBefore.size.y, 4);
        expect(sectionBoundsAfter.vertexFloatCount).toBe(sectionBoundsBefore.vertexFloatCount);
        expect(solidBoundsAfter.vertexFloatCount).toBe(solidBoundsBefore.vertexFloatCount);

        // 4. Thanh gốc được bảo vệ vẫn giữ nguyên 3000 mm
        expect(measureSolidBounds(sourceBar.shape.value).size.z).toBeCloseTo(3000, 2);
    });

    // =========================================================================
    // 3. Tình huống 2 trên bản sao LS-3S-150 thật:
    //    Cắt phần thừa tại mặt phẳng Z = 2000 mm, xác nhận đúng phần được giữ lại [0..2000]
    // =========================================================================
    test("3. Tình huống 2 (trên bản sao LS-3S-150): Cắt tại mặt Z=2000 mm bằng booleanCut -> giữ lại đúng phần Z=[0..2000] và biên dạng 3 sóng", async () => {
        const anchor = new XYZ(100, 200, 0);
        const sourceSection = createLS3S150SectionFace(anchor);
        const sourcePrism = factory.prism(sourceSection, new XYZ(0, 0, 3000)).value;
        const sourceNode = new EditableShapeNode({
            document: doc,
            name: "Tấm ốp lam 3 sóng 150×15 (gốc)",
            shape: sourcePrism,
        });
        doc.modelManager.addNode(sourceNode);
        ensureSourceProtection(doc);

        // Tạo bản sao thanh LS-3S-150 để thực hiện phép cắt
        const copySection = createLS3S150SectionFace(anchor);
        const copyPrism = factory.prism(copySection, new XYZ(0, 0, 3000)).value;
        const copyNode = new EditableShapeNode({
            document: doc,
            name: "Tấm ốp lam 3 sóng 150×15 (bản sao cắt)",
            shape: copyPrism,
        });
        doc.modelManager.addNode(copyNode);
        recordTaskOwnedNodes([copyNode.id], doc);

        const boundsBefore = measureSolidBounds(copyNode.shape.value);
        expect(boundsBefore.min.z).toBeCloseTo(0, 2);
        expect(boundsBefore.max.z).toBeCloseTo(3000, 2);
        expect(boundsBefore.size.z).toBeCloseTo(3000, 2);
        expect(boundsBefore.size.x).toBeCloseTo(150, 2);
        expect(boundsBefore.size.y).toBeCloseTo(15, 2);

        // Mặt cắt chỉ định tại Z = 2000 mm:
        // - Phần giữ lại: Z từ 0 đến 2000 mm (dài 2000 mm)
        // - Phần thừa cắt bỏ: Z từ 2000 đến 3000 mm (dài 1000 mm)
        const cutterPlane = new Plane({
            origin: new XYZ(90, 190, 2000),
            normal: XYZ.unitZ,
            xvec: XYZ.unitX,
        });
        const cutterRes = factory.box(cutterPlane, 170, 35, 1100);
        expect(cutterRes.isOk).toBe(true);

        const cutRes = factory.booleanCut([copyNode.shape.value], [cutterRes.value]);
        expect(cutRes.isOk).toBe(true);

        Transaction.execute(doc, "Cắt phần thừa thanh LS-3S-150 tại Z=2000", () => {
            copyNode.parent?.remove(copyNode);
            const resultNode = new EditableShapeNode({
                document: doc,
                name: "Tấm ốp lam 3 sóng 150×15 (đã cắt)",
                shape: cutRes.value,
            });
            doc.modelManager.addNode(resultNode);
        });

        const boundsAfter = measureSolidBounds(cutRes.value);
        // 1. Xác nhận đúng phần giữ lại Z từ 0 đến 2000 mm (chiều dài 2000 mm)
        expect(boundsAfter.min.z).toBeCloseTo(0, 2);
        expect(boundsAfter.max.z).toBeCloseTo(2000, 2);
        expect(boundsAfter.size.z).toBeCloseTo(2000, 2);
        // 2. Xác nhận tiết diện 3 sóng 150 x 15 mm và vị trí đầu cố định (100, 200, 0) được giữ nguyên
        expect(boundsAfter.min.x).toBeCloseTo(100, 2);
        expect(boundsAfter.min.y).toBeCloseTo(200, 2);
        expect(boundsAfter.size.x).toBeCloseTo(150, 2);
        expect(boundsAfter.size.y).toBeCloseTo(15, 2);
        expect(boundsAfter.vertexFloatCount).toBe(boundsBefore.vertexFloatCount);

        // 3. Thanh gốc vẫn nguyên vẹn 3000 mm
        expect(measureSolidBounds(sourceNode.shape.value).size.z).toBeCloseTo(3000, 2);
    });
});
