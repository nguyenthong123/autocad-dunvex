// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type BoundingBox,
    type EdgeMeshData,
    type FaceMeshData,
    type GeometryNode,
    type IShape,
    type ISubShape,
    type IVisualGeometry,
    type Matrix4,
    MeshDataUtils,
    MeshUtils,
    ShapeNode,
    type ShapeType,
    ShapeTypes,
    ShapeTypeUtils,
    type VertexMeshData,
    VisualConfig,
} from "@chili3d/core";
import {
    type Box3,
    type Color,
    type Material,
    Mesh,
    type MeshLambertMaterial,
    type Object3D,
    Points,
    type PointsMaterial,
} from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { Constants, EdgeVertexOffsetKey } from "./constants";
import {
    defaultEdgeMaterial,
    defaultVertexMaterial,
    edgeMaterialOfWidth,
    lockFaceMaterial,
    lockLineMaterial,
} from "./materials";
import { ThreeGeometryFactory, TopRenderOrder } from "./threeGeometryFactory";
import { ThreeHelper } from "./threeHelper";
import type { ThreeVisualContext } from "./threeVisualContext";
import { ThreeVisualObject } from "./threeVisualObject";

const OnTopMaterialKey = "onTopMaterial";

export class ThreeGeometry extends ThreeVisualObject implements IVisualGeometry {
    private _faceMaterial: Material | Material[];
    private _effectiveFaceMaterial?: Material | Material[];
    /**
     * The edge lines of the node: one `LineSegments2` per maximal run of one line type —
     * a mesh whose ranges carry a `lineType` (appended display-only edges, e.g. auxiliary
     * lines) splits here, because dashing is a per-material feature and cannot mix within
     * one object. Each part remembers the material to restore after a temporary swap, and
     * whether that material is its own copy to dispose with us (per-segment colours or
     * dashing rule the shared per-width materials out — see `edgeMaterialFor`).
     */
    private _edgeParts: {
        line: LineSegments2;
        material: LineMaterial;
        ownsMaterial: boolean;
        lineType?: string;
    }[] = [];
    private _faces?: Mesh;
    private _ownsFaceMaterial = false;
    private _vertexs?: Points;
    private _renderOnTop = false;
    private _generated = false;
    private _disposed = false;
    private _worldBox?: Box3;
    private _batched = false;
    private _hasTempFaceMaterial = false;
    private _hasTempEdgeMaterial = false;

    get ownsFaceMaterial(): boolean {
        return this._ownsFaceMaterial;
    }

    constructor(
        readonly geometryNode: GeometryNode,
        readonly context: ThreeVisualContext,
    ) {
        super(geometryNode);
        this._faceMaterial = context.getMaterial(geometryNode.materialId);
        if (geometryNode.visible !== false && geometryNode.parentVisible !== false) {
            this.generateShape();
        }
        geometryNode.onPropertyChanged(this.handleGeometryPropertyChanged);
    }

    private ensureGenerated(): void {
        if (!this._generated && !this._disposed) {
            this.generateShape();
        }
    }

    override updateWorldMatrix(updateParents?: boolean, updateChildren?: boolean): void {
        super.updateWorldMatrix(updateParents, updateChildren);
        this._worldBox = undefined;
    }

    worldBox(): Box3 | undefined {
        if (this._worldBox !== undefined) return this._worldBox;
        const localBox = this.box();
        if (!localBox || localBox.isEmpty()) return undefined;
        this._worldBox = localBox.clone().applyMatrix4(this.matrixWorld);
        return this._worldBox;
    }

    isBatchCandidateNode(): boolean {
        const node = this.geometryNode as any;
        return Boolean(
            (node.isInstance === true || node.constructor?.name === "BodyInstanceNode") &&
                typeof node.sourceId === "string" &&
                node.sourceId.length > 0,
        );
    }

    isBatchEligible(): boolean {
        if (!this.isBatchCandidateNode()) return false;
        if (
            !this.visible ||
            this.geometryNode.visible === false ||
            this.geometryNode.parentVisible === false
        ) {
            return false;
        }
        if (this.locked || this._renderOnTop || this._hasTempFaceMaterial) {
            return false;
        }
        const node = this.geometryNode as any;
        if (Array.isArray(node.materialId) || (node.faceMaterialPair && node.faceMaterialPair.length > 0)) {
            return false;
        }
        this.ensureGenerated();
        if (!this._faces || Array.isArray(this._faces.material) || this._faces.geometry.groups.length > 1) {
            return false;
        }
        if (this._edgeParts.length > 1) {
            return false;
        }
        if (this._edgeParts.length === 1 && this._edgeParts[0].lineType === "dash") {
            return false;
        }
        if (this.matrixWorld.determinant() <= 0) {
            return false;
        }
        return true;
    }

    batchGroupKey(): string | undefined {
        if (!this.isBatchCandidateNode()) return undefined;
        const node = this.geometryNode as any;
        const matId = typeof node.materialId === "string" ? node.materialId : "";
        const edgeMatId = this._edgeParts[0]?.material.uuid ?? "";
        return `${node.sourceId}::${matId}::${edgeMatId}`;
    }

    get isBatched(): boolean {
        return this._batched;
    }

    setBatchedState(batched: boolean): void {
        this._batched = batched;
        if (this._faces) {
            this._faces.layers.set(batched ? Constants.Layers.BatchedSolid : Constants.Layers.Solid);
        }
        for (const part of this._edgeParts) {
            const useWireframe = !batched || this._hasTempEdgeMaterial;
            part.line.layers.set(
                useWireframe ? Constants.Layers.Wireframe : Constants.Layers.BatchedWireframe,
            );
        }
    }

    private hasCustomFaceMaterial(): boolean {
        const doc = this.geometryNode.document;
        const materials = doc?.modelManager?.materials;
        if (!materials || materials.length <= 1) return false;
        const matId = Array.isArray(this.geometryNode.materialId)
            ? this.geometryNode.materialId[0]
            : this.geometryNode.materialId;
        const firstMaterial = materials.at(0);
        return Boolean(firstMaterial && matId && matId !== firstMaterial.id);
    }

    private isThinOverlaySolid(): boolean {
        if (!(this.geometryNode instanceof ShapeNode) || !this.geometryNode.shape.isOk) {
            return false;
        }
        if (this.geometryNode.shape.value.shapeType !== ShapeTypes.solid) {
            return false;
        }
        const box = this.box();
        if (!box) return false;
        const dims = [
            Math.abs(box.max.x - box.min.x),
            Math.abs(box.max.y - box.min.y),
            Math.abs(box.max.z - box.min.z),
        ].sort((a, b) => a - b);
        const [minDim, midDim, maxDim] = dims;

        // Bức tường hoặc sàn lớn: có 2 chiều lớn >= 200mm và độ dày minDim > 8mm -> KHÔNG PHẢI tấm mỏng ốp
        const isBroadWallOrFloor = minDim > 8.0 && midDim >= 200.0 && maxDim >= 200.0;
        if (isBroadWallOrFloor) {
            return false;
        }

        // Tấm ốp siêu mỏng (<= 8mm, ví dụ tấm nano 5-8mm, alu 3-4mm, lam composite 5mm):
        if (minDim <= 8.0 && maxDim >= 50.0) {
            return true;
        }

        // Thanh lam / nẹp chỉ / phào (dạng thanh hẹp: chiều dày <= 50mm, bề rộng thanh <= 100mm, và chiều dài >= 100mm):
        if (minDim <= 50.0 && midDim <= 100.0 && maxDim >= 100.0) {
            return true;
        }

        return false;
    }

    private getPolygonOffsetTier(): number {
        if (!(this.geometryNode instanceof ShapeNode) || !this.geometryNode.shape.isOk) {
            return 0;
        }

        // Tier 2: 2D shapes (Face, Wire, Edge, Compound)
        if (this.isPlanarOrSurfaceOverlay()) {
            return 2;
        }

        // Tier 1: Khối 3D solid dạng tấm mỏng / thanh lam ốp tường
        // Khối solid phải có vật liệu riêng biệt (khác vật liệu mặc định LightGray) VÀ là tấm mỏng/thanh lam
        if (this.geometryNode.shape.value.shapeType === ShapeTypes.solid) {
            if (this.hasCustomFaceMaterial() && this.isThinOverlaySolid()) {
                return 1;
            }
        }

        return 0;
    }

    private updateEffectiveFaceMaterial() {
        if (
            this._ownsFaceMaterial &&
            this._effectiveFaceMaterial &&
            this._effectiveFaceMaterial !== this._faceMaterial
        ) {
            if (Array.isArray(this._effectiveFaceMaterial)) {
                this._effectiveFaceMaterial.forEach((m) => m.dispose());
            } else {
                this._effectiveFaceMaterial.dispose();
            }
        }
        const tier = this.getPolygonOffsetTier();
        if (tier > 0) {
            this._effectiveFaceMaterial = this.applyPolygonOffset(this._faceMaterial, tier);
            this._ownsFaceMaterial = true;
        } else {
            this._effectiveFaceMaterial = this._faceMaterial;
            this._ownsFaceMaterial = false;
        }
        if (this._faces && !this.locked) {
            this._faces.material = this._effectiveFaceMaterial!;
        }
    }

    changeFaceMaterial(material: Material | Material[]) {
        this._faceMaterial = material;
        this.updateEffectiveFaceMaterial();
        if (!this._faces) {
            this.updateEdgeMaterials();
            return;
        }

        if (this.locked) {
            this._faces.userData["oldMaterial"] = this._effectiveFaceMaterial;
        } else {
            this._faces.material = this._effectiveFaceMaterial!;
        }
    }

    get renderOnTop(): boolean {
        return this._renderOnTop;
    }

    /**
     * Toggles depth-test-free rendering above the rest of the scene (used while the
     * node is being edited, e.g. a sketch). Re-applied to meshes rebuilt later.
     */
    setRenderOnTop(value: boolean): void {
        if (this._renderOnTop === value) return;
        this._renderOnTop = value;
        if (this._vertexs) this.applyOnTopMaterial(this._vertexs, defaultVertexMaterial);
        for (const part of this._edgeParts) this.applyOnTopMaterial(part.line, part.material);
        if (this._faces)
            this.applyOnTopMaterial(this._faces, this._effectiveFaceMaterial ?? this._faceMaterial);
    }

    private applyOnTopMaterial(object: Mesh | LineSegments2 | Points, normalMaterial: Material | Material[]) {
        this.disposeOnTopMaterial(object);
        if (this._renderOnTop) {
            object.renderOrder = TopRenderOrder;
            const onTopMaterial = Array.isArray(normalMaterial)
                ? normalMaterial.map((x) => ThreeGeometryFactory.createOnTopMaterial(x))
                : ThreeGeometryFactory.createOnTopMaterial(normalMaterial);
            object.material = onTopMaterial as any;
            object.userData[OnTopMaterialKey] = onTopMaterial;
        } else {
            object.renderOrder = 0;
            object.material = normalMaterial as any;
        }
    }

    private disposeOnTopMaterial(object: Object3D): void {
        const material = object.userData[OnTopMaterialKey] as Material | Material[] | undefined;
        if (material === undefined) return;
        delete object.userData[OnTopMaterialKey];
        for (const item of Array.isArray(material) ? material : [material]) {
            item.dispose();
        }
    }

    box() {
        this.ensureGenerated();
        // Fast path: at most one edge run and no points — nothing to union (a body's own
        // edges cannot stick out past its faces), and the geometry's live box can be
        // returned as-is. Rect picks call this once per visual, so skip the copies.
        if (this._edgeParts.length <= 1 && !this._vertexs) {
            return (
                this._faces?.geometry.boundingBox ??
                this._edgeParts[0]?.line.geometry.boundingBox ??
                undefined
            );
        }
        // A lone-vertex shape (a point node) has no faces or edges; its points are the
        // geometry, and a rect pick needs a box to admit it as a candidate at all.
        // Every edge part counts, not just the first — a dashed auxiliary run can stick
        // out past the solid's own edges.
        let box = this._faces?.geometry.boundingBox?.clone();
        for (const part of this._edgeParts) {
            const partBox = part.line.geometry.boundingBox;
            if (!partBox) continue;
            box = box ? box.union(partBox) : partBox.clone();
        }
        const vertexBox = this._vertexs?.geometry.boundingBox;
        if (vertexBox) box = box ? box.union(vertexBox) : vertexBox.clone();
        return box;
    }

    override boundingBox(): BoundingBox | undefined {
        const box = this.box();
        if (!box) return undefined;

        return {
            min: ThreeHelper.toXYZ(box.min),
            max: ThreeHelper.toXYZ(box.max),
        };
    }

    private readonly handleGeometryPropertyChanged = (property: keyof GeometryNode) => {
        if (property === "materialId") {
            this.changeFaceMaterial(this.context.getMaterial(this.geometryNode.materialId));
            this.context.markInstanceBatchesDirty?.();
        } else if ((property as keyof ShapeNode) === "shape") {
            this.removeMeshes();
            if (this.geometryNode.visible !== false && this.geometryNode.parentVisible !== false) {
                this.generateShape();
            }
            this.context.markInstanceBatchesDirty?.();
        }
    };

    private generateShape() {
        this._generated = true;
        const mesh = this.geometryNode.mesh;
        const faces = mesh?.faces;
        const edges = mesh?.edges;
        const hasFaces = (faces?.position.length ?? 0) > 0;
        const hasEdges = (edges?.position.length ?? 0) > 0;
        // A shape that also draws faces or edges gets its points on demand
        // (`ensureVertexs`): building them here would allocate a wrapper and a kernel
        // handle per topological vertex for every body, and put every point of every body
        // into every hover raycast. A lone-vertex shape has nothing else to draw, so its
        // points are built here and stay visible.
        const vertexs = !hasFaces && !hasEdges ? mesh?.vertexs : undefined;
        if (vertexs !== undefined && vertexs.position.length > 0) this.initVertexs(vertexs);
        if (hasFaces && faces) this.initFaces(faces);
        if (hasEdges && edges) this.initEdges(edges);
        this.updateWorldMatrix(true, true);
    }

    rebuildMesh(): void {
        (this.geometryNode as any).invalidateMesh?.();
        this.removeMeshes();
        this.generateShape();
        this.updateWorldMatrix(true, true);
        this.context.markInstanceBatchesDirty?.();
    }

    /**
     * The pickable points, built on first use for a shape that also draws faces/edges.
     * They stay invisible — raycasting ignores `visible` — so they never litter every
     * body with dots. Only a pick that asks for vertices pays for them: a vertex pick,
     * or a snap session whose snap type includes vertex. Face/edge picks and ordinary
     * rendering never build them.
     */
    private ensureVertexs(): Points | undefined {
        if (this._vertexs) return this._vertexs;
        const data = this.geometryNode.mesh.vertexs;
        if (!data || data.position.length === 0) return undefined;
        this.initVertexs(data, true);
        return this._vertexs;
    }

    override dispose() {
        this._disposed = true;
        super.dispose();
        this.geometryNode.removePropertyChanged(this.handleGeometryPropertyChanged);
        this.removeMeshes();
        this.context.markInstanceBatchesDirty?.();
    }

    private removeMeshes() {
        this._generated = false;
        this._worldBox = undefined;
        this._batched = false;
        if (this._vertexs) {
            this.disposeOnTopMaterial(this._vertexs);
            this.remove(this._vertexs);
            this._vertexs.geometry.dispose();
            this._vertexs = null as any;
        }
        for (const part of this._edgeParts) {
            this.disposeOnTopMaterial(part.line);
            this.remove(part.line);
            part.line.geometry.dispose();
            if (part.ownsMaterial) part.material.dispose();
        }
        this._edgeParts = [];
        if (this._faces) {
            this.disposeOnTopMaterial(this._faces);
            this.remove(this._faces);
            this._faces.geometry.dispose();
            if (
                this._ownsFaceMaterial &&
                this._effectiveFaceMaterial &&
                this._effectiveFaceMaterial !== this._faceMaterial
            ) {
                if (Array.isArray(this._effectiveFaceMaterial)) {
                    this._effectiveFaceMaterial.forEach((m) => m.dispose());
                } else {
                    this._effectiveFaceMaterial.dispose();
                }
                this._ownsFaceMaterial = false;
            }
            this._faces = null as any;
        }
    }

    private initVertexs(data: VertexMeshData, pickOnly = false) {
        const buff = ThreeGeometryFactory.createVertexBufferGeometry(data);
        this._vertexs = new Points(buff, defaultVertexMaterial);
        this._vertexs.layers.set(Constants.Layers.Wireframe);
        this._vertexs.visible = !pickOnly;
        if (this._renderOnTop) this.applyOnTopMaterial(this._vertexs, defaultVertexMaterial);
        this.add(this._vertexs);
    }

    private initEdges(data: EdgeMeshData) {
        const runs = MeshDataUtils.splitEdgeRuns(data);
        for (const run of runs) {
            const runData: EdgeMeshData = {
                ...data,
                position: run.position,
                color: run.color,
                lineType: run.lineType,
            };
            const buff = ThreeGeometryFactory.createEdgeBufferGeometry(runData);
            const { material, owned } = this.edgeMaterialFor(runData, buff);
            const line = new LineSegments2(buff, material);
            if (run.lineType === "dash") line.computeLineDistances();
            line.layers.set(Constants.Layers.Wireframe);
            // A split object's raycast index counts from its own buffer — the pick mapping
            // (`threeView.findShapeAndIndex`) shifts it back by this into the mesh's numbering.
            if (runs.length > 1) line.userData[EdgeVertexOffsetKey] = run.startVertex;
            if (this._renderOnTop) this.applyOnTopMaterial(line, material);
            this.add(line);
            this._edgeParts.push({ line, material, ownsMaterial: owned, lineType: run.lineType });
        }
    }

    private getCustomEdgeColor(): Color | undefined {
        if (this._faces !== undefined) return undefined;
        const mat = Array.isArray(this._faceMaterial) ? this._faceMaterial[0] : this._faceMaterial;
        const matColor = (mat as any)?.color;
        if (!matColor?.isColor) return undefined;
        const materials = this.geometryNode.document?.modelManager?.materials;
        const matId = Array.isArray(this.geometryNode.materialId)
            ? this.geometryNode.materialId[0]
            : this.geometryNode.materialId;
        const firstMaterial = materials?.at?.(0);
        const isUntouchedDefault =
            firstMaterial !== undefined &&
            matId === firstMaterial.id &&
            matColor.getHex() === VisualConfig.defaultFaceColor;
        return isUntouchedDefault ? undefined : matColor;
    }

    updateEdgeMaterials() {
        if (this._faces !== undefined || this._edgeParts.length === 0) return;
        const customColor = this.getCustomEdgeColor();
        for (const part of this._edgeParts) {
            if (customColor !== undefined) {
                if (!part.ownsMaterial) {
                    part.material = part.material.clone();
                    part.ownsMaterial = true;
                }
                part.material.color.copy(customColor);
            } else if (part.ownsMaterial && part.lineType !== "dash") {
                part.material.dispose();
                part.material = edgeMaterialOfWidth(part.material.linewidth);
                part.ownsMaterial = false;
            }
            if (this.locked) {
                part.line.userData["oldMaterial"] = part.material;
            } else {
                part.line.material = part.material;
            }
            if (this._renderOnTop) {
                this.applyOnTopMaterial(part.line, part.material);
            }
        }
    }

    /**
     * The edge material of one run: the shared per-width one by default. A dashed run always
     * gets a material of its own — dashing is a material flag — and so does a run carrying
     * per-segment colours, what a sketch being edited hands in for its constraint state,
     * because `vertexColors` is a material flag too and the shared materials are keyed by
     * width alone: setting it there would repaint every other visual of that width. An owned
     * copy is disposed with this object.
     */
    private edgeMaterialFor(data: EdgeMeshData, geometry: LineSegmentsGeometry) {
        if (data.lineType === "dash") {
            const material = ThreeGeometryFactory.createEdgeMaterial(data);
            ThreeGeometryFactory.setColor(geometry, data, material);
            return { material, owned: true };
        }
        if (!Array.isArray(data.color)) {
            const customColor = this.getCustomEdgeColor();
            if (customColor !== undefined) {
                const material = edgeMaterialOfWidth(data.lineWidth).clone();
                material.color.copy(customColor);
                return { material, owned: true };
            }
            return { material: edgeMaterialOfWidth(data.lineWidth), owned: false };
        }
        const material = edgeMaterialOfWidth(data.lineWidth).clone();
        // `setColor` puts the per-segment colours on the geometry and whitens the material —
        // the whitening is what matters here, since the clone inherited the shared material's
        // `defaultEdgeColor` (see its comment)
        ThreeGeometryFactory.setColor(geometry, data, material);
        return { material, owned: true };
    }

    private isPlanarOrSurfaceOverlay(): boolean {
        if (!(this.geometryNode instanceof ShapeNode) || !this.geometryNode.shape.isOk) {
            return false;
        }
        const st = this.geometryNode.shape.value.shapeType;
        return (
            st === ShapeTypes.face ||
            st === ShapeTypes.wire ||
            st === ShapeTypes.edge ||
            st === ShapeTypes.compound
        );
    }

    private applyPolygonOffset(mat: Material | Material[], tier: number): Material | Material[] {
        const factor = tier >= 2 ? -1.0 : -0.5;
        const units = tier >= 2 ? -4.0 : -2.0;
        if (Array.isArray(mat)) {
            return mat.map((m) => {
                const cloned = m.clone();
                cloned.polygonOffset = true;
                cloned.polygonOffsetFactor = factor;
                cloned.polygonOffsetUnits = units;
                return cloned;
            });
        }
        const cloned = mat.clone();
        cloned.polygonOffset = true;
        cloned.polygonOffsetFactor = factor;
        cloned.polygonOffsetUnits = units;
        return cloned;
    }

    private initFaces(data: FaceMeshData) {
        const buff = ThreeGeometryFactory.createFaceBufferGeometry(data);
        if (data.groups.length > 1) buff.groups = data.groups;
        this._faces = new Mesh(buff);
        this.updateEffectiveFaceMaterial();
        this._faces.material = this._effectiveFaceMaterial!;
        this._faces.layers.set(Constants.Layers.Solid);
        if (this._renderOnTop) this.applyOnTopMaterial(this._faces, this._effectiveFaceMaterial!);
        this.add(this._faces);
    }

    setFacesMateiralTemperary(material: MeshLambertMaterial) {
        this.ensureGenerated();
        this._hasTempFaceMaterial = true;
        if (this._faces) {
            this._faces.material = material;
            this._faces.layers.set(Constants.Layers.Solid);
        }
        this.context.markInstanceBatchesDirty?.();
    }

    setEdgesMateiralTemperary(material: LineMaterial) {
        this.ensureGenerated();
        this._hasTempEdgeMaterial = true;
        for (const part of this._edgeParts) {
            part.line.material = material;
            part.line.layers.set(Constants.Layers.Wireframe);
        }
    }

    setVertexsMateiralTemperary(material: PointsMaterial) {
        if (this._vertexs) this._vertexs.material = material;
    }

    removeTemperaryMaterial(): void {
        const hadTempFace = this._hasTempFaceMaterial;
        this._hasTempFaceMaterial = false;
        this._hasTempEdgeMaterial = false;
        if (this._vertexs) this._vertexs.material = defaultVertexMaterial;
        for (const part of this._edgeParts) {
            if (part.line.material !== lockLineMaterial) part.line.material = part.material;
            part.line.layers.set(
                this._batched ? Constants.Layers.BatchedWireframe : Constants.Layers.Wireframe,
            );
        }
        const effective = this._effectiveFaceMaterial ?? this._faceMaterial;
        if (this._faces && this._faces.material !== lockFaceMaterial) {
            this._faces.material = effective;
            this._faces.layers.set(this._batched ? Constants.Layers.BatchedSolid : Constants.Layers.Solid);
        }
        // restore the on-top state the temporary material replaced
        if (this._renderOnTop) {
            if (this._vertexs) this.applyOnTopMaterial(this._vertexs, defaultVertexMaterial);
            for (const part of this._edgeParts) {
                if (part.line.material !== lockLineMaterial)
                    this.applyOnTopMaterial(part.line, part.material);
            }
            if (this._faces && this._faces.material !== lockFaceMaterial)
                this.applyOnTopMaterial(this._faces, effective);
        }
        if (hadTempFace) {
            this.context.markInstanceBatchesDirty?.();
        }
    }

    cloneSubEdge(index: number) {
        this.ensureGenerated();
        const positions = MeshUtils.subEdge(this.geometryNode.mesh.edges!, index);
        if (!positions) return undefined;

        const buff = new LineSegmentsGeometry();
        ThreeGeometryFactory.setLineSegmentsPositions(buff, positions);
        buff.applyMatrix4(this.matrixWorld);

        return new LineSegments2(buff, defaultEdgeMaterial);
    }

    cloneSubFace(index: number) {
        this.ensureGenerated();
        const mesh = MeshUtils.subFace(this.geometryNode.mesh.faces!, index);
        if (!mesh) return undefined;

        const buff = ThreeGeometryFactory.createFaceBufferGeometry(mesh);
        buff.applyMatrix4(this.matrixWorld);

        return new Mesh(buff, this._faceMaterial);
    }

    faces() {
        this.ensureGenerated();
        return this._faces;
    }

    edges() {
        this.ensureGenerated();
        return this._edgeParts[0]?.line;
    }

    /** Every edge line object — several when the mesh mixes line types (`initEdges` splits it). */
    edgeLines(): LineSegments2[] {
        this.ensureGenerated();
        return this._edgeParts.map((x) => x.line);
    }

    vertexs() {
        this.ensureGenerated();
        return this._vertexs;
    }

    override getSubShapeAndIndex(shapeType: "face" | "edge" | "vertex", subVisualIndex: number) {
        const groups =
            shapeType === "vertex"
                ? this.geometryNode.mesh.vertexs?.range
                : shapeType === "edge"
                  ? this.geometryNode.mesh.edges?.range
                  : this.geometryNode.mesh.faces?.range;
        let subShape: ISubShape | undefined;
        let transform: Matrix4 | undefined;
        // A raycast can land on geometry no range covers — e.g. the cross-hair segments a sketch
        // appends for its points — so a miss means "no sub-shape here", not a crash.
        const groupIndex =
            groups === undefined ? undefined : ThreeHelper.findGroupIndex(groups, subVisualIndex);
        let index = -1;
        if (groupIndex !== undefined) {
            index = groupIndex;
            subShape = groups![groupIndex].shape;
            transform = groups![groupIndex].transform;
        }

        let shape: IShape | undefined = subShape;
        if (this.geometryNode instanceof ShapeNode) {
            shape = this.geometryNode.shape.value;
        }
        return { transform, shape, subShape, index, groups: groups ?? [] };
    }

    override subShapeVisual(shapeType: ShapeType): (Mesh | LineSegments2 | Points)[] {
        this.ensureGenerated();
        const shapes: (Mesh | LineSegments2 | Points | undefined)[] = [];

        const isWhole =
            shapeType === ShapeTypes.shape ||
            ShapeTypeUtils.hasCompound(shapeType) ||
            ShapeTypeUtils.hasCompoundSolid(shapeType) ||
            ShapeTypeUtils.hasSolid(shapeType);

        // Points join the raycast set only when the pick asks for a vertex, or when a
        // lone-vertex shape has no other geometry to be picked by. Adding every solid's
        // vertices to every whole pick made each hover raycast walk every point in the
        // scene (three's `Points.raycast` is a per-point loop).
        const picksVertex = ShapeTypeUtils.hasVertex(shapeType);
        // `removeMeshes` empties the part lists rather than deleting them, so test length:
        // a lone-vertex shape swapped in place must still answer a whole pick with points.
        const vertexOnly = isWhole && !this._faces && this._edgeParts.length === 0;
        if (picksVertex || vertexOnly) {
            shapes.push(this.ensureVertexs());
        }

        // `isWhole` is also true for a vertex pick, but a vertex is not answered by the
        // faces or edges its ray happens to graze (they are filtered out later): leave
        // them out of the raycast set so the pick stays a points-only walk.
        const wholeGeometry = isWhole && !picksVertex;
        if (wholeGeometry || ShapeTypeUtils.hasEdge(shapeType) || ShapeTypeUtils.hasWire(shapeType)) {
            shapes.push(...this.edgeLines());
        }

        if (wholeGeometry || ShapeTypeUtils.hasFace(shapeType) || ShapeTypeUtils.hasShell(shapeType)) {
            shapes.push(this.faces());
        }

        // A mesh removed by `removeMeshes` is null rather than undefined — drop both.
        return shapes.filter((x) => x !== undefined && x !== null);
    }

    override wholeVisual(): (Mesh | LineSegments2 | Points)[] {
        this.ensureGenerated();
        return [...this.edgeLines(), this.faces(), this.vertexs()].filter(
            (x) => x !== undefined && x !== null,
        );
    }
}
