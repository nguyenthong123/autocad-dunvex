// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { surfaceQueryApiDoc } from "../tools/capabilities.generated";
import type { Skill } from "./types";

const surfaceBoundsNote = `\n\n## Surface Bounds & Parameter Coordinates (surface.bounds)
- Method name is "surface.bounds" (target must be a surface ref, e.g. from face.surface):
  {"method": "surface.bounds", "target": "<surfaceRef>", "id": "b"}
- Return data shape: { u1: number, u2: number, v1: number, v2: number }
- Handling Unbounded / Infinite Domains:
  - Planar surfaces in CAD have infinite/unbounded domains (|u1| > 1e10 or !Number.isFinite(u1), e.g. -2e100 to 2e100 in OCCT).
  - When evaluating face.normal on unbounded/planar surfaces, pass canonical coordinates u = 0, v = 0.
  - Do NOT calculate (u1 + u2) / 2 on infinite values because (-Infinity + Infinity) yields NaN!
  - When bounds are finite (|u1| < 1e10, e.g. bounded BSpline surface), use midpoint: u = (u1 + u2) / 2, v = (v1 + v2) / 2.
`;

/**
 * The surface half of the generated query catalog. See curve-query for why the family documents
 * are separate skills rather than one load.
 */
export const surfaceQuery: Skill = {
    name: "surface-query",
    description:
        "Surfaces behind faces: surface type, bounds, normals, parameter evaluation, projection, periodicity and the elementary/swept/revolution subtype members",
    content: `${surfaceQueryApiDoc}${surfaceBoundsNote}`,
};
