// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    BoundingBox,
    EditableShapeNode,
    FolderNode,
    type Matrix4,
    Plane,
    Result,
    ShapeTypes,
    XYZ,
} from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import { clearSessionMemory, getSessionMemory, onNodesRemoved } from "../src/memory";
import { buildArrayTools } from "../src/tools/arrayTools";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";
import { buildNodeTools } from "../src/tools/nodeTools";
import { buildParametricTools } from "../src/tools/parametricTools";

describe("Door Modeling Errors Regression Suite (16 Reported Errors Verification)", () => {
    let doc: TestDocument;
    let mockFactory: any;

    beforeEach(() => {
        doc = new TestDocument({ selection: { clearSelection: rs.fn() } as any });
        mockFactory = {
            box: rs.fn(() => Result.ok(createMockShape(ShapeTypes.solid, 1000))),
            wire: rs.fn(() => Result.ok(createMockShape(ShapeTypes.wire, 0))),
            face: rs.fn(() => Result.ok(createMockShape(ShapeTypes.face, 0))),
            solid: rs.fn(() => Result.ok(createMockShape(ShapeTypes.solid, 500))),
            booleanCut: rs.fn(() => Result.ok(createMockShape(ShapeTypes.solid, 400))),
        };
        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        (app as any).shapeProvider = { factory: mockFactory };
        rs.stubGlobal("app", app);
        rs.stubGlobal("shapeFactory", mockFactory);
        clearSessionMemory();
    });

    afterEach(() => {
        rs.unstubAllGlobals();
    });

    function createMockShape(type: any, vol = 1000): any {
        return {
            shapeType: type,
            volume: rs.fn(() => vol),
            isClosed: rs.fn(() => true),
            checkShape: rs.fn(() => true),
            setTolerance: rs.fn(),
            boundingBox: rs.fn(
                () => new BoundingBox(new XYZ({ x: 0, y: 0, z: 0 }), new XYZ({ x: 10, y: 10, z: 10 })),
            ),
            transformedMul: rs.fn((m: Matrix4) => createMockShape(type, vol)),
            findSubShapes: rs.fn((subType: any) => []),
            containsPoint: rs.fn(() => false),
        } as unknown as any;
    }

    test("1. coerceRefParam: face.wire as non-array string throws actionable syntax error instead of t.map is not a function", async () => {
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        // Register a wire in localRefs
        const wireNode = new EditableShapeNode({
            document: doc,
            name: "Wire1",
            shape: Result.ok(createMockShape(ShapeTypes.wire, 0)),
        });
        doc.modelManager.addNode(wireNode);

        // Call face with wire as string (error report [12] reproduction)
        const res = await runProgramTool.handler({
            ops: [
                {
                    method: "face",
                    id: "myFace",
                    args: {
                        wire: wireNode.id, // String instead of array
                    },
                },
            ],
        });

        // normalizeOpArgs automatically wraps wire string into [wire], so it succeeds without t.map failure
        const parsed = JSON.parse(res as string);
        expect(parsed.created).toHaveLength(1);
        expect(parsed.created[0].name).toBe("face");
    });

    test("2. coerceRefParam: solid.shells requires array and gives clear error or normalizes single shell", async () => {
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        const shellNode = new EditableShapeNode({
            document: doc,
            name: "Shell1",
            shape: Result.ok(createMockShape(ShapeTypes.shell, 0)),
        });
        doc.modelManager.addNode(shellNode);

        // Call solid with shape: "id" instead of shells: ["id"] (error report [13] reproduction)
        const res = await runProgramTool.handler({
            ops: [
                {
                    method: "solid",
                    id: "mySolid",
                    args: {
                        shape: shellNode.id, // alias for shells
                    },
                },
            ],
        });

        const parsed = JSON.parse(res as string);
        expect(parsed.created).toHaveLength(1);
    });

    test("3. normalizeOpArgs: findSubShapes aliases (type, shapeType, op.id inference) correctly infer subshapeType", async () => {
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        const mockSolid = createMockShape(ShapeTypes.solid, 1000);
        const mockFace = createMockShape(ShapeTypes.face, 0);
        (mockSolid as any).findSubShapes = rs.fn((type: any) => {
            if (type === ShapeTypes.face) return [mockFace];
            return [];
        });

        const solidNode = new EditableShapeNode({
            document: doc,
            name: "TargetSolid",
            shape: Result.ok(mockSolid),
        });
        doc.modelManager.addNode(solidNode);

        // Op with id: "find_faces" and type: "face" (error report [11] reproduction)
        const res = await runProgramTool.handler({
            ops: [
                {
                    method: "shape.findSubShapes",
                    id: "find_faces",
                    target: solidNode.id,
                    args: {
                        type: "face",
                    },
                },
            ],
        });

        const parsed = JSON.parse(res as string);
        expect(parsed.results.find_faces.count).toBe(1);
        expect(parsed.results.find_faces.refs).toEqual(["find_faces#0"]);
        // Verify findSubShapes was called with ShapeTypes.face, NOT ShapeTypes.edge
        expect(mockSolid.findSubShapes).toHaveBeenCalledWith(ShapeTypes.face);
    });

    test("4. checkQueryOwner: shape mismatch provides guidance referencing subshapeType", async () => {
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        const edgeShape = createMockShape(ShapeTypes.edge, 0);
        const edgeNode = new EditableShapeNode({
            document: doc,
            name: "EdgeNode",
            shape: Result.ok(edgeShape),
        });
        doc.modelManager.addNode(edgeNode);

        // Call face.area on an edge target (reproducing error report [11])
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

    test("5. resolveSketchPlane: { origin, normal } plane configuration throws actionable error", async () => {
        const parametricTools = buildParametricTools();
        const runParametricTool = parametricTools.find((t) => t.name === "run_parametric")!;

        // Error report [5], [7] reproduction: plane passed as { origin, normal }
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

    test("6. resolveSketchPlane: host node with 0 faces reports clear 0 faces error instead of (0..-1)", async () => {
        const parametricTools = buildParametricTools();
        const runParametricTool = parametricTools.find((t) => t.name === "run_parametric")!;

        // Host node with empty faces (e.g. non-solid or empty shape)
        const emptyShape = createMockShape(ShapeTypes.compound, 0);
        (emptyShape as any).findSubShapes = rs.fn(() => []); // 0 faces
        const hostNode = new EditableShapeNode({
            document: doc,
            name: "EmptyHost",
            shape: Result.ok(emptyShape),
        });
        doc.modelManager.addNode(hostNode);

        // Error report [6], [8] reproduction
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

    test("7. measure_nodes: falls back to B-rep bounding box when mesh is untessellated", async () => {
        const arrayTools = buildArrayTools();
        const measureTool = arrayTools.find((t) => t.name === "measure_nodes")!;

        // ShapeNode whose node.boundingBox() is undefined (untessellated mesh)
        const node = new EditableShapeNode({
            document: doc,
            name: "UntessellatedBody",
            shape: Result.ok(createMockShape(ShapeTypes.solid, 1000)),
        });
        // Override boundingBox to simulate empty mesh
        rs.spyOn(node, "boundingBox").mockReturnValue(undefined);
        doc.modelManager.addNode(node);

        const resRaw = await measureTool.handler({ nodeIds: [node.id] });
        const res = JSON.parse(resRaw as string);

        expect(res.error).toBeUndefined();
        expect(res.nodes).toHaveLength(1);
        expect(res.nodes[0].id).toBe(node.id);
        expect(res.nodes[0].dimensions).toEqual({ x: 10, y: 10, z: 10 });
    });

    test("8. measure_nodes: empty sketch reports diagnostic error and keeps verification unverified", async () => {
        const arrayTools = buildArrayTools();
        const measureTool = arrayTools.find((t) => t.name === "measure_nodes")!;

        // Node with no boundingBox and no shape boundingBox
        const emptyNode = new FolderNode({ document: doc, name: "EmptyFolder" });
        doc.modelManager.addNode(emptyNode);

        const resRaw = await measureTool.handler({ nodeIds: [emptyNode.id] });
        const res = JSON.parse(resRaw as string);

        expect(res.nodes).toBeUndefined();
        expect(res.error).toContain("Node cannot be measured (no bounding box)");
        expect(res.error).toContain("Verification status: unverified");
    });

    test("9. delete_node: consumed boolean tool guard preserves pristine state and gives actionable owner guidance", async () => {
        const nodeTools = buildNodeTools();
        const deleteTool = nodeTools.find((t) => t.name === "delete_node")!;

        // Simulate consumed boolean tool owned by a non-folder parent (parametric body / shape node)
        const parentBody = new EditableShapeNode({
            document: doc,
            name: "WallBody",
            shape: Result.ok(createMockShape(ShapeTypes.solid, 1000)),
        });
        doc.modelManager.addNode(parentBody);

        const consumedToolNode = new EditableShapeNode({
            document: doc,
            name: "DoorCutterConsumed",
            shape: Result.ok(createMockShape(ShapeTypes.solid, 500)),
        });
        doc.modelManager.addNode(consumedToolNode);
        (consumedToolNode as any).parent = parentBody;

        const initialNodesCount = doc.modelManager.findNodes(() => true).length;

        // Try to delete consumed tool (error report [1], [2] reproduction)
        const resRaw = await deleteTool.handler({ id: consumedToolNode.id });
        const res = JSON.parse(resRaw as string);

        expect(res.error).toContain('it is a consumed boolean tool owned by parametric body "WallBody"');
        expect(res.error).toContain(
            "To modify or remove this cut/fuse, edit or delete the boolean feature on the parent body using run_parametric",
        );
        expect(res.error).toContain("Do not retry deleting this node");

        // Verify document is preserved in pristine state
        expect(doc.modelManager.findNodes(() => true).length).toBe(initialNodesCount);
        expect(doc.modelManager.findNodes((n) => n.id === consumedToolNode.id)).toHaveLength(1);
    });

    test("10. transformedMul: translation {0,0,0} creates new node, does NOT delete original node", async () => {
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        const baseNode = new EditableShapeNode({
            document: doc,
            name: "OriginalNode",
            shape: Result.ok(createMockShape(ShapeTypes.solid, 1000)),
        });
        doc.modelManager.addNode(baseNode);

        // Agent calling transformedMul with translate 0 as "delete_bad" (error report [16] reproduction)
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
        // Original node still exists intact
        expect(doc.modelManager.findNodes((n) => n.id === baseNode.id)).toHaveLength(1);
    });

    test("11. resolveRefEntry: stale or removed node ID reports clear guidance pointing to get_document_state", async () => {
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        // Register removed ID in session memory via onNodesRemoved
        onNodesRemoved(["MoeRXPNj7nkVfKJkGxdod"]);

        // Error report [15], [16] reproduction: targeting stale ID
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
