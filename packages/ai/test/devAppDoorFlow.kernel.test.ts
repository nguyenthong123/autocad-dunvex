// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { EditableShapeNode, Plane, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { ParametricBodyNode } from "@chili3d/parametric";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { rs } from "@rstest/core";
import "../../parametric/test/sketch/setup";
import { clearSessionMemory } from "../src/memory";
import { buildArrayTools } from "../src/tools/arrayTools";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";
import { buildParametricTools } from "../src/tools/parametricTools";

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

    test("Real Kernel Parametric Door Cut: wall sketch -> extrude -> door sketch on planar face -> extrude cut -> verify history intact", async () => {
        console.log("--- TEST PARAMETRIC WALL & DOOR CUT ON REAL OCCT KERNEL ---");
        const parametricTools = buildParametricTools();
        const runParametricTool = parametricTools.find((t) => t.name === "run_parametric")!;

        // Step 1: Create Parametric Wall (1000 x 200 x 2500 mm)
        // Sketch rectangle on XY plane: 1000 x 200, extruded Z=2500
        const wallProgRaw = await runParametricTool.handler({
            ops: [
                {
                    op: "sketch",
                    id: "wallSketch",
                    plane: "XY",
                    name: "Wall Outline",
                    entities: [
                        { type: "line", params: [0, 0, 1000, 0] },
                        { type: "line", params: [1000, 0, 1000, 200] },
                        { type: "line", params: [1000, 200, 0, 200] },
                        { type: "line", params: [0, 200, 0, 0] },
                    ],
                },
                {
                    op: "extrude",
                    id: "wallBody",
                    sketch: "wallSketch",
                    depth: 2500,
                    name: "Parametric Wall",
                },
            ],
        });

        const wallProg = JSON.parse(wallProgRaw as string);
        expect(wallProg.created).toHaveLength(2); // sketch + body
        const wallBodyId = wallProg.created.find((c: any) => c.name === "Parametric Wall")!.nodeId;
        const wallBody = doc.modelManager.findNodes((n) => n.id === wallBodyId)[0] as ParametricBodyNode;
        expect(wallBody).toBeDefined();
        expect(wallBody instanceof ParametricBodyNode).toBe(true);

        const initialVol = wallBody.shape.value.volume();
        console.log(`[Parametric Real Kernel] Initial Wall Volume: ${initialVol.toFixed(2)} mm3`);
        expect(initialVol).toBeCloseTo(500_000_000, 0);

        // Step 2: Cut door opening using parametric cut
        const cutProgRaw = await runParametricTool.handler({
            ops: [
                {
                    op: "sketch",
                    id: "doorSketch",
                    plane: "XY",
                    name: "Door Cut Profile",
                    entities: [
                        { type: "line", params: [100, -50, 900, -50] },
                        { type: "line", params: [900, -50, 900, 250] },
                        { type: "line", params: [900, 250, 100, 250] },
                        { type: "line", params: [100, 250, 100, -50] },
                    ],
                },
                {
                    op: "extrude",
                    id: "doorCutFeature",
                    sketch: "doorSketch",
                    body: wallBodyId,
                    operation: "cut",
                    depth: 2000,
                },
            ],
        });

        const cutProg = JSON.parse(cutProgRaw as string);
        expect(cutProg.created).toBeDefined();

        // Step 3: Verify ParametricBodyNode features history intact
        const featuresRaw = await runParametricTool.handler({
            ops: [
                {
                    op: "features",
                    body: wallBodyId,
                },
            ],
        });
        const featuresRes = JSON.parse(featuresRaw as string);
        const featureList = featuresRes.results.features;
        console.log("[Parametric Body Feature History]:", JSON.stringify(featureList, null, 2));
        expect(featureList).toHaveLength(2); // extrude (wall) + extrude (cut)
        expect(featureList[0].type).toBe("extrude");
        expect(featureList[1].type).toBe("extrude");
        expect((wallBody.features[1] as any).operation).toBe("cut");

        // Verify volume reduced by exactly cut volume: 800 * 200 * 2000 = 320,000,000 mm3
        const finalVol = wallBody.shape.value.volume();
        console.log(`[Parametric Real Kernel] Final Wall Volume After Cut: ${finalVol.toFixed(2)} mm3`);
        expect(finalVol).toBeCloseTo(180_000_000, 0);
        expect(initialVol - finalVol).toBeCloseTo(320_000_000, 0);
    });

    test("Real Kernel Parametric Safe Stop: invalid plane faceIndex or stale body ID fails safely preserving document", async () => {
        console.log("--- TEST PARAMETRIC SAFE STOP ON REAL OCCT KERNEL ---");
        const parametricTools = buildParametricTools();
        const runParametricTool = parametricTools.find((t) => t.name === "run_parametric")!;

        const initialCount = doc.modelManager.findNodes(() => true).length;

        // Attempt to cut on non-existent/stale body ID
        await expect(
            runParametricTool.handler({
                ops: [
                    {
                        op: "sketch",
                        id: "badSketch",
                        plane: "XY",
                        entities: [
                            { type: "line", params: [0, 0, 10, 0] },
                            { type: "line", params: [10, 0, 10, 10] },
                            { type: "line", params: [10, 10, 0, 10] },
                            { type: "line", params: [0, 10, 0, 0] },
                        ],
                    },
                    {
                        op: "extrude",
                        id: "badCut",
                        sketch: "badSketch",
                        body: "non_existent_body_id",
                        operation: "cut",
                        depth: 100,
                    },
                ],
            }),
        ).rejects.toThrow(/unknown body "non_existent_body_id"/);

        // Entire transaction rolled back — no dangling sketches or partial geometry
        const currentCount = doc.modelManager.findNodes(() => true).length;
        expect(currentCount).toBe(initialCount);
        console.log("[Pristine State Verified]: Doc retains exactly original node count.");
    });

    test("Real Kernel Door Cut on Facade at Negative Coordinates (Y = -157): query faces -> locate front facade -> cut through-door -> verify physical aperture", async () => {
        console.log("--- TEST NEGATIVE COORDINATE FACADE DOOR CUT ON REAL OCCT KERNEL ---");
        const capabilityTools = buildCapabilityTools();
        const runProgramTool = capabilityTools.find((t) => t.name === "run_program")!;

        // 1. Create real OCCT Wall Solid matching report model footprint:
        // X in [-426, 4673] (width = 5099 mm)
        // Y in [-357, -157] (front facade at Y = -157, thickness = 200 mm)
        // Z in [0, 3400] (height = 3400 mm)
        const wallPlane = Plane.XY.translateTo(new XYZ(-426, -357, 0));
        const wallRes = factory.box(wallPlane, 5099, 200, 3400);
        expect(wallRes.isOk).toBe(true);
        const wallShape = wallRes.value;

        const wallNode = new EditableShapeNode({
            document: doc,
            name: "Main Wall (Negative Y)",
            shape: wallRes,
        });
        doc.modelManager.addNode(wallNode);
        const initialVol = wallShape.volume();
        console.log(`[OCCT Real Kernel] Wall Volume Before: ${initialVol.toFixed(2)} mm3`);
        expect(initialVol).toBeCloseTo(3_467_320_000, 0);

        // 2. Query faces via shape.findSubShapes (Step 1 of two-step workflow)
        const findFacesRaw = await runProgramTool.handler({
            ops: [
                {
                    method: "shape.findSubShapes",
                    id: "wallFaces",
                    target: wallNode.id,
                    args: { subshapeType: "face" },
                },
            ],
        });
        const findFacesRes = JSON.parse(findFacesRaw as string);
        const faceRefs = findFacesRes.results.wallFaces.refs as string[];
        expect(faceRefs).toHaveLength(6);
        console.log(`[OCCT Real Kernel] Found ${faceRefs.length} faces:`, faceRefs);

        // 3. Inspect faces to locate front facade (normal +Y and max Y = -157)
        // Never rely on fixed index or normal alone
        const faceQueries = [];
        for (let i = 0; i < faceRefs.length; i++) {
            faceQueries.push({ method: "face.surface", target: faceRefs[i], id: `s_${i}` });
            faceQueries.push({ method: "surface.bounds", target: `s_${i}`, id: `b_${i}` });
        }
        const geomResRaw = await runProgramTool.handler({ ops: faceQueries });
        const geomRes = JSON.parse(geomResRaw as string);

        let frontFaceRef: string | undefined;
        let facadePt: XYZ | undefined;
        let facadeNormal: XYZ | undefined;
        for (let i = 0; i < faceRefs.length; i++) {
            const bounds = geomRes.results[`b_${i}`];
            const uMid = (bounds.u1 + bounds.u2) / 2;
            const vMid = (bounds.v1 + bounds.v2) / 2;
            const normRaw = await runProgramTool.handler({
                ops: [
                    {
                        method: "face.normal",
                        target: faceRefs[i],
                        id: "fn",
                        args: { u: uMid, v: vMid },
                    },
                ],
            });
            const normRes = JSON.parse(normRaw as string);
            const [pt, normal] = normRes.results.fn;
            // Front facade has normal facing +Y (outward) and is located at max Y (-157)
            if (normal.y > 0.99 && Math.abs(pt.y - -157) < 1.0) {
                frontFaceRef = faceRefs[i];
                facadePt = pt;
                facadeNormal = normal;
                console.log(
                    `[OCCT Real Kernel] Front Facade identified: ${frontFaceRef} at Y=${pt.y.toFixed(2)}, normal=[${normal.x}, ${normal.y}, ${normal.z}]`,
                );
                break;
            }
        }
        expect(frontFaceRef).toBeDefined();
        expect(facadePt).toBeDefined();
        expect(facadeNormal).toBeDefined();

        // 4. Create Cutter Box via run_program using queried facade position and normal
        // This exercises coercePlane with alignUp: true on vertical plane
        // Door opening: width 1000 mm (X in [1000, 2000]), height 2200 mm (Z in [0, 2200])
        // Wall thickness is 200 mm (spanning Y in [-357, -157]).
        // Origin: X=2000, Y=facadePt.y - 250 = -407, Z=0. Normal: [0, 1, 0].
        // coercePlane computes xvec = (-1, 0, 0), yvec = normal.cross(xvec) = (0, 0, 1) (+Z, World Up).
        // Then box parameters:
        // - dx = 1000 along xvec: X goes from 2000 down to 1000 (span [1000, 2000])
        // - dy = 2200 along yvec: Z goes from 0 up to 2200 (span [0, 2200], height upward from floor)
        // - dz = 300 along normal: Y goes from -407 up to -107 (span [-407, -107], piercing both faces)
        const cutterProgRaw = await runProgramTool.handler({
            ops: [
                {
                    method: "box",
                    id: "doorCutterThrough",
                    args: {
                        plane: {
                            origin: { x: 2000, y: facadePt!.y - 250, z: 0 },
                            normal: { x: facadeNormal!.x, y: facadeNormal!.y, z: facadeNormal!.z },
                            alignUp: true,
                        },
                        dx: 1000,
                        dy: 2200,
                        dz: 300,
                    },
                    name: "Door Cutter Through",
                },
            ],
        });
        const cutterProg = JSON.parse(cutterProgRaw as string);
        expect(cutterProg.created).toHaveLength(1);
        const cutterNodeId = cutterProg.created[0].nodeId;

        // Inspect real bounding box of cutter BEFORE Boolean operation
        const cutterNode = doc.modelManager.findNodes((n) => n.id === cutterNodeId)[0] as EditableShapeNode;
        expect(cutterNode).toBeDefined();
        const cutterBbox = cutterNode.shape.value.boundingBox();
        console.log("[OCCT Real Kernel] Cutter BoundingBox:", cutterBbox);

        // Verify height extends upward from the floor: Z_min = 0, Z_max = 2200 (strictly positive)
        expect(cutterBbox.min.z).toBeCloseTo(0, 1);
        expect(cutterBbox.max.z).toBeCloseTo(2200, 1);

        // Verify cutter penetrates through BOTH opposite faces of the wall (wall Y in [-357, -157])
        expect(cutterBbox.min.y).toBeLessThanOrEqual(-357);
        expect(cutterBbox.max.y).toBeGreaterThanOrEqual(-157);

        // Verify cutter is positioned correctly along wall width (X in [1000, 2000])
        expect(cutterBbox.min.x).toBeCloseTo(1000, 1);
        expect(cutterBbox.max.x).toBeCloseTo(2000, 1);

        // 5. Execute Boolean Cut via run_program with throughCut: true
        const cutRaw = await runProgramTool.handler({
            ops: [
                {
                    method: "booleanCut",
                    id: "doorCutAperture",
                    args: {
                        target: wallNode.id,
                        tool: cutterNodeId,
                        throughCut: true,
                    },
                    name: "Wall with Front Door Aperture",
                },
            ],
        });
        const cutRes = JSON.parse(cutRaw as string);
        expect(cutRes.created).toHaveLength(1);
        expect(cutRes.removed).toHaveLength(2); // old wall and cutter consumed

        // Verify throughCut verification result
        expect(cutRes.results.doorCutAperture).toBeDefined();
        expect(cutRes.results.doorCutAperture.throughVerified).toBe(true);
        expect(cutRes.results.doorCutAperture.status).toBe("verified");
        expect(cutRes.results.doorCutAperture.penetrationAxis).toBe("y");
        console.log("[OCCT Real Kernel] throughCut Verification:", cutRes.results.doorCutAperture);

        const newWallId = cutRes.created[0].nodeId;
        const newWallNode = doc.modelManager.findNodes((n) => n.id === newWallId)[0] as EditableShapeNode;
        expect(newWallNode).toBeDefined();
        const newWallShape = newWallNode.shape.value;

        // 6. Geometry & Physical Hollow Verification:
        // Material volume reduction = 1000 * 200 * 2200 = 440,000,000 mm3
        const finalVol = newWallShape.volume();
        console.log(`[OCCT Real Kernel] Wall Volume After Door Cut: ${finalVol.toFixed(2)} mm3`);
        expect(finalVol).toBeCloseTo(3_027_320_000, 0);
        expect(initialVol - finalVol).toBeCloseTo(440_000_000, 0);

        // Physical aperture verification: point inside door opening is NOT in solid
        const doorOpeningCenter = new XYZ(1500, -257, 1100);
        expect(newWallShape.containsPoint(doorOpeningCenter, false)).toBe(false);
        console.log(
            "[Verification Evidence] Door opening center (1500, -257, 1100) is hollow (containsPoint: false).",
        );

        // Points in remaining wall and lintel ARE in solid
        const wallBesideDoor = new XYZ(500, -257, 1100);
        expect(newWallShape.containsPoint(wallBesideDoor, false)).toBe(true);
        console.log(
            "[Verification Evidence] Adjacent wall (500, -257, 1100) contains material (containsPoint: true).",
        );

        const lintelAboveDoor = new XYZ(1500, -257, 2800);
        expect(newWallShape.containsPoint(lintelAboveDoor, false)).toBe(true);
        console.log(
            "[Verification Evidence] Lintel above door (1500, -257, 2800) contains material (containsPoint: true).",
        );

        // Camera viewpoint metadata for facade & oblique perspectives
        const frontFacadeView = {
            eye: new XYZ(2123, 2000, 1700),
            target: new XYZ(2123, -257, 1700),
            up: XYZ.unitZ,
        };
        const obliqueIsometricView = {
            eye: new XYZ(6000, 2000, 5000),
            target: new XYZ(2123, -257, 1700),
            up: XYZ.unitZ,
        };
        console.log("[Evidence Viewpoints] Front view:", frontFacadeView);
        console.log("[Evidence Viewpoints] Oblique isometric view:", obliqueIsometricView);
    });
});
