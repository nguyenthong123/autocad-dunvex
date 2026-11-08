// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";
import {
    circularArcToCubics,
    layoutPdfPage,
    maxArcDeviationModelMm,
    mmToPt,
    modelToPaper,
    pageSizePts,
    paperDistanceMm,
    ptToMm,
} from "../src/pdf";

describe("pdf layout", () => {
    test("A3 landscape is 420×297 mm", () => {
        const { w, h } = pageSizePts("A3", true);
        expect(ptToMm(w)).toBeCloseTo(420, 3);
        expect(ptToMm(h)).toBeCloseTo(297, 3);
    });

    test("5100 mm at 1:50 is 102 mm on paper", () => {
        const layout = layoutPdfPage(
            { minU: 0, minV: 0, maxU: 5100, maxV: 2550 },
            {
                pageSize: "A3",
                landscape: true,
                marginMm: 10,
                scaleMode: "fixed",
                scale: 50,
                lineWeightMm: 0.35,
                thinWeightMm: 0.18,
            },
        );
        expect(layout.clip).toBe(false);
        expect(paperDistanceMm(layout, 5100)).toBeCloseTo(102, 6);
        const a = modelToPaper(layout, 0, 0);
        const b = modelToPaper(layout, 5100, 0);
        expect(ptToMm(b.x - a.x)).toBeCloseTo(102, 5);
    });

    test("fixed 1:15 on A4 landscape clips with ~63 mm excess width", () => {
        const layout = layoutPdfPage(
            { minU: 0, minV: 0, maxU: 5100, maxV: 2550 },
            {
                pageSize: "A4",
                landscape: true,
                marginMm: 10,
                scaleMode: "fixed",
                scale: 15,
                lineWeightMm: 0.35,
                thinWeightMm: 0.18,
            },
        );
        expect(layout.clip).toBe(true);
        expect(layout.clipExcessMm[0]).toBeCloseTo(63, 0);
        expect(layout.clipExcessMm[1]).toBeCloseTo(0, 0);
    });

    test("fit mode clears clip", () => {
        const layout = layoutPdfPage(
            { minU: 0, minV: 0, maxU: 5100, maxV: 2550 },
            {
                pageSize: "A4",
                landscape: true,
                marginMm: 10,
                scaleMode: "fit",
                scale: 50,
                lineWeightMm: 0.35,
                thinWeightMm: 0.18,
            },
        );
        expect(layout.clip).toBe(false);
        expect(layout.scale).toBeGreaterThan(15);
    });
});

describe("circular arc Bézier", () => {
    test("90° arc radial deviation stays under ~3e-4·R (classical cubic bound)", () => {
        const r = 400;
        const segs = circularArcToCubics(0, 0, r, Math.PI / 2, 0);
        expect(segs.length).toBe(1);
        const dev = maxArcDeviationModelMm(0, 0, r, segs);
        // Standard κ=4/3·tan(Δ/4) peaks near 2.7e-4·R for a 90° span.
        expect(dev).toBeLessThan(3e-4 * r);
    });

    test("full circle uses four cubics", () => {
        const segs = circularArcToCubics(0, 0, 10, 0, 0);
        expect(segs.length).toBe(4);
    });

    test("paper deviation at 1:50 stays under 0.01 mm for fillet r=400", () => {
        const segs = circularArcToCubics(0, 0, 400, Math.PI / 2, 0);
        const devModel = maxArcDeviationModelMm(0, 0, 400, segs);
        expect(devModel / 50).toBeLessThan(0.01);
    });

    test("mmToPt round-trips", () => {
        expect(ptToMm(mmToPt(25.4))).toBeCloseTo(25.4, 10);
    });
});
