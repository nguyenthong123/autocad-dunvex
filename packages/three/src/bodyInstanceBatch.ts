// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Group, InstancedMesh, type Material } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { Constants } from "./constants";
import { ThreeGeometry } from "./threeGeometry";
import { ThreeGeometryFactory } from "./threeGeometryFactory";
import type { ThreeVisualContext } from "./threeVisualContext";

interface BatchEntry {
    facesMesh?: InstancedMesh;
    edgesLine?: LineSegments2;
    edgesGeometry?: LineSegmentsGeometry;
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
    private _dirty = true;
    private _lastSignature = 0;
    private _lastIsolated = false;

    constructor(private readonly context: ThreeVisualContext) {
        this.group.name = "BodyInstanceBatches";
        this.group.matrixAutoUpdate = false;
    }

    markDirty(): void {
        this._dirty = true;
    }

    sync(isolated: boolean): void {
        const signature = this.computeSignature(isolated);
        if (!this._dirty && isolated === this._lastIsolated && signature === this._lastSignature) {
            return;
        }
        this._dirty = false;
        this._lastIsolated = isolated;
        this._lastSignature = signature;

        this.clearBatches();

        if (isolated) {
            return;
        }

        const groups = new Map<string, ThreeGeometry[]>();
        for (const visual of this.context.visuals()) {
            if (!(visual instanceof ThreeGeometry)) continue;
            if (!visual.isBatchEligible()) continue;
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

    private computeSignature(isolated: boolean): number {
        let hash = isolated ? 17 : 31;
        for (const visual of this.context.visuals()) {
            if (!(visual instanceof ThreeGeometry)) continue;
            if (!visual.isBatchCandidateNode()) continue;
            const eligible = visual.isBatchEligible() ? 1 : 0;
            hash = (hash * 31 + visual.id) | 0;
            hash = (hash * 31 + eligible) | 0;
            if (eligible) {
                const e = visual.matrixWorld.elements;
                hash = (hash * 31 + ((e[12] * 10) | 0)) | 0;
                hash = (hash * 31 + ((e[13] * 10) | 0)) | 0;
                hash = (hash * 31 + ((e[14] * 10) | 0)) | 0;
                hash = (hash * 31 + ((e[0] * 1000) | 0)) | 0;
                hash = (hash * 31 + ((e[5] * 1000) | 0)) | 0;
            }
        }
        return hash;
    }

    private buildBatch(members: ThreeGeometry[]): BatchEntry | undefined {
        const first = members[0];
        const firstFaces = first.faces();
        const firstEdges = first.edges();
        const entry: BatchEntry = {};

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
                for (let j = 0; j < stride; j += 3) {
                    const x = rawEdgePos[j];
                    const y = rawEdgePos[j + 1];
                    const z = rawEdgePos[j + 2];
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
        this.group.parent?.remove(this.group);
    }
}
