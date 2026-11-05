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
- Step 1: Call shape.findSubShapes alone:
  {"ops": [{"method": "shape.findSubShapes", "target": "<nodeId>", "id": "f", "args": { "subshapeType": "face" }}]}
- Step 2: Read results[id].refs in the tool response (e.g. 6 faces -> ["f#0", "f#1", ..., "f#5"]). Only query the returned refs. Do not reference "#6" or beyond, and never use the group id (like "f") as a single ref.
- When topology changes (after a cut, extrude, or fillet), always re-query shape.findSubShapes — old subshape refs are invalidated.

## Querying Face Normal, Surface UV Bounds & Identifying Top Face (Executable Workflow)
1. Query subshapes alone:
   {"ops": [{"method": "shape.findSubShapes", "target": "<nodeId>", "id": "f", "args": { "subshapeType": "face" }}]}
   Response: results.f = { count: 6, refs: ["f#0", "f#1", "f#2", "f#3", "f#4", "f#5"] }

2. Query face surface, then use surface-query skill for UV bounds on candidate refs:
   - First get surface ref: {"method": "face.surface", "target": "f#0", "id": "s0"}
   - Query bounds from surface-query skill (target: "s0", id: "b0") -> returns { u1, u2, v1, v2 }
   (bounds data shape: { u1: number, u2: number, v1: number, v2: number }).

3. Handle bounds & evaluate face.normal:
   - If bounds are unbounded or non-finite (|u1| > 1e10 or !Number.isFinite(u1), typical for planar faces in CAD):
     Pass canonical u = 0, v = 0. Do NOT evaluate (u1 + u2) / 2 because (-Infinity + Infinity) yields NaN!
   - If bounds are finite (|u1| < 1e10, e.g. bounded BSpline surface):
     Pass midpoint u = (u1 + u2) / 2, v = (v1 + v2) / 2.
   {"ops": [
     {"method": "face.normal", "target": "f#0", "args": { "u": 0, "v": 0 }, "id": "n0"},
     {"method": "face.normal", "target": "f#1", "args": { "u": 0, "v": 0 }, "id": "n1"}
   ]}
   Response: results.n0 = [point: { x, y, z }, normal: { x, y, z }]

4. Identifying the Top Face of a Floor or Box:
   - NEVER deduce the top face by index (e.g. assuming "#0" is top) or by naming an op "top_face".
     In an OCCT box, face "#0" is the BOTTOM face at Z=0 with outward normal (0, 0, -1)!
   - The top face MUST be identified by:
     1) Upward normal direction: normal.z > 0.9 (e.g. normal is [0, 0, 1]).
     2) Highest Z position: candidate face with the maximum point.z (or bounding box max Z).

## Identifying the Front Facade of a Building
- Do NOT rely on fixed face index (e.g. "#5") or normal vector alone.
- For a building footprint, find faces whose normal points outward (e.g. +Y).
- Check the face's 3D coordinates / bounding box: for a building extending in negative Y, the front facade is at the maximum Y coordinate (e.g. Y = -157).
- If multiple faces share the outward normal (e.g. facade vs protruding porch), prompt the user to clarify before cutting.

## Wall Facade Cutters & Upright Plane Alignment
- Default plane orientation: omitting "xvec" and "alignUp" retains legacy CAD orientation (xvec = unitX).
- On a vertical facade (e.g. normal +Y): to align in-plane Y axis with World Up (+Z) so box "dy" is height upward:
  - Pass explicit "xvec": e.g. for normal (0, 1, 0), pass xvec: [-1, 0, 0] so normal.cross(xvec) points along +Z.
  - Or pass "alignUp": true so in-plane yvec automatically aligns with World Up (+Z).`;

export const shapeQuery: Skill = {
    name: "shape-query",
    description:
        "Solids, faces, edges, wires and topology: volume/area/bounding box, distances, findSubShapes, containsPoint, sub-shape refs — start here for measurements on a body",
    content: `${queryApiDoc}${subshapeNote}`,
};
