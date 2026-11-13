// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    GeometryUtils,
    type IFace,
    type IShapeFactory,
    Precision,
    Result,
    type ShapeTypes,
    type XYZ,
} from "@chili3d/core";

/**
 * 2D cross-section coordinates of the authentic 3-wave panel (LS-3S-150):
 * - Total width W = 150 mm
 * - Wave crest height T = 15 mm
 * - Base sheet thickness t = 3 mm
 * - 3 distinct wave crests (width 20mm each, height 15mm)
 * - 2 flat valleys between waves (base thickness 3mm)
 * - Interlocking tongue and groove joint on edges (hèm âm dương)
 */
export const THREE_WAVE_2D_PROFILE: ReadonlyArray<[number, number]> = [
    [0, 0],
    [150, 0],
    [150, 3],
    [144, 3],
    // Wave 3
    [136, 3],
    [134, 15],
    [114, 15],
    [112, 3],
    // Valley 2
    [98, 3],
    // Wave 2
    [96, 15],
    [76, 15],
    [74, 3],
    // Valley 1
    [60, 3],
    // Wave 1
    [58, 15],
    [38, 15],
    [36, 3],
    // Interlocking left edge
    [10, 3],
    [10, 1.5],
    [0, 1.5],
];

/**
 * Builds the 3D planar profile face for the 3-wave panel at the given anchor point.
 * Guarantees that:
 * - Profile lies on the wall face at anchor
 * - Width spans along widthDir (0 to 150 mm)
 * - Thickness projects along normalDir (0 to 15 mm)
 * - Face normal points exactly along lengthDir (so extrusion extends in lengthDir)
 */
export function buildThreeWaveProfileFace(
    factory: IShapeFactory,
    anchor: XYZ,
    widthDir: XYZ,
    normalDir: XYZ,
    lengthDir: XYZ,
): Result<IFace> {
    const w = widthDir.normalize();
    const n = normalDir.normalize();
    const l = lengthDir.normalize();
    if (!w || !n || !l) {
        return Result.err("Hệ trục tọa độ không hợp lệ.");
    }
    const widthV = w;
    const normalV = n;
    const lengthV = l;

    function create3DPoints(reverse = false): XYZ[] {
        const raw = [...THREE_WAVE_2D_PROFILE];
        // Ensure polygon wire is strictly closed
        if (raw[raw.length - 1][0] !== raw[0][0] || raw[raw.length - 1][1] !== raw[0][1]) {
            raw.push([raw[0][0], raw[0][1]]);
        }
        if (reverse) raw.reverse();
        return raw.map(([u, v]) => anchor.add(widthV.multiply(u)).add(normalV.multiply(v)));
    }

    // Attempt 1: Default winding
    const pts1 = create3DPoints(false);
    const wire1 = factory.polygon(pts1);
    if (!wire1.isOk) return Result.err(wire1.error);

    const face1 = factory.face([wire1.value]);
    if (!face1.isOk) return Result.err(face1.error);

    const faceNormal1 = GeometryUtils.normal(face1.value);
    if (faceNormal1.dot(l) > 0.01) {
        return Result.ok(face1.value);
    }

    // Normal points opposite to lengthDir; reverse points to orient normal along +lengthDir
    face1.value.dispose();
    const pts2 = create3DPoints(true);
    const wire2 = factory.polygon(pts2);
    if (!wire2.isOk) return Result.err(wire2.error);

    const face2 = factory.face([wire2.value]);
    if (!face2.isOk) return Result.err(face2.error);

    return Result.ok(face2.value);
}
