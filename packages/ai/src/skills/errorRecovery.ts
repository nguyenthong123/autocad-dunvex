// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { Skill } from "./types";

export const errorRecovery: Skill = {
    name: "error-recovery",
    description:
        "What common run_program / tool errors mean and how to fix them: failed booleans, bad fillet radius, stale refs, wrong ref kinds, missed clicks",
    content: `Error recovery. Strategy: read the message, fix the cause, re-run ONLY the failed ops — refs persist across run_program calls, so retries are cheap. Load the query skill for the failing ref's family when a query fails — shape-query for topology, curve-query for curves, surface-query for surfaces.

"unknown method "x"" — the method is not in the modeling catalog. Query methods (owner.name like face.area) are listed in the query skills by family: shape-query (shape/vertex/edge/wire/face), curve-query (curve and its subtypes), surface-query (surface and its subtypes); modeling methods in the modeling-api skill. Check spelling and casing.

"must be a finite number" / "must be one of a|b|c" / "must be { x, y, z }" — argument encoding wrong. Re-check the JSON encoding section: XYZ={x,y,z}, Line={point,direction} (NOT {start,end}), Plane={origin, normal?, xvec?}, enum params list values inline.

"Missing required parameter "x"" — the op left out a required argument; nothing ran. Add it and re-run that op (the signatures are in the modeling-api skill).

"The radius is too small." — the radius is at or below the kernel's minimum (1e-7 mm), i.e. effectively zero. Pass a positive radius.

"Failed to fillet" / "Failed to chamfer" (or "Fillet Error: …") — the radius/distance is too large for the adjacent faces, or the picked edges are unsuitable. Query edge.length / face.area around the target and lower the value; typical cause is a radius larger than half the shortest adjacent edge.

"The edges is empty." — fillet/chamfer needs edge indices: run shape.findSubShapes(target, edge) first and pick indices (ref e#3 -> index 3) by edge.ends geometry.

"ref "x" is no longer valid: its source node was removed" — the node behind the ref was consumed by an edit-style op or deleted. Use the id of the op that replaced it, or re-run the query that produced the ref against the new node.

"Node cannot be measured (no bounding box): <id>" — the node has no physical 3D bounds (e.g. an empty sketch with no entities). Check that geometry exists before measuring. Missing measurement data keeps the verification status unverified.

'"x" is a SketchNode (...), not a ParametricBodyNode' — editFeature and features ops require a 3D ParametricBodyNode id, not a 2D sketch. To modify a feature, pass the body id. To create geometry from a sketch, use extrude/revolve.

'unknown entity type "rect"' — no rect entity exists in sketch schema. Create rectangles using 4 closed "line" entities in perimeter order.

'unknown constraint kind "Coincident"' — the solver expects "P2PCoincident" with refs [{ entity: i, point: p1 }, { entity: j, point: p2 }].

'"x" is a query ref list group' / 'query op "x" produced 0 sub-shapes' — do not pass the query id (e.g. "wallFaces") to face.area or face.normal; read results[id].refs and use individual indexed refs like "wallFaces#0". Never assume refs like "sketchEdges#0" exist when the query found 0 sub-shapes.

'Missing required parameter "u"' / 'face.normal requires parameters "u" and "v"' — face.normal needs both surface parametric coordinates. Query UV bounds with face.surface -> surface.uvBounds or use midpoint coordinates (e.g. u=0, v=0 for planar faces).

"node not found: <id>" (delete_node / set_node_visible / transform_node / create_folder / move_nodes) — the node is gone, most likely consumed by an edit-style op: run_program's response "removed" lists those nodes. Do NOT retry or hide consumed nodes; call get_document_state if you need the current node list.

"folder not found: <id>" / "<id> is a <Type>, not a folder" / "cannot move <id>: …" / "cannot move <id> into itself or one of its own descendants" (create_folder / move_nodes) — the grouping target is wrong: the id is not a folder (a shape node or a body), or the node belongs to a parametric body that rebuilds it, or the move would nest a folder inside itself. get_document_state lists the FolderNode ids and every node's parentId — re-issue the move against a real folder id.

'Unknown ref "x"' — the id was never registered: no successfully-run op defined it (ops run in order, so an op cannot reference an id defined later in the same program), or you guessed it from a numbering pattern. The error lists the currently available refs — run the op that defines x first (or fix the op order), then re-run only the failed ops.

'Ref "x" was defined but its query returned null' — the defining op ran but produced no geometry (e.g. an empty intersection). x is unusable; re-run the defining query on a different target. (Only the "Unknown ref" message lists what is available — this one does not.)

"ref "x" is no longer valid: its source shape changed" — a sub-shape index no longer exists after the source was edited. Re-run shape.findSubShapes (or the original query) on the current shape and re-pick indices.

"requires a <kind> target, got a <other> ref" / "requires a <type> curve" — wrong ref kind or sub-shape type. Curve queries accept edge refs and surface queries accept face refs directly (auto-derived), and every curve member except curve.* / trimmedCurve.* unwraps trimmedCurve→basisCurve for you — so this means the target is neither (e.g. a solid or wire), or the edge's underlying curve is a different type. Inspect with shape.shapeType / trimmedCurve.basisCurve + curve.curveType and pass the right ref. Mutation queries (curve.reverse, trimmedCurve.setTrim) are the exception: they need an explicit edge.curve ref.

'<owner>.<name> does not apply to this target: it has no "<name>"' — the query asked for a member the target's kind does not have (a surface member on a face whose surface is another kind, most often). Curve owners are checked up front and fail with "requires a <type> curve" instead, so this is mostly surfaces: read the members the surface DOES have, or re-derive it (face.surface on the right face) and check with the family members first.

"BooleanCut Error" / "BooleanFuse Error" / "BooleanCommon Error" (or a raw OCCT diagnostic) — the kernel could not complete the operation. Do not assume the cause: a disjoint fuse SUCCEEDS (it returns a compound of loose solids, not one solid — that is why booleanFuse is only for touching solids). Compare the operands with shape.boundingBox / shape.extremaDistance, check that both are solids of the expected size, fix placement (corner vs base-center vs true-center rules) or the operand choice, and retry.

"booleanCut did not remove any volume from target" — the cutter did not penetrate target solid material. If cutter bounds are outside the target, reposition or enlarge the cutter. If bounds overlap but removed volume is 0, the target is already hollow at that position (an opening was already cut) or only grazed the boundary — inspect the active model tree with get_document_state to confirm existing openings before deciding whether to adjust cutter or proceed to door framing.

"booleanCut failed through-cut verification" — the cutter only created a blind pocket or recess and did not penetrate both opposite faces in the wall thickness dimension. Check the thickness direction of the wall, enlarge the cutter's span along that axis so it extends beyond both target boundaries, and retry. Never declare a door or window complete if it did not cut all the way through.

"Target/Tool "x" is a Shell/Face/Wire, not a solid body. Boolean cut requires solid bodies." — boolean operations require solid bodies. If the cutter was extruded from a wire or profile, ensure the profile was closed into a face before extrusion, or create a solid primitive (box, cylinder). A compound mixing solids with open shells/faces is also rejected.

"To face failed" (wire.toFace) or "Failed to create prism" / "Prism Error: …" (prism) — the wire is not usable as a profile: polygon points must ALL lie on one plane and number at least 3 (fewer points or scattered 3D points produce an open/non-planar wire). Re-issue the corners on a single plane in perimeter order, repeating the first point as the last so the wire is closed.

prism/revolve on a polygon wire returns a shell or breaks downstream booleans — the wire was not CLOSED (a closed one is turned into a face and sweeps a solid). Re-run polygon with the first point repeated as the last point, then extrude again.

"Failed to create box / cylinder / face / polygon / solid / ellipse" — the factory rejected the parameters (a zero or negative size, a degenerate profile). Check the arguments the message names and re-run that op.

'ref "x" is a <kind>, but a shape is required' — the op wanted a shape and got a curve/surface ref (or the reverse). Pass a ref of the kind the parameter takes (see the modeling-api skill).

click_view "hits": [] — nothing of that shapeType at the pixel. Retake capture_screenshot (the view may have moved), nudge coordinates toward the target's center — an edge is only a few pixels wide where a face fills the pixels around it, so the same click lands on a face far more often. If several attempts miss, fall back to shape.findSubShapes + geometry, or ask the user to describe the shape in words.

The highlight in a click_view screenshot is on the wrong shape — the pixel missed, or several shapes overlap there. Re-click using the hit list's point (it names the world position you actually hit) or switch to shape.findSubShapes on the node and pick indices by geometry. Never operate on a selection you have not seen highlighted.

A capture shows the area you need to check covered by the highlight — a highlighted face is drawn as an opaque fill over the face, so its shading, texture and edges are not in that picture. Clear the selection (select_nodes []) and retake; re-select afterwards if the user should see the result.

click_view "x and y must be numbers in [0,1]" — the coordinates were missing or outside the image; both are normalized fractions of the screenshot (x: 0=left/1=right, y: 0=top/1=bottom).

'query op "x" requires an id' / 'requires a target' — a query op is missing the "id" it reports its value under, or the "target" it inspects. Add the missing field; nothing else in the program is affected.

Query returns null (e.g. curve.parameter, surface.parameter, face.intersectLine) — the point/line does not map onto the geometry; it is a valid answer, not an error.`,
};
