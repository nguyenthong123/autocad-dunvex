#!/usr/bin/env node

// Part of the Chili3d Project, under the AGPL-3.0 License.
// Backend C (browser-relevant): pdf-lib direct vector. Installs pdf-lib ephemerally if missing.

import { execSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "output");
mkdirSync(OUT, { recursive: true });

function ensurePdfLib() {
    try {
        return createRequire(import.meta.url)("pdf-lib");
    } catch {
        execSync("npm install --no-save pdf-lib@1.17.1", {
            cwd: __dirname,
            stdio: "inherit",
        });
        return createRequire(import.meta.url)("pdf-lib");
    }
}

const { PDFDocument, rgb, StandardFonts } = ensurePdfLib();

const MM = 72 / 25.4;
const mm = (v) => v * MM;

async function exportOne({ name, pageWmm, pageHmm, scale, clipWarn }) {
    const modelW = 5100;
    const modelH = 2550;
    const margin = 10;
    const t0 = performance.now();

    const doc = await PDFDocument.create();
    const page = doc.addPage([mm(pageWmm), mm(pageHmm)]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();
    const m = mm(margin);
    const contentW = mm(modelW / scale);
    const contentH = mm(modelH / scale);
    const ox = m;
    const oy = height - m - contentH;

    const toPage = (x, y) => [ox + mm(x / scale), oy + mm(y / scale)];

    page.drawText("Dunvex CAD PDF spike — pdf-lib (browser path)", {
        x: m,
        y: height - mm(7),
        size: 11,
        font,
        color: rgb(0, 0, 0),
    });

    const [x0, y0] = toPage(0, 0);
    const [x1, y1] = toPage(modelW, modelH);
    page.drawRectangle({
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
        borderColor: rgb(0, 0, 0),
        borderWidth: mm(0.35),
    });

    const inset = 150;
    const [ix0, iy0] = toPage(inset, inset);
    const [ix1, iy1] = toPage(modelW - inset, modelH - inset);
    page.drawRectangle({
        x: ix0,
        y: iy0,
        width: ix1 - ix0,
        height: iy1 - iy0,
        borderColor: rgb(0, 0, 0),
        borderWidth: mm(0.18),
    });

    const [cx0, cy0] = toPage(modelW / 2, 0);
    const [cx1, cy1] = toPage(modelW / 2, modelH);
    page.drawLine({
        start: { x: cx0, y: cy0 },
        end: { x: cx1, y: cy1 },
        thickness: mm(0.18),
        color: rgb(0, 0, 0),
        dashArray: [3, 2],
    });

    // Arc approximated with quadratic segments (pdf-lib has no native arc helper)
    const r = 400;
    const steps = 16;
    for (let i = 0; i < steps; i++) {
        const a0 = Math.PI + (i / steps) * (Math.PI / 2);
        const a1 = Math.PI + ((i + 1) / steps) * (Math.PI / 2);
        const [ax0, ay0] = toPage(r + r * Math.cos(a0), r + r * Math.sin(a0));
        const [ax1, ay1] = toPage(r + r * Math.cos(a1), r + r * Math.sin(a1));
        page.drawLine({
            start: { x: ax0, y: ay0 },
            end: { x: ax1, y: ay1 },
            thickness: mm(0.35),
            color: rgb(0.1, 0.1, 0.55),
        });
    }

    const dimOff = 350;
    const [d1x, d1y] = toPage(0, -dimOff * 0.85);
    const [d2x, d2y] = toPage(modelW, -dimOff * 0.85);
    page.drawLine({
        start: { x: d1x, y: d1y },
        end: { x: d2x, y: d2y },
        thickness: mm(0.35),
        color: rgb(0, 0, 0),
    });
    page.drawText("5.100", {
        x: (d1x + d2x) / 2 - 12,
        y: d1y + mm(1.2),
        size: 9,
        font,
        color: rgb(0, 0, 0),
    });

    const expected = modelW / scale;
    page.drawLine({
        start: { x: m, y: mm(12) },
        end: { x: m + mm(expected), y: mm(12) },
        thickness: mm(0.5),
        color: rgb(0, 0.45, 0),
    });
    page.drawText(`Thanh kiem: canh 5.100 @ 1:${scale} = ${expected.toFixed(3)} mm giay`, {
        x: m,
        y: mm(14),
        size: 7,
        font,
        color: rgb(0, 0.35, 0),
    });

    if (clipWarn) {
        page.drawText("CANH BAO: ty le co dinh khong vua giay (clip).", {
            x: m,
            y: height - mm(12),
            size: 9,
            font,
            color: rgb(0.75, 0, 0),
        });
    }

    // Note: Helvetica cannot encode Vietnamese — intentional gap for this backend.
    page.drawText("Ghi chu (ASCII fallback): canh dai 5.100 mm, ty le 1:50", {
        x: m,
        y: mm(3),
        size: 8,
        font,
        color: rgb(0, 0, 0),
    });

    const bytes = await doc.save();
    const path = join(OUT, name);
    writeFileSync(path, bytes);
    return {
        backend: "C_pdf_lib",
        path,
        bytes: statSync(path).size,
        elapsed_ms: Math.round((performance.now() - t0) * 100) / 100,
        expected_edge_paper_mm: expected,
        vietnamese_native: false,
        arc_exact: false,
        note: "StandardFonts.Helvetica — no VN glyphs; arcs are polyline approximations",
    };
}

const results = [];
results.push(
    await exportOne({
        name: "sample_C_pdflib_A3_1to50.pdf",
        pageWmm: 420,
        pageHmm: 297,
        scale: 50,
        clipWarn: false,
    }),
);
results.push(
    await exportOne({
        name: "sample_C_pdflib_A4_1to50_CLIP.pdf",
        pageWmm: 297,
        pageHmm: 210,
        scale: 50,
        clipWarn: true,
    }),
);
console.log(JSON.stringify(results, null, 2));
writeFileSync(join(OUT, "backend_c_metrics.json"), JSON.stringify(results, null, 2));
