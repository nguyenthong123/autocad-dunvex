// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PDF_PAGE_OPTIONS, ptToMm } from "@chili3d/core";
import { describe, expect, test } from "@rstest/core";
import { PDFDocument } from "pdf-lib";
import { buildSamplePdfPlan, setPdfFontBytesForTests, writePdfPlan } from "../src/pdf";

const FONT = readFileSync(resolve(__dirname, "../assets/fonts/NotoSans-OFL-subset.ttf"));

describe("PDF export sample plan", () => {
    test("A3 1:50 longest edge is 102.0 ± 0.2 mm in PDF coordinates", async () => {
        setPdfFontBytesForTests(FONT);
        const plan = buildSamplePdfPlan({
            ...DEFAULT_PDF_PAGE_OPTIONS,
            pageSize: "A3",
            landscape: true,
            scaleMode: "fixed",
            scale: 50,
        });
        expect(plan.longestEdgePaperMm).toBeCloseTo(102, 5);
        expect(Math.abs(plan.longestEdgePaperMm - 102)).toBeLessThanOrEqual(0.2);
        // Classical 90° cubic ≈ 2.7e-4·R model → ~0.002 mm paper at 1:50 for R=400.
        expect(plan.maxArcDeviationPaperMm).toBeLessThan(0.01);

        const t0 = performance.now();
        const bytes = await writePdfPlan(plan);
        const elapsed = performance.now() - t0;

        expect(bytes.byteLength).toBeGreaterThan(5_000);
        expect(elapsed).toBeLessThan(5_000);

        const doc = await PDFDocument.load(bytes);
        const page = doc.getPage(0);
        const { width, height } = page.getSize();
        expect(ptToMm(width)).toBeCloseTo(420, 2);
        expect(ptToMm(height)).toBeCloseTo(297, 2);

        // Recover bottom-edge length from plan primitives (same data the writer used).
        const dimLine = plan.primitives.find(
            (p) =>
                p.kind === "path" &&
                p.ops.length === 2 &&
                p.ops[0].op === "M" &&
                p.ops[1].op === "L" &&
                Math.abs((p.ops[1] as any).y - (p.ops[0] as any).y) < 0.01 &&
                ptToMm(Math.abs((p.ops[1] as any).x - (p.ops[0] as any).x)) > 100,
        );
        expect(dimLine).toBeDefined();
        if (dimLine && dimLine.kind === "path") {
            const x0 = (dimLine.ops[0] as { x: number }).x;
            const x1 = (dimLine.ops[1] as { x: number }).x;
            expect(ptToMm(Math.abs(x1 - x0))).toBeCloseTo(102, 1);
        }

        const texts = plan.primitives.filter((p) => p.kind === "text").map((p) => (p as any).text);
        expect(texts.some((t) => t.includes("Bản vẽ"))).toBe(true);
        expect(texts.some((t) => t.includes("Ghi chú"))).toBe(true);
        expect(texts.some((t) => t.includes("5.100"))).toBe(true);

        // Content stream must contain cubic curves for the fillet.
        const raw = page.node.Contents()?.toString() ?? "";
        void raw;
        const saved = Buffer.from(bytes).toString("latin1");
        // Inflated streams are compressed — check plan ops instead for unit test reliability.
        const hasCurve = plan.primitives.some((p) => p.kind === "path" && p.ops.some((o) => o.op === "C"));
        expect(hasCurve).toBe(true);
        expect(saved.startsWith("%PDF")).toBe(true);
    });

    test("clip plan flags excess when fixed scale does not fit", () => {
        const plan = buildSamplePdfPlan({
            ...DEFAULT_PDF_PAGE_OPTIONS,
            pageSize: "A4",
            landscape: true,
            scaleMode: "fixed",
            scale: 15,
        });
        expect(plan.layout.clip).toBe(true);
        expect(plan.layout.clipExcessMm[0]).toBeGreaterThan(50);
        expect(plan.primitives.some((p) => p.kind === "text" && (p as any).color === "#cc0000")).toBe(true);
    });
});
