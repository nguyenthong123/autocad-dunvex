// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type BufferGeometry, Group, InstancedMesh, type Material } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { Constants } from "./constants";
import { ThreeGeometry } from "./threeGeometry";
import { ThreeGeometryFactory } from "./threeGeometryFactory";
import type { ThreeVisualContext } from "./threeVisualContext";

export interface BatchEntry {
    facesMesh?: InstancedMesh;
    edgesLine?: LineSegments2;
    edgesGeometry?: LineSegmentsGeometry;
    members: ThreeGeometry[];
}

interface MemberSnapshot {
    visual: ThreeGeometry;
    key: string;
    matrixElements: Float64Array;
    facesGeometry?: BufferGeometry;
    facesPosAttr?: unknown;
    facesMaterial?: Material;
    facesColorHex?: number;
    facesOpacity?: number;
    facesMaterialVersion?: number;
    edgesPosArray?: Float32Array | number[];
    edgesGeometry?: LineSegmentsGeometry;
    edgesMaterial?: Material;
    edgesColorHex?: number;
    edgesMaterialVersion?: number;
}

/**
 * Batches rendering of `BodyInstanceNode` visuals that share the same source shape and material
 * into one `InstancedMesh` (for solid faces) and one merged `LineSegments2` (for wireframe edges)
 * per `(sourceId, materialId)` group. Individual `ThreeGeometry` visuals stay intact on the
 * `BatchedSolid` / `BatchedWireframe` layers so picking, highlighting, selection, and OSNAP
 * resolve against each individual instance without extra draw calls.
 */
export class BodyInstanceBatchManager {
    readonly group = new Group();
    private readonly _batches = new Map<string, BatchEntry>();
    private readonly _batchedGeometries = new Set<ThreeGeometry>();
    private _lastSnapshots: MemberSnapshot[] = [];
    private _dirty = true;
    private _lastIsolated = false;

    constructor(private readonly context: ThreeVisualContext) {
        this.group.name = "BodyInstanceBatches";
        this.group.matrixAutoUpdate = false;
    }

    get batches(): ReadonlyMap<string, BatchEntry> {
        return this._batches;
    }

    markDirty(): void {
        this._dirty = true;
    }

    sync(isolated: boolean): void {
        const eligibleVisuals: ThreeGeometry[] = [];
        if (!isolated) {
            for (const visual of this.context.visuals()) {
                if (visual instanceof ThreeGeometry && visual.isBatchEligible()) {
                    eligibleVisuals.push(visual);
                }
            }
        }

        if (
            !this._dirty &&
            isolated === this._lastIsolated &&
            this.snapshotsMatch(eligibleVisuals, this._lastSnapshots)
        ) {
            return;
        }

        this._dirty = false;
        this._lastIsolated = isolated;
        this._lastSnapshots = eligibleVisuals.map((v) => this.captureSnapshot(v));

        this.clearBatches();

        if (isolated || eligibleVisuals.length === 0) {
            return;
        }

        const groups = new Map<string, ThreeGeometry[]>();
        for (const visual of eligibleVisuals) {
            const key = visual.batchGroupKey();
            if (!key) continue;
            let list = groups.get(key);
            if (!list) {
                list = [];
                groups.set(key, list);
            }
            list.push(visual);
        }

        for (const [key, members] of groups) {
            if (members.length < 2) continue;
            const entry = this.buildBatch(members);
            if (entry) {
                this._batches.set(key, entry);
                for (const geo of members) {
                    geo.setBatchedState(true);
                    this._batchedGeometries.add(geo);
                }
            }
        }
    }

    private captureSnapshot(visual: ThreeGeometry): MemberSnapshot {
        const faces = visual.faces();
        const edges = visual.edges();
        const faceMat = (faces && !Array.isArray(faces.material) ? faces.material : undefined) as any;
        const edgeMat = edges?.material as any;
        return {
            visual,
            key: visual.batchGroupKey() ?? "",
            matrixElements: new Float64Array(visual.matrixWorld.elements),
            facesGeometry: faces?.geometry,
            facesPosAttr: faces?.geometry.getAttribute("position"),
            facesMaterial: faceMat,
            facesColorHex: faceMat?.color?.isColor ? faceMat.color.getHex() : undefined,
            facesOpacity: faceMat?.opacity,
            facesMaterialVersion: faceMat?.version,
            edgesPosArray: visual.geometryNode.mesh?.edges?.position,
            edgesGeometry: edges?.geometry,
            edgesMaterial: edgeMat,
            edgesColorHex: edgeMat?.color?.isColor ? edgeMat.color.getHex() : undefined,
            edgesMaterialVersion: edgeMat?.version,
        };
    }

    private snapshotsMatch(current: ThreeGeometry[], previous: MemberSnapshot[]): boolean {
        if (current.length !== previous.length) return false;
        for (let i = 0; i < current.length; i++) {
            const vis = current[i];
            const snap = previous[i];
            if (vis !== snap.visual) return false;
            if ((vis.batchGroupKey() ?? "") !== snap.key) return false;

            const e = vis.matrixWorld.elements;
            const se = snap.matrixElements;
            for (let m = 0; m < 16; m++) {
                if (e[m] !== se[m]) return false;
            }

            const faces = vis.faces();
            const faceMat = (faces && !Array.isArray(faces.material) ? faces.material : undefined) as any;
            if (faces?.geometry !== snap.facesGeometry) return false;
            if (faces?.geometry.getAttribute("position") !== snap.facesPosAttr) return false;
            if (faceMat !== snap.facesMaterial) return false;
            if ((faceMat?.color?.isColor ? faceMat.color.getHex() : undefined) !== snap.facesColorHex) {
                return false;
            }
            if (faceMat?.opacity !== snap.facesOpacity) return false;
            if (faceMat?.version !== snap.facesMaterialVersion) return false;

            const edges = vis.edges();
            const edgeMat = edges?.material as any;
            if (vis.geometryNode.mesh?.edges?.position !== snap.edgesPosArray) return false;
            if (edges?.geometry !== snap.edgesGeometry) return false;
            if (edgeMat !== snap.edgesMaterial) return false;
            if ((edgeMat?.color?.isColor ? edgeMat.color.getHex() : undefined) !== snap.edgesColorHex) {
                return false;
            }
            if (edgeMat?.version !== snap.edgesMaterialVersion) return false;
        }
        return true;
    }

    private buildBatch(members: ThreeGeometry[]): BatchEntry | undefined {
        const first = members[0];
        const firstFaces = first.faces();
        const firstEdges = first.edges();
        const entry: BatchEntry = { members: [...members] };

        if (firstFaces && !Array.isArray(firstFaces.material)) {
            const instanced = new InstancedMesh(
                firstFaces.geometry,
                firstFaces.material as Material,
                members.length,
            );
            instanced.layers.set(Constants.Layers.Solid);
            instanced.frustumCulled = false;
            for (let i = 0; i < members.length; i++) {
                instanced.setMatrixAt(i, members[i].matrixWorld);
            }
            instanced.instanceMatrix.needsUpdate = true;
            this.group.add(instanced);
            entry.facesMesh = instanced;
        }

        const rawEdgePos = first.geometryNode.mesh?.edges?.position;
        if (firstEdges && rawEdgePos && rawEdgePos.length >= 6) {
            const stride = rawEdgePos.length;
            const merged = new Float32Array(members.length * stride);
            let out = 0;
            for (let i = 0; i < members.length; i++) {
                const memberPos = members[i].geometryNode.mesh?.edges?.position ?? rawEdgePos;
                const e = members[i].matrixWorld.elements;
                const e0 = e[0];
                const e1 = e[1];
                const e2 = e[2];
                const e4 = e[4];
                const e5 = e[5];
                const e6 = e[6];
                const e8 = e[8];
                const e9 = e[9];
                const e10 = e[10];
                const e12 = e[12];
                const e13 = e[13];
                const e14 = e[14];
                const len = Math.min(stride, memberPos.length);
                for (let j = 0; j < len; j += 3) {
                    const x = memberPos[j];
                    const y = memberPos[j + 1];
                    const z = memberPos[j + 2];
                    merged[out++] = e0 * x + e4 * y + e8 * z + e12;
                    merged[out++] = e1 * x + e5 * y + e9 * z + e13;
                    merged[out++] = e2 * x + e6 * y + e10 * z + e14;
                }
            }
            const edgeGeom = new LineSegmentsGeometry();
            ThreeGeometryFactory.setLineSegmentsPositions(edgeGeom, merged);
            const batchedLine = new LineSegments2(edgeGeom, firstEdges.material);
            batchedLine.layers.set(Constants.Layers.Wireframe);
            batchedLine.frustumCulled = false;
            this.group.add(batchedLine);
            entry.edgesLine = batchedLine;
            entry.edgesGeometry = edgeGeom;
        }

        if (!entry.facesMesh && !entry.edgesLine) {
            return undefined;
        }
        return entry;
    }

    private clearBatches(): void {
        for (const geo of this._batchedGeometries) {
            geo.setBatchedState(false);
        }
        this._batchedGeometries.clear();

        for (const entry of this._batches.values()) {
            if (entry.facesMesh) {
                this.group.remove(entry.facesMesh);
                entry.facesMesh.dispose();
            }
            if (entry.edgesLine) {
                this.group.remove(entry.edgesLine);
                entry.edgesGeometry?.dispose();
            }
        }
        this._batches.clear();
    }

    dispose(): void {
        this.clearBatches();
        this._lastSnapshots = [];
        this.group.parent?.remove(this.group);
    }
}
