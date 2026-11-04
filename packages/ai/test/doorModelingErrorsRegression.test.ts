// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, EditableShapeNode, Matrix4, Plane, Result, ShapeTypes, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { SketchNode } from "@chili3d/parametric";
import { rs } from "@rstest/core";
import { extractVerifiedEvidence } from "../src/llm/agent";
import { buildArrayTools } from "../src/tools/arrayTools";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";
import { buildParametricTools } from "../src/tools/parametricTools";

function createFakeEdge(start: XYZ, end: XYZ) {
    return {
        shapeType: ShapeTypes.edge,
        isEqual: () => false,
        startPoint: () => start,
        endPoint: () => end,
        intersect: () => [],
        matrix: Matrix4.identity(),
        mesh: {
            faces: undefined,
            edges: {
                position: new Float32Array([start.x, start.y, start.z, end.x, end.y, end.z]),
            },
            vertexs: undefined,
        },
        boundingBox: () =>
            new BoundingBox(
                { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), z: Math.min(start.z, end.z) },
                { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y), z: Math.max(start.z, end.z) },
            ),
    };
}

function createFakeShape(subEdges: any[] = []) {
    return {
        shapeType: ShapeTypes.solid,
        isEqual: () => false,
        findSubShapes: (type: any) => (type === ShapeTypes.edge ? subEdges : []),
        matrix: Matrix4.identity(),
        mesh: { faces: undefined, edges: undefined, vertexs: undefined },
        boundingBox: () => new BoundingBox(XYZ.zero, new XYZ(10, 10, 10)),
    } as any;
}

function stubAppAndDoc(doc: TestDocument) {
    const factory = {
        box: rs.fn(() => Result.ok(createFakeShape())),
        line: rs.fn((start: XYZ, end: XYZ) => Result.ok(createFakeEdge(start, end))),
        combine: rs.fn((shapes: any[]) => Result.ok(createFakeShape(shapes))),
    };
    const app = createMockApplication();
    (app as any).activeView = { document: doc };
    (app as any).shapeProvider = { factory };
    rs.stubGlobal("app", app);
    rs.stubGlobal("shapeFactory", factory);
    return app;
}

describe("Door Modeling Errors & Recovery Regression", () => {
    let doc: TestDocument;

    beforeEach(() => {
        doc = new TestDocument({ selection: { clearSelection: rs.fn() } as any });
        stubAppAndDoc(doc);
    });

    afterEach(() => {
        rs.unstubAllGlobals();
    });

    describe("1. Parametric Body vs SketchNode Selection", () => {
        test("passing SketchNode as body to editFeature gives clear recovery guidance and preserves doc", async () => {
            const sketch = new SketchNode({
                document: doc,
                plane: Plane.XY,
                data: { entities: [], constraints: [] },
            });
            sketch.name = "Door Sketch";
            doc.modelManager.addNode(sketch);

            const tool = buildParametricTools().find((t) => t.name === "run_parametric")!;
            const initialNodeCount = doc.modelManager.findNodes(() => true).length;

            await expect(
                tool.handler({
                    ops: [
                        {
                            op: "editFeature",
                            body: sketch.id,
                            action: "setParameter",
                            featureId: "feat-1",
                            key: "depth",
                            value: 300,
                        },
                    ],
                }),
            ).rejects.toThrow(/is a SketchNode \("Door Sketch"\), not a ParametricBodyNode/);

            // Document remains completely pristine
            expect(doc.modelManager.findNodes(() => true).length).toBe(initialNodeCount);
            expect(doc.modelManager.findNodes((n) => n.id === sketch.id)[0]).toBe(sketch);
        });

        test("passing SketchNode as body to features op gives clear recovery guidance", async () => {
            const sketch = new SketchNode({
                document: doc,
                plane: Plane.XY,
                data: { entities: [], constraints: [] },
            });
            sketch.name = "Door Outline";
            doc.modelManager.addNode(sketch);

            const tool = buildParametricTools().find((t) => t.name === "run_parametric")!;

            await expect(
                tool.handler({
                    ops: [
                        {
                            op: "features",
                            body: sketch.id,
                        },
                    ],
                }),
            ).rejects.toThrow(/is a SketchNode/);
        });

        test("editFeature missing body parameter fails with actionable error", async () => {
            const tool = buildParametricTools().find((t) => t.name === "run_parametric")!;

            await expect(
                tool.handler({
                    ops: [
                        {
                            op: "editFeature",
                            action: "setParameter",
                            featureId: "feat-1",
                            key: "depth",
                            value: 300,
                        },
                    ],
                }),
            ).rejects.toThrow(/body is required/);
        });
    });

    describe("2. SketchNode Measurement and Verification Gate", () => {
        test("empty sketch reports unmeasurable and keeps verification status unverified", async () => {
            const emptySketch = new SketchNode({
                document: doc,
                plane: Plane.XY,
                data: { entities: [], constraints: [] },
            });
            emptySketch.name = "Door Outline (Preview)";
            doc.modelManager.addNode(emptySketch);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const rawRes = await measureTool.handler({ nodeIds: [emptySketch.id] });
            const parsed = JSON.parse(rawRes as string);

            expect(parsed.error).toContain(`Node cannot be measured (no bounding box): ${emptySketch.id}`);

            // Verification gate must not verify unmeasurable node
            const evidence = extractVerifiedEvidence(
                "measure_nodes",
                JSON.stringify({ nodeIds: [emptySketch.id] }),
                parsed,
            );
            expect(evidence.ids.has(emptySketch.id)).toBe(false);
            expect(evidence.names.size).toBe(0);
        });

        test("sketch with geometry calculates accurate world-space bounding box and dimensions", async () => {
            // Rectangle 800 x 2000 mm on XY plane offset by Z = 100 mm
            const plane = Plane.XY.translateTo(new XYZ(0, 0, 100));
            const sketchWithGeo = new SketchNode({
                document: doc,
                plane,
                data: {
                    entities: [
                        { id: 1, type: "line", params: [0, 0, 800, 0] },
                        { id: 2, type: "line", params: [800, 0, 800, 2000] },
                        { id: 3, type: "line", params: [800, 2000, 0, 2000] },
                        { id: 4, type: "line", params: [0, 2000, 0, 0] },
                    ],
                    constraints: [],
                },
            });
            sketchWithGeo.name = "Door Outline";
            doc.modelManager.addNode(sketchWithGeo);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const rawRes = await measureTool.handler({ nodeIds: [sketchWithGeo.id] });
            const parsed = JSON.parse(rawRes as string);

            expect(parsed.error).toBeUndefined();
            expect(parsed.nodes).toBeDefined();
            expect(parsed.nodes.length).toBe(1);

            const nodeMeasure = parsed.nodes[0];
            expect(nodeMeasure.id).toBe(sketchWithGeo.id);
            expect(nodeMeasure.dimensions.x).toBeCloseTo(800, 1);
            expect(nodeMeasure.dimensions.y).toBeCloseTo(2000, 1);
            expect(nodeMeasure.dimensions.z).toBeCloseTo(0, 1);
            expect(nodeMeasure.bounds.min.z).toBeCloseTo(100, 1);
            expect(nodeMeasure.bounds.max.z).toBeCloseTo(100, 1);

            // Verification gate verifies node with valid measurement evidence
            const evidence = extractVerifiedEvidence(
                "measure_nodes",
                JSON.stringify({ nodeIds: [sketchWithGeo.id] }),
                parsed,
            );
            expect(evidence.ids.has(sketchWithGeo.id)).toBe(true);
        });
    });

    describe("3. Query Ref Resolution & UV Requirements", () => {
        test("shape.findSubShapes normalizes target from args.shape or args.target", async () => {
            const wallNode = new EditableShapeNode({
                document: doc,
                name: "Walls",
                id: "wall-node-1",
                shape: Result.ok(createFakeShape([createFakeShape(), createFakeShape()])),
            });
            doc.modelManager.addNode(wallNode);

            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;
            const resRaw = await runProgram.handler({
                ops: [
                    {
                        method: "shape.findSubShapes",
                        id: "wallEdges",
                        args: {
                            shape: "wall-node-1",
                            subshapeType: "edge",
                        },
                    },
                ],
            });

            const res = JSON.parse(resRaw as string);
            expect(res.results.wallEdges).toBeDefined();
            expect(res.results.wallEdges.count).toBe(2);
            expect(res.results.wallEdges.refs).toEqual(["wallEdges#0", "wallEdges#1"]);
        });

        test("referencing query list group id instead of indexed ref throws helpful error", async () => {
            const wallNode = new EditableShapeNode({
                document: doc,
                name: "Walls",
                id: "wall-node-1",
                shape: Result.ok(createFakeShape([createFakeShape()])),
            });
            doc.modelManager.addNode(wallNode);

            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;
            await expect(
                runProgram.handler({
                    ops: [
                        {
                            method: "shape.findSubShapes",
                            id: "wallEdges",
                            target: "wall-node-1",
                            args: { subshapeType: "edge" },
                        },
                        {
                            method: "edge.length",
                            target: "wallEdges", // Group name instead of wallEdges#0
                            id: "len",
                        },
                    ],
                }),
            ).rejects.toThrow(/is a query ref list group/);
        });

        test("referencing nonexistent indexed ref from empty query throws clear message", async () => {
            const emptyNode = new EditableShapeNode({
                document: doc,
                name: "Door Preview",
                id: "empty-sketch-node",
                shape: Result.ok(createFakeShape([])), // 0 edges
            });
            doc.modelManager.addNode(emptyNode);

            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;
            await expect(
                runProgram.handler({
                    ops: [
                        {
                            method: "shape.findSubShapes",
                            id: "sketchEdges",
                            target: "empty-sketch-node",
                            args: { subshapeType: "edge" },
                        },
                        {
                            method: "edge.length",
                            target: "sketchEdges#0", // Does not exist because 0 edges found
                            id: "len0",
                        },
                    ],
                }),
            ).rejects.toThrow(/The query op "sketchEdges" produced 0 sub-shapes/);
        });

        test("face.normal missing u or v throws explicit parameter guidance without guessing", async () => {
            const fakeFace = {
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                normal: rs.fn(() => [XYZ.zero, XYZ.unitZ]),
            };
            const faceNode = new EditableShapeNode({
                document: doc,
                name: "FaceNode",
                id: "face-node-1",
                shape: Result.ok(fakeFace as any),
            });
            doc.modelManager.addNode(faceNode);

            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;
            await expect(
                runProgram.handler({
                    ops: [
                        {
                            method: "face.normal",
                            target: "face-node-1",
                            id: "n0",
                            args: {}, // Missing both u and v
                        },
                    ],
                }),
            ).rejects.toThrow(
                /Missing required parameter "u"\. Both "u" and "v" surface parametric coordinates are required/,
            );
        });
    });
});
