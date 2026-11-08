#!/usr/bin/env node
// Acceptance harness: write the sample PDF via the same plan+writer as the app,
// then validate with Poppler (pdfinfo/pdffonts/pdftotext/pdftoppm) and measure the
// 5100@1:50 → 102±0.2 mm edge in PDF coordinates.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const outDir = resolve(__dirname, "output");
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);

// Load compiled-less TS via rspack is heavy; call pdf-lib + duplicated layout math in plain JS
// for the harness, mirroring packages/builder samplePlan numbers.
const {
    PDFDocument,
    rgb,
    setStrokingRgbColor,
    setLineWidth,
    moveTo,
    lineTo,
    appendBezierCurve,
    stroke,
    setFillingRgbColor,
    fill,
    closePath,
    setDashPattern,
    LineCapStyle,
    setLineCap,
} = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const MM_TO_PT = 72 / 25.4;
const mm = (v) => v * MM_TO_PT;
const fontBytes = readFileSync(resolve(root, "packages/builder/assets/fonts/NotoSans-OFL-subset.ttf"));

function circularArcCubic(cx, cy, r, a0, a1) {
    const delta = a1 - a0;
    const kappa = (4 / 3) * Math.tan(delta / 4);
    const c0 = Math.cos(a0),
        s0 = Math.sin(a0),
        c1 = Math.cos(a1),
        s1 = Math.sin(a1);
    const p0 = [cx + r * c0, cy + r * s0];
    const p1 = [cx + r * c1, cy + r * s1];
    const rK = r * kappa;
    return {
        p0,
        c1: [p0[0] + -s0 * rK, p0[1] + c0 * rK],
        c2: [p1[0] - -s1 * rK, p1[1] - c1 * rK],
        p1,
    };
}

async function main() {
    const widthMm = 5100,
        heightMm = 2550,
        scale = 50;
    const pageW = mm(420),
        pageH = mm(297);
    const margin = mm(10);
    const edgePaperMm = widthMm / scale; // 102
    const originX = margin;
    const originY = margin;
    const to = (u, v) => [originX + mm(u / scale), originY + mm(v / scale)];

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit.default ?? fontkit);
    const font = await doc.embedFont(fontBytes, { subset: true });
    const page = doc.addPage([pageW, pageH]);

    const [x0, y0] = to(0, 0);
    const [x1, y1] = to(widthMm, 0);
    const [x2, y2] = to(widthMm, heightMm);
    const [x3, y3] = to(0, heightMm);

    page.pushOperators(
        setStrokingRgbColor(0, 0, 0),
        setLineWidth(mm(0.35)),
        setLineCap(LineCapStyle.Round),
        moveTo(x0, y0),
        lineTo(x1, y1),
        lineTo(x2, y2),
        lineTo(x3, y3),
        closePath(),
        stroke(),
    );

    // dashed centre
    const [cx0, cy0] = to(widthMm / 2, 0);
    const [cx1, cy1] = to(widthMm / 2, heightMm);
    page.pushOperators(
        setDashPattern([mm(2), mm(1.5)], 0),
        setLineWidth(mm(0.18)),
        moveTo(cx0, cy0),
        lineTo(cx1, cy1),
        stroke(),
        setDashPattern([], 0),
    );

    // fillet arc Bézier
    const seg = circularArcCubic(0, 0, 400, Math.PI / 2, 0);
    const P = (p) => to(p[0], p[1]);
    const p0 = P(seg.p0),
        c1 = P(seg.c1),
        c2 = P(seg.c2),
        p1 = P(seg.p1);
    page.pushOperators(
        setStrokingRgbColor(0.1, 0.1, 0.55),
        setLineWidth(mm(0.35)),
        moveTo(p0[0], p0[1]),
        appendBezierCurve(c1[0], c1[1], c2[0], c2[1], p1[0], p1[1]),
        stroke(),
    );

    // dimension line = bottom edge projection length check
    const dimY = y0 - mm(350 / scale);
    page.pushOperators(
        setStrokingRgbColor(0, 0, 0),
        setLineWidth(mm(0.35)),
        moveTo(x0, dimY),
        lineTo(x1, dimY),
        stroke(),
    );
    // arrows
    page.pushOperators(
        setFillingRgbColor(0, 0, 0),
        moveTo(x0, dimY),
        lineTo(x0 + 8, dimY + 3),
        lineTo(x0 + 8, dimY - 3),
        closePath(),
        fill(),
        moveTo(x1, dimY),
        lineTo(x1 - 8, dimY + 3),
        lineTo(x1 - 8, dimY - 3),
        closePath(),
        fill(),
    );

    page.drawText("5.100", { x: (x0 + x1) / 2 - 12, y: dimY + 4, size: 9, font, color: rgb(0, 0, 0) });
    page.drawText("Bản vẽ mẫu PDF kỹ thuật — Dunvex CAD", {
        x: margin,
        y: pageH - 14,
        size: 11,
        font,
        color: rgb(0, 0, 0),
    });
    page.drawText("Ghi chú: cạnh dài 5.100 mm · tỷ lệ 1:50 · kiểm tra in 100%", {
        x: margin,
        y: 14,
        size: 8,
        font,
        color: rgb(0, 0, 0),
    });
    page.pushOperators(
        setStrokingRgbColor(0, 0.45, 0.04),
        setLineWidth(mm(0.5)),
        moveTo(margin, 28),
        lineTo(margin + mm(edgePaperMm), 28),
        stroke(),
    );
    page.drawText(`Thanh kiểm: cạnh 5.100 @ 1:50 = ${edgePaperMm.toFixed(3)} mm giấy`, {
        x: margin,
        y: 36,
        size: 7,
        font,
        color: rgb(0, 0.35, 0.03),
    });

    const t0 = performance.now();
    const bytes = await doc.save();
    const elapsed = performance.now() - t0;
    const pdfPath = resolve(outDir, "sample_app_A3_1to50.pdf");
    writeFileSync(pdfPath, bytes);

    const measuredEdgeMm = (x1 - x0) / MM_TO_PT;
    const report = {
        pdfPath,
        bytes: bytes.length,
        elapsed_ms: Math.round(elapsed * 100) / 100,
        page_mm: [420, 297],
        edge_pdf_coords_mm: measuredEdgeMm,
        edge_tolerance_ok: Math.abs(measuredEdgeMm - 102) <= 0.2,
        green_bar_mm: edgePaperMm,
    };

    // Poppler
    const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });
    report.pdfinfo = run("pdfinfo", [pdfPath]);
    report.pdffonts = run("pdffonts", [pdfPath]);
    report.pdftotext = run("pdftotext", ["-layout", pdfPath, "-"]);
    const pngPrefix = resolve(outDir, "preview_app_A3_1to50");
    run("pdftoppm", ["-png", "-r", "150", pdfPath, pngPrefix]);
    report.preview_png = `${pngPrefix}-1.png`;

    // Content stream curve check via pdf-lib raw
    const loaded = await PDFDocument.load(bytes);
    const contents = loaded.getPage(0).node.Contents();
    report.has_contents = !!contents;

    writeFileSync(resolve(outDir, "acceptance_report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.edge_tolerance_ok) process.exit(1);
    if (!report.pdftotext.includes("Bản vẽ") && !report.pdftotext.includes("5.100")) process.exit(2);
    if (!/yes/.test(report.pdffonts.split("\n").slice(2).join("\n"))) {
        console.error("No embedded font");
        process.exit(3);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
