// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    BoundingBox,
    EditableShapeNode,
    isConsumedTool,
    Matrix4,
    Plane,
    Result,
    type ShapeType,
    ShapeTypes,
    Transaction,
    XYZ,
} from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { ParametricBodyNode, SketchNode } from "@chili3d/parametric";
import { rs } from "@rstest/core";
import { extractVerifiedEvidence, runAgent } from "../src/llm/agent";
import {
    clearSessionMemory,
    getSessionMemory,
    onNodesRemoved,
    syncSessionMemoryWithDocument,
} from "../src/memory";
import { buildArrayTools } from "../src/tools/arrayTools";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";
import { buildNodeTools } from "../src/tools/nodeTools";
import { buildParametricTools } from "../src/tools/parametricTools";
import { buildReadTools } from "../src/tools/readTools";
import { ScriptedLLMProvider } from "./_helpers/scriptedProvider";

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
    const fake = {
        shapeType: ShapeTypes.solid,
        isEqual: () => false,
        findSubShapes: (type: any) => (type === ShapeTypes.edge ? subEdges : []),
        matrix: Matrix4.identity(),
        mesh: { faces: undefined, edges: undefined, vertexs: undefined },
        boundingBox: () =>
            subEdges.length === 0 ? undefined : new BoundingBox(XYZ.zero, new XYZ(10, 10, 10)),
        transformedMul: (_m: Matrix4) => fake,
    } as any;
    return fake;
}

function stubAppAndDoc(doc: TestDocument) {
    const factory = {
        box: rs.fn(() => Result.ok(createFakeShape())),
        line: rs.fn((start: XYZ, end: XYZ) => Result.ok(createFakeEdge(start, end))),
        combine: rs.fn((shapes: any[]) => Result.ok(createFakeShape(shapes))),
        face: rs.fn((_wires: any[]) => Result.ok(createFakeShape())),
        solid: rs.fn((_shells: any[]) => Result.ok(createFakeShape())),
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
            console.log("RAW_RES:", rawRes);
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

    describe("4. Door Cut Boolean Operations & Pristine State Preservation", () => {
        function createFakeSolid(box: BoundingBox, volumeVal: number, containsPtFn?: (pt: any) => boolean) {
            return {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: () => [],
                matrix: Matrix4.identity(),
                mesh: { faces: undefined, edges: undefined, vertexs: undefined },
                boundingBox: () => box,
                volume: () => volumeVal,
                checkShape: () => true,
                setTolerance: rs.fn(),
                containsPoint: containsPtFn ?? (() => false),
                transformedMul: (m: Matrix4) => {
                    const transformedBox = BoundingBox.transformed(box, m);
                    return createFakeSolid(transformedBox, volumeVal, containsPtFn);
                },
                dispose: rs.fn(),
            } as any;
        }

        test("successful through-cut reduces volume and passes throughCut verification", async () => {
            // Wall solid: X[0, 100], Y[0, 20], Z[0, 100] (thickness = 20 along Y)
            const wallBox = new BoundingBox(new XYZ(0, 0, 0), new XYZ(100, 20, 100));
            const wallShape = createFakeSolid(wallBox, 200000);

            // Cutter solid: X[20, 40], Y[-5, 25], Z[0, 40] (penetrates Y[0, 20])
            const cutterBox = new BoundingBox(new XYZ(20, -5, 0), new XYZ(40, 25, 40));
            const cutterShape = createFakeSolid(cutterBox, 24000);

            // Result solid: volume reduced by 16000, containsPoint = false in opening
            const resultShape = createFakeSolid(wallBox, 184000, () => false);

            const booleanCut = rs.fn((_shapes: any[], _tools: any[]) => Result.ok(resultShape));
            (globalThis.app as any).shapeProvider.factory.booleanCut = booleanCut;

            const wallNode = new EditableShapeNode({
                document: doc,
                name: "Wall",
                shape: Result.ok(wallShape),
            });
            doc.modelManager.addNode(wallNode);

            const cutterNode = new EditableShapeNode({
                document: doc,
                name: "DoorCutter",
                shape: Result.ok(cutterShape),
            });
            doc.modelManager.addNode(cutterNode);

            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;
            const resRaw = await runProgram.handler({
                ops: [
                    {
                        method: "booleanCut",
                        id: "doorCut1",
                        name: "Wall With Door",
                        args: {
                            shape1: wallNode.id,
                            shape2: cutterNode.id,
                            throughCut: true,
                        },
                    },
                ],
            });

            const res = JSON.parse(resRaw as string);
            expect(res.created.length).toBe(1);
            expect(res.created[0].id).toBe("doorCut1");
            expect(res.created[0].name).toBe("Wall With Door");
            expect(res.removed.length).toBe(2);
            expect(res.results.doorCut1).toEqual(
                expect.objectContaining({
                    throughVerified: true,
                    status: "verified",
                    penetrationAxis: "y",
                }),
            );
        });

        test("cutter completely missing wall throws clear bounds error and preserves document pristine state", async () => {
            const wallBox = new BoundingBox(new XYZ(0, 0, 0), new XYZ(100, 20, 100));
            const wallShape = createFakeSolid(wallBox, 200000);

            // Cutter is positioned outside the wall (X[200, 250])
            const cutterBox = new BoundingBox(new XYZ(200, 0, 0), new XYZ(250, 20, 50));
            const cutterShape = createFakeSolid(cutterBox, 20000);

            // Kernel boolean cut returns identical shape with unchanged volume
            const uncutResult = createFakeSolid(wallBox, 200000);
            const booleanCut = rs.fn((_shapes: any[], _tools: any[]) => Result.ok(uncutResult));
            (globalThis.app as any).shapeProvider.factory.booleanCut = booleanCut;

            const wallNode = new EditableShapeNode({
                document: doc,
                name: "Wall",
                shape: Result.ok(wallShape),
            });
            doc.modelManager.addNode(wallNode);

            const cutterNode = new EditableShapeNode({
                document: doc,
                name: "MisalignedCutter",
                shape: Result.ok(cutterShape),
            });
            doc.modelManager.addNode(cutterNode);

            const initialNodes = doc.modelManager.findNodes(() => true);
            const initialCount = initialNodes.length;

            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;
            await expect(
                runProgram.handler({
                    ops: [
                        {
                            method: "booleanCut",
                            id: "doorCutMiss",
                            args: {
                                shape1: wallNode.id,
                                shape2: cutterNode.id,
                            },
                        },
                    ],
                }),
            ).rejects.toThrow(
                /booleanCut did not remove any volume from target "Wall".*Cutter does not intersect the target: cutter is completely outside target bounds/,
            );

            // Document remains completely pristine (no nodes removed, no nodes created)
            const afterNodes = doc.modelManager.findNodes(() => true);
            expect(afterNodes.length).toBe(initialCount);
            expect(doc.modelManager.findNodes((n) => n.id === wallNode.id)[0]).toBe(wallNode);
            expect(doc.modelManager.findNodes((n) => n.id === cutterNode.id)[0]).toBe(cutterNode);
        });

        test("booleanCut overlapping bounding box when overlap center lies outside solid does NOT claim opening already exists, reports cause undetermined and preserves document pristine state", async () => {
            const wallBox = new BoundingBox(new XYZ(0, 0, 0), new XYZ(100, 20, 100));
            // containsPoint returns false: point probe lies outside solid
            const wallShape = createFakeSolid(wallBox, 200000, () => false);

            // Cutter overlaps wall AABB (X[20, 40], Y[-5, 25], Z[0, 40])
            const cutterBox = new BoundingBox(new XYZ(20, -5, 0), new XYZ(40, 25, 40));
            const cutterShape = createFakeSolid(cutterBox, 24000);

            // Volume before and after are identical (0 volume removed)
            const unchangedResult = createFakeSolid(wallBox, 200000);
            const booleanCut = rs.fn((_shapes: any[], _tools: any[]) => Result.ok(unchangedResult));
            (globalThis.app as any).shapeProvider.factory.booleanCut = booleanCut;

            const wallNode = new EditableShapeNode({
                document: doc,
                name: "Wall",
                shape: Result.ok(wallShape),
            });
            doc.modelManager.addNode(wallNode);

            const cutterNode = new EditableShapeNode({
                document: doc,
                name: "DuplicateDoorCutter",
                shape: Result.ok(cutterShape),
            });
            doc.modelManager.addNode(cutterNode);

            const initialCount = doc.modelManager.findNodes(() => true).length;
            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;

            let thrownError: any = null;
            try {
                await runProgram.handler({
                    ops: [
                        {
                            method: "booleanCut",
                            id: "doorCut2",
                            args: {
                                shape1: wallNode.id,
                                shape2: cutterNode.id,
                            },
                        },
                    ],
                });
            } catch (err: any) {
                thrownError = err;
            }

            expect(thrownError).not.toBeNull();
            // Proves diagnosis remains "Cause undetermined" with probe detail
            expect(thrownError.message).toContain(
                "Cause undetermined: cutter bounding box overlaps target footprint but removed zero volume.",
            );
            expect(thrownError.message).toContain("lies outside the target solid");
            expect(thrownError.message).toContain(
                "Inspect actual 3D geometry, cutter position, depth, and orientation",
            );
            // Crucially: MUST NOT claim that an opening or hollow already exists based on a single point!
            expect(thrownError.message).not.toContain("already hollow");
            expect(thrownError.message).not.toContain("opening or cut was already performed");

            // Document remains completely pristine
            expect(doc.modelManager.findNodes(() => true).length).toBe(initialCount);
            expect(doc.modelManager.findNodes((n) => n.id === wallNode.id)[0]).toBe(wallNode);
            expect(doc.modelManager.findNodes((n) => n.id === cutterNode.id)[0]).toBe(cutterNode);
        });

        test("booleanCut missing bounding box reports insufficient diagnostic data and preserves document", async () => {
            const wallShape = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: () => [],
                matrix: Matrix4.identity(),
                mesh: { faces: undefined, edges: undefined, vertexs: undefined },
                boundingBox: () => undefined, // Missing bounding box!
                volume: () => 200000,
                checkShape: () => true,
                setTolerance: rs.fn(),
                containsPoint: () => true,
                transformedMul: () => wallShape,
                dispose: rs.fn(),
            } as any;

            const cutterBox = new BoundingBox(new XYZ(20, -5, 0), new XYZ(40, 25, 40));
            const cutterShape = createFakeSolid(cutterBox, 24000);

            // 0 volume reduction
            const booleanCut = rs.fn((_shapes: any[], _tools: any[]) => Result.ok(wallShape));
            (globalThis.app as any).shapeProvider.factory.booleanCut = booleanCut;

            const wallNode = new EditableShapeNode({
                document: doc,
                name: "WallNoBox",
                shape: Result.ok(wallShape),
            });
            doc.modelManager.addNode(wallNode);

            const cutterNode = new EditableShapeNode({
                document: doc,
                name: "CutterWithBox",
                shape: Result.ok(cutterShape),
            });
            doc.modelManager.addNode(cutterNode);

            const initialCount = doc.modelManager.findNodes(() => true).length;
            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;

            await expect(
                runProgram.handler({
                    ops: [
                        {
                            method: "booleanCut",
                            id: "doorCutNoBox",
                            args: {
                                shape1: wallNode.id,
                                shape2: cutterNode.id,
                            },
                        },
                    ],
                }),
            ).rejects.toThrow(
                /Insufficient bounding box diagnostic data to determine spatial relationship between target and cutter/,
            );

            // Document remains completely pristine
            expect(doc.modelManager.findNodes(() => true).length).toBe(initialCount);
            expect(doc.modelManager.findNodes((n) => n.id === wallNode.id)[0]).toBe(wallNode);
            expect(doc.modelManager.findNodes((n) => n.id === cutterNode.id)[0]).toBe(cutterNode);
        });

        test("booleanCut overlapping bounding box without geometric proof reports cause undetermined and preserves document", async () => {
            const wallBox = new BoundingBox(new XYZ(0, 0, 0), new XYZ(100, 20, 100));
            // containsPoint returns true: solid interior, not proven hollow!
            const wallShape = createFakeSolid(wallBox, 200000, () => true);

            const cutterBox = new BoundingBox(new XYZ(20, -5, 0), new XYZ(40, 25, 40));
            const cutterShape = createFakeSolid(cutterBox, 24000);

            const unchangedResult = createFakeSolid(wallBox, 200000);
            const booleanCut = rs.fn((_shapes: any[], _tools: any[]) => Result.ok(unchangedResult));
            (globalThis.app as any).shapeProvider.factory.booleanCut = booleanCut;

            const wallNode = new EditableShapeNode({
                document: doc,
                name: "WallSolid",
                shape: Result.ok(wallShape),
            });
            doc.modelManager.addNode(wallNode);

            const cutterNode = new EditableShapeNode({
                document: doc,
                name: "CutterOverlap",
                shape: Result.ok(cutterShape),
            });
            doc.modelManager.addNode(cutterNode);

            const initialCount = doc.modelManager.findNodes(() => true).length;
            const runProgram = buildCapabilityTools().find((t) => t.name === "run_program")!;

            await expect(
                runProgram.handler({
                    ops: [
                        {
                            method: "booleanCut",
                            id: "doorCutUndetermined",
                            args: {
                                shape1: wallNode.id,
                                shape2: cutterNode.id,
                            },
                        },
                    ],
                }),
            ).rejects.toThrow(
                /Cause undetermined: cutter bounding box overlaps target footprint but removed zero volume.*Overlap center point \[.*\] lies inside the target solid.*Inspect actual 3D geometry, cutter position, depth, and orientation/,
            );

            // Document remains completely pristine
            expect(doc.modelManager.findNodes(() => true).length).toBe(initialCount);
            expect(doc.modelManager.findNodes((n) => n.id === wallNode.id)[0]).toBe(wallNode);
            expect(doc.modelManager.findNodes((n) => n.id === cutterNode.id)[0]).toBe(cutterNode);
        });
    });

    describe("5. Consumed Node Tracking & Boolean Post-Verification", () => {
        test("measure_nodes reports consumed node guidance when querying removedNodeIds", async () => {
            const consumedId = "OnVBBDN2gEBfU3pwRPnWD";
            onNodesRemoved([consumedId]);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const rawRes = await measureTool.handler({ nodeIds: [consumedId] });
            const parsed = JSON.parse(rawRes as string);

            expect(parsed.error).toContain(
                `Node "${consumedId}" was consumed or removed by a previous edit operation (found in sessionMemory.removedNodeIds)`,
            );
            expect(parsed.error).toContain("Call get_document_state to view current active nodes");
        });

        test("measure_nodes reports not found guidance for arbitrary missing node", async () => {
            const missingId = "completely-unknown-node-id";
            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const rawRes = await measureTool.handler({ nodeIds: [missingId] });
            const parsed = JSON.parse(rawRes as string);

            expect(parsed.error).toContain(`Node not found: ${missingId}`);
            expect(parsed.error).toContain("Call get_document_state to view the active model tree");
        });

        test("post-verification after Boolean: measuring old consumed ID cannot verify newly created node", async () => {
            clearSessionMemory();
            const consumedId = "OnVBBDN2gEBfU3pwRPnWD";
            const newCreatedId = "newNode-wall-cut-789";

            let turnIndex = 0;
            const fakeProvider = {
                id: "fake",
                streamChat: async function* () {
                    turnIndex++;
                    if (turnIndex === 1) {
                        yield {
                            type: "tool_call",
                            id: "call-1",
                            name: "run_program",
                            arguments: JSON.stringify({
                                ops: [
                                    {
                                        method: "booleanCut",
                                        id: "doorCut",
                                        args: { shape1: consumedId, shape2: "cutter-1" },
                                    },
                                ],
                            }),
                        };
                        yield { type: "done", stopReason: "tool_use" };
                    } else if (turnIndex === 2) {
                        yield {
                            type: "tool_call",
                            id: "call-2",
                            name: "measure_nodes",
                            arguments: JSON.stringify({ nodeIds: [consumedId] }),
                        };
                        yield { type: "done", stopReason: "tool_use" };
                    } else {
                        yield { type: "text", text: "Done without valid verification." };
                        yield { type: "done", stopReason: "end_turn" };
                    }
                },
            };

            const tools = [
                {
                    name: "run_program",
                    parameters: {},
                    handler: async () =>
                        JSON.stringify({
                            created: [{ id: "doorCut", nodeId: newCreatedId, name: "Wall" }],
                            removed: [{ nodeId: consumedId, name: "Wall" }],
                            results: {},
                        }),
                },
                {
                    name: "measure_nodes",
                    parameters: {},
                    handler: async () =>
                        JSON.stringify({
                            nodes: [
                                {
                                    id: consumedId,
                                    name: "Wall",
                                    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 20, z: 100 } },
                                    dimensions: { x: 100, y: 20, z: 100 },
                                    approxVolumeMm3: 200000,
                                },
                            ],
                        }),
                },
            ];

            const messages: any[] = [{ role: "user", content: "Cut door in wall" }];
            await runAgent({
                config: { provider: "mock", apiKey: "x" } as any,
                provider: fakeProvider as any,
                system: "sys" as any,
                messages,
                tools: tools as any,
                callbacks: {
                    onTextDelta: () => {},
                    onToolCall: () => {},
                    onThinkingDelta: () => {},
                    onUsage: () => {},
                },
            });

            // Even though measure_nodes returned data for consumedId, it MUST NOT verify newCreatedId!
            const memory = getSessionMemory();
            expect(memory.lastVerification?.verified).toBe(false);
            expect(memory.lastVerification?.summary).toBe("UNVERIFIED");
        });

        test("post-verification after Boolean: measuring new created ID successfully verifies change", async () => {
            clearSessionMemory();
            const consumedId = "OnVBBDN2gEBfU3pwRPnWD";
            const newCreatedId = "newNode-wall-cut-789";

            let turnIndex = 0;
            const fakeProvider = {
                id: "fake",
                streamChat: async function* () {
                    turnIndex++;
                    if (turnIndex === 1) {
                        yield {
                            type: "tool_call",
                            id: "call-1",
                            name: "run_program",
                            arguments: JSON.stringify({
                                ops: [
                                    {
                                        method: "booleanCut",
                                        id: "doorCut",
                                        args: { shape1: consumedId, shape2: "cutter-1" },
                                    },
                                ],
                            }),
                        };
                        yield { type: "done", stopReason: "tool_use" };
                    } else if (turnIndex === 2) {
                        yield {
                            type: "tool_call",
                            id: "call-2",
                            name: "measure_nodes",
                            arguments: JSON.stringify({ nodeIds: [newCreatedId] }),
                        };
                        yield { type: "done", stopReason: "tool_use" };
                    } else {
                        yield { type: "text", text: "Verified and finished." };
                        yield { type: "done", stopReason: "end_turn" };
                    }
                },
            };

            const tools = [
                {
                    name: "run_program",
                    parameters: {},
                    handler: async () =>
                        JSON.stringify({
                            created: [{ id: "doorCut", nodeId: newCreatedId, name: "Wall" }],
                            removed: [{ nodeId: consumedId, name: "Wall" }],
                            results: {},
                        }),
                },
                {
                    name: "measure_nodes",
                    parameters: {},
                    handler: async () =>
                        JSON.stringify({
                            nodes: [
                                {
                                    id: newCreatedId,
                                    name: "Wall",
                                    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 20, z: 100 } },
                                    dimensions: { x: 100, y: 20, z: 100 },
                                    approxVolumeMm3: 184000,
                                },
                            ],
                        }),
                },
            ];

            const messages: any[] = [{ role: "user", content: "Cut door in wall" }];
            await runAgent({
                config: { provider: "mock", apiKey: "x" } as any,
                provider: fakeProvider as any,
                system: "sys" as any,
                messages,
                tools: tools as any,
                callbacks: {
                    onTextDelta: () => {},
                    onToolCall: () => {},
                    onThinkingDelta: () => {},
                    onUsage: () => {},
                },
            });

            const memory = getSessionMemory();
            expect(memory.lastVerification?.verified).toBe(true);
            expect(memory.lastVerification?.toolName).toBe("measure_nodes");
        });
    });

    describe("6. Sketch Coordinate Measurement Contract & Curves", () => {
        test("sketch on offset plane measures accurate position and dimensions without double transformation", async () => {
            // Plane offset at (100, 200, 300)
            const plane = Plane.XY.translateTo(new XYZ(100, 200, 300));
            const sketch = new SketchNode({
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
            sketch.name = "OffsetDoorSketch";
            doc.modelManager.addNode(sketch);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const resRaw = await measureTool.handler({ nodeIds: [sketch.id] });
            const res = JSON.parse(resRaw as string);

            expect(res.error).toBeUndefined();
            const m = res.nodes[0];
            expect(m.bounds.min).toEqual({ x: 100, y: 200, z: 300 });
            expect(m.bounds.max).toEqual({ x: 900, y: 2200, z: 300 });
            expect(m.dimensions).toEqual({ x: 800, y: 2000, z: 0 });
        });

        test("sketch with non-identity transform applies transformation exactly once", async () => {
            const plane = Plane.XY;
            const sketch = new SketchNode({
                document: doc,
                plane,
                data: {
                    entities: [{ id: 1, type: "line", params: [0, 0, 100, 200] }],
                    constraints: [],
                },
            });
            // Apply node translation transform (50, 60, 70)
            sketch.transform = Matrix4.fromTranslation(50, 60, 70);
            sketch.name = "TransformedSketch";
            doc.modelManager.addNode(sketch);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const resRaw = await measureTool.handler({ nodeIds: [sketch.id] });
            const res = JSON.parse(resRaw as string);

            expect(res.error).toBeUndefined();
            const m = res.nodes[0];
            // Transformation must be applied once:
            // x: 0 + 50 = 50 to 100 + 50 = 150
            // y: 0 + 60 = 60 to 200 + 60 = 260
            // z: 0 + 70 = 70 to 0 + 70 = 70
            expect(m.bounds.min).toEqual({ x: 50, y: 60, z: 70 });
            expect(m.bounds.max).toEqual({ x: 150, y: 260, z: 70 });
            expect(m.dimensions).toEqual({ x: 100, y: 200, z: 0 });
        });

        test("sketch with circle calculates exact geometric axis-aligned bounding box", async () => {
            // Circle center (100, 100), radius 50 on plane Z = 500
            const plane = Plane.XY.translateTo(new XYZ(0, 0, 500));
            const sketch = new SketchNode({
                document: doc,
                plane,
                data: {
                    entities: [{ id: 1, type: "circle", params: [100, 100, 50] }],
                    constraints: [],
                },
            });
            doc.modelManager.addNode(sketch);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const resRaw = await measureTool.handler({ nodeIds: [sketch.id] });
            const res = JSON.parse(resRaw as string);

            const m = res.nodes[0];
            expect(m.bounds.min.x).toBeCloseTo(50, 1);
            expect(m.bounds.max.x).toBeCloseTo(150, 1);
            expect(m.bounds.min.y).toBeCloseTo(50, 1);
            expect(m.bounds.max.y).toBeCloseTo(150, 1);
            expect(m.bounds.min.z).toBeCloseTo(500, 1);
            expect(m.bounds.max.z).toBeCloseTo(500, 1);
            expect(m.dimensions.x).toBeCloseTo(100, 1);
            expect(m.dimensions.y).toBeCloseTo(100, 1);
        });

        test("sketch with arc and bezier calculates valid geometric bounding bounds", async () => {
            // Arc center (0, 0), from (50, 0) to (0, 50) on plane XY
            // Bezier control points: (0, 0), (50, 100), (100, 0)
            const sketch = new SketchNode({
                document: doc,
                plane: Plane.XY,
                data: {
                    entities: [
                        { id: 1, type: "arc", params: [0, 0, 50, 0, 0, 50] },
                        { id: 2, type: "bezier", params: [0, 0, 50, 100, 100, 0] },
                    ],
                    constraints: [],
                },
            });
            doc.modelManager.addNode(sketch);

            const measureTool = buildArrayTools().find((t) => t.name === "measure_nodes")!;
            const resRaw = await measureTool.handler({ nodeIds: [sketch.id] });
            const res = JSON.parse(resRaw as string);

            const m = res.nodes[0];
            expect(m.bounds.min.x).toBeCloseTo(0, 1);
            expect(m.bounds.max.x).toBeCloseTo(100, 1);
            expect(m.bounds.min.y).toBeCloseTo(0, 1);
            expect(m.bounds.max.y).toBeCloseTo(100, 1);
            expect(m.dimensions.x).toBeCloseTo(100, 1);
            expect(m.dimensions.y).toBeCloseTo(100, 1);
        });
    });

    describe("7. Additional Door Modeling Fixes & Preflight Enforcements", () => {
        test("face.wire as non-array string is normalized or throws actionable syntax error", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const wireNode = new EditableShapeNode({
                document: doc,
                name: "Wire1",
                shape: Result.ok(createFakeEdge(XYZ.zero, new XYZ(10, 0, 0)) as any),
            });
            doc.modelManager.addNode(wireNode);

            const res = await runProgramTool.handler({
                ops: [
                    {
                        method: "face",
                        id: "myFace",
                        args: {
                            wire: wireNode.id,
                        },
                    },
                ],
            });

            const parsed = JSON.parse(res as string);
            expect(parsed.created).toHaveLength(1);
        });

        test("solid.shells requires array and normalizes single shell alias from shape", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const shellNode = new EditableShapeNode({
                document: doc,
                name: "Shell1",
                shape: Result.ok(createFakeShape([createFakeEdge(XYZ.zero, new XYZ(10, 0, 0))])),
            });
            doc.modelManager.addNode(shellNode);

            const res = await runProgramTool.handler({
                ops: [
                    {
                        method: "solid",
                        id: "mySolid",
                        args: {
                            shape: shellNode.id,
                        },
                    },
                ],
            });

            const parsed = JSON.parse(res as string);
            expect(parsed.created).toHaveLength(1);
        });

        test('shape.findSubShapes with id: "find_faces" that OMITS subshapeType receives explicit required error instead of picking a default', async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const targetSolid = new EditableShapeNode({
                document: doc,
                name: "TargetSolid",
                shape: Result.ok(createFakeShape([createFakeEdge(XYZ.zero, new XYZ(10, 0, 0))])),
            });
            doc.modelManager.addNode(targetSolid);

            // Agent names op id "find_faces" but omits subshapeType parameter
            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "shape.findSubShapes",
                            id: "find_faces",
                            target: targetSolid.id,
                            args: {},
                        },
                    ],
                }),
            ).rejects.toThrow(/Missing required parameter "subshapeType".*args: { subshapeType: "face" }/);
        });

        test('shape.findSubShapes with explicit alias args: { type: "face" } is accepted', async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const mockSolid = createFakeShape();
            const mockFace = createFakeShape();
            (mockSolid as any).findSubShapes = rs.fn((type: any) =>
                type === ShapeTypes.face ? [mockFace] : [],
            );

            const solidNode = new EditableShapeNode({
                document: doc,
                name: "TargetSolidAlias",
                shape: Result.ok(mockSolid),
            });
            doc.modelManager.addNode(solidNode);

            const res = await runProgramTool.handler({
                ops: [
                    {
                        method: "shape.findSubShapes",
                        id: "queryFaces",
                        target: solidNode.id,
                        args: {
                            type: "face",
                        },
                    },
                ],
            });

            const parsed = JSON.parse(res as string);
            expect(parsed.results.queryFaces.count).toBe(1);
            expect(mockSolid.findSubShapes).toHaveBeenCalledWith(ShapeTypes.face);
        });

        test("checkQueryOwner shape mismatch provides guidance referencing subshapeType", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const edgeShape = createFakeEdge(XYZ.zero, new XYZ(10, 0, 0));
            const edgeNode = new EditableShapeNode({
                document: doc,
                name: "EdgeTarget",
                shape: Result.ok(edgeShape as any),
            });
            doc.modelManager.addNode(edgeNode);

            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "face.area",
                            id: "areaQuery",
                            target: edgeNode.id,
                        },
                    ],
                }),
            ).rejects.toThrow(/face\.area requires a face target, got edge/);
        });

        test("resolveSketchPlane with { origin, normal } throws actionable plane configuration error", async () => {
            const parametricTools = buildParametricTools();
            const runParametricTool = parametricTools.find((t) => t.name === "run_parametric")!;

            await expect(
                runParametricTool.handler({
                    ops: [
                        {
                            op: "sketch",
                            id: "doorSketch",
                            plane: {
                                origin: { x: 100, y: 0, z: 0 },
                                normal: { x: 0, y: 1, z: 0 },
                            } as any,
                            entities: [{ type: "line", params: [0, 0, 10, 0] }],
                        },
                    ],
                }),
            ).rejects.toThrow(/Invalid sketch plane configuration.*plane.*must be.*XY.*YZ.*ZX/);
        });

        test("resolveSketchPlane with host having 0 faces reports clear 0 faces error instead of (0..-1)", async () => {
            const parametricTools = buildParametricTools();
            const runParametricTool = parametricTools.find((t) => t.name === "run_parametric")!;

            const emptyShape = createFakeShape();
            (emptyShape as any).findSubShapes = rs.fn(() => []); // 0 faces
            const hostNode = new EditableShapeNode({
                document: doc,
                name: "HostNoFaces",
                shape: Result.ok(emptyShape),
            });
            doc.modelManager.addNode(hostNode);

            await expect(
                runParametricTool.handler({
                    ops: [
                        {
                            op: "sketch",
                            id: "doorSketch",
                            plane: {
                                nodeId: hostNode.id,
                                faceIndex: 4,
                            },
                            entities: [{ type: "line", params: [0, 0, 10, 0] }],
                        },
                    ],
                }),
            ).rejects.toThrow(/has no faces to place a sketch on \(faces count: 0\)/);
        });

        test("delete_node on consumed boolean tool preserves pristine state and gives actionable owner guidance", async () => {
            const nodeTools = buildNodeTools();
            const deleteTool = nodeTools.find((t) => t.name === "delete_node")!;

            const parentBody = new EditableShapeNode({
                document: doc,
                name: "WallBody",
                shape: Result.ok(createFakeShape([createFakeEdge(XYZ.zero, new XYZ(10, 0, 0))])),
            });
            doc.modelManager.addNode(parentBody);

            const consumedToolNode = new EditableShapeNode({
                document: doc,
                name: "DoorCutterConsumed",
                shape: Result.ok(createFakeShape([createFakeEdge(XYZ.zero, new XYZ(5, 0, 0))])),
            });
            doc.modelManager.addNode(consumedToolNode);
            (consumedToolNode as any).parent = parentBody;

            const initialNodesCount = doc.modelManager.findNodes(() => true).length;

            const resRaw = await deleteTool.handler({ id: consumedToolNode.id });
            const res = JSON.parse(resRaw as string);

            expect(res.error).toContain('it is a consumed boolean tool owned by parametric body "WallBody"');
            expect(res.error).toContain(
                "To modify or remove this cut/fuse, edit or delete the boolean feature on the parent body using run_parametric",
            );
            expect(res.error).toContain("Do not retry deleting this node");

            expect(doc.modelManager.findNodes(() => true).length).toBe(initialNodesCount);
            expect(doc.modelManager.findNodes((n) => n.id === consumedToolNode.id)).toHaveLength(1);
        });

        test("transformedMul with translation {0,0,0} creates new node, does NOT delete original node", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const baseNode = new EditableShapeNode({
                document: doc,
                name: "OriginalNode",
                shape: Result.ok(createFakeShape([createFakeEdge(XYZ.zero, new XYZ(10, 0, 0))])),
            });
            doc.modelManager.addNode(baseNode);

            const resRaw = await runProgramTool.handler({
                ops: [
                    {
                        method: "transformedMul",
                        id: "delete_bad",
                        args: {
                            shape: baseNode.id,
                            translate: { x: 0, y: 0, z: 0 },
                        },
                    },
                ],
            });

            const res = JSON.parse(resRaw as string);
            expect(res.created).toHaveLength(1);
            expect(res.removed).toHaveLength(0);
            expect(doc.modelManager.findNodes((n) => n.id === baseNode.id)).toHaveLength(1);
        });

        test("resolveRefEntry: stale or removed node ID reports clear guidance pointing to get_document_state", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            onNodesRemoved(["MoeRXPNj7nkVfKJkGxdod"]);

            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "booleanCut",
                            id: "cutStale",
                            args: {
                                shape1: "MoeRXPNj7nkVfKJkGxdod",
                                shape2: "anyOther",
                            },
                        },
                    ],
                }),
            ).rejects.toThrow(
                /Node "MoeRXPNj7nkVfKJkGxdod" was consumed or removed by a previous operation.*Call get_document_state/,
            );
        });
    });

    describe("8. Session 3 Errors: Face Queries, UV Bounds, Negative Coordinates & Ownership", () => {
        test("shape.findSubShapes producing 8 faces: querying #8 throws explicit out-of-range guidance", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const faces8 = Array.from({ length: 8 }, (_, i) => ({
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                area: () => 100 + i,
            }));
            const fakeSolid = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: rs.fn((type: ShapeType) => (type === ShapeTypes.face ? faces8 : [])),
            };
            const solidNode = new EditableShapeNode({
                document: doc,
                name: "WallsBase8",
                shape: Result.ok(fakeSolid as any),
            });
            doc.modelManager.addNode(solidNode);

            // Attempting to batch shape.findSubShapes and blindly query wallFacesFinal#8
            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "shape.findSubShapes",
                            id: "wallFacesFinal",
                            target: solidNode.id,
                            args: { subshapeType: "face" },
                        },
                        {
                            method: "face.area",
                            id: "fa8",
                            target: "wallFacesFinal#8",
                        },
                    ],
                }),
            ).rejects.toThrow(
                /Unknown ref "wallFacesFinal#8"\. The query op "wallFacesFinal" only produced 8 sub-shapes.*Index 8 is out of range.*Do not batch assumptions about sub-shape counts/,
            );
        });

        test("targeting query ref list group 'wallFacesFinal' throws explicit ref list group error", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const faces8 = Array.from({ length: 8 }, (_, i) => ({
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                area: () => 100 + i,
            }));
            const fakeSolid = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: rs.fn((type: ShapeType) => (type === ShapeTypes.face ? faces8 : [])),
            };
            const solidNode = new EditableShapeNode({
                document: doc,
                name: "WallsBase8",
                shape: Result.ok(fakeSolid as any),
            });
            doc.modelManager.addNode(solidNode);

            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "shape.findSubShapes",
                            id: "wallFacesFinal",
                            target: solidNode.id,
                            args: { subshapeType: "face" },
                        },
                        {
                            method: "face.area",
                            id: "groupArea",
                            target: "wallFacesFinal", // Group name, not indexed
                        },
                    ],
                }),
            ).rejects.toThrow(
                /"wallFacesFinal" is a query ref list group \(holding 8 items: .*\), not an individual subshape ref.*Do not pass the group name as a single ref/,
            );
        });

        test("two-step workflow: query shape.findSubShapes alone, read refs, then query returned refs", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const faces8 = Array.from({ length: 8 }, (_, i) => ({
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                area: () => 200 + i * 10,
            }));
            const fakeSolid = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: rs.fn((type: ShapeType) => (type === ShapeTypes.face ? faces8 : [])),
            };
            const solidNode = new EditableShapeNode({
                document: doc,
                name: "WallsBase8",
                shape: Result.ok(fakeSolid as any),
            });
            doc.modelManager.addNode(solidNode);

            // Step 1: Query subshapes
            const step1Raw = await runProgramTool.handler({
                ops: [
                    {
                        method: "shape.findSubShapes",
                        id: "wf",
                        target: solidNode.id,
                        args: { subshapeType: "face" },
                    },
                ],
            });
            const step1 = JSON.parse(step1Raw as string);
            expect(step1.results.wf.count).toBe(8);
            expect(step1.results.wf.refs).toHaveLength(8);
            expect(step1.results.wf.refs).toContain("wf#0");
            expect(step1.results.wf.refs).toContain("wf#7");
            expect(step1.results.wf.refs).not.toContain("wf#8");

            // Step 2: Query only the returned refs
            const step2Raw = await runProgramTool.handler({
                ops: step1.results.wf.refs.map((ref: string, i: number) => ({
                    method: "face.area",
                    id: `fa_${i}`,
                    target: ref,
                })),
            });
            const step2 = JSON.parse(step2Raw as string);
            expect(step2.results.fa_0).toBe(200);
            expect(step2.results.fa_7).toBe(270);
        });

        test("face.normal missing coordinates mentions surface.bounds (not surface.uvBounds)", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const fakeFace = {
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                normal: rs.fn(() => [XYZ.zero, XYZ.unitZ]),
            };
            const faceNode = new EditableShapeNode({
                document: doc,
                name: "FaceNode",
                shape: Result.ok(fakeFace as any),
            });
            doc.modelManager.addNode(faceNode);

            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "face.normal",
                            target: faceNode.id,
                            id: "fn",
                            args: {},
                        },
                    ],
                }),
            ).rejects.toThrow(
                /Missing required parameter "u"\. Both "u" and "v" surface parametric coordinates are required for face\.normal\. Query surface bounds with face\.surface -> surface\.bounds/,
            );
        });

        test("surface.bounds -> face.normal workflow executes cleanly with valid midpoint", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const fakeSurface = {
                bounds: () => ({ u1: 0, u2: 10, v1: 0, v2: 20 }),
            };
            const fakeFace = {
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                surface: () => fakeSurface,
                normal: rs.fn((u: number, v: number) => [new XYZ(u, v, 0), new XYZ(0, 1, 0)]),
            };
            const faceNode = new EditableShapeNode({
                document: doc,
                name: "FaceNode",
                shape: Result.ok(fakeFace as any),
            });
            doc.modelManager.addNode(faceNode);

            const resRaw = await runProgramTool.handler({
                ops: [
                    { method: "face.surface", target: faceNode.id, id: "surf" },
                    { method: "surface.bounds", target: "surf", id: "b" },
                    {
                        method: "face.normal",
                        target: faceNode.id,
                        id: "norm",
                        args: { u: 5, v: 10 },
                    },
                ],
            });
            const res = JSON.parse(resRaw as string);
            expect(res.results.b).toEqual({ u1: 0, u2: 10, v1: 0, v2: 20 });
            expect(res.results.norm[1]).toEqual({ x: 0, y: 1, z: 0 });
        });

        test("coercePlane preserves legacy default orientation when xvec and alignUp are omitted", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            let receivedPlane: Plane | undefined;
            const mockFactory = {
                box: rs.fn((plane: Plane, dx: number, dy: number, dz: number) => {
                    receivedPlane = plane;
                    return Result.ok({
                        shapeType: ShapeTypes.solid,
                        isEqual: () => false,
                        boundingBox: () =>
                            new BoundingBox(
                                new XYZ(plane.origin.x, plane.origin.y, plane.origin.z),
                                new XYZ(plane.origin.x + dx, plane.origin.y + dz, plane.origin.z + dy),
                            ),
                    });
                }),
            };
            const app = (globalThis as any).app;
            app.shapeProvider.factory = mockFactory;

            // Legacy payload without xvec or alignUp
            await runProgramTool.handler({
                ops: [
                    {
                        method: "box",
                        id: "legacyBox",
                        args: {
                            plane: {
                                origin: { x: 100, y: 200, z: 0 },
                                normal: { x: 0, y: 1, z: 0 },
                            },
                            dx: 500,
                            dy: 600,
                            dz: 700,
                        },
                    },
                ],
            });

            expect(receivedPlane).toBeDefined();
            // Normal is +Y
            expect(receivedPlane!.normal.y).toBeCloseTo(1, 5);
            // Legacy default orientation: fallback xvec is unitX (1, 0, 0)
            expect(receivedPlane!.xvec.x).toBeCloseTo(1, 5);
            expect(receivedPlane!.xvec.y).toBeCloseTo(0, 5);
            expect(receivedPlane!.xvec.z).toBeCloseTo(0, 5);
            // In-plane yvec is normal.cross(xvec) = (0, 1, 0) x (1, 0, 0) = (0, 0, -1) (-unitZ)
            expect(receivedPlane!.yvec.z).toBeCloseTo(-1, 5);
            expect(receivedPlane!.yvec.y).toBeCloseTo(0, 5);
        });

        test("coercePlane with explicit xvec or alignUp cuts door aperture with upward height (+Z)", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            const receivedPlanes: Plane[] = [];
            const mockFactory = {
                box: rs.fn((plane: Plane, dx: number, dy: number, dz: number) => {
                    receivedPlanes.push(plane);
                    return Result.ok({
                        shapeType: ShapeTypes.solid,
                        isEqual: () => false,
                        boundingBox: () =>
                            new BoundingBox(
                                new XYZ(plane.origin.x, plane.origin.y, plane.origin.z),
                                new XYZ(plane.origin.x + dx, plane.origin.y + dz, plane.origin.z + dy),
                            ),
                    });
                }),
            };
            const app = (globalThis as any).app;
            app.shapeProvider.factory = mockFactory;

            // Case A: Explicit xvec to orient in-plane yvec upward along +Z
            await runProgramTool.handler({
                ops: [
                    {
                        method: "box",
                        id: "doorCutterExplicitXvec",
                        args: {
                            plane: {
                                origin: { x: 500, y: -157, z: 0 },
                                normal: { x: 0, y: 1, z: 0 },
                                xvec: { x: -1, y: 0, z: 0 },
                            },
                            dx: 900,
                            dy: 2100,
                            dz: 400,
                        },
                    },
                ],
            });

            // Case B: Deliberate upright mechanism (alignUp: true)
            await runProgramTool.handler({
                ops: [
                    {
                        method: "box",
                        id: "doorCutterAlignUp",
                        args: {
                            plane: {
                                origin: { x: 500, y: -157, z: 0 },
                                normal: { x: 0, y: 1, z: 0 },
                                alignUp: true,
                            },
                            dx: 900,
                            dy: 2100,
                            dz: 400,
                        },
                    },
                ],
            });

            expect(receivedPlanes).toHaveLength(2);

            for (const plane of receivedPlanes) {
                // Normal is +Y
                expect(plane.normal.y).toBeCloseTo(1, 5);
                // xvec is perpendicular to normal along X axis
                expect(Math.abs(plane.xvec.x)).toBeCloseTo(1, 5);
                // In-plane yvec points strictly along World Up (+Z, door height from floor)
                expect(plane.yvec.z).toBeCloseTo(1, 5);
                expect(plane.yvec.y).toBeCloseTo(0, 5);
            }
        });

        test("misaligned cutter with negative Y target wall fails with clear bounds diagnostic and preserves doc", async () => {
            const capabilityTools = buildCapabilityTools();
            const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

            // Target wall at negative coordinates: X[-426, 4673], Y[-10757, -157], Z[0, 3400]
            const wallShape = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                volume: () => 100_000,
                boundingBox: () => new BoundingBox(new XYZ(-426, -10757, 0), new XYZ(4673, -157, 3400)),
            };
            const wallNode = new EditableShapeNode({
                document: doc,
                name: "Door Cut Correct",
                id: "wall-neg-1",
                shape: Result.ok(wallShape as any),
            });
            doc.modelManager.addNode(wallNode);
            const initialCount = doc.modelManager.findNodes(() => true).length;

            // Cutter at disjoint coordinates: Y[-100, 500] and Z[-3050, 100] (from Error 6 in log)
            const cutterShape = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                volume: () => 5000,
                boundingBox: () => new BoundingBox(new XYZ(683, -100, -3050), new XYZ(3563, 500, 100)),
            };
            const mockFactory = {
                booleanCut: rs.fn(() => Result.ok(wallShape)), // Returns unchanged wall shape (0 volume removed)
            };
            const app = (globalThis as any).app;
            app.shapeProvider.factory = mockFactory;

            const cutterNode = new EditableShapeNode({
                document: doc,
                name: "CutterMisaligned",
                id: "cutter-misaligned-1",
                shape: Result.ok(cutterShape as any),
            });
            doc.modelManager.addNode(cutterNode);

            await expect(
                runProgramTool.handler({
                    ops: [
                        {
                            method: "booleanCut",
                            id: "cutFail",
                            args: {
                                target: "wall-neg-1",
                                tool: "cutter-misaligned-1",
                            },
                        },
                    ],
                }),
            ).rejects.toThrow(
                /booleanCut did not remove any volume from target "Door Cut Correct".*Cutter does not intersect the target: cutter is completely outside target bounds.*Target bounds: X\[-426\.00, 4673\.00\], Y\[-10757\.00, -157\.00\], Z\[0\.00, 3400\.00\]\. Cutter bounds: X\[683\.00, 3563\.00\], Y\[-100\.00, 500\.00\], Z\[-3050\.00, 100\.00\]/,
            );

            // Document preserves state: cutterNode was manually added before run_program, neither wall nor cutter deleted
            expect(doc.modelManager.findNodes((n) => n.id === "wall-neg-1")).toHaveLength(1);
        });

        test("unconsumed independent cutter node can be safely deleted or inspected", async () => {
            const nodeTools = buildNodeTools().find((t) => t.name === "delete_node")!;

            const independentCutter = new EditableShapeNode({
                document: doc,
                name: "Door Cutter Fixed v3",
                shape: Result.ok({
                    shapeType: ShapeTypes.solid,
                    isEqual: () => false,
                } as any),
            });
            doc.modelManager.addNode(independentCutter);

            expect(doc.modelManager.findNodes((n) => n.id === independentCutter.id)).toHaveLength(1);

            // Since it is NOT a consumed boolean tool owned by a parametric body, deletion succeeds
            const resRaw = await nodeTools.handler({ id: independentCutter.id });
            const res = resRaw ? JSON.parse(resRaw as string) : {};
            expect(res.error).toBeUndefined();
            expect(doc.modelManager.findNodes((n) => n.id === independentCutter.id)).toHaveLength(0);
        });

        test("agent receiving out-of-range ref error changes step to read real results and succeeds", async () => {
            const faces8 = Array.from({ length: 8 }, (_, i) => ({
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                findSubShapes: () => [],
                area: () => 150 + i * 10,
            }));
            const fakeSolid = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: rs.fn((type: ShapeType) => (type === ShapeTypes.face ? faces8 : [])),
            };
            const solidNode = new EditableShapeNode({
                document: doc,
                name: "WallsRecoveryTest",
                shape: Result.ok(fakeSolid as any),
            });
            doc.modelManager.addNode(solidNode);

            // Scripted Agent:
            // Turn 1: Tries to guess face index #8 in batch and fails with out-of-range error
            // Turn 2: Reads error, changes step: runs shape.findSubShapes alone to inspect real returned count and refs
            // Turn 3: Reads returned 8 refs and queries face.area on actual returned faces, completing successfully
            const allTools = [
                ...buildCapabilityTools(),
                ...buildNodeTools(),
                ...buildArrayTools(),
                ...buildParametricTools(),
            ];

            const turnIndex = 0;
            const scriptedProvider = new ScriptedLLMProvider([
                // Turn 1
                {
                    type: "tool_calls",
                    calls: [
                        {
                            id: "call-1",
                            name: "run_program",
                            args: {
                                ops: [
                                    {
                                        method: "shape.findSubShapes",
                                        id: "wf",
                                        target: solidNode.id,
                                        args: { subshapeType: "face" },
                                    },
                                    {
                                        method: "face.area",
                                        id: "fa8",
                                        target: "wf#8",
                                    },
                                ],
                            },
                        },
                    ],
                },
                // Turn 2
                (opts) => {
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain("Index 8 is out of range");
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "call-2",
                                name: "run_program",
                                args: {
                                    ops: [
                                        {
                                            method: "shape.findSubShapes",
                                            id: "realFaces",
                                            target: solidNode.id,
                                            args: { subshapeType: "face" },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                },
                // Turn 3
                (opts) => {
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain('"count":8');
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "call-3",
                                name: "run_program",
                                args: {
                                    ops: [
                                        {
                                            method: "face.area",
                                            id: "frontArea",
                                            target: "realFaces#0",
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                },
                // Final turn
                {
                    type: "text",
                    text: "Successfully queried real face area on valid subshape ref.",
                },
            ]);

            const messages: any[] = [{ role: "user", content: "Inspect walls and query face areas." }];
            const callbacks = {
                onTextDelta: () => {},
                onThinkingDelta: () => {},
                onToolCall: () => {},
                onUsage: () => {},
            };

            await runAgent({
                provider: scriptedProvider,
                config: { model: "mock-model" } as any,
                system: { stable: "system-test", volatile: "" },
                messages,
                tools: allTools,
                callbacks,
            });

            const finalMsg = messages[messages.length - 1];
            expect(finalMsg.content).toContain("Successfully queried real face area on valid subshape ref.");
        });

        test("Agent missing UV in face.normal receives clear error and recovers by querying surface.bounds and passing valid UV", async () => {
            const fakeSurface = {
                bounds: () => ({ u1: 0, u2: 10, v1: 0, v2: 20 }),
            };
            const fakeFace = {
                shapeType: ShapeTypes.face,
                isEqual: () => false,
                surface: () => fakeSurface,
                normal: rs.fn((u: number, v: number) => [new XYZ(u, v, 200), new XYZ(0, 0, 1)]),
            };
            const fakeSolid = {
                shapeType: ShapeTypes.solid,
                isEqual: () => false,
                findSubShapes: rs.fn((type: ShapeType) => (type === ShapeTypes.face ? [fakeFace] : [])),
            };
            const floorNode = new EditableShapeNode({
                document: doc,
                name: "FloorSlab",
                shape: Result.ok(fakeSolid as any),
            });
            doc.modelManager.addNode(floorNode);

            const allTools = [
                ...buildCapabilityTools(),
                ...buildNodeTools(),
                ...buildArrayTools(),
                ...buildParametricTools(),
            ];

            // Scripted Agent Recovery Sequence:
            // Turn 1: Agent mistakenly attempts to call face.normal without u and v
            // Turn 2: Agent receives "Missing required parameter 'u' ... Query surface bounds" error,
            //         changes step: queries shape.findSubShapes alone to get real refs
            // Turn 3: Agent queries face.surface -> surface.bounds on real returned ref
            // Turn 4: Agent reads bounds { u1: 0, u2: 10, v1: 0, v2: 20 }, passes midpoint u=5, v=10 to face.normal
            // Turn 5: Agent reports recovered normal
            const scriptedProvider = new ScriptedLLMProvider([
                // Turn 1: Mistaken call batching shape.findSubShapes and face.normal without u, v (exactly like error report)
                {
                    type: "tool_calls",
                    calls: [
                        {
                            id: "call-uv-1",
                            name: "run_program",
                            args: {
                                ops: [
                                    {
                                        id: "find_faces",
                                        method: "shape.findSubShapes",
                                        target: floorNode.id,
                                        args: { shapeType: "face" },
                                    },
                                    {
                                        id: "top_face",
                                        method: "face.normal",
                                        target: "find_faces#0",
                                        args: {},
                                    },
                                ],
                            },
                        },
                    ],
                },
                // Turn 2: Reads error, changes step: runs shape.findSubShapes alone
                (opts) => {
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain("Missing required parameter");
                    expect((lastMsg as any).content).toContain("surface.bounds");
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "call-uv-2",
                                name: "run_program",
                                args: {
                                    ops: [
                                        {
                                            method: "shape.findSubShapes",
                                            id: "flFaces",
                                            target: floorNode.id,
                                            args: { subshapeType: "face" },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                },
                // Turn 3: Reads returned refs, queries face.surface and surface.bounds
                (opts) => {
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain('"refs":["flFaces#0"]');
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "call-uv-3",
                                name: "run_program",
                                args: {
                                    ops: [
                                        {
                                            method: "face.surface",
                                            id: "surf0",
                                            target: "flFaces#0",
                                        },
                                        {
                                            method: "surface.bounds",
                                            id: "bounds0",
                                            target: "surf0",
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                },
                // Turn 4: Reads bounds { u1: 0, u2: 10, v1: 0, v2: 20 }, computes valid midpoint and calls face.normal
                (opts) => {
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain('"u1":0');
                    expect((lastMsg as any).content).toContain('"v2":20');
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "call-uv-4",
                                name: "run_program",
                                args: {
                                    ops: [
                                        {
                                            method: "face.normal",
                                            id: "good_norm",
                                            target: "flFaces#0",
                                            args: { u: 5, v: 10 },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                },
                // Turn 5: Final text confirmation
                {
                    type: "text",
                    text: "Successfully recovered from missing UV error and queried face normal on real ref.",
                },
            ]);

            const messages: any[] = [{ role: "user", content: "Query normal of floor top face." }];
            const callbacks = {
                onTextDelta: () => {},
                onThinkingDelta: () => {},
                onToolCall: () => {},
                onUsage: () => {},
            };

            await runAgent({
                provider: scriptedProvider,
                config: { model: "mock-model" } as any,
                system: { stable: "system-test", volatile: "" },
                messages,
                tools: allTools,
                callbacks,
            });

            const finalMsg = messages[messages.length - 1];
            expect(finalMsg.content).toContain(
                "Successfully recovered from missing UV error and queried face normal on real ref.",
            );
        });

        test("Already-deleted node ID is rejected and agent does NOT repeat delete, calling get_document_state instead", async () => {
            const nodeToDelete = new EditableShapeNode({
                document: doc,
                name: "NodeToDelete",
                shape: Result.ok({
                    shapeType: ShapeTypes.solid,
                    isEqual: () => false,
                } as any),
            });
            doc.modelManager.addNode(nodeToDelete);
            const targetId = nodeToDelete.id;

            const allTools = [
                ...buildCapabilityTools(),
                ...buildNodeTools(),
                ...buildReadTools(),
                ...buildArrayTools(),
                ...buildParametricTools(),
            ];

            let deleteAttemptCount = 0;

            // Scripted Agent Sequence:
            // Turn 1: Calls delete_node on targetId -> node is successfully deleted
            // Turn 2: Agent attempts to delete targetId again -> receives "already consumed or deleted" error
            // Turn 3: Agent changes step: does NOT call delete_node again; calls get_document_state to confirm active tree
            // Turn 4: Agent confirms node is gone and finishes turn
            const scriptedProvider = new ScriptedLLMProvider([
                // Turn 1: First delete
                {
                    type: "tool_calls",
                    calls: [
                        {
                            id: "del-1",
                            name: "delete_node",
                            args: { id: targetId },
                        },
                    ],
                },
                // Turn 2: Erroneous duplicate delete attempt
                (opts) => {
                    deleteAttemptCount++;
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain(`"deleted":"${targetId}"`);
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "del-2",
                                name: "delete_node",
                                args: { id: targetId },
                            },
                        ],
                    };
                },
                // Turn 3: Reads error, changes step: calls get_document_state instead of retrying delete
                (opts) => {
                    deleteAttemptCount++;
                    const lastMsg = opts.messages[opts.messages.length - 1];
                    expect((lastMsg as any).content).toContain("was already consumed or deleted");
                    return {
                        type: "tool_calls",
                        calls: [
                            {
                                id: "read-doc",
                                name: "get_document_state",
                                args: {},
                            },
                        ],
                    };
                },
                // Turn 4: Completes turn without retrying delete
                {
                    type: "text",
                    text: `Confirmed via get_document_state that node ${targetId} is no longer in active document.`,
                },
            ]);

            const messages: any[] = [{ role: "user", content: `Delete node ${targetId}` }];
            const callbacks = {
                onTextDelta: () => {},
                onThinkingDelta: () => {},
                onToolCall: () => {},
                onUsage: () => {},
            };

            await runAgent({
                provider: scriptedProvider,
                config: { model: "mock-model" } as any,
                system: { stable: "system-test", volatile: "" },
                messages,
                tools: allTools,
                callbacks,
            });

            expect(deleteAttemptCount).toBe(2); // Attempt 1 succeeded, Attempt 2 rejected, Attempt 3 switched to get_document_state!
            const finalMsg = messages[messages.length - 1];
            expect(finalMsg.content).toContain(
                `Confirmed via get_document_state that node ${targetId} is no longer in active document.`,
            );
        });

        test("syncSessionMemoryWithDocument reconciles active and removed nodes across delete and undo", () => {
            const nodeA = new EditableShapeNode({
                document: doc,
                name: "NodeA",
                shape: Result.ok({ shapeType: ShapeTypes.solid } as any),
            });
            const nodeB = new EditableShapeNode({
                document: doc,
                name: "NodeB",
                shape: Result.ok({ shapeType: ShapeTypes.solid } as any),
            });
            doc.modelManager.addNode(nodeA);
            doc.modelManager.addNode(nodeB);

            // Sync with initial document
            syncSessionMemoryWithDocument(doc);
            let mem = getSessionMemory();
            expect(mem.activeNodes.map((n) => n.id)).toContain(nodeA.id);
            expect(mem.activeNodes.map((n) => n.id)).toContain(nodeB.id);
            expect(mem.removedNodeIds).not.toContain(nodeA.id);

            // Simulate deleting nodeA
            nodeA.parent?.remove(nodeA);
            onNodesRemoved([nodeA.id]);
            mem = getSessionMemory();
            expect(mem.removedNodeIds).toContain(nodeA.id);
            expect(mem.activeNodes.map((n) => n.id)).not.toContain(nodeA.id);

            // Simulate Undo restoring nodeA back to document
            doc.modelManager.addNode(nodeA);
            syncSessionMemoryWithDocument(doc);
            mem = getSessionMemory();
            // nodeA is restored: must NOT be in removedNodeIds, must be back in activeNodes
            expect(mem.removedNodeIds).not.toContain(nodeA.id);
            expect(mem.activeNodes.map((n) => n.id)).toContain(nodeA.id);
        });

        test("parametric boolean consumes cutter into body history -> sync keeps cutter protected in removedNodeIds and excluded from activeNodes; real undo restores it", async () => {
            clearSessionMemory();

            const body = new ParametricBodyNode({
                document: doc,
                features: [],
            });
            body.name = "TargetBody";
            doc.modelManager.addNode(body);

            const cutter = new EditableShapeNode({
                document: doc,
                name: "CutterTool",
                shape: Result.ok({
                    shapeType: ShapeTypes.solid,
                    isEqual: () => false,
                } as any),
            });
            doc.modelManager.addNode(cutter);

            // 1. Initial document state sync: both are independent active nodes
            syncSessionMemoryWithDocument(doc);
            let mem = getSessionMemory();
            expect(mem.activeNodes.map((n) => n.id)).toContain(body.id);
            expect(mem.activeNodes.map((n) => n.id)).toContain(cutter.id);
            expect(mem.removedNodeIds).not.toContain(cutter.id);

            // 2. Parametric boolean cut consumes the cutter into the body's feature history
            Transaction.execute(doc, "cut", () => {
                body.setFeaturesEmitShapeChanged([
                    {
                        id: "cut-feat-1",
                        type: "boolean",
                        operation: "cut",
                        toolIds: [cutter.id],
                        consumeTools: true,
                    } as never,
                ]);
            });

            // Verify the cutter was transferred to the body as a consumed tool
            expect(cutter.parent).toBe(body);
            expect(isConsumedTool(cutter)).toBe(true);

            // 3. Sync with document after boolean adoption:
            // syncSessionMemoryWithDocument must recognize isConsumedTool(cutter) === true.
            // Cutter MUST be placed into removedNodeIds and MUST NOT return to activeNodes.
            syncSessionMemoryWithDocument(doc);
            mem = getSessionMemory();
            expect(mem.removedNodeIds).toContain(cutter.id);
            expect(mem.activeNodes.map((n) => n.id)).not.toContain(cutter.id);
            expect(mem.activeNodes.map((n) => n.id)).toContain(body.id);

            // 4. Also verify that attempting to delete the consumed tool fails with ownership protection
            const deleteTool = buildNodeTools().find((t) => t.name === "delete_node")!;
            const rawDelResult = (await deleteTool.handler({ id: cutter.id })) as string;
            const delResult = JSON.parse(rawDelResult);
            expect(delResult.error).toContain("it is a consumed boolean tool owned by parametric body");
            expect(delResult.error).toContain("TargetBody");

            // 5. Perform real Undo: releases cutter from body back to root
            doc.history.undo();
            expect(cutter.parent).toBe(doc.modelManager.rootNode);
            expect(isConsumedTool(cutter)).toBe(false);

            // 6. Sync with document after Undo:
            // State is now legitimately an independent live node, so it MUST be restored to activeNodes
            // and un-marked from removedNodeIds!
            syncSessionMemoryWithDocument(doc);
            mem = getSessionMemory();
            expect(mem.removedNodeIds).not.toContain(cutter.id);
            expect(mem.activeNodes.map((n) => n.id)).toContain(cutter.id);
            expect(mem.activeNodes.map((n) => n.id)).toContain(body.id);
        });
    });
});
