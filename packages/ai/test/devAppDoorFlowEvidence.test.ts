// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, EditableShapeNode, Matrix4, Plane, Result, ShapeTypes, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { SketchNode } from "@chili3d/parametric";
import { rs } from "@rstest/core";
import { runAgent } from "../src/llm/agent";
import { clearSessionMemory, getSessionMemory } from "../src/memory";
import { buildArrayTools } from "../src/tools/arrayTools";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";

describe("End-to-End Door Modeling Flow Integration Test (Simulated Boolean)", () => {
    let doc: TestDocument;
    let factory: any;

    function createSolidShape(box: BoundingBox, volumeVal: number, containsPtFn?: (pt: any) => boolean) {
        return {
            shapeType: ShapeTypes.solid,
            isEqual: () => false,
            findSubShapes: () => [],
            matrix: Matrix4.identity(),
            mesh: {
                faces: {
                    position: new Float32Array([
                        box.min.x,
                        box.min.y,
                        box.min.z,
                        box.max.x,
                        box.max.y,
                        box.max.z,
                    ]),
                },
                edges: undefined,
                vertexs: undefined,
            },
            boundingBox: () => box,
            volume: () => volumeVal,
            checkShape: () => true,
            setTolerance: rs.fn(),
            containsPoint: containsPtFn ?? (() => false),
            transformedMul: (m: Matrix4) => {
                const transformedBox = BoundingBox.transformed(box, m);
                return createSolidShape(transformedBox, volumeVal, containsPtFn);
            },
            dispose: rs.fn(),
        } as any;
    }

    beforeEach(() => {
        doc = new TestDocument({ selection: { clearSelection: rs.fn() } as any });
        factory = {
            box: rs.fn(),
            booleanCut: rs.fn(),
        };
        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        (app as any).shapeProvider = { factory };
        rs.stubGlobal("app", app);
        rs.stubGlobal("shapeFactory", factory);
        clearSessionMemory();
    });

    afterEach(() => {
        rs.unstubAllGlobals();
    });

    test("Full flow: create door sketch -> measure sketch -> cut wall -> read resulting nodeId -> post-verify correct node", async () => {
        console.log("=== STEP 1: CREATE DOOR SKETCH ===");
        // Sketch door: 800 x 2000 mm on Plane XY offset by Z = 0
        const doorSketch = new SketchNode({
            document: doc,
            plane: Plane.XY,
            data: {
                entities: [
                    { id: 1, type: "line", params: [100, 0, 900, 0] },
                    { id: 2, type: "line", params: [900, 0, 900, 2000] },
                    { id: 3, type: "line", params: [900, 2000, 100, 2000] },
                    { id: 4, type: "line", params: [100, 2000, 100, 0] },
                ],
                constraints: [],
            },
        });
        doorSketch.name = "Door Sketch";
        doc.modelManager.addNode(doorSketch);

        const arrayTools = buildArrayTools();
        const measureTool = arrayTools.find((t) => t.name === "measure_nodes")!;
        const sketchMeasureRaw = await measureTool.handler({ nodeIds: [doorSketch.id] });
        const sketchMeasure = JSON.parse(sketchMeasureRaw as string);
        console.log("Door Sketch Measurement:", JSON.stringify(sketchMeasure.nodes[0]));
        expect(sketchMeasure.nodes[0].dimensions).toEqual({ x: 800, y: 2000, z: 0 });
        expect(sketchMeasure.nodes[0].bounds.min).toEqual({ x: 100, y: 0, z: 0 });
        expect(sketchMeasure.nodes[0].bounds.max).toEqual({ x: 900, y: 2000, z: 0 });

        console.log("=== STEP 2: CREATE WALL AND CUTTER SOLIDS ===");
        // Wall solid: 1000 x 200 x 2500 mm (X[0, 1000], Y[0, 200], Z[0, 2500]), Volume = 500,000,000 mm3
        const wallBox = new BoundingBox(new XYZ(0, 0, 0), new XYZ(1000, 200, 2500));
        const wallVolBefore = 500_000_000;
        const wallShape = createSolidShape(wallBox, wallVolBefore);
        const wallNode = new EditableShapeNode({
            document: doc,
            name: "Main Wall",
            shape: Result.ok(wallShape),
        });
        doc.modelManager.addNode(wallNode);
        const originalWallId = wallNode.id;

        // Cutter solid: 800 x 300 x 2000 mm (X[100, 900], Y[-50, 250], Z[0, 2000]), penetrates thickness Y[0, 200]
        const cutterBox = new BoundingBox(new XYZ(100, -50, 0), new XYZ(900, 250, 2000));
        const cutterVol = 800 * 300 * 2000;
        const cutterShape = createSolidShape(cutterBox, cutterVol);
        const cutterNode = new EditableShapeNode({
            document: doc,
            name: "Door Void Cutter",
            shape: Result.ok(cutterShape),
        });
        doc.modelManager.addNode(cutterNode);
        const cutterId = cutterNode.id;

        console.log(`Initial nodes in doc: wallId=${originalWallId}, cutterId=${cutterId}`);
        console.log(`Wall Volume Before Cut: ${wallVolBefore.toLocaleString()} mm3`);

        console.log("=== STEP 3: PERFORM THROUGH-WALL BOOLEAN CUT ===");
        // Result wall: Volume reduced by 800 * 200 * 2000 = 320,000,000 mm3 -> VolAfter = 180,000,000 mm3
        const wallVolAfter = wallVolBefore - 800 * 200 * 2000;
        const cutResultShape = createSolidShape(wallBox, wallVolAfter, () => false);

        factory.booleanCut = rs.fn((_targets: any[], _tools: any[]) => Result.ok(cutResultShape));

        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        const cutResRaw = await runProgramTool.handler({
            ops: [
                {
                    method: "booleanCut",
                    id: "doorApertureCut",
                    name: "Wall (With Door Opening)",
                    args: {
                        shape1: originalWallId,
                        shape2: cutterId,
                        throughCut: true,
                    },
                },
            ],
        });

        const cutRes = JSON.parse(cutResRaw as string);
        console.log("Boolean Cut Result:", JSON.stringify(cutRes));

        expect(cutRes.created.length).toBe(1);
        expect(cutRes.removed.length).toBe(2);
        expect(cutRes.removed.map((r: any) => r.nodeId)).toContain(originalWallId);
        expect(cutRes.removed.map((r: any) => r.nodeId)).toContain(cutterId);

        const resultingNodeId = cutRes.created[0].nodeId;
        const resultingNodeName = cutRes.created[0].name;
        console.log(`Newly Created Result Node: ID="${resultingNodeId}", Name="${resultingNodeName}"`);
        console.log(
            `Wall Volume After Cut: ${wallVolAfter.toLocaleString()} mm3 (Removed: ${(wallVolBefore - wallVolAfter).toLocaleString()} mm3)`,
        );
        expect(cutRes.results.doorApertureCut.throughVerified).toBe(true);
        expect(cutRes.results.doorApertureCut.status).toBe("verified");

        console.log("=== STEP 4: VERIFY CONSUMED NODE REJECTION ===");
        // Attempting to measure originalWallId returns informative guidance, not false verification
        const oldMeasureRaw = await measureTool.handler({ nodeIds: [originalWallId] });
        const oldMeasure = JSON.parse(oldMeasureRaw as string);
        console.log("Attempting to measure consumed originalWallId:", JSON.stringify(oldMeasure));
        expect(oldMeasure.error).toContain(
            `Node "${originalWallId}" was consumed or removed by a previous edit operation (found in sessionMemory.removedNodeIds)`,
        );

        console.log("=== STEP 5: POST-VERIFY NEW RESULT NODE VIA MEASURE_NODES ===");
        const newMeasureRaw = await measureTool.handler({ nodeIds: [resultingNodeId] });
        const newMeasure = JSON.parse(newMeasureRaw as string);
        console.log("Measurement of resulting active node:", JSON.stringify(newMeasure));

        expect(newMeasure.error).toBeUndefined();
        expect(newMeasure.nodes.length).toBe(1);
        expect(newMeasure.nodes[0].id).toBe(resultingNodeId);
        expect(newMeasure.nodes[0].dimensions).toEqual({ x: 1000, y: 200, z: 2500 });
        expect(newMeasure.nodes[0].approxVolumeMm3).toBe(1000 * 200 * 2500);

        console.log("=== FLOW COMPLETED SUCCESSFULLY WITH PERFECT INTEGRITY ===");
    });
});
