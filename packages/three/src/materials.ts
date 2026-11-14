// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { VisualConfig, type VisualItemConfig } from "@chili3d/core";
import { DoubleSide, MeshLambertMaterial, PointsMaterial, ShaderLib } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ThreeHelper } from "./threeHelper";

// Bias LineMaterial segments slightly toward the camera in view space so 2D screen-aligned
// wide line quads (whose clip.z has zero derivative perpendicular to the line) do not lose
// fragments against adjacent shallow-angle or Tier-1 polygonOffset solid faces.
const LINE_CAMERA_SPACE_ANCHOR =
    "vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );\n\t\t\tvec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );";
if (
    ShaderLib.line?.vertexShader &&
    ShaderLib.line.vertexShader.includes(LINE_CAMERA_SPACE_ANCHOR) &&
    !ShaderLib.line.vertexShader.includes("/* chili3d_edge_bias */")
) {
    ShaderLib.line.vertexShader = ShaderLib.line.vertexShader.replace(
        LINE_CAMERA_SPACE_ANCHOR,
        `${LINE_CAMERA_SPACE_ANCHOR}
\t\t\t/* chili3d_edge_bias */
\t\t\tif ( start.z < 0.0 && end.z < 0.0 ) {
\t\t\t\tstart.z += min( abs( start.z ) * 0.0025, 1.5 );
\t\t\t\tend.z += min( abs( end.z ) * 0.0025, 1.5 );
\t\t\t}`,
    );
}

export const defaultVertexMaterial = new PointsMaterial({
    color: ThreeHelper.fromColor(VisualConfig.defaultEdgeColor),
    sizeAttenuation: false,
    size: 3,
});

export const highlightVertexMaterial = new PointsMaterial({
    color: ThreeHelper.fromColor(VisualConfig.highlightEdgeColor),
    sizeAttenuation: false,
    size: 5,
});

export const selectedVertexMaterial = new PointsMaterial({
    color: ThreeHelper.fromColor(VisualConfig.selectedEdgeColor),
    sizeAttenuation: false,
    size: 5,
});

const defaultEdgeMaterialOptions = {
    color: VisualConfig.defaultEdgeColor,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
};

export const defaultEdgeMaterial = new LineMaterial({
    ...defaultEdgeMaterialOptions,
    linewidth: 1,
});

const edgeMaterialsByWidth = new Map<number, LineMaterial>([[1, defaultEdgeMaterial]]);

/**
 * Shared edge material for a pixel `lineWidth` — `undefined`/1 maps to
 * `defaultEdgeMaterial`, anything else is cached per width so mesh data can carry a
 * `lineWidth` without every visual owning a material instance. The cache is
 * deliberately unbounded and never disposed: widths come from a small set of UI
 * constants and from document mesh data (`MeshData.lineWidth` is serialized), so
 * the key space stays bounded by the handful of widths real documents carry, and
 * sharing keeps the `defaultEdgeColor` listener below O(1) per material.
 * `ThreeGeometryFactory.createEdgeMaterial` is a separate source on purpose — it
 * builds per-visual materials at a different z-layer.
 */
export function edgeMaterialOfWidth(lineWidth: number | undefined): LineMaterial {
    const width = lineWidth ?? 1;
    let material = edgeMaterialsByWidth.get(width);
    if (material === undefined) {
        material = new LineMaterial({
            ...defaultEdgeMaterialOptions,
            linewidth: width,
        });
        edgeMaterialsByWidth.set(width, material);
    }
    return material;
}

VisualConfig.onPropertyChanged((property: keyof VisualItemConfig) => {
    if (property === "defaultEdgeColor") {
        defaultEdgeMaterial.color.set(VisualConfig.defaultEdgeColor);
        defaultVertexMaterial.color.set(VisualConfig.defaultEdgeColor);
        edgeMaterialsByWidth.forEach((material) => material.color.set(VisualConfig.defaultEdgeColor));
    }
});

export const hilightEdgeMaterial = new LineMaterial({
    linewidth: 3,
    color: ThreeHelper.fromColor(VisualConfig.highlightEdgeColor),
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
});

export const hilightDashedEdgeMaterial = new LineMaterial({
    linewidth: 3,
    color: ThreeHelper.fromColor(VisualConfig.highlightEdgeColor),
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    dashed: true,
    dashScale: 100,
    dashSize: 100,
    gapSize: 100,
});

export const selectedEdgeMaterial = new LineMaterial({
    linewidth: 3,
    color: ThreeHelper.fromColor(VisualConfig.selectedEdgeColor),
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
});

export const faceTransparentMaterial = new MeshLambertMaterial({
    transparent: true,
    side: DoubleSide,
    color: ThreeHelper.fromColor(VisualConfig.selectedFaceColor),
    opacity: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
});

export const selectedFaceColoredMaterial = new MeshLambertMaterial({
    side: DoubleSide,
    color: ThreeHelper.fromColor(VisualConfig.selectedFaceColor),
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
});

export const highlightFaceMaterial = new MeshLambertMaterial({
    color: ThreeHelper.fromColor(VisualConfig.highlightFaceColor),
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
});

export const lockFaceMaterial = new MeshLambertMaterial({
    color: 0x6a6a6a,
    transparent: true,
    opacity: 0.5,
});

export const lockLineMaterial = new LineMaterial({
    color: 0x6a6a6a,
    transparent: true,
    opacity: 0.5,
});
