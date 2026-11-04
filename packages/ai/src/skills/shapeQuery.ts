// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { queryApiDoc } from "../tools/capabilities.generated";
import type { Skill } from "./types";

/**
 * The topology half of the generated query catalog — see modelingApi for the creation half, and
 * curve-query / surface-query for the geometry behind edges and faces. Kept to one family because
 * the combined document is ~19k characters, most of which a given turn does not need.
 */
const subshapeNote = `\n\n## shape.findSubShapes Parameter Requirement
- Always explicitly specify "subshapeType" in args:
  {"method": "shape.findSubShapes", "target": "<ref>", "args": { "subshapeType": "face" }}
  Valid kinds: "face", "edge", "wire", "vertex", "solid", "shell".
  Do not omit subshapeType or rely on op id naming — omitting subshapeType returns an explicit error asking for the parameter.

## Separate Query from Property Measurement
- NEVER batch shape.findSubShapes together with assumed indexed refs (like "#0", "#1", ..., "#8") in the same run_program call!
  You do not know in advance how many faces or edges the shape actually has.
- Step 1: Call shape.findSubShapes alone.
- Step 2: Read results[id].refs in the tool response (e.g. 8 faces -> ["faces#0", ..., "faces#7"]). Only use the exact refs returned. Do not reference "#8" or beyond, and never use the group id (like "wallFaces") as a single ref.
- When topology changes (after a cut, extrude, or fillet), always re-query shape.findSubShapes — old subshape refs are invalidated.

## Querying Face Normal & Surface UV Bounds (3-Step Pattern)
1. Query surface ref: {"method": "face.surface", "target": "faceRef#0", "id": "s0"}
2. Query surface UV bounds (from surface-query skill): target "s0" -> bounds { u1, u2, v1, v2 }
3. Query normal at midpoint: {"method": "face.normal", "target": "faceRef#0", "args": { "u": (u1 + u2) / 2, "v": (v1 + v2) / 2 }}
   Note: method name is "surface." + "bounds" (from surface-query, NOT surface.uvBounds).

## Identifying the Front Facade of a Building
- Do NOT rely on fixed face index (e.g. "#5") or normal vector alone.
- For a building footprint, find faces whose normal points outward (e.g. +Y).
- Check the face's 3D coordinates / bounding box: for a building extending in negative Y, the front facade is at the maximum Y coordinate (e.g. Y = -157).
- If multiple faces share the outward normal (e.g. facade vs protruding porch), prompt the user to clarify before cutting.`;

export const shapeQuery: Skill = {
    name: "shape-query",
    description:
        "Solids, faces, edges, wires and topology: volume/area/bounding box, distances, findSubShapes, containsPoint, sub-shape refs — start here for measurements on a body",
    content: `${queryApiDoc}${subshapeNote}`,
};
