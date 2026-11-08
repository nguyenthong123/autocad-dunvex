// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Synthetic technical sample matching the spike: 5100×2550 mm rectangle, dashed
 * centreline, fillet arc, dimension "5.100", Vietnamese note. Used for acceptance
 * without requiring a live OCCT document.
 */

import {
    arcCubicsToPathOps,
    circularArcToCubics,
    DEFAULT_PDF_PAGE_OPTIONS,
    layoutPdfPage,
    maxArcDeviationModelMm,
    mmToPt,
    modelToPaper,
    type PdfExportPlan,
    type PdfPageOptions,
    type PdfPrimitive,
    paperDistanceMm,
} from "@chili3d/core";

export interface SampleDrawingSpec {
    widthMm?: number;
    heightMm?: number;
    filletRMm?: number;
    title?: string;
    note?: string;
    dimText?: string;
}

export function buildSamplePdfPlan(
    options: PdfPageOptions = DEFAULT_PDF_PAGE_OPTIONS,
    spec: SampleDrawingSpec = {},
): PdfExportPlan {
    const widthMm = spec.widthMm ?? 5100;
    const heightMm = spec.heightMm ?? 2550;
    const filletRMm = spec.filletRMm ?? 400;
    const title = spec.title ?? "Bản vẽ mẫu PDF kỹ thuật — Dunvex CAD";
    const note = spec.note ?? "Ghi chú: cạnh dài 5.100 mm · tỷ lệ 1:50 · kiểm tra in 100%";
    const dimText = spec.dimText ?? "5.100";

    // Bounds include dimension offset below the bottom edge.
    const dimOff = 350;
    const bounds = {
        minU: 0,
        minV: -dimOff,
        maxU: widthMm,
        maxV: heightMm,
    };
    const layout = layoutPdfPage(bounds, options);
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

    const corners: [number, number][] = [
        [0, 0],
        [widthMm, 0],
        [widthMm, heightMm],
        [0, heightMm],
    ];
    const rectOps: import("@chili3d/core").PdfPathOp[] = corners.map(([u, v], i) => {
        const p = toPaper(u, v);
        return i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y };
    });
    rectOps.push({ op: "Z" });
    prims.push({ kind: "path", ops: rectOps, widthPt: continuous });

    // Inner thin rectangle
    const inset = 150;
    const inner: [number, number][] = [
        [inset, inset],
        [widthMm - inset, inset],
        [widthMm - inset, heightMm - inset],
        [inset, heightMm - inset],
    ];
    const innerOps: import("@chili3d/core").PdfPathOp[] = inner.map(([u, v], i) => {
        const p = toPaper(u, v);
        return i === 0 ? { op: "M", x: p.x, y: p.y } : { op: "L", x: p.x, y: p.y };
    });
    innerOps.push({ op: "Z" });
    prims.push({ kind: "path", ops: innerOps, widthPt: thin }); // Dashed centreline
    const c0 = toPaper(widthMm / 2, 0);
    const c1 = toPaper(widthMm / 2, heightMm);
    prims.push({
        kind: "path",
        ops: [
            { op: "M", x: c0.x, y: c0.y },
            { op: "L", x: c1.x, y: c1.y },
        ],
        widthPt: thin,
        dash: [mmToPt(2), mmToPt(1.5)],
    });

    // Fillet arc at origin corner
    const a0 = Math.PI / 2;
    const a1 = 0;
    const segs = circularArcToCubics(0, 0, filletRMm, a0, a1);
    const arcDev = maxArcDeviationModelMm(0, 0, filletRMm, segs);
    prims.push({
        kind: "path",
        ops: arcCubicsToPathOps(segs, toPaper),
        widthPt: continuous,
        color: "#1a1a8c",
    });

    // Dimension line + extensions + arrows (simplified)
    const d1 = toPaper(0, -dimOff * 0.85);
    const d2 = toPaper(widthMm, -dimOff * 0.85);
    const e1 = toPaper(0, -dimOff);
    const e2 = toPaper(widthMm, -dimOff);
    const t0 = toPaper(0, 0);
    const t1 = toPaper(widthMm, 0);
    prims.push({
        kind: "path",
        ops: [
            { op: "M", x: t0.x, y: t0.y },
            { op: "L", x: e1.x, y: e1.y },
        ],
        widthPt: thin,
    });
    prims.push({
        kind: "path",
        ops: [
            { op: "M", x: t1.x, y: t1.y },
            { op: "L", x: e2.x, y: e2.y },
        ],
        widthPt: thin,
    });
    prims.push({
        kind: "path",
        ops: [
            { op: "M", x: d1.x, y: d1.y },
            { op: "L", x: d2.x, y: d2.y },
        ],
        widthPt: continuous,
    });
    // Arrowheads (filled triangles)
    const arrow = 8;
    prims.push({
        kind: "fillPath",
        ops: [
            { op: "M", x: d1.x, y: d1.y },
            { op: "L", x: d1.x + arrow, y: d1.y + arrow * 0.35 },
            { op: "L", x: d1.x + arrow, y: d1.y - arrow * 0.35 },
            { op: "Z" },
        ],
    });
    prims.push({
        kind: "fillPath",
        ops: [
            { op: "M", x: d2.x, y: d2.y },
            { op: "L", x: d2.x - arrow, y: d2.y + arrow * 0.35 },
            { op: "L", x: d2.x - arrow, y: d2.y - arrow * 0.35 },
            { op: "Z" },
        ],
    });

    const mid = toPaper(widthMm / 2, -dimOff * 0.85);
    prims.push({
        kind: "text",
        x: mid.x - 12,
        y: mid.y + 4,
        sizePt: 9,
        text: dimText,
    });

    prims.push({
        kind: "text",
        x: m,
        y: layout.pageHeightPt - 14,
        sizePt: 11,
        text: title,
    });
    prims.push({
        kind: "text",
        x: m,
        y: 14,
        sizePt: 8,
        text: note,
    });

    // Scale-check bar: expected paper length of the bottom edge
    const expected = paperDistanceMm(layout, widthMm);
    const barEnd = { x: m + mmToPt(expected), y: 28 };
    prims.push({
        kind: "path",
        ops: [
            { op: "M", x: m, y: 28 },
            { op: "L", x: barEnd.x, y: barEnd.y },
        ],
        widthPt: mmToPt(0.5),
        color: "#00730a",
    });
    prims.push({
        kind: "text",
        x: m,
        y: 36,
        sizePt: 7,
        text: `Thanh kiểm: cạnh 5.100 @ 1:${Math.round(layout.scale)} = ${expected.toFixed(3)} mm giấy`,
        color: "#005a08",
    });

    if (layout.clip) {
        const [ox, oy] = layout.clipExcessMm;
        prims.push({
            kind: "text",
            x: m,
            y: layout.pageHeightPt - 28,
            sizePt: 9,
            text: `CẢNH BÁO: tỷ lệ 1:${Math.round(layout.scale)} không vừa giấy — cắt thừa ~ ${ox.toFixed(1)}×${oy.toFixed(1)} mm.`,
            color: "#cc0000",
        });
    }

    return {
        options,
        layout,
        primitives: prims,
        skipped: [],
        maxArcDeviationPaperMm: paperDistanceMm(layout, arcDev),
        longestEdgeModelMm: widthMm,
        longestEdgePaperMm: expected,
    };
}
