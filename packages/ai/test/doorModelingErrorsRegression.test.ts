// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, EditableShapeNode, Matrix4, Plane, Result, ShapeTypes, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { SketchNode } from "@chili3d/parametric";
import { rs } from "@rstest/core";
import { extractVerifiedEvidence, runAgent } from "../src/llm/agent";
import { clearSessionMemory, getSessionMemory, onNodesRemoved } from "../src/memory";
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
});
