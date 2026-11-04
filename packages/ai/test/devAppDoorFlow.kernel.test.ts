// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { EditableShapeNode, Plane, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { rs } from "@rstest/core";
import { clearSessionMemory } from "../src/memory";
import { buildArrayTools } from "../src/tools/arrayTools";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";

// Under Node, load the real compiled OCCT WASM binary from disk
const WASM_PATH = path.resolve(__dirname, "../../wasm/lib/chili-wasm.wasm");
const WASM_BINARY = readFileSync(WASM_PATH);

describe("Dev App Door Flow on Real OCCT/WASM Kernel", () => {
    let doc: TestDocument;
    let factory: ShapeFactory;

    beforeAll(async () => {
        await initWasm({ wasmBinary: WASM_BINARY });
        factory = new ShapeFactory();
    });

    beforeEach(() => {
        doc = new TestDocument({ selection: { clearSelection: rs.fn() } as any });
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

    test("Real Kernel Door Cut Flow: create wall & cutter -> throughCut -> get created[0].nodeId -> measure new ID vs old ID", async () => {
        console.log("--- STEP 1: CREATE REAL OCCT WALL & CUTTER SOLIDS ---");
        // Real OCCT Solid Wall: 1000 x 200 x 2500 mm (thickness = 200 along Y)
        const wallRes = factory.box(Plane.XY, 1000, 200, 2500);
        expect(wallRes.isOk).toBe(true);
        const wallShape = wallRes.value;

        const wallNode = new EditableShapeNode({
            document: doc,
            name: "Main Wall",
            shape: wallRes,
        });
        doc.modelManager.addNode(wallNode);
        const wallNodeId = wallNode.id;

        // Real OCCT Solid Cutter: 800 x 300 x 2000 mm at X=100, Y=-50, Z=0 (penetrates Y from -50 to 250, through wall Y[0, 200])
        const cutterPlane = new Plane({
            origin: new XYZ({ x: 100, y: -50, z: 0 }),
            normal: XYZ.unitZ,
            xvec: XYZ.unitX,
        });
        const cutterRes = factory.box(cutterPlane, 800, 300, 2000);
        expect(cutterRes.isOk).toBe(true);
        const cutterShape = cutterRes.value;

        const cutterNode = new EditableShapeNode({
            document: doc,
            name: "Door Void Cutter",
            shape: cutterRes,
        });
        doc.modelManager.addNode(cutterNode);
        const cutterNodeId = cutterNode.id;

        const kernelWallVolBefore = wallShape.volume();
        const kernelCutterVol = cutterShape.volume();
        console.log(`[OCCT Kernel] Wall Volume Before: ${kernelWallVolBefore.toFixed(2)} mm3`);
        console.log(`[OCCT Kernel] Cutter Volume: ${kernelCutterVol.toFixed(2)} mm3`);
        expect(kernelWallVolBefore).toBeCloseTo(500_000_000, 0);
        expect(kernelCutterVol).toBeCloseTo(480_000_000, 0);

        console.log("--- STEP 2: EXECUTE THROUGH-WALL BOOLEAN CUT VIA RUN_PROGRAM ---");
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        const cutRaw = await runProgramTool.handler({
            ops: [
                {
                    method: "booleanCut",
                    id: "doorCutReal",
                    name: "Wall (With Real Cut)",
                    args: {
                        shape1: wallNodeId,
                        shape2: cutterNodeId,
                        throughCut: true,
                    },
                },
            ],
        });

        const cutRes = JSON.parse(cutRaw as string);
        console.log("[run_program Result]:", JSON.stringify(cutRes, null, 2));

        // Verify created and removed lists
        expect(cutRes.created).toHaveLength(1);
        const removedIds = cutRes.removed.map((r: any) => r.nodeId);
        expect(removedIds).toEqual(expect.arrayContaining([wallNodeId, cutterNodeId]));

        const newWallNodeId = cutRes.created[0].nodeId;
        console.log(`[Kernel Verified] Consumed Old IDs: [${wallNodeId}, ${cutterNodeId}]`);
        console.log(`[Kernel Verified] New Created Node ID: "${newWallNodeId}"`);

        // Check verification results from kernel
        const throughCheck = cutRes.results.doorCutReal;
        console.log("[Kernel Through-Cut Verification]:", JSON.stringify(throughCheck, null, 2));
        expect(throughCheck.throughVerified).toBe(true);
        expect(throughCheck.penetrationAxis).toBe("y");
        expect(throughCheck.probedPointsCount).toBeGreaterThan(0);

        // Fetch newly created node from document and check its real OCCT volume
        const createdNode = doc.modelManager.findNodes((n) => n.id === newWallNodeId)[0] as EditableShapeNode;
        expect(createdNode).toBeDefined();
        const kernelWallVolAfter = createdNode.shape.value.volume();
        console.log(`[OCCT Kernel] Wall Volume After: ${kernelWallVolAfter.toFixed(2)} mm3`);
        // Expected reduction: 800 * 200 * 2000 = 320,000,000 mm3 -> After = 180,000,000 mm3
        expect(kernelWallVolAfter).toBeCloseTo(180_000_000, 0);
        expect(kernelWallVolBefore - kernelWallVolAfter).toBeCloseTo(320_000_000, 0);

        console.log("--- STEP 3: POST-VERIFICATION MEASUREMENT ON NEW ID VS OLD ID ---");
        const arrayTools = buildArrayTools();
        const measureTool = arrayTools.find((t) => t.name === "measure_nodes")!;

        // 3A: Measure new valid node ID
        const measureNewRaw = await measureTool.handler({ nodeIds: [newWallNodeId] });
        const measureNew = JSON.parse(measureNewRaw as string);
        console.log("[measure_nodes on New Node ID]:", JSON.stringify(measureNew, null, 2));
        expect(measureNew.error).toBeUndefined();
        expect(measureNew.nodes).toHaveLength(1);
        expect(measureNew.nodes[0].id).toBe(newWallNodeId);
        expect(measureNew.nodes[0].dimensions).toEqual({ x: 1000, y: 200, z: 2500 });
        expect(measureNew.nodes[0].approxVolumeMm3).toBe(500_000_000);

        // 3B: Measure old consumed node ID (must fail with recovery guidance and not verify)
        const measureOldRaw = await measureTool.handler({ nodeIds: [wallNodeId] });
        const measureOld = JSON.parse(measureOldRaw as string);
        console.log("[measure_nodes on Old Consumed Node ID]:", JSON.stringify(measureOld, null, 2));
        expect(measureOld.error).toContain(
            `Node "${wallNodeId}" was consumed or removed by a previous edit operation`,
        );
        expect(measureOld.error).toContain("Call get_document_state to view current active nodes");
        expect(measureOld.nodes).toBeUndefined();
    });

    test("Real Kernel Misaligned Cutter: fails with clear bounds error and preserves document pristine", async () => {
        console.log("--- TEST MISALIGNED CUTTER ON REAL KERNEL ---");
        // Real Wall: 1000 x 200 x 2500 mm (X[0, 1000], Y[0, 200], Z[0, 2500])
        const wallRes = factory.box(Plane.XY, 1000, 200, 2500);
        const wallNode = new EditableShapeNode({
            document: doc,
            name: "Main Wall",
            shape: wallRes,
        });
        doc.modelManager.addNode(wallNode);

        // Cutter shifted far along X: X[2000, 2800] (completely outside wall bounds)
        const misalignedPlane = new Plane({
            origin: new XYZ({ x: 2000, y: -50, z: 0 }),
            normal: XYZ.unitZ,
            xvec: XYZ.unitX,
        });
        const cutterRes = factory.box(misalignedPlane, 800, 300, 2000);
        const cutterNode = new EditableShapeNode({
            document: doc,
            name: "Far Cutter",
            shape: cutterRes,
        });
        doc.modelManager.addNode(cutterNode);

        const initialCount = doc.modelManager.findNodes(() => true).length;
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        await expect(
            runProgramTool.handler({
                ops: [
                    {
                        method: "booleanCut",
                        id: "misalignedCut",
                        args: {
                            shape1: wallNode.id,
                            shape2: cutterNode.id,
                        },
                    },
                ],
            }),
        ).rejects.toThrow(
            /booleanCut did not remove any volume from target "Main Wall".*Cutter does not intersect the target: cutter is completely outside target bounds/,
        );

        // Document remains completely pristine: no nodes deleted, no nodes added
        const currentNodes = doc.modelManager.findNodes(() => true);
        expect(currentNodes.length).toBe(initialCount);
        expect(doc.modelManager.findNodes((n) => n.id === wallNode.id)[0]).toBe(wallNode);
        expect(doc.modelManager.findNodes((n) => n.id === cutterNode.id)[0]).toBe(cutterNode);
        console.log("[Pristine State Verified]: Doc retains exactly original 2 nodes unchanged.");
    });
});
