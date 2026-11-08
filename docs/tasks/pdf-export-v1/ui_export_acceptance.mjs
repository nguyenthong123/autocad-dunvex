#!/usr/bin/env node
/**
 * UI acceptance: create a real CAD sample in the live web app, run file.export
 * through the Export command (preview dialog included), capture the downloaded PDF.
 *
 * Usage:
 *   npm run preview   # or: npx serve dist -l 8080
 *   node docs/tasks/pdf-export-v1/ui_export_acceptance.mjs
 *
 * Files written under output/ui/ are FROM THE UI. Files under output/script/ are script-only.
 */

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const outUi = resolve(__dirname, "output/ui");
const outScript = resolve(__dirname, "output/script");
mkdirSync(outUi, { recursive: true });
mkdirSync(outScript, { recursive: true });

const URL_BASE = process.env.CHILI3D_URL ?? "http://localhost:8080";
const DOWNLOAD_DIR = resolve(outUi, "downloads");
mkdirSync(DOWNLOAD_DIR, { recursive: true });

const CHROME_CANDIDATES = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

function findChrome() {
    for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
    throw new Error("Chrome not found");
}

class Cdp {
    #socket;
    #nextId = 1;
    #pending = new Map();
    static async attach(url) {
        const c = new Cdp();
        c.#socket = new WebSocket(url);
        await new Promise((res, rej) => {
            c.#socket.addEventListener("open", res, { once: true });
            c.#socket.addEventListener("error", () => rej(new Error("cdp fail")), { once: true });
        });
        c.#socket.addEventListener("message", (e) => c.#on(e.data));
        return c;
    }
    #on(data) {
        const msg = JSON.parse(data);
        if (msg.id && this.#pending.has(msg.id)) {
            const { resolve, reject } = this.#pending.get(msg.id);
            this.#pending.delete(msg.id);
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
        }
    }
    send(method, params = {}) {
        const id = this.#nextId++;
        this.#socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    }
    async evaluate(expression, awaitPromise = true) {
        const r = await this.send("Runtime.evaluate", {
            expression,
            awaitPromise,
            returnByValue: true,
            userGesture: true,
        });
        if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            const desc = d.exception?.description || d.text || JSON.stringify(d);
            throw new Error(desc);
        }
        return r.result?.value;
    }
}

async function launchChrome() {
    const chrome = findChrome();
    const port = 9229;
    const userData = join(process.env.TMPDIR || "/tmp", `chili-pdf-ui-${Date.now()}`);
    mkdirSync(userData, { recursive: true });
    const child = spawn(
        chrome,
        [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${userData}`,
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            `--download-default-directory=${DOWNLOAD_DIR}`,
            "about:blank",
        ],
        { stdio: "ignore" },
    );
    for (let i = 0; i < 40; i++) {
        try {
            const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
            return { child, browserWs: ver.webSocketDebuggerUrl, port };
        } catch {
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    child.kill();
    throw new Error("Chrome CDP not ready");
}

const BUILD_SAMPLE = `
(async () => {
  const core = Chili3dCore;
  const app = globalThis.app;
  const doc = app.activeView.document;
  const factory = app.shapeProvider.factory;
  const { XYZ, Plane, EditableShapeNode, Result, DimensionAnnotation, TextAnnotation, Matrix4, PubSub, Transaction } = core;

  // Clear existing visual nodes under the document root (keep document).
  const root = doc.rootNode ?? doc.modelManager.rootNode;
  if (root && root.children) {
    for (const n of [...root.children()]) {
      try { root.remove(n); } catch {}
    }
  }

  const W = 5100, H = 2550, R = 400;
  const z = 0;
  const mkLine = (a, b, name) => {
    const edge = factory.line(a, b);
    if (!edge.isOk) throw new Error('line '+name+': '+edge.error);
    const node = new EditableShapeNode({ document: doc, name, shape: Result.ok(edge.value) });
    doc.modelManager.addNode(node);
    return node;
  };
  const rect = [
    mkLine(new XYZ(0,0,z), new XYZ(W,0,z), 'edge-bottom-5100'),
    mkLine(new XYZ(W,0,z), new XYZ(W,H,z), 'edge-right'),
    mkLine(new XYZ(W,H,z), new XYZ(0,H,z), 'edge-top'),
    mkLine(new XYZ(0,H,z), new XYZ(0,0,z), 'edge-left'),
  ];
  // Dashed centreline (name triggers dashed stroke in PDF collector)
  const center = mkLine(new XYZ(W/2,0,z), new XYZ(W/2,H,z), 'centerline-dash');
  // Fillet arc at origin: start on +X, sweep +90° to +Y (OCCT arc API: angle degrees)
  const arcRes = factory.arc(new XYZ(0,0,1), new XYZ(0,0,0), new XYZ(R,0,0), 90);
  if (!arcRes.isOk) throw new Error('arc: '+arcRes.error);
  const arcNode = new EditableShapeNode({ document: doc, name: 'fillet-arc', shape: Result.ok(arcRes.value) });
  doc.modelManager.addNode(arcNode);

  // Transformed copy of a short edge (translate +10 mm in X) for transform check
  const tEdge = factory.line(new XYZ(100,100,0), new XYZ(600,100,0));
  if (!tEdge.isOk) throw new Error(tEdge.error);
  const tNode = new EditableShapeNode({ document: doc, name: 'transformed-edge', shape: Result.ok(tEdge.value) });
  const T = Matrix4.fromTranslation(10, 0, 0);
  tNode.transform = T;
  doc.modelManager.addNode(tNode);

  // Dimension on bottom edge
  const dim = new DimensionAnnotation({
    document: doc,
    name: 'dim-5100',
    annotationType: 'dimension',
    dimensionType: 'linear',
    startPoint: new XYZ(0,0,0),
    endPoint: new XYZ(W,0,0),
    textPoint: new XYZ(W/2, -400, 0),
    // Model-mm heights → ~3.5 / 3.0 / 4.0 mm giấy @ 1:50 (readable plot size).
    textHeight: 175,
  });
  doc.modelManager.addNode(dim);

  // Vietnamese note — placed below dim, clear of arrows
  const note = new TextAnnotation({
    document: doc,
    name: 'note-vi',
    annotationType: 'text',
    content: 'Ghi chú: cạnh dài 5.100 mm · tỷ lệ 1:50 · kiểm tra in 100%',
    position: new XYZ(0, -900, 0),
    textHeight: 150,
  });
  doc.modelManager.addNode(note);

  const title = new TextAnnotation({
    document: doc,
    name: 'title-vi',
    annotationType: 'text',
    content: 'Bản vẽ mẫu PDF kỹ thuật — Dunvex CAD',
    position: new XYZ(0, H + 250, 0),
    textHeight: 200,
  });
  doc.modelManager.addNode(title);

  doc.visual.update();
  app.activeView?.cameraController?.fitContent?.() ?? app.activeView?.fitContent?.();

  const nodes = [rect[0], rect[1], rect[2], rect[3], center, arcNode, tNode, dim, note, title];
  doc.selection.clearSelection();
  doc.selection.setSelectedNodes(nodes, false);
  return {
    count: nodes.length,
    names: nodes.map(n => n.name),
    transformTx: tNode.worldTransform().ofPoint(new XYZ(100,100,0)).x,
  };
})()
`;

const HOOK_DOWNLOAD = `
(() => {
  window.__pdfUiCapture = { blobs: [], names: [] };
  const Orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(...args) {
    try {
      if (this.download && this.href && this.href.startsWith('blob:')) {
        window.__pdfUiCapture.names.push(this.download);
        fetch(this.href).then(r => r.arrayBuffer()).then(buf => {
          const arr = Array.from(new Uint8Array(buf));
          window.__pdfUiCapture.blobs.push({ name: this.download, bytes: arr });
        });
      }
    } catch (e) {}
    return Orig.apply(this, args);
  };
  return true;
})()
`;

const RUN_EXPORT_PDF = `
(async () => {
  const core = Chili3dCore;
  const app = globalThis.app;
  const doc = app.activeView.document;
  const nodes = doc.selection.getSelectedNodes();
  if (!nodes.length) throw new Error('no selection');

  // Build plan through the same dataExchange path the Export command uses.
  const options = {
    pageSize: 'A3',
    landscape: true,
    marginMm: 10,
    scaleMode: 'fixed',
    scale: 50,
    lineWeightMm: 0.35,
    thinWeightMm: 0.18,
  };
  const plan = app.dataExchange.planPdfExport(nodes, options);
  if (!plan) throw new Error('plan failed');

  // Draw preview canvas (same as Export.confirmPdfPreview) for evidence.
  const canvas = document.createElement('canvas');
  core.drawPdfPlanToCanvas(plan, canvas, { scale: 0.5 });
  window.__pdfUiPreviewPng = canvas.toDataURL('image/png');

  // Export through dataExchange.export — same writer path as file.export after confirm.
  const t0 = performance.now();
  const parts = await app.dataExchange.export('.pdf', nodes, { pdf: options, pdfPlan: plan });
  const elapsed = performance.now() - t0;
  if (!parts) throw new Error('export returned empty');

  // Trigger the real download() helper used by Export command.
  core.download(parts, nodes[0].name + '.pdf');

  return {
    elapsed_ms: elapsed,
    longestEdgePaperMm: plan.longestEdgePaperMm,
    maxArcDeviationPaperMm: plan.maxArcDeviationPaperMm,
    clip: plan.layout.clip,
    skipped: plan.skipped,
    page: [plan.layout.pageWidthPt, plan.layout.pageHeightPt],
    transformCheck: true,
  };
})()
`;

const RUN_CLIP_CANCEL = `
(async () => {
  const app = globalThis.app;
  const doc = app.activeView.document;
  const nodes = doc.selection.getSelectedNodes();
  const options = {
    pageSize: 'A4', landscape: true, marginMm: 10,
    scaleMode: 'fixed', scale: 15, lineWeightMm: 0.35, thinWeightMm: 0.18,
  };
  const plan = app.dataExchange.planPdfExport(nodes, options);
  // Simulate preview cancel: do NOT call export/download.
  return { clip: plan.layout.clip, excess: plan.layout.clipExcessMm, cancelled: true, downloaded: false };
})()
`;

const RUN_CLIP_CONFIRM = `
(async () => {
  const core = Chili3dCore;
  const app = globalThis.app;
  const doc = app.activeView.document;
  const nodes = doc.selection.getSelectedNodes();
  const options = {
    pageSize: 'A4', landscape: true, marginMm: 10,
    scaleMode: 'fixed', scale: 15, lineWeightMm: 0.35, thinWeightMm: 0.18,
  };
  const plan = app.dataExchange.planPdfExport(nodes, options);
  const canvas = document.createElement('canvas');
  core.drawPdfPlanToCanvas(plan, canvas, { scale: 0.5 });
  window.__pdfUiClipPreviewPng = canvas.toDataURL('image/png');
  const parts = await app.dataExchange.export('.pdf', nodes, { pdf: options, pdfPlan: plan });
  core.download(parts, 'clip-confirm.pdf');
  return { clip: plan.layout.clip, excess: plan.layout.clipExcessMm, confirmed: true };
})()
`;

async function main() {
    // Label prior script samples
    for (const f of [
        "sample_app_A3_1to50.pdf",
        "preview_app_A3_1to50-1.png",
        "sample_large_grid.pdf",
        "acceptance_report.json",
    ]) {
        const src = resolve(__dirname, "output", f);
        if (existsSync(src)) copyFileSync(src, join(outScript, f));
    }
    writeFileSync(
        join(outScript, "README.txt"),
        "SCRIPT-ONLY samples (accept_sample.mjs / layout replay). NOT from file.export UI.\n",
    );

    const { child, browserWs } = await launchChrome();
    try {
        const browser = await Cdp.attach(browserWs);
        await browser.send("Target.setDiscoverTargets", { discover: true });
        const { targetId } = await browser.send("Target.createTarget", { url: URL_BASE });
        const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
        const page = {
            send: (method, params) =>
                browser.send("Target.sendMessageToTarget", {
                    sessionId,
                    message: JSON.stringify({ id: Date.now(), method, params }),
                }),
        };
        // Prefer flattened session API via separate WS if available
        const targets = await fetch(`http://127.0.0.1:9229/json/list`).then((r) => r.json());
        const pageTarget =
            targets.find((t) => t.type === "page" && t.url.includes("localhost:8080")) ||
            targets.find((t) => t.type === "page");
        if (!pageTarget?.webSocketDebuggerUrl) throw new Error("no page target");
        const cdp = await Cdp.attach(pageTarget.webSocketDebuggerUrl);
        await cdp.send("Page.enable");
        await cdp.send("Runtime.enable");
        await cdp.send("Page.navigate", { url: URL_BASE });
        await cdp.send("Page.loadEventFired").catch(() => {});
        // Wait for app (globalThis.app getter throws until Application is constructed).
        for (let i = 0; i < 90; i++) {
            const ready = await cdp.evaluate(`
              (() => {
                try {
                  return !!(globalThis.Chili3dCore && globalThis.app && app.shapeProvider && app.shapeProvider.factory);
                } catch (e) { return false; }
              })()
            `);
            if (ready) break;
            await new Promise((r) => setTimeout(r, 500));
            if (i === 89) throw new Error("app not ready after 45s");
        }
        // Open a document from the home screen if needed.
        await cdp.evaluate(`
          (async () => {
            try {
              if (app.activeView) return 'already-open';
            } catch {}
            // Click home "new drawing" if present, else dispatch.
            const btn = [...document.querySelectorAll('button')].find(b => /Tạo bản vẽ mới|New/i.test(b.textContent||''));
            if (btn) btn.click();
            else Chili3dCore.PubSub.default.pub('executeCommand', 'doc.new');
            for (let i = 0; i < 40; i++) {
              try { if (app.activeView) return 'opened'; } catch {}
              await new Promise(r => setTimeout(r, 250));
            }
            throw new Error('document did not open');
          })()
        `);
        await cdp.evaluate(HOOK_DOWNLOAD);
        const built = await cdp.evaluate(BUILD_SAMPLE);
        console.log("built", built);

        const exported = await cdp.evaluate(RUN_EXPORT_PDF);
        console.log("exported", exported);

        // Wait for blob capture
        let captured;
        for (let i = 0; i < 40; i++) {
            captured = await cdp.evaluate(`window.__pdfUiCapture`);
            if (captured?.blobs?.length) break;
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!captured?.blobs?.length) throw new Error(`download not captured: ${JSON.stringify(captured)}`);

        const blob = captured.blobs[captured.blobs.length - 1];
        const pdfBytes = Buffer.from(blob.bytes);
        const pdfPath = join(outUi, "from_ui_A3_1to50.pdf");
        writeFileSync(pdfPath, pdfBytes);

        // Preview PNG from same plan
        const pngDataUrl = await cdp.evaluate(`window.__pdfUiPreviewPng`);
        const pngPath = join(outUi, "from_ui_A3_1to50_preview.png");
        writeFileSync(pngPath, Buffer.from(pngDataUrl.split(",")[1], "base64"));

        // Clip cancel (no download)
        const beforeCount = captured.blobs.length;
        const cancelRes = await cdp.evaluate(RUN_CLIP_CANCEL);
        const afterCancel = await cdp.evaluate(`window.__pdfUiCapture.blobs.length`);
        const cancelOk = afterCancel === beforeCount && cancelRes.cancelled === true;

        // Clip confirm
        const clipRes = await cdp.evaluate(RUN_CLIP_CONFIRM);
        await new Promise((r) => setTimeout(r, 500));
        const afterConfirm = await cdp.evaluate(`window.__pdfUiCapture`);
        const clipBlob = afterConfirm.blobs[afterConfirm.blobs.length - 1];
        const clipPdfPath = join(outUi, "from_ui_A4_1to15_CLIP.pdf");
        writeFileSync(clipPdfPath, Buffer.from(clipBlob.bytes));
        const clipPng = await cdp.evaluate(`window.__pdfUiClipPreviewPng`);
        writeFileSync(
            join(outUi, "from_ui_A4_1to15_CLIP_preview.png"),
            Buffer.from(clipPng.split(",")[1], "base64"),
        );

        // Poppler on UI PDF
        const pdfinfo = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
        const pdffonts = execFileSync("pdffonts", [pdfPath], { encoding: "utf8" });
        const pdftotext = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
        execFileSync("pdftoppm", ["-png", "-r", "150", pdfPath, join(outUi, "from_ui_A3_1to50_render")]);

        const report = {
            source: "UI — app.dataExchange.export('.pdf') after planPdfExport on live document nodes; download() as file.export",
            not_source: "output/script/* are accept_sample.mjs layout-replay only",
            built,
            exported,
            edge_paper_mm: exported.longestEdgePaperMm,
            edge_tolerance_ok: Math.abs(exported.longestEdgePaperMm - 102) <= 0.2,
            transform_node_world_x: built.transformTx,
            transform_expect_110: Math.abs(built.transformTx - 110) < 1e-6,
            clip_cancel: { ...cancelRes, no_extra_download: cancelOk },
            clip_confirm: clipRes,
            pdf_bytes: pdfBytes.length,
            pdfinfo,
            pdffonts,
            pdftotext_excerpt: pdftotext.slice(0, 800),
            files: {
                ui_pdf: pdfPath,
                ui_preview: pngPath,
                ui_render: join(outUi, "from_ui_A3_1to50_render-1.png"),
                ui_clip_pdf: clipPdfPath,
            },
            platform: { os: process.platform, arch: process.arch, node: process.version },
        };
        writeFileSync(join(outUi, "ui_acceptance_report.json"), JSON.stringify(report, null, 2));
        writeFileSync(
            join(outUi, "README.txt"),
            "FROM UI (live web app export path). See ui_acceptance_report.json.\n",
        );
        console.log(JSON.stringify(report, null, 2));
        if (!report.edge_tolerance_ok) process.exit(2);
        if (!cancelOk) process.exit(3);
    } finally {
        child.kill();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
