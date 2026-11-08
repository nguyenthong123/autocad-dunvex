// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, IShape, Result } from "@chili3d/core";
import { ShapeNode } from "@chili3d/core";
import { findNode } from "../../tools/documentContext";

/** World-space axis-aligned reading of a subject node, mm. BBox-based — see runner notes. */
export interface SubjectWorldBox {
    sizeMm: [number, number, number];
    centerMm: [number, number, number];
}

export interface SubjectReading {
    found: boolean;
    box?: SubjectWorldBox;
    /** Why the subject could not be read (kernel null/error, not a geometry verdict). */
    error?: string;
}

/**
 * Deeper probe for the evidence state marker: the node's CACHED local shape object
 * (identity changes only when the geometry is rebuilt — moving a hole inside an
 * unchanged bounding box rebuilds the shape, so identity catches what bbox cannot)
 * plus the solid volume, which catches rebuilds that keep the same handle.
 */
export interface SubjectShapeProbe {
    found: boolean;
    box?: SubjectWorldBox;
    shapeHandle?: object;
    volumeMm3?: number;
    error?: string;
}

export function readSubjectShapeProbe(doc: IDocument, nodeId: string): SubjectShapeProbe {
    const node = findNode(doc, nodeId);
    if (!node) {
        return { found: false, error: `không tìm thấy đối tượng "${nodeId}" trong tài liệu` };
    }
    if (!(node instanceof ShapeNode)) {
        return { found: false, error: `"${nodeId}" không phải đối tượng hình học đọc được` };
    }
    let result: Result<IShape> | undefined;
    try {
        result = node.shape;
    } catch {
        return { found: false, error: `"${nodeId}" ném lỗi khi đọc shape` };
    }
    if (!result || !result.isOk) {
        return { found: false, error: `"${nodeId}" không có shape hợp lệ để đo` };
    }
    const shape: IShape = result.value;
    if (shape.isNull()) {
        return { found: false, error: `"${nodeId}" có shape rỗng` };
    }
    let volumeMm3: number | undefined;
    try {
        volumeMm3 = shape.volume();
    } catch {
        volumeMm3 = undefined;
    }
    const world = shape.transformedMul(node.worldTransform());
    const box = world.boundingBox();
    return {
        found: true,
        box: {
            sizeMm: [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z],
            centerMm: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.min.z) / 2],
        },
        shapeHandle: shape,
        volumeMm3,
    };
}

function worldShape(node: ShapeNode): IShape | undefined {
    try {
        const result = node.shape;
        if (!result || typeof result.isOk !== "boolean" || !result.isOk) {
            return undefined;
        }
        const shape: IShape = result.value;
        if (shape.isNull()) {
            return undefined;
        }
        return shape.transformedMul(node.worldTransform());
    } catch {
        return undefined;
    }
}

export function readSubjectWorldBox(doc: IDocument, nodeId: string): SubjectReading {
    const node = findNode(doc, nodeId);
    if (!node) {
        return { found: false, error: `không tìm thấy đối tượng "${nodeId}" trong tài liệu` };
    }
    if (!(node instanceof ShapeNode)) {
        return { found: false, error: `"${nodeId}" không phải đối tượng hình học đọc được` };
    }
    const world = worldShape(node);
    if (!world) {
        return { found: false, error: `"${nodeId}" không có shape hợp lệ để đo` };
    }
    const box = world.boundingBox();
    const sizeMm: [number, number, number] = [
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z,
    ];
    const centerMm: [number, number, number] = [
        (box.min.x + box.max.x) / 2,
        (box.min.y + box.max.y) / 2,
        (box.min.z + box.max.z) / 2,
    ];
    return { found: true, box: { sizeMm, centerMm } };
}
