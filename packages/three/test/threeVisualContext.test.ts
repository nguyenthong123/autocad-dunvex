// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Mesh as CoreMesh,
    GeometryNode,
    type IDocument,
    type IVisual,
    type IVisualObject,
    Material,
    Matrix4,
    MeshNode,
    ShapeTypes,
    type VisualNode,
    VisualStates,
} from "@chili3d/core";
import { createMockVisual, TestDocument } from "@chili3d/core/test-utils";
import {
    Group,
    MeshBasicMaterial,
    type MeshPhysicalMaterial,
    Object3D,
    Scene,
    Texture,
    Matrix4 as ThreeMatrix4,
} from "three";
import { hilightEdgeMaterial } from "../src/materials";
import { ThreeGeometry } from "../src/threeGeometry";
import { ThreeVisualContext } from "../src/threeVisualContext";
import { createTestGeometryNode } from "./mocks";

/**
 * Wraps core createMockVisual with a document whose modelManager tracks the
 * observers registered by the ThreeVisualContext constructor.
 */
function createVisualWithObserverTracking(): {
    visual: IVisual;
    nodeObservers: Array<(records: unknown[]) => void>;
    materialHandlers: Array<(args: unknown) => void>;
} {
    const nodeObservers: Array<(records: unknown[]) => void> = [];
    const collectionHandlers: Array<(args: unknown) => void> = [];

    const document = {
        modelManager: {
            addNodeObserver: (fn: (records: unknown[]) => void) => {
                nodeObservers.push(fn);
            },
            removeNodeObserver: (fn: (records: unknown[]) => void) => {
                const idx = nodeObservers.indexOf(fn);
                if (idx >= 0) nodeObservers.splice(idx, 1);
            },
            materials: {
                forEach: () => {},
                removeCollectionChanged: () => {},
                onCollectionChanged: (fn: (args: unknown) => void) => {
                    collectionHandlers.push(fn);
                },
            },
        },
    } as unknown as IDocument;

    return { visual: createMockVisual({ document }), nodeObservers, materialHandlers: collectionHandlers };
}

describe("ThreeVisualContext (real instance)", () => {
    let context: ThreeVisualContext;
    let scene: Scene;
    let visual: IVisual;
    let nodeObservers: Array<(records: unknown[]) => void>;
    let materialHandlers: Array<(args: unknown) => void>;

    beforeEach(() => {
        const tracked = createVisualWithObserverTracking();
        visual = tracked.visual;
        nodeObservers = tracked.nodeObservers;
        materialHandlers = tracked.materialHandlers;
        scene = new Scene();
        context = new ThreeVisualContext(visual, scene);
    });

    describe("constructor", () => {
        test("should create visualShapes, tempShapes, cssObjects groups", () => {
            expect(context.visualShapes).toBeInstanceOf(Group);
            expect(context.tempShapes).toBeInstanceOf(Group);
            expect(context.cssObjects).toBeInstanceOf(Group);
            expect(context.materialMap).toBeInstanceOf(Map);
        });

        test("should add groups to scene", () => {
            expect(scene.children).toContain(context.visualShapes);
            expect(scene.children).toContain(context.tempShapes);
            expect(scene.children).toContain(context.cssObjects);
        });

        test("should register node observer on model manager", () => {
            expect(nodeObservers.length).toBeGreaterThan(0);
        });
    });

    describe("material environment", () => {
        /** Announces a material the way the model manager does, and hands back its three material. */
        function addMaterial(material: Material): MeshPhysicalMaterial {
            materialHandlers[0]({ action: "add", items: [material] });
            return context.materialMap.get(material.id) as MeshPhysicalMaterial;
        }

        function documentMaterial() {
            return new Material({ document: new TestDocument(), name: "m", color: 0x112233 });
        }

        test("should leave a material alone until the scene has an environment", () => {
            const material = documentMaterial();
            material.envMapIntensity = 2;

            const threeMaterial = addMaterial(material);

            expect(scene.environment).toBeNull();
            expect(threeMaterial.envMap).toBeNull();
        });

        test("should attach the scene's environment, at the material's own reflection strength", () => {
            const environment = new Texture();
            scene.environment = environment;
            const material = documentMaterial();
            material.envMapIntensity = 2;

            const threeMaterial = addMaterial(material);

            expect(threeMaterial.envMap).toBe(environment);
            expect(threeMaterial.envMapIntensity).toBe(2);
        });

        test("should rebuild the program when a material gets a texture", () => {
            const material = documentMaterial();
            const threeMaterial = addMaterial(material);
            const builtWithout = threeMaterial.version;

            material.map.image = "data:image/png;base64,AAAA";

            // the program was compiled without a map, so it has to be rebuilt for the shader to
            // sample one at all — a refreshed uniform would not be enough
            expect(threeMaterial.map).not.toBeNull();
            expect(threeMaterial.version).toBeGreaterThan(builtWithout);
        });

        test("should take the map away when the image is cleared", () => {
            const material = documentMaterial();
            material.map.image = "data:image/png;base64,AAAA";
            const threeMaterial = addMaterial(material);
            expect(threeMaterial.map).not.toBeNull();

            material.map.image = "";

            expect(threeMaterial.map).toBeNull();
        });

        test("should follow the strength as it changes", () => {
            // the renderer overwrites a material's intensity with the scene's while the environment
            // comes from the scene, which is why the material is given the map itself
            scene.environment = new Texture();
            const material = documentMaterial();

            const threeMaterial = addMaterial(material);
            material.envMapIntensity = 3;

            expect(threeMaterial.envMapIntensity).toBe(3);
        });

        test("should update visuals that own their face material when material changes", () => {
            const material = documentMaterial();
            addMaterial(material);

            const node = createTestGeometryNode({ materialId: material.id });
            const mockVisual = Object.create(ThreeGeometry.prototype);
            mockVisual._ownsFaceMaterial = true;
            Object.defineProperty(mockVisual, "ownsFaceMaterial", { get: () => true });
            mockVisual.geometryNode = node;
            mockVisual.changeFaceMaterial = rs.fn();

            (context as any)._NodeVisualMap.set(node, mockVisual);

            material.roughness = 0.8;

            expect(mockVisual.changeFaceMaterial).toHaveBeenCalled();
        });

        test("should update visuals even when ownsFaceMaterial is false (wire/line nodes)", () => {
            const material = documentMaterial();
            addMaterial(material);

            const node = createTestGeometryNode({ materialId: material.id });
            const mockVisual = Object.create(ThreeGeometry.prototype);
            mockVisual._ownsFaceMaterial = false;
            Object.defineProperty(mockVisual, "ownsFaceMaterial", { get: () => false });
            mockVisual.geometryNode = node;
            mockVisual.changeFaceMaterial = rs.fn();

            (context as any)._NodeVisualMap.set(node, mockVisual);

            material.color = 0xff0000;

            expect(mockVisual.changeFaceMaterial).toHaveBeenCalled();
        });
    });

    describe("addVisualObject / removeVisualObject", () => {
        test("should add Object3D to visualShapes", () => {
            const obj = new Object3D();
            context.addVisualObject(obj as unknown as IVisualObject);
            expect(context.visualShapes.children).toContain(obj);
            expect(context.shapeCount).toBe(1);
        });

        test("should remove Object3D from visualShapes", () => {
            const obj = new Object3D();
            context.addVisualObject(obj as unknown as IVisualObject);
            expect(context.shapeCount).toBe(1);

            context.removeVisualObject(obj as unknown as IVisualObject);
            expect(context.visualShapes.children).not.toContain(obj);
            expect(context.shapeCount).toBe(0);
        });

        test("should ignore non-Object3D in addVisualObject", () => {
            const noop = {} as IVisualObject;
            context.addVisualObject(noop);
            expect(context.shapeCount).toBe(0);
        });

        test("should ignore non-Object3D in removeVisualObject", () => {
            const noop = {} as IVisualObject;
            context.addVisualObject(new Object3D() as unknown as IVisualObject);
            context.removeVisualObject(noop);
            expect(context.shapeCount).toBe(1);
        });
    });

    describe("getNode / getVisual", () => {
        test("getNode should return undefined for unknown visual", () => {
            const obj = {} as IVisualObject;
            expect(context.getNode(obj)).toBeUndefined();
        });

        test("getVisual should return undefined for unknown node", () => {
            const node = {} as VisualNode;
            expect(context.getVisual(node)).toBeUndefined();
        });
    });

    describe("shapeCount", () => {
        test("should start at 0", () => {
            expect(context.shapeCount).toBe(0);
        });

        test("should increase when objects are added to visualShapes", () => {
            context.visualShapes.add(new Object3D());
            expect(context.shapeCount).toBe(1);
        });
    });

    describe("setVisible", () => {
        test("should ignore unknown node", () => {
            context.setVisible({} as VisualNode, false);
            expect(context.shapeCount).toBe(0);
        });
    });

    describe("getMaterial", () => {
        test("should return material from map", () => {
            const mat = new MeshBasicMaterial();
            context.materialMap.set("test-id", mat);
            expect(context.getMaterial("test-id")).toBe(mat);
        });

        test("should return fallback material for unknown material id without throwing", () => {
            const mat = context.getMaterial("nonexistent");
            expect(mat).toBeDefined();
        });

        test("should return fallback material for unknown material in array without throwing", () => {
            const mat = context.getMaterial(["nonexistent1"]);
            expect(mat).toBeDefined();
        });

        test("should return array of materials for array input", () => {
            const mat1 = new MeshBasicMaterial();
            const mat2 = new MeshBasicMaterial();
            context.materialMap.set("id1", mat1);
            context.materialMap.set("id2", mat2);

            const result = context.getMaterial(["id1", "id2"]);
            expect(Array.isArray(result)).toBe(true);
            expect((result as MeshBasicMaterial[]).length).toBe(2);
        });

        test("should return single material when array has one element", () => {
            const mat = new MeshBasicMaterial();
            context.materialMap.set("id1", mat);

            const result = context.getMaterial(["id1"]);
            expect(result).toBe(mat);
        });

        test("should return fallback material for empty string material id", () => {
            const mat = context.getMaterial("");
            expect(mat).toBeDefined();
        });
    });

    describe("setVisible auto-recovery and rebuild", () => {
        test("should recover visual when getVisual is undefined and visible is true", () => {
            const node = createTestGeometryNode();
            Object.setPrototypeOf(node, GeometryNode.prototype);
            expect(context.getVisual(node)).toBeUndefined();

            context.setVisible(node, true);

            const recovered = context.getVisual(node);
            expect(recovered).toBeDefined();
            expect(recovered?.visible).toBe(true);
        });

        test("should call rebuildMesh when visual exists but has 0 children and visible is true", () => {
            const node = createTestGeometryNode();
            Object.setPrototypeOf(node, GeometryNode.prototype);
            context.addNode([node]);
            const visual = context.getVisual(node) as ThreeGeometry;
            expect(visual).toBeDefined();

            const rebuildSpy = rs.fn();
            visual.rebuildMesh = rebuildSpy;
            // Clear children to simulate empty mesh
            visual.clear();
            expect(visual.children.length).toBe(0);

            context.setVisible(node, true);
            expect(rebuildSpy).toHaveBeenCalled();
        });
    });

    describe("dispose", () => {
        test("should clean up groups and clear maps", () => {
            context.materialMap.set("test", new MeshBasicMaterial());
            context.dispose();

            expect(context.materialMap.size).toBe(0);
        });

        test("should remove groups from scene", () => {
            context.dispose();
            expect(scene.children).not.toContain(context.visualShapes);
            expect(scene.children).not.toContain(context.tempShapes);
        });

        test("should unregister the node observer", () => {
            expect(nodeObservers.length).toBeGreaterThan(0);
            context.dispose();
            expect(nodeObservers.length).toBe(0);
        });
    });

    describe("visuals", () => {
        test("should return empty array for empty visualShapes", () => {
            expect(context.visuals()).toEqual([]);
        });
    });

    describe("findShapes", () => {
        test("should return empty array for edge highlight state", () => {
            expect(context.findShapes(VisualStates.edgeHighlight)).toEqual([]);
        });

        test("should return visualShapes children for shape type", () => {
            const shapes = context.findShapes({} as any);
            expect(Array.isArray(shapes)).toBe(true);
        });

        test("edge shapes include every run of a mixed-line-type visual", () => {
            context.materialMap.set("mat-1", new MeshBasicMaterial());
            const node = createTestGeometryNode({
                hasFaces: false,
                hasVertexs: false,
                edges: {
                    position: new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]),
                    color: 0xff0000,
                    lineType: "solid",
                    range: [
                        { start: 0, count: 2, shape: { id: "e1" } as any },
                        { start: 2, count: 2, shape: { id: "aux1" } as any, lineType: "dash" },
                    ],
                },
            });
            const geo = new ThreeGeometry(node, context);
            context.visualShapes.add(geo);

            const shapes = context.findShapes(ShapeTypes.edge);
            expect(shapes).toHaveLength(2);
            expect(shapes).toEqual(geo.edgeLines());
        });
    });

    describe("displayMesh", () => {
        test("should return a group id for face mesh data", () => {
            const data = [
                {
                    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                    uv: new Float32Array([0, 0, 1, 0, 0, 1]),
                    index: new Uint32Array([0, 1, 2]),
                    groups: [],
                    range: [],
                    color: 0xff0000,
                },
            ];
            const id = context.displayMesh(data as any);
            expect(typeof id).toBe("number");
        });

        test("should return a group id for edge mesh data", () => {
            const data = [
                {
                    position: new Float32Array([0, 0, 0, 1, 0, 0]),
                    range: [],
                    color: 0x00ff00,
                    lineType: "solid",
                },
            ];
            const id = context.displayMesh(data as any);
            expect(typeof id).toBe("number");
        });
    });

    describe("temp shape operations with invalid id", () => {
        test("removeMesh ignores unknown id", () => {
            context.removeMesh(99999);
            expect(context.tempShapes.children.length).toBe(0);
        });

        test("setMeshColor ignores unknown id", () => {
            context.setMeshColor(99999, 0xff0000);
            expect(context.tempShapes.children.length).toBe(0);
        });

        test("setPosition ignores unknown id", () => {
            context.setPosition(99999, new Float32Array([]));
            expect(context.tempShapes.children.length).toBe(0);
        });

        test("setInstanceMatrix ignores unknown id", () => {
            context.setInstanceMatrix(99999, []);
            expect(context.tempShapes.children.length).toBe(0);
        });
    });

    describe("moveNode", () => {
        test("should ignore node whose parent did not change", () => {
            const node = { parent: {} } as any;
            context.moveNode(node, node.parent);
            expect(context.getVisual(node)).toBeUndefined();
            expect(context.shapeCount).toBe(0);
        });
    });

    describe("addNode / removeNode with real nodes", () => {
        beforeEach(() => {
            context.materialMap.set("mat-1", new MeshBasicMaterial());
        });

        test("addNode with duck-typed node creates no visual", () => {
            const node = createTestGeometryNode();
            context.addNode([node as any]);
            // Duck-typed nodes fail the instanceof checks in displayNode
            expect(context.getVisual(node as any)).toBeUndefined();
            expect(context.shapeCount).toBe(0);
        });

        test("removeNode with unregistered node keeps the scene unchanged", () => {
            const node = createTestGeometryNode();
            context.removeNode([node as any]);
            expect(context.getVisual(node as any)).toBeUndefined();
            expect(context.shapeCount).toBe(0);
        });

        test("getVisual returns undefined for unregistered node", () => {
            const node = createTestGeometryNode();
            expect(context.getVisual(node as any)).toBeUndefined();
        });

        test("setVisible with unregistered node changes nothing", () => {
            const node = createTestGeometryNode();
            context.setVisible(node as any, false);
            expect(context.getVisual(node as any)).toBeUndefined();
            expect(context.shapeCount).toBe(0);
        });

        test("redrawNode preserves the node's locked state", () => {
            const node = new MeshNode({
                document: visual.document,
                mesh: CoreMesh.createSurface(3, 3),
                name: "mesh",
                materialId: "mat-1",
            });
            context.addNode([node]);
            const original = context.getVisual(node)!;
            original.locked = true;

            context.redrawNode([node]);

            const redrawn = context.getVisual(node)!;
            expect(redrawn).not.toBe(original);
            expect(redrawn.locked).toBe(true);
        });

        test("redrawNode on duck-typed node creates no visual", () => {
            const node = createTestGeometryNode();
            context.redrawNode([node as any]);
            expect(context.getVisual(node as any)).toBeUndefined();
            expect(context.shapeCount).toBe(0);
        });
    });

    describe("displayMesh with real data", () => {
        test("displayMesh with face data returns non-zero id and adds to tempShapes", () => {
            const data = [
                {
                    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                    uv: new Float32Array([0, 0, 1, 0, 0, 1]),
                    index: new Uint32Array([0, 1, 2]),
                    groups: [],
                    range: [],
                    color: 0xff0000,
                },
            ];
            const beforeCount = context.tempShapes.children.length;
            const id = context.displayMesh(data as any);
            expect(id).toBeGreaterThan(0);
            expect(context.tempShapes.children.length).toBeGreaterThan(beforeCount);

            // Clean up
            context.removeMesh(id);
        });

        test("displayInstancedMesh returns non-zero id", () => {
            const meshData = {
                position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                index: new Uint32Array([0, 1, 2]),
                normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                uv: new Float32Array([0, 0, 1, 0, 0, 1]),
            };
            const id = context.displayInstancedMesh(meshData, [] as unknown as Matrix4[]);
            expect(id).toBeGreaterThan(0);

            context.removeMesh(id);
        });

        test("displayLineSegments returns non-zero id", () => {
            const id = context.displayLineSegments({
                lineType: "solid",
                position: new Float32Array([0, 0, 0, 1, 0, 0]),
                range: [],
            } as any);
            expect(id).toBeGreaterThan(0);

            context.removeMesh(id);
        });
    });

    describe("BodyInstanceBatchManager integration", () => {
        function createBatchedPair(ctx: ThreeVisualContext, len = 10) {
            const mat = new MeshBasicMaterial({ color: 0xcc2222 });
            ctx.materialMap.set("mat-inst", mat);

            const makeInstanceVisual = (id: string, xOffset: number) => {
                const node = createTestGeometryNode({
                    materialId: "mat-inst",
                    edges: {
                        position: new Float32Array([0, 0, 0, len, 0, 0]),
                        color: 0x333333,
                        lineType: "solid",
                        range: [{ start: 0, count: 2, shape: { id: `${id}-e1` } as any }],
                    },
                });
                node.mesh.faces = {
                    position: new Float32Array([0, 0, 0, len, 0, 0, 0, len, 0]),
                    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
                    uv: new Float32Array([0, 0, 1, 0, 0, 1]),
                    index: new Uint32Array([0, 1, 2]),
                    groups: [],
                    range: [{ start: 0, count: 3, shape: { id: `${id}-f1` } as any }],
                    color: 0xcccccc,
                } as any;
                node.mesh.vertexs = {
                    position: new Float32Array([0, 0, 0, len, 0, 0]),
                    range: [
                        { start: 0, count: 1, shape: { id: `${id}-v1` } as any },
                        { start: 1, count: 1, shape: { id: `${id}-v2` } as any },
                    ],
                    size: 3,
                    color: 0x0000ff,
                } as any;
                (node as any).isInstance = true;
                (node as any).sourceId = "src-panel-1";
                const geo = new ThreeGeometry(node, ctx);
                geo.transform = Matrix4.fromTranslation(xOffset, 0, 0);
                ctx.visualShapes.add(geo);
                return { node, geo };
            };

            const first = makeInstanceVisual("inst-1", 0);
            const second = makeInstanceVisual("inst-2", 150);
            ctx.syncInstanceBatches(false);
            return { mat, g1: first.geo, g2: second.geo, n1: first.node, n2: second.node };
        }

        test("syncInstanceBatches batches eligible BodyInstanceNode visuals and keeps highlighted edges on Wireframe layer", () => {
            const { g1, g2 } = createBatchedPair(context);

            expect(g1.isBatched).toBe(true);
            expect(g2.isBatched).toBe(true);
            // Individual edges move to BatchedWireframe (3) while unselected
            expect(g1.edgeLines()[0].layers.isEnabled(3)).toBe(true);
            expect(g1.edgeLines()[0].layers.isEnabled(1)).toBe(false);

            // Selecting/highlighting g1 keeps g1 batched for faces, but promotes g1's own 3px edge outline to Wireframe (1)
            g1.setEdgesMateiralTemperary(hilightEdgeMaterial);
            expect(g1.edgeLines()[0].layers.isEnabled(1)).toBe(true);

            // Clearing state returns g1's edge to BatchedWireframe (3)
            g1.removeTemperaryMaterial();
            expect(g1.edgeLines()[0].layers.isEnabled(3)).toBe(true);
            expect(g1.edgeLines()[0].layers.isEnabled(1)).toBe(false);
        });

        test("sub-0.1mm translation (0.05 mm) updates batched faces, batched edges, worldBox selection bounds, and OSNAP sub-shapes", () => {
            const { g1 } = createBatchedPair(context);

            // Translate g1 by 0.05 mm in X (under 0.1 mm threshold of old integer quantization)
            g1.transform = Matrix4.fromTranslation(0.05, 0, 0);
            // Even if _dirty were false, snapshotsMatch must detect the 0.05 mm difference
            (context.instanceBatchManager as any)._dirty = false;
            context.syncInstanceBatches(false);

            const batch = [...context.instanceBatchManager.batches.values()][0];
            expect(batch).toBeDefined();

            // 1. Batched face InstancedMesh matrix updated
            const instMat = new ThreeMatrix4();
            batch.facesMesh!.getMatrixAt(0, instMat);
            expect(instMat.elements[12]).toBeCloseTo(0.05, 5);

            // 2. Batched edge LineSegments2 start/end buffer updated
            const startAttr = batch.edgesGeometry!.getAttribute("instanceStart");
            const endAttr = batch.edgesGeometry!.getAttribute("instanceEnd");
            expect(startAttr.getX(0)).toBeCloseTo(0.05, 5);
            expect(endAttr.getX(0)).toBeCloseTo(10.05, 5);

            // 3. Selection / worldBox updated
            const wbox = g1.worldBox()!;
            expect(wbox.min.x).toBeCloseTo(0.05, 5);
            expect(wbox.max.x).toBeCloseTo(10.05, 5);

            // 4. OSNAP sub-shapes (faces, edges, and on-demand vertices) updated
            expect(g1.faces()!.matrixWorld.elements[12]).toBeCloseTo(0.05, 5);
            expect(g1.edgeLines()[0].matrixWorld.elements[12]).toBeCloseTo(0.05, 5);
            const vertexVisual = g1.subShapeVisual(ShapeTypes.vertex)[0];
            expect(vertexVisual.matrixWorld.elements[12]).toBeCloseTo(0.05, 5);
        });

        test("rotation that preserves e[0], e[5], e[12], e[13], e[14] (+30 deg -> -30 deg around Z) updates batch, worldBox, and OSNAP", () => {
            const { g1 } = createBatchedPair(context);

            const radPos30 = (30 * Math.PI) / 180;
            const radNeg30 = (-30 * Math.PI) / 180;
            g1.transform = Matrix4.fromAxisRad({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, radPos30);
            context.syncInstanceBatches(false);

            const eBefore = [...g1.matrixWorld.elements];

            // Rotate from +30° to -30° around Z: cos(-30°) === cos(+30°), so e[0], e[5], e[12], e[13], e[14] stay identical!
            g1.transform = Matrix4.fromAxisRad({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, radNeg30);
            const eAfter = [...g1.matrixWorld.elements];
            expect(eAfter[0]).toBeCloseTo(eBefore[0], 7);
            expect(eAfter[5]).toBeCloseTo(eBefore[5], 7);
            expect(eAfter[12]).toBe(eBefore[12]);
            expect(eAfter[13]).toBe(eBefore[13]);
            expect(eAfter[14]).toBe(eBefore[14]);
            expect(eAfter[1]).toBeCloseTo(-eBefore[1], 7);

            // Even if _dirty were false, snapshotsMatch must detect the off-diagonal rotation change
            (context.instanceBatchManager as any)._dirty = false;
            context.syncInstanceBatches(false);

            const batch = [...context.instanceBatchManager.batches.values()][0];
            const instMat = new ThreeMatrix4();
            batch.facesMesh!.getMatrixAt(0, instMat);
            expect(instMat.elements[1]).toBeCloseTo(-0.5, 5);
            expect(instMat.elements[4]).toBeCloseTo(0.5, 5);

            // Batched edge endpoint (10, 0, 0) rotated by -30° around Z has Y = -5 instead of +5
            const endAttr = batch.edgesGeometry!.getAttribute("instanceEnd");
            expect(endAttr.getX(0)).toBeCloseTo(10 * Math.cos(radNeg30), 4);
            expect(endAttr.getY(0)).toBeCloseTo(-5, 4);

            // Selection worldBox and OSNAP sub-shapes reflect -30°
            const wbox = g1.worldBox()!;
            expect(wbox.min.y).toBeCloseTo(-5, 4);
            expect(g1.faces()!.matrixWorld.elements[1]).toBeCloseTo(-0.5, 5);
            expect(g1.edgeLines()[0].matrixWorld.elements[1]).toBeCloseTo(-0.5, 5);
            const vertexVisual = g1.subShapeVisual(ShapeTypes.vertex)[0];
            expect(vertexVisual.matrixWorld.elements[1]).toBeCloseTo(-0.5, 5);
        });

        test("changing material color or instance materialId updates batched group", () => {
            const { g1, g2 } = createBatchedPair(context);

            // 1. Change material color in-place via changeFaceMaterial
            const updatedMat = new MeshBasicMaterial({ color: 0x00ff88 });
            context.materialMap.set("mat-inst", updatedMat);
            g1.changeFaceMaterial(updatedMat);
            g2.changeFaceMaterial(updatedMat);
            context.syncInstanceBatches(false);

            const batchAfterColor = [...context.instanceBatchManager.batches.values()][0];
            expect((batchAfterColor.facesMesh!.material as MeshBasicMaterial).color.getHex()).toBe(0x00ff88);

            // 2. Change materialId on g1 alone -> g1 and g2 no longer share a batch group
            const mat2 = new MeshBasicMaterial({ color: 0x1122ff });
            context.materialMap.set("mat-2", mat2);
            (g1.geometryNode as any).materialId = "mat-2";
            g1.changeFaceMaterial(mat2);
            context.syncInstanceBatches(false);

            expect(context.instanceBatchManager.batches.size).toBe(0);
            expect(g1.isBatched).toBe(false);
            expect(g2.isBatched).toBe(false);
        });

        test("modifying source geometry updates batched faces, batched edges, worldBox, and OSNAP", () => {
            const { g1, g2, n1, n2 } = createBatchedPair(context, 10);

            // Simulate source geometry lengthening from 10 to 25
            for (const n of [n1, n2]) {
                n.mesh.faces!.position = new Float32Array([0, 0, 0, 25, 0, 0, 0, 10, 0]);
                n.mesh.edges!.position = new Float32Array([0, 0, 0, 25, 0, 0]);
                n.mesh.vertexs!.position = new Float32Array([0, 0, 0, 25, 0, 0]);
            }
            g1.rebuildMesh();
            g2.rebuildMesh();
            context.syncInstanceBatches(false);

            const batch = [...context.instanceBatchManager.batches.values()][0];
            expect(batch).toBeDefined();

            // Batched face geometry reflects length 25
            const facePos = batch.facesMesh!.geometry.getAttribute("position");
            expect(facePos.getX(1)).toBeCloseTo(25, 5);

            // Batched edge geometry reflects length 25 for g1 (0 -> 25) and g2 (150 -> 175)
            const endAttr = batch.edgesGeometry!.getAttribute("instanceEnd");
            expect(endAttr.getX(0)).toBeCloseTo(25, 5);
            expect(endAttr.getX(1)).toBeCloseTo(175, 5);

            // Selection worldBox and OSNAP sub-shapes reflect length 25
            expect(g1.worldBox()!.max.x).toBeCloseTo(25, 5);
            expect(g2.worldBox()!.max.x).toBeCloseTo(175, 5);
            const vPos = g1.subShapeVisual(ShapeTypes.vertex)[0].geometry.getAttribute("position");
            expect(vPos.getX(1)).toBeCloseTo(25, 5);
        });
    });
});
