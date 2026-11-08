// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { PdfExportPlan, PdfPathOp, PdfPrimitive } from "@chili3d/core";

type PdfLibModule = typeof import("pdf-lib");

let pdfLibPromise: Promise<PdfLibModule> | undefined;
let fontkitPromise: Promise<{ default: unknown }> | undefined;
let fontBytesPromise: Promise<Uint8Array> | undefined;
let fontBytesOverride: Uint8Array | undefined;

/** Test/Node hook: supply font bytes without fetch(import.meta.url). */
export function setPdfFontBytesForTests(bytes: Uint8Array | undefined) {
    fontBytesOverride = bytes;
    fontBytesPromise = undefined;
}

/** Lazy-load pdf-lib only when the user opens PDF export. */
export function loadPdfLib(): Promise<PdfLibModule> {
    pdfLibPromise ??= import("pdf-lib");
    return pdfLibPromise;
}

function loadFontkit(): Promise<{ default: unknown }> {
    fontkitPromise ??= import("@pdf-lib/fontkit") as Promise<{ default: unknown }>;
    return fontkitPromise;
}

/** OFL Noto Sans subset (Latin + Vietnamese) — fetched once per session. */
export function loadPdfFontBytes(): Promise<Uint8Array> {
    if (fontBytesOverride) return Promise.resolve(fontBytesOverride);
    fontBytesPromise ??= (async () => {
        const url = new URL("../../assets/fonts/NotoSans-OFL-subset.ttf", import.meta.url);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`PDF font load failed: ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
    })();
    return fontBytesPromise;
}

function parseHexColor(pdfLib: PdfLibModule, color: string | undefined) {
    const hex = (color ?? "#000000").replace("#", "");
    const full = hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex;
    const n = Number.parseInt(full, 16);
    return pdfLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Write a PDF plan with an embedded OFL font subset. Geometry stays vector
 * (lines + cubic Béziers); text is searchable via drawText.
 */
export async function writePdfPlan(plan: PdfExportPlan): Promise<Uint8Array> {
    const pdfLib = await loadPdfLib();
    const fontkit = await loadFontkit();
    const fontBytes = await loadPdfFontBytes();

    const doc = await pdfLib.PDFDocument.create();
    doc.registerFontkit(fontkit.default as any);
    const font = await doc.embedFont(fontBytes, { subset: true });
    const page = doc.addPage([plan.layout.pageWidthPt, plan.layout.pageHeightPt]);

    for (const prim of plan.primitives) {
        drawPrimitive(pdfLib, page, font, prim);
    }

    return doc.save();
}

function drawPrimitive(
    pdfLib: PdfLibModule,
    page: import("pdf-lib").PDFPage,
    font: import("pdf-lib").PDFFont,
    prim: PdfPrimitive,
) {
    if (prim.kind === "clipRect") {
        const { moveTo, lineTo, closePath, clip, endPath } = pdfLib;
        page.pushOperators(
            moveTo(prim.x, prim.y),
            lineTo(prim.x + prim.w, prim.y),
            lineTo(prim.x + prim.w, prim.y + prim.h),
            lineTo(prim.x, prim.y + prim.h),
            closePath(),
            clip(),
            endPath(),
        );
        return;
    }

    if (prim.kind === "path") {
        drawStrokePath(pdfLib, page, prim.ops, prim.widthPt, prim.color, prim.dash);
        return;
    }

    if (prim.kind === "fillPath") {
        drawFillPath(pdfLib, page, prim.ops, prim.color);
        return;
    }

    if (prim.kind === "text") {
        page.drawText(prim.text, {
            x: prim.x,
            y: prim.y,
            size: prim.sizePt,
            font,
            color: parseHexColor(pdfLib, prim.color),
        });
    }
}

function pathOps(pdfLib: PdfLibModule, ops: readonly PdfPathOp[]) {
    const { moveTo, lineTo, appendBezierCurve, closePath } = pdfLib;
    const out: ReturnType<typeof moveTo>[] = [];
    for (const op of ops) {
        if (op.op === "M") out.push(moveTo(op.x, op.y));
        else if (op.op === "L") out.push(lineTo(op.x, op.y));
        else if (op.op === "C") out.push(appendBezierCurve(op.x1, op.y1, op.x2, op.y2, op.x, op.y));
        else if (op.op === "Z") out.push(closePath());
    }
    return out;
}

function drawStrokePath(
    pdfLib: PdfLibModule,
    page: import("pdf-lib").PDFPage,
    ops: readonly PdfPathOp[],
    widthPt: number,
    color: string | undefined,
    dash?: readonly [number, number],
) {
    const {
        setStrokingRgbColor,
        setLineWidth,
        setLineCap,
        setLineJoin,
        LineCapStyle,
        LineJoinStyle,
        setDashPattern,
        stroke,
    } = pdfLib;
    const c = parseHexColor(pdfLib, color);
    page.pushOperators(
        setStrokingRgbColor(c.red, c.green, c.blue),
        setLineWidth(widthPt),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
        dash ? setDashPattern([dash[0], dash[1]], 0) : setDashPattern([], 0),
        ...pathOps(pdfLib, ops),
        stroke(),
    );
}

function drawFillPath(
    pdfLib: PdfLibModule,
    page: import("pdf-lib").PDFPage,
    ops: readonly PdfPathOp[],
    color: string | undefined,
) {
    const { setFillingRgbColor, fill } = pdfLib;
    const c = parseHexColor(pdfLib, color);
    page.pushOperators(setFillingRgbColor(c.red, c.green, c.blue), ...pathOps(pdfLib, ops), fill());
}
