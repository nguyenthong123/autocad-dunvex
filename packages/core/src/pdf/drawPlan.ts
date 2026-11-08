// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { PdfExportPlan, PdfPathOp, PdfPrimitive } from "./types";

function parseColor(color: string | undefined, fallback: string): string {
    return color ?? fallback;
}

function applyPath(ctx: CanvasRenderingContext2D, ops: readonly PdfPathOp[]) {
    ctx.beginPath();
    for (const op of ops) {
        if (op.op === "M") ctx.moveTo(op.x, op.y);
        else if (op.op === "L") ctx.lineTo(op.x, op.y);
        else if (op.op === "C") ctx.bezierCurveTo(op.x1, op.y1, op.x2, op.y2, op.x, op.y);
        else if (op.op === "Z") ctx.closePath();
    }
}

/**
 * Paint a PDF plan onto a canvas using the same paper-space coordinates as the
 * writer (PDF y-up → canvas y-down via a flip). Shared layout data — not a second layout.
 */
export function drawPdfPlanToCanvas(
    plan: PdfExportPlan,
    canvas: HTMLCanvasElement,
    options?: { scale?: number },
): void {
    const pixelScale = options?.scale ?? 1;
    const w = plan.layout.pageWidthPt * pixelScale;
    const h = plan.layout.pageHeightPt * pixelScale;
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(pixelScale, pixelScale);
    // PDF y-up → canvas y-down
    ctx.translate(0, plan.layout.pageHeightPt);
    ctx.scale(1, -1);

    let clipped = false;
    for (const prim of plan.primitives) {
        drawPrimitive(ctx, prim, () => {
            clipped = true;
        });
    }
    if (clipped) {
        // clipRect opens a clip; leave it for subsequent prims — already applied in order.
    }
    ctx.restore();
}

function drawPrimitive(ctx: CanvasRenderingContext2D, prim: PdfPrimitive, _onClip: () => void) {
    if (prim.kind === "clipRect") {
        ctx.beginPath();
        ctx.rect(prim.x, prim.y, prim.w, prim.h);
        ctx.clip();
        return;
    }
    if (prim.kind === "path") {
        applyPath(ctx, prim.ops);
        ctx.strokeStyle = parseColor(prim.color, "#000000");
        ctx.lineWidth = prim.widthPt;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (prim.dash) ctx.setLineDash([prim.dash[0], prim.dash[1]]);
        else ctx.setLineDash([]);
        ctx.stroke();
        return;
    }
    if (prim.kind === "fillPath") {
        applyPath(ctx, prim.ops);
        ctx.fillStyle = parseColor(prim.color, "#000000");
        ctx.fill();
        return;
    }
    if (prim.kind === "text") {
        // Text must not be y-flipped glyph-wise — undo the page flip locally.
        ctx.save();
        ctx.translate(prim.x, prim.y);
        ctx.scale(1, -1);
        ctx.fillStyle = parseColor(prim.color, "#000000");
        ctx.font = `${prim.sizePt}px sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.fillText(prim.text, 0, 0);
        ctx.restore();
    }
}
