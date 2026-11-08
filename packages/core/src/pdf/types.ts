// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/** Page setup shared by PDF preview and the pdf-lib writer. */
export interface PdfPageOptions {
    pageSize: "A4" | "A3";
    landscape: boolean;
    /** Margin on every side, millimetres on paper. */
    marginMm: number;
    /** `fixed` uses `scale` (1:n); `fit` shrinks to the printable area. */
    scaleMode: "fixed" | "fit";
    /** Denominator n of 1:n when `scaleMode` is `fixed`. */
    scale: number;
    /** Continuous edge stroke width on paper (mm). */
    lineWeightMm: number;
    /** Thin / dashed stroke width on paper (mm). */
    thinWeightMm: number;
}

export const DEFAULT_PDF_PAGE_OPTIONS: PdfPageOptions = {
    pageSize: "A3",
    landscape: true,
    marginMm: 10,
    scaleMode: "fixed",
    scale: 50,
    lineWeightMm: 0.35,
    thinWeightMm: 0.18,
};

export interface PdfLayout {
    pageWidthPt: number;
    pageHeightPt: number;
    /** Paper-pt of model (0,0) in the drawing plane. */
    originXPt: number;
    originYPt: number;
    /** Model-mm → paper scale factor as 1:n (larger n = smaller on paper). */
    scale: number;
    marginPt: number;
    clip: boolean;
    clipExcessMm: readonly [number, number];
    contentWidthMm: number;
    contentHeightMm: number;
}

export type PdfPathOp =
    | { op: "M"; x: number; y: number }
    | { op: "L"; x: number; y: number }
    | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { op: "Z" };

/** Paper-space draw list — preview canvas and PDF writer consume the same primitives. */
export type PdfPrimitive =
    | {
          kind: "path";
          ops: PdfPathOp[];
          widthPt: number;
          color?: string;
          dash?: readonly [number, number];
      }
    | {
          kind: "fillPath";
          ops: PdfPathOp[];
          color?: string;
      }
    | {
          kind: "text";
          x: number;
          y: number;
          sizePt: number;
          text: string;
          color?: string;
      }
    | {
          kind: "clipRect";
          x: number;
          y: number;
          w: number;
          h: number;
      };

export interface PdfExportPlan {
    options: PdfPageOptions;
    layout: PdfLayout;
    primitives: PdfPrimitive[];
    /** Human-readable kinds skipped (ellipse, solid faces as HLR, …). */
    skipped: string[];
    /** Max arc/circle Bézier deviation measured on paper (mm). */
    maxArcDeviationPaperMm: number;
    /** Model-space length of the longest exported straight edge (mm), for scale checks. */
    longestEdgeModelMm: number;
    /** That edge's length on paper (mm) = longestEdgeModelMm / layout.scale. */
    longestEdgePaperMm: number;
}

export interface DataExchangeExportOptions {
    pdf?: PdfPageOptions;
    /** When set, skip re-planning and write this plan (preview → export). */
    pdfPlan?: PdfExportPlan;
}
