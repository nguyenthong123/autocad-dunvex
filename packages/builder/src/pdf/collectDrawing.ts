// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type Annotation,
    arcCubicsToPathOps,
    CurveUtils,
    circularArcToCubics,
    type DimensionAnnotation,
    dimensionLayoutFor,
    dimensionLayoutScale,
    type ICircle,
    type IEdge,
    type IShape,
    layoutPdfPage,
    type ModelBounds,
    maxArcDeviationModelMm,
    mmToPt,
    modelToPaper,
    type PdfExportPlan,
    type PdfPageOptions,
    type PdfPathOp,
    type PdfPrimitive,
    Plane,
    paperDistanceMm,
    ShapeNode,
    ShapeTypes,
    ShapeTypeUtils,
    type TextAnnotation,
    type VisualNode,
    XYZ,
} from "@chili3d/core";

function projectUv(plane: Plane, p: XYZ): [number, number] {
    const d = p.sub(plane.origin);
    return [d.dot(plane.xvec), d.dot(plane.yvec)];
}

function expandBounds(b: ModelBounds | undefined, u: number, v: number): ModelBounds {
    if (!b) return { minU: u, minV: v, maxU: u, maxV: v };
    return {
        minU: Math.min(b.minU, u),
        minV: Math.min(b.minV, v),
        maxU: Math.max(b.maxU, u),
        maxV: Math.max(b.maxV, v),
    };
}

function isDimension(node: VisualNode): node is DimensionAnnotation {
    return (node as Annotation).annotationType === "dimension";
}

function isText(node: VisualNode): node is TextAnnotation {
    return (node as Annotation).annotationType === "text";
}

interface CollectState {
    bounds?: ModelBounds;
    modelPaths: Array<{
        kind: "line" | "arc" | "poly" | "dash" | "fill";
        // model-mm coords before paper transform
        uvs: number[]; // flat pairs, or for arc: cx,cy,r,a0,a1
        weight: "continuous" | "thin" | "dashed";
        color?: string;
    }>;
    texts: Array<{ u: number; v: number; text: string; heightMm: number; color?: string }>;
    skipped: Set<string>;
    longestEdgeModelMm: number;
    maxArcDevModelMm: number;
}

function noteSkip(state: CollectState, kind: string) {
    state.skipped.add(kind);
}

function addUv(state: CollectState, u: number, v: number) {
    state.bounds = expandBounds(state.bounds, u, v);
}

function collectEdges(
    state: CollectState,
    shape: IShape,
    plane: Plane,
    weight: "continuous" | "thin" | "dashed" = "continuous",
) {
    const edges = shape.findSubShapes(ShapeTypes.edge) as IEdge[];
    for (const edge of edges) {
        let trimmed: IEdge["curve"] | undefined;
        try {
            trimmed = edge.curve;
        } catch {
            noteSkip(state, "degenerate-edge");
            continue;
        }
        if (!trimmed) continue;

        const basis = CurveUtils.isTrimmed(trimmed) ? trimmed.basisCurve : trimmed;

        if (CurveUtils.isLine(basis)) {
            const p1 = edge.startPoint();
            const p2 = edge.endPoint();
            const [u1, v1] = projectUv(plane, p1);
            const [u2, v2] = projectUv(plane, p2);
            addUv(state, u1, v1);
            addUv(state, u2, v2);
            const len = Math.hypot(u2 - u1, v2 - v1);
            state.longestEdgeModelMm = Math.max(state.longestEdgeModelMm, len);
            state.modelPaths.push({
                kind: "line",
                uvs: [u1, v1, u2, v2],
                weight,
            });
        } else if (CurveUtils.isCircle(basis)) {
            const circle = basis as ICircle;
            const [cu, cv] = projectUv(plane, circle.center);
            const first = edge.firstParameter();
            const last = edge.lastParameter();
            const isFull = edge.isClosed() || Math.abs(last - first - 2 * Math.PI) < 1e-4;
            const start = edge.startPoint();
            const end = isFull ? start : edge.endPoint();
            const [su, sv] = projectUv(plane, start);
            const [eu, ev] = projectUv(plane, end);
            const a0 = Math.atan2(sv - cv, su - cu);
            let a1 = isFull ? a0 + 2 * Math.PI : Math.atan2(ev - cv, eu - cu);
            // Match parameter sweep direction.
            const paramSweep = last - first;
            if (!isFull && paramSweep < 0 && a1 > a0) a1 -= 2 * Math.PI;
            if (!isFull && paramSweep > 0 && a1 < a0) a1 += 2 * Math.PI;

            const r = circle.radius;
            addUv(state, cu - r, cv - r);
            addUv(state, cu + r, cv + r);
            const segs = circularArcToCubics(cu, cv, r, a0, a1);
            state.maxArcDevModelMm = Math.max(
                state.maxArcDevModelMm,
                maxArcDeviationModelMm(cu, cv, r, segs),
            );
            state.modelPaths.push({
                kind: "arc",
                uvs: [cu, cv, r, a0, a1],
                weight: weight === "dashed" ? "thin" : "continuous",
                color: "#1a1a8c",
            });
        } else {
            noteSkip(state, "curve-as-polyline");
            const first = edge.firstParameter();
            const last = edge.lastParameter();
            const segments = 32;
            const uvs: number[] = [];
            for (let i = 0; i <= segments; i++) {
                const t = first + ((last - first) * i) / segments;
                const pt = edge.pointAt(t);
                const [u, v] = projectUv(plane, pt);
                addUv(state, u, v);
                uvs.push(u, v);
            }
            state.modelPaths.push({ kind: "poly", uvs, weight });
        }
        trimmed.dispose?.();
    }
}

function collectDimension(state: CollectState, dim: DimensionAnnotation, plane: Plane) {
    const world = dim.worldTransform();
    const start = world.ofPoint(dim.startPoint);
    const end = world.ofPoint(dim.endPoint);
    const textPoint = world.ofPoint(dim.textPoint);
    const center = dim.centerPoint !== undefined ? world.ofPoint(dim.centerPoint) : undefined;
    const planeNormal = dim.planeNormal !== undefined ? world.ofVector(dim.planeNormal) : undefined;
    const layout = dimensionLayoutFor(
        dim.dimensionType,
        start,
        end,
        textPoint,
        dimensionLayoutScale(dim.textHeight),
        center,
        planeNormal,
    );
    if (!layout) {
        noteSkip(state, `dimension-${dim.dimensionType}`);
        return;
    }

    for (let i = 0; i + 5 < layout.segments.length; i += 6) {
        const [u1, v1] = projectUv(
            plane,
            new XYZ(layout.segments[i], layout.segments[i + 1], layout.segments[i + 2]),
        );
        const [u2, v2] = projectUv(
            plane,
            new XYZ(layout.segments[i + 3], layout.segments[i + 4], layout.segments[i + 5]),
        );
        addUv(state, u1, v1);
        addUv(state, u2, v2);
        state.modelPaths.push({ kind: "line", uvs: [u1, v1, u2, v2], weight: "thin" });
    }

    for (let i = 0; i + 8 < layout.triangles.length; i += 9) {
        const pts: number[] = [];
        for (let k = 0; k < 3; k++) {
            const [u, v] = projectUv(
                plane,
                new XYZ(
                    layout.triangles[i + k * 3],
                    layout.triangles[i + k * 3 + 1],
                    layout.triangles[i + k * 3 + 2],
                ),
            );
            addUv(state, u, v);
            pts.push(u, v);
        }
        state.modelPaths.push({ kind: "fill", uvs: pts, weight: "continuous" });
    }

    const [tu, tv] = projectUv(plane, layout.textPosition);
    addUv(state, tu, tv);
    state.texts.push({
        u: tu,
        v: tv,
        text: dim.formattedValue(),
        heightMm: dim.textHeight,
    });
}

function collectText(state: CollectState, text: TextAnnotation, plane: Plane) {
    const world = text.worldTransform();
    const pos = world.ofPoint(text.position);
    const [u, v] = projectUv(plane, pos);
    addUv(state, u, v);
    if (text.leaderPoint !== undefined) {
        const lead = world.ofPoint(text.leaderPoint);
        const [lu, lv] = projectUv(plane, lead);
        addUv(state, lu, lv);
        state.modelPaths.push({
            kind: "line",
            uvs: [lu, lv, u, v],
            weight: "thin",
        });
    }
    state.texts.push({ u, v, text: text.content, heightMm: text.textHeight });
}

function resolvePlane(nodes: VisualNode[]): Plane {
    const view = nodes[0]?.document.application.activeView;
    return view?.workplane ?? Plane.XY;
}

function buildPrimitives(
    state: CollectState,
    layout: ReturnType<typeof layoutPdfPage>,
    options: PdfPageOptions,
): PdfPrimitive[] {
    const toPaper = (u: number, v: number) => modelToPaper(layout, u, v);
    const continuous = mmToPt(options.lineWeightMm);
    const thin = mmToPt(options.thinWeightMm);
    const prims: PdfPrimitive[] = [];

    const m = layout.marginPt;
    prims.push({
        kind: "clipRect",
        x: m,
        y: m,
        w: layout.pageWidthPt - 2 * m,
        h: layout.pageHeightPt - 2 * m,
    });

    for (const path of state.modelPaths) {
        const widthPt = path.weight === "continuous" ? continuous : thin;
        if (path.kind === "line") {
            const a = toPaper(path.uvs[0], path.uvs[1]);
            const b = toPaper(path.uvs[2], path.uvs[3]);
            prims.push({
                kind: "path",
                ops: [
                    { op: "M", x: a.x, y: a.y },
                    { op: "L", x: b.x, y: b.y },
                ],
                widthPt,
                color: path.color,
                dash: path.weight === "dashed" ? [mmToPt(2), mmToPt(1.5)] : undefined,
            });
        } else if (path.kind === "arc") {
            const [cu, cv, r, a0, a1] = path.uvs;
            const segs = circularArcToCubics(cu, cv, r, a0, a1);
            prims.push({
                kind: "path",
                ops: arcCubicsToPathOps(segs, toPaper),
                widthPt,
                color: path.color ?? "#1a1a8c",
            });
        } else if (path.kind === "poly") {
            const pathOps: PdfPathOp[] = [];
            for (let i = 0; i + 1 < path.uvs.length; i += 2) {
                const p = toPaper(path.uvs[i], path.uvs[i + 1]);
                pathOps.push(i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y });
            }
            prims.push({ kind: "path", ops: pathOps, widthPt, color: path.color });
        } else if (path.kind === "fill") {
            const pathOps: PdfPathOp[] = [];
            for (let i = 0; i + 1 < path.uvs.length; i += 2) {
                const p = toPaper(path.uvs[i], path.uvs[i + 1]);
                pathOps.push(i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y });
            }
            pathOps.push({ op: "Z" });
            prims.push({ kind: "fillPath", ops: pathOps, color: path.color ?? "#000000" });
        } else if (path.kind === "dash") {
            const a = toPaper(path.uvs[0], path.uvs[1]);
            const b = toPaper(path.uvs[2], path.uvs[3]);
            prims.push({
                kind: "path",
                ops: [
                    { op: "M", x: a.x, y: a.y },
                    { op: "L", x: b.x, y: b.y },
                ],
                widthPt: thin,
                dash: [mmToPt(2), mmToPt(1.5)],
            });
        }
    }

    for (const t of state.texts) {
        const p = toPaper(t.u, t.v);
        // textHeight is model-mm (same as geometry); scale onto paper like edges.
        prims.push({
            kind: "text",
            x: p.x,
            y: p.y,
            sizePt: mmToPt(t.heightMm / layout.scale),
            text: t.text,
            color: t.color,
        });
    }

    if (layout.clip) {
        const [ox, oy] = layout.clipExcessMm;
        prims.push({
            kind: "text",
            x: m,
            y: layout.pageHeightPt - 8,
            sizePt: 9,
            text: `CẢNH BÁO: tỷ lệ 1:${Math.round(layout.scale)} không vừa giấy — cắt thừa ~ ${ox.toFixed(1)}×${oy.toFixed(1)} mm. Chọn khổ lớn hơn hoặc vừa trang.`,
            color: "#cc0000",
        });
    }

    return prims;
}

/**
 * Collect selected nodes into a paper-space PDF plan. Selection defines content;
 * the workplane (else XY) is the projection plane; camera/zoom do not affect scale.
 */
export function planPdfFromNodes(nodes: VisualNode[], options: PdfPageOptions): PdfExportPlan | undefined {
    if (nodes.length === 0) return undefined;

    const plane = resolvePlane(nodes);
    const state: CollectState = {
        modelPaths: [],
        texts: [],
        skipped: new Set(),
        longestEdgeModelMm: 0,
        maxArcDevModelMm: 0,
    };

    for (const node of nodes) {
        if (node instanceof ShapeNode && !node.isReferenceGeometry) {
            if (!node.shape.isOk) {
                noteSkip(state, "invalid-shape");
                continue;
            }
            const shape = node.shape.value.transformedMul(node.worldTransform());
            const dashed =
                /center|centre|dash|truc|nét\s*đứt|net\s*dut/i.test(node.name) ||
                node.name.toLowerCase().includes("centerline");
            collectEdges(state, shape, plane, dashed ? "dashed" : "continuous");
            // Solids/faces contribute edges only — no hidden-line removal in v1.
            if (ShapeTypeUtils.hasFace(shape.shapeType) || ShapeTypeUtils.hasSolid(shape.shapeType)) {
                noteSkip(state, "solid-edges-only(no-hlr)");
            }
        } else if (isDimension(node)) {
            collectDimension(state, node, plane);
        } else if (isText(node)) {
            collectText(state, node, plane);
        } else {
            noteSkip(state, node.constructor?.name ?? "unknown-node");
        }
    }

    if (!state.bounds) return undefined;

    const layout = layoutPdfPage(state.bounds, options);
    const primitives = buildPrimitives(state, layout, options);

    return {
        options,
        layout,
        primitives,
        skipped: [...state.skipped].sort(),
        maxArcDeviationPaperMm: paperDistanceMm(layout, state.maxArcDevModelMm),
        longestEdgeModelMm: state.longestEdgeModelMm,
        longestEdgePaperMm: paperDistanceMm(layout, state.longestEdgeModelMm),
    };
}
