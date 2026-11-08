// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { PdfPathOp } from "./types";

export interface ArcBezierSegment {
    /** Cubic control points in plane mm: p0, c1, c2, p1. */
    readonly p0: readonly [number, number];
    readonly c1: readonly [number, number];
    readonly c2: readonly [number, number];
    readonly p1: readonly [number, number];
}

/**
 * One cubic approximating a circular arc of sweep ≤ 90°.
 * κ = (4/3) tan(Δ/4) — the standard unit-circle control length.
 */
export function circularArcCubic(
    cx: number,
    cy: number,
    radius: number,
    a0: number,
    a1: number,
): ArcBezierSegment {
    const delta = a1 - a0;
    const kappa = (4 / 3) * Math.tan(delta / 4);
    const cos0 = Math.cos(a0);
    const sin0 = Math.sin(a0);
    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    const p0: [number, number] = [cx + radius * cos0, cy + radius * sin0];
    const p1: [number, number] = [cx + radius * cos1, cy + radius * sin1];
    const t0x = -sin0;
    const t0y = cos0;
    const t1x = -sin1;
    const t1y = cos1;
    const rK = radius * kappa;
    return {
        p0,
        c1: [p0[0] + t0x * rK, p0[1] + t0y * rK],
        c2: [p1[0] - t1x * rK, p1[1] - t1y * rK],
        p1,
    };
}

/** Split an arbitrary sweep into ≤90° cubics (handles full circles). */
export function circularArcToCubics(
    cx: number,
    cy: number,
    radius: number,
    startRad: number,
    endRad: number,
): ArcBezierSegment[] {
    let sweep = endRad - startRad;
    // Normalize to (-2π, 2π]; empty sweep → full circle when caller asks for closed.
    if (Math.abs(sweep) < 1e-12) {
        sweep = Math.PI * 2;
    }
    const dir = sweep >= 0 ? 1 : -1;
    const total = Math.abs(sweep);
    const parts: ArcBezierSegment[] = [];
    let a = startRad;
    let remaining = total;
    while (remaining > 1e-12) {
        const step = Math.min(remaining, Math.PI / 2);
        const b = a + dir * step;
        parts.push(circularArcCubic(cx, cy, radius, a, b));
        a = b;
        remaining -= step;
    }
    return parts;
}

function cubicPoint(
    p0: readonly [number, number],
    c1: readonly [number, number],
    c2: readonly [number, number],
    p1: readonly [number, number],
    t: number,
): [number, number] {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    const x = uu * u * p0[0] + 3 * uu * t * c1[0] + 3 * u * tt * c2[0] + tt * t * p1[0];
    const y = uu * u * p0[1] + 3 * uu * t * c1[1] + 3 * u * tt * c2[1] + tt * t * p1[1];
    return [x, y];
}

/**
 * Max radial deviation of the Bézier chain from the true circle, in the same
 * units as `radius` (model mm). Sample mid-span of each cubic — where the
 * classical approximation peaks.
 */
export function maxArcDeviationModelMm(
    cx: number,
    cy: number,
    radius: number,
    segments: readonly ArcBezierSegment[],
    samplesPerSeg = 8,
): number {
    let max = 0;
    for (const seg of segments) {
        for (let i = 1; i < samplesPerSeg; i++) {
            const t = i / samplesPerSeg;
            const [x, y] = cubicPoint(seg.p0, seg.c1, seg.c2, seg.p1, t);
            const r = Math.hypot(x - cx, y - cy);
            max = Math.max(max, Math.abs(r - radius));
        }
    }
    return max;
}

export function arcCubicsToPathOps(
    segments: readonly ArcBezierSegment[],
    toPaper: (u: number, v: number) => { x: number; y: number },
): PdfPathOp[] {
    if (segments.length === 0) return [];
    const ops: PdfPathOp[] = [];
    const first = toPaper(segments[0].p0[0], segments[0].p0[1]);
    ops.push({ op: "M", x: first.x, y: first.y });
    for (const seg of segments) {
        const c1 = toPaper(seg.c1[0], seg.c1[1]);
        const c2 = toPaper(seg.c2[0], seg.c2[1]);
        const p1 = toPaper(seg.p1[0], seg.p1[1]);
        ops.push({ op: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p1.x, y: p1.y });
    }
    return ops;
}
