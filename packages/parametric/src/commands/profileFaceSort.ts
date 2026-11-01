// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { ShapeNode, ShapeTypeUtils, type VisualShapeData } from "@chili3d/core";
import { ParametricBodyNode } from "../parametricBodyNode";
import { SketchNode } from "../sketch/sketchNode";

function is2DOrSketchProfile(x: VisualShapeData): boolean {
    if (x.owner?.node instanceof SketchNode) return true;
    const node = x.owner?.node;
    if (node instanceof ShapeNode && !(node instanceof ParametricBodyNode)) {
        try {
            if (node.shape?.isOk) {
                const st = node.shape.value?.shapeType;
                if (
                    typeof st === "number" &&
                    (ShapeTypeUtils.hasFace(st) || ShapeTypeUtils.hasWire(st)) &&
                    !ShapeTypeUtils.hasSolid(st)
                ) {
                    return true;
                }
            }
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * Moves the profile faces of sketches and 2D independent shapes ahead of the rest of what
 * the pointer detected. A sketch or 2D face drawn on a solid face is coplanar with it, so a
 * raycast hits both at the same depth and the order they come back in flips with the smallest
 * pointer movement — which makes a pick that takes the first entry flicker between the two.
 * The 2D face / sketch is what the user put on that face, so it is the one the pick should take.
 */
export function prioritizeSketchFaces(detected: VisualShapeData[]): VisualShapeData[] {
    const planar2d = detected.filter(is2DOrSketchProfile);
    if (planar2d.length === 0 || planar2d.length === detected.length) return detected;
    return [...planar2d, ...detected.filter((x) => !is2DOrSketchProfile(x))];
}
