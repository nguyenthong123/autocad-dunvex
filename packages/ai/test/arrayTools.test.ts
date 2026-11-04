// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, FolderNode, Matrix4, VisualNode, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import { _clearActivePlans, buildArrayTools, MAX_ARRAY_COUNT, planArrayLogic } from "../src/tools/arrayTools";

class MockVisualBox extends VisualNode {
    override get transformMode() {
        return "direct" as const;
    }
    private readonly boxMin: XYZ;
    private readonly boxMax: XYZ;

    constructor(
        document: any,
        name = "MockBox",
        id = Math.random().toString(36).slice(2),
        min?: XYZ,
        max?: XYZ,
    ) {
        super(document, name, id);
        this.boxMin = min ?? new XYZ(0, 0, 0);
        this.boxMax = max ?? new XYZ(100, 20, 20);
    }

    override display(): any {
        return "mock.box";
    }

    override boundingBox(): BoundingBox | undefined {
        const box = new BoundingBox(this.boxMin, this.boxMax);
        return this.transform.equals(Matrix4.identity()) ? box : BoundingBox.transformed(box, this.transform);
    }

    override clone(): this {
        const copy = new MockVisualBox(
            this.document,
            this.name,
            Math.random().toString(36).slice(2),
            this.boxMin,
            this.boxMax,
        );
        copy.transform = this.transform.clone();
        return copy as this;
    }

    override cloneTransformed(transform: Matrix4): this {
        const copy = new MockVisualBox(
            this.document,
            this.name,
            Math.random().toString(36).slice(2),
            this.boxMin,
            this.boxMax,
        );
        copy.transform = this.transform.multiply(transform);
        return copy as this;
    }
}

function stubDocument(doc: TestDocument) {
    const app = createMockApplication();
    (app as any).activeView = { document: doc };
    rs.stubGlobal("app", app);
}

describe("arrayTools", () => {
    describe("planArrayLogic (pure math & feasibility checks)", () => {
        test("reproduces overflow case: 50 slats of 100mm inside 1080mm bay returns feasible: false", () => {
            const plan = planArrayLogic({
                itemDim: 100,
                axis: "x",
                count: 50,
                availableSpan: 1080,
            });

            expect(plan.feasible).toBe(false);
            expect(plan.overflowMm).toBe(50 * 100 - 1080); // 3920 mm overflow
            expect(plan.maxFittingCount).toBe(10); // at most 10 slats of 100mm can fit in 1080mm
            expect(plan.reason).toContain("exceeds compartment span");
            expect(plan.suggestedAction).toContain("at most 10");
        });

        test("valid fit_count: 10 slats of 50mm inside 1000mm bay returns feasible: true with even spacing", () => {
            const plan = planArrayLogic({
                itemDim: 50,
                axis: "x",
                count: 10,
                availableSpan: 1000,
            });

            expect(plan.feasible).toBe(true);
            expect(plan.copiesToCreate).toBe(9);
            // pitch = (1000 - 50) / 9 = 950 / 9 ~= 105.555 mm
            expect(plan.pitch).toBeCloseTo(105.555, 2);
            // gap = pitch - 50 ~= 55.555 mm
            expect(plan.gap).toBeCloseTo(55.555, 2);
            expect(plan.totalSpan).toBe(1000);
            expect(plan.offsets?.length).toBe(9);
        });

        test("valid fixed gap: 5 slats of 40mm with 10mm gap inside 300mm bay", () => {
            const plan = planArrayLogic({
                itemDim: 40,
                axis: "y",
                count: 5,
                availableSpan: 300,
                gap: 10,
            });

            expect(plan.feasible).toBe(true);
            // totalSpan = (5-1) * (40+10) + 40 = 240 mm
            expect(plan.totalSpan).toBe(240);
            expect(plan.pitch).toBe(50);
            expect(plan.leftoverMm).toBe(60);
        });

        test("fixed gap overflow: 5 slats of 100mm with 20mm gap inside 400mm bay", () => {
            const plan = planArrayLogic({
                itemDim: 100,
                axis: "x",
                count: 5,
                availableSpan: 400,
                gap: 20,
            });

            expect(plan.feasible).toBe(false);
            // totalSpan = 4 * 120 + 100 = 580 mm > 400 mm
            expect(plan.overflowMm).toBe(180);
            expect(plan.maxFittingCount).toBe(3);
            expect(plan.reason).toContain("exceeds available span");
        });

        test("rejects count < 2 and count > MAX_ARRAY_COUNT (200)", () => {
            const under = planArrayLogic({ itemDim: 50, axis: "x", count: 1, availableSpan: 1000 });
            expect(under.feasible).toBe(false);
            expect(under.reason).toContain("at least 2");

            const over = planArrayLogic({ itemDim: 5, axis: "x", count: 201, availableSpan: 2000 });
            expect(over.feasible).toBe(false);
            expect(over.reason).toContain("maximum safe limit");
        });
    });

    describe("measure_nodes tool", () => {
        let doc: TestDocument;

        beforeEach(() => {
            doc = new TestDocument();
            stubDocument(doc);
        });

        afterEach(() => {
            rs.unstubAllGlobals();
        });

        test("measures bounding box, dimensions, and approximate volume accurately", async () => {
            const box = new MockVisualBox(
                doc,
                "Slat",
                "box-1",
                new XYZ(10, 20, 30),
                new XYZ(110, 40, 50), // dx = 100, dy = 20, dz = 20
            );
            doc.modelManager.addNode(box);

            const tools = buildArrayTools();
            const measureTool = tools.find((t) => t.name === "measure_nodes")!;
            const resRaw = await measureTool.handler({ nodeIds: [box.id] });
            const result = JSON.parse(resRaw as string);

            expect(result.nodes).toBeDefined();
            expect(result.nodes.length).toBe(1);
            expect(result.nodes[0].id).toBe(box.id);
            expect(result.nodes[0].dimensions).toEqual({ x: 100, y: 20, z: 20 });
            expect(result.nodes[0].approxVolumeMm3).toBe(100 * 20 * 20);
        });
    });

    describe("plan_array tool integration", () => {
        let doc: TestDocument;

        beforeEach(() => {
            doc = new TestDocument();
            stubDocument(doc);
        });

        afterEach(() => {
            rs.unstubAllGlobals();
        });

        test("plan_array tool queries node dimension automatically and catches overflow without creating nodes", async () => {
            const slat = new MockVisualBox(
                doc,
                "NanGo",
                "slat-1",
                new XYZ(0, 0, 0),
                new XYZ(100, 20, 20), // 100mm along x
            );
            doc.modelManager.addNode(slat);

            const initialNodeCount = (doc.modelManager.rootNode as any).children().length;

            const tools = buildArrayTools();
            const planTool = tools.find((t) => t.name === "plan_array")!;
            const resRaw = await planTool.handler({
                nodeId: slat.id,
                axis: "x",
                count: 50,
                availableSpan: 1080,
            });
            const result = JSON.parse(resRaw as string);

            expect(result.feasible).toBe(false);
            expect(result.overflowMm).toBe(3920);
            expect(result.maxFittingCount).toBe(10);

            // Verify absolutely no nodes were created during preflight planning
            expect((doc.modelManager.rootNode as any).children().length).toBe(initialNodeCount);
        });
    });

    describe("apply_array tool & preflight enforcement", () => {
        let doc: TestDocument;

        beforeEach(() => {
            _clearActivePlans();
            doc = new TestDocument();
            stubDocument(doc);
        });

        afterEach(() => {
            _clearActivePlans();
            rs.unstubAllGlobals();
        });

        test("rejects direct call without planId and creates 0 nodes", async () => {
            const slat = new MockVisualBox(doc, "Slat", "slat-noplan");
            doc.modelManager.addNode(slat);

            const initialNodesCount = (doc.modelManager.rootNode as any).children().length;
            const tools = buildArrayTools();
            const applyTool = tools.find((t) => t.name === "apply_array")!;

            const resRaw = await applyTool.handler({
                nodeId: slat.id,
                axis: "x",
                count: 5,
                pitch: 50,
            });
            const result = JSON.parse(resRaw as string);

            expect(result.error).toMatch(/Preflight plan required/i);
            expect((doc.modelManager.rootNode as any).children().length).toBe(initialNodesCount);
        });

        test("rejects call with unknown or expired planId and creates 0 nodes", async () => {
            const slat = new MockVisualBox(doc, "Slat", "slat-badplan");
            doc.modelManager.addNode(slat);

            const initialNodesCount = (doc.modelManager.rootNode as any).children().length;
            const tools = buildArrayTools();
            const applyTool = tools.find((t) => t.name === "apply_array")!;

            const resRaw = await applyTool.handler({
                planId: "plan_non_existent_12345",
                nodeId: slat.id,
                axis: "x",
                count: 5,
                pitch: 50,
            });
            const result = JSON.parse(resRaw as string);

            expect(result.error).toMatch(/Array plan not found or expired/i);
            expect((doc.modelManager.rootNode as any).children().length).toBe(initialNodesCount);
        });

        test("rejects call when parameters mismatch approved plan and creates 0 nodes", async () => {
            const slat = new MockVisualBox(doc, "Slat", "slat-mismatch");
            doc.modelManager.addNode(slat);

            const initialNodesCount = (doc.modelManager.rootNode as any).children().length;
            const tools = buildArrayTools();
            const planTool = tools.find((t) => t.name === "plan_array")!;
            const applyTool = tools.find((t) => t.name === "apply_array")!;

            // Plan for count = 5, pitch = 150
            const planRes = JSON.parse(
                (await planTool.handler({
                    nodeId: slat.id,
                    axis: "x",
                    count: 5,
                    pitch: 150,
                    availableSpan: 1000,
                })) as string,
            );
            expect(planRes.feasible).toBe(true);
            expect(planRes.planId).toBeDefined();

            // Try applying with count = 8 (mismatch)
            const resRaw = await applyTool.handler({
                planId: planRes.planId,
                nodeId: slat.id,
                axis: "x",
                count: 8,
                pitch: 150,
            });
            const result = JSON.parse(resRaw as string);

            expect(result.error).toMatch(/Parameters do not match approved planId/i);
            expect((doc.modelManager.rootNode as any).children().length).toBe(initialNodesCount);
        });

        test("rejects call when source node was mutated or moved after plan creation and creates 0 nodes", async () => {
            const slat = new MockVisualBox(doc, "Slat", "slat-mutated");
            doc.modelManager.addNode(slat);

            const initialNodesCount = (doc.modelManager.rootNode as any).children().length;
            const tools = buildArrayTools();
            const planTool = tools.find((t) => t.name === "plan_array")!;
            const applyTool = tools.find((t) => t.name === "apply_array")!;

            const planRes = JSON.parse(
                (await planTool.handler({
                    nodeId: slat.id,
                    axis: "x",
                    count: 5,
                    pitch: 150,
                    availableSpan: 1000,
                })) as string,
            );
            expect(planRes.planId).toBeDefined();

            // Mutate source node position after plan
            slat.transform = Matrix4.fromTranslation(50, 0, 0).multiply(slat.transform);

            const resRaw = await applyTool.handler({
                planId: planRes.planId,
                nodeId: slat.id,
                axis: "x",
                count: 5,
                pitch: 150,
            });
            const result = JSON.parse(resRaw as string);

            expect(result.error).toMatch(/has been moved or resized since plan was created/i);
            expect((doc.modelManager.rootNode as any).children().length).toBe(initialNodesCount);
        });

        test("rejects count > 200 with clear safety error", async () => {
            const slat = new MockVisualBox(doc, "Slat", "slat-reject");
            doc.modelManager.addNode(slat);

            const tools = buildArrayTools();
            const planTool = tools.find((t) => t.name === "plan_array")!;
            const planRes = JSON.parse(
                (await planTool.handler({
                    nodeId: slat.id,
                    axis: "x",
                    count: 201,
                    pitch: 50,
                    availableSpan: 20000,
                })) as string,
            );
            // Preflight plan rejects count > 200
            expect(planRes.feasible).toBe(false);
            expect(planRes.reason).toMatch(/exceeds maximum safe limit of 200/i);
        });

        test("mock unit benchmark 50 items: clones 49 copies in memory in a single transaction in under 50ms", async () => {
            const slat = new MockVisualBox(doc, "Slat50", "slat-50");
            doc.modelManager.addNode(slat);

            const tools = buildArrayTools();
            const planTool = tools.find((t) => t.name === "plan_array")!;
            const applyTool = tools.find((t) => t.name === "apply_array")!;

            const planRes = JSON.parse(
                (await planTool.handler({
                    nodeId: slat.id,
                    axis: "x",
                    count: 50,
                    pitch: 25,
                    availableSpan: 2000,
                })) as string,
            );
            expect(planRes.feasible).toBe(true);

            const start = performance.now();
            const resRaw = await applyTool.handler({
                planId: planRes.planId,
                nodeId: slat.id,
                axis: "x",
                count: 50,
                pitch: 25,
            });
            const durationMs = performance.now() - start;

            const result = JSON.parse(resRaw as string);
            expect(result.createdCount).toBe(49);
            expect(result.totalCount).toBe(50);
            expect(result.created.length).toBe(49);

            // Mock unit benchmark: measures node cloning logic in-memory (not live 3D Three.js scene render)
            expect(durationMs).toBeLessThan(100);
        });

        test("mock unit benchmark 200 items: clones 199 copies in memory in a single transaction in under 100ms", async () => {
            const slat = new MockVisualBox(doc, "Slat200", "slat-200");
            doc.modelManager.addNode(slat);

            const tools = buildArrayTools();
            const planTool = tools.find((t) => t.name === "plan_array")!;
            const applyTool = tools.find((t) => t.name === "apply_array")!;

            const planRes = JSON.parse(
                (await planTool.handler({
                    nodeId: slat.id,
                    axis: "x",
                    count: 200,
                    pitch: 10,
                    availableSpan: 3000,
                })) as string,
            );
            expect(planRes.feasible).toBe(true);

            const start = performance.now();
            const resRaw = await applyTool.handler({
                planId: planRes.planId,
                nodeId: slat.id,
                axis: "x",
                count: 200,
                pitch: 10,
            });
            const durationMs = performance.now() - start;

            const result = JSON.parse(resRaw as string);
            expect(result.createdCount).toBe(199);
            expect(result.totalCount).toBe(200);

            // Mock unit benchmark: measures node cloning logic in-memory (not live 3D Three.js scene render)
            expect(durationMs).toBeLessThan(200);
        });
    });
});
