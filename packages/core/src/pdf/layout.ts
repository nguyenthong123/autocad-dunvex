// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { PdfLayout, PdfPageOptions } from "./types";

/** PDF / PostScript: 1 pt = 1/72 in. */
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
    return mm * MM_TO_PT;
}

export function ptToMm(pt: number): number {
    return pt / MM_TO_PT;
}

const PAGE_SIZES_MM: Record<"A4" | "A3", { w: number; h: number }> = {
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
};

export function pageSizePts(pageSize: "A4" | "A3", landscape: boolean): { w: number; h: number } {
    const { w, h } = PAGE_SIZES_MM[pageSize];
    return landscape
        ? { w: mmToPt(Math.max(w, h)), h: mmToPt(Math.min(w, h)) }
        : { w: mmToPt(Math.min(w, h)), h: mmToPt(Math.max(w, h)) };
}

export interface ModelBounds {
    minU: number;
    minV: number;
    maxU: number;
    maxV: number;
}

/**
 * Lay out model-plane millimetres onto one PDF page. Camera/zoom never enter here —
 * only page size, margins, and scale mode.
 */
export function layoutPdfPage(bounds: ModelBounds, options: PdfPageOptions): PdfLayout {
    const { w: pageWidthPt, h: pageHeightPt } = pageSizePts(options.pageSize, options.landscape);
    const marginPt = mmToPt(options.marginMm);
    const contentW = Math.max(1e-9, bounds.maxU - bounds.minU);
    const contentH = Math.max(1e-9, bounds.maxV - bounds.minV);

    let scale: number;
    let clip = false;
    let clipExcessMm: readonly [number, number] = [0, 0];

    if (options.scaleMode === "fit") {
        const availW = pageWidthPt - 2 * marginPt;
        const availH = pageHeightPt - 2 * marginPt;
        const sW = contentW / ptToMm(availW);
        const sH = contentH / ptToMm(availH);
        scale = Math.max(sW, sH);
    } else {
        scale = Math.max(1e-9, options.scale);
        const paperW = contentW / scale;
        const paperH = contentH / scale;
        const availW = ptToMm(pageWidthPt) - 2 * options.marginMm;
        const availH = ptToMm(pageHeightPt) - 2 * options.marginMm;
        const excessW = Math.max(0, paperW - availW);
        const excessH = Math.max(0, paperH - availH);
        clip = excessW > 1e-6 || excessH > 1e-6;
        clipExcessMm = [excessW, excessH];
    }

    // Place model (minU, minV) at the bottom-left printable corner (PDF y-up).
    const originXPt = marginPt - mmToPt(bounds.minU / scale);
    const originYPt = marginPt - mmToPt(bounds.minV / scale);

    return {
        pageWidthPt,
        pageHeightPt,
        originXPt,
        originYPt,
        scale,
        marginPt,
        clip,
        clipExcessMm,
        contentWidthMm: contentW,
        contentHeightMm: contentH,
    };
}

/** Model-plane mm → PDF points (y up). */
export function modelToPaper(layout: PdfLayout, uMm: number, vMm: number): { x: number; y: number } {
    return {
        x: layout.originXPt + mmToPt(uMm / layout.scale),
        y: layout.originYPt + mmToPt(vMm / layout.scale),
    };
}

export function paperDistanceMm(layout: PdfLayout, modelMm: number): number {
    return modelMm / layout.scale;
}
