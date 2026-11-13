// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Plane, Result, XYZ } from "@chili3d/core";
import type { ComponentOrientation } from "../catalog/types";

export interface WallPlacementResult {
    readonly plane: Plane;
    readonly widthDir: XYZ;
    readonly lengthDir: XYZ;
    readonly normalDir: XYZ;
    readonly orientation: ComponentOrientation;
    readonly flip: boolean;
}

/**
 * Calculates a local right-handed placement plane on a wall face given:
 * - faceNormal: the outward normal vector of the wall face
 * - hitPoint: the 3D position where the base anchor should sit
 * - orientation: "vertical" (ốp đứng) or "horizontal" (ốp ngang)
 * - flip: whether to flip the length growth direction
 *
 * Guaranteed invariants:
 * - plane.origin sits on the wall face at hitPoint
 * - plane.normal points outward from the wall (along thickness dz)
 * - plane.xvec points along width dx (transverse / array direction across wall)
 * - plane.yvec points along length dy (along the wall)
 * - Changing dy (length) preserves origin, width (dx), and thickness (dz).
 */
export function calculateWallPlacement(
    faceNormal: XYZ,
    hitPoint: XYZ,
    orientation: ComponentOrientation = "vertical",
    flip = false,
): Result<WallPlacementResult> {
    const normal = faceNormal.normalize();
    if (!normal) {
        return Result.err("Pháp tuyến mặt không hợp lệ (vectơ không).");
    }

    // Check if face is horizontal (e.g. floor or ceiling)
    const zDot = Math.abs(normal.dot(XYZ.unitZ));
    if (zDot > 0.999) {
        return Result.err(
            "Mặt được chọn là mặt phẳng nằm ngang. Mẫu ốp tường chỉ hỗ trợ vách đứng hoặc vách nghiêng.",
        );
    }

    // Project world vertical Z onto the wall surface to get the upward wall vector
    const z = XYZ.unitZ;
    const vRaw = z.sub(normal.multiply(normal.dot(z)));
    const vUp = vRaw.normalize();
    if (!vUp) {
        return Result.err("Không thể xác định trục đứng trên mặt phẳng vách.");
    }

    // Horizontal vector along wall face: N x V_up (right-handed)
    const hDir = normal.cross(vUp).normalize();
    if (!hDir) {
        return Result.err("Không thể xác định trục ngang trên mặt phẳng vách.");
    }

    let lengthDir: XYZ;
    if (orientation === "vertical") {
        lengthDir = flip ? vUp.reverse() : vUp;
    } else {
        lengthDir = flip ? hDir.reverse() : hDir;
    }

    // Because Plane constructor sets this.yvec = normal.cross(xvec),
    // setting xvec = lengthDir.cross(normal) mathematically guarantees:
    // normal.cross(xvec) = normal.cross(lengthDir.cross(normal)) === lengthDir!
    const xvec = lengthDir.cross(normal).normalize();
    if (!xvec) {
        return Result.err("Không thể tạo hệ trục tọa độ vuông góc trên mặt vách.");
    }

    const plane = new Plane({
        origin: hitPoint,
        normal,
        xvec,
    });

    return Result.ok({
        plane,
        widthDir: plane.xvec,
        lengthDir: plane.yvec,
        normalDir: plane.normal,
        orientation,
        flip,
    });
}
