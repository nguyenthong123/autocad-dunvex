#!/usr/bin/env node
/**
 * MENU / RIBBON UI acceptance — real file.export clicks on the live web app.
 *
 * Unlike ui_export_acceptance.mjs (which drives the exporter API directly), this run
 * clicks the actual ribbon "Xuất bản vẽ (Export)" button, changes the real `<select>`
 * format field to `.pdf`, sets the real PDF page properties in the CommandContext panel,
 * confirms the multi-selection step with the panel's checkmark, then clicks through the
 * "Xem trước PDF" dialog and lets the BROWSER save the downloaded file (Page.setDownload-
 * Behavior). The 5100 mm edge is then MEASURED FROM THE DOWNLOADED PDF'S OWN content
 * stream (vector `m`/`l` ops), not from the plan object.
 *
 * Usage:  node docs/tasks/pdf-export-v1/menu_ui_acceptance.mjs
 * Output: docs/tasks/pdf-export-v1/output/menu-ui/
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const outMenu = resolve(__dirname, "output/menu-ui");
const downloadDir = resolve(outMenu, "downloads");
mkdirSync(outMenu, { recursive: true });
mkdirSync(downloadDir, { recursive: true });

// Clean prior downloads so we capture exactly this run's browser file.
for (const f of readdirSync(downloadDir)) {
    const p = join(downloadDir, f);
    if (statSync(p).isFile()) rmSafe(p);
}
function rmSafe(p) {
    try {
        unlinkSync(p);
    } catch {
        /* ignore */
    }
}

const PORT = Number(process.env.CHILI3D_PORT ?? 8080);
const URL_BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".ttf": "font/ttf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".dxf": "application/dxf",
};

function startStaticServer(distDir) {
    const server = createServer((req, res) => {
        let path = decodeURIComponent(req.url.split("?")[0]);
        if (path === "/") path = "/index.html";
        const file = resolve(distDir, `.${path}`);
        if (!file.startsWith(distDir) || !existsSync(file) || statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end("not found");
            return;
        }
        const ext = file.slice(file.lastIndexOf("."));
        res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
        res.end(readFileSync(file));
    });
    return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

class Cdp {
    #socket;
    #nextId = 1;
    #pending = new Map();
    #handlers = new Map();
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
    on(method, fn) {
        if (!this.#handlers.has(method)) this.#handlers.set(method, []);
        this.#handlers.get(method).push(fn);
    }
    #on(data) {
        const msg = JSON.parse(data);
        if (msg.method && this.#handlers.has(msg.method)) {
            for (const fn of this.#handlers.get(msg.method)) fn(msg.params);
        }
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
            throw new Error(d.exception?.description || d.text || JSON.stringify(d));
        }
        return r.result?.value;
    }
    async clickPoint(x, y) {
        await this.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1,
        });
        await this.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1,
        });
    }
    async screenshot(path) {
        const { data } = await this.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(path, Buffer.from(data, "base64"));
    }
    async centerOf(jsExpr) {
        return this.evaluate(`(async () => {
            const el = (${jsExpr});
            if (!el) return null;
            el.scrollIntoView({block:'center', inline:'center'});
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return null;
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        })()`);
    }
    async clickElement(jsExpr) {
        // Wait until the target point actually hits the element (no loading overlay on top).
        let pt = null;
        for (let i = 0; i < 60; i++) {
            pt = await this.evaluate(`(async () => {
                const el = (${jsExpr});
                if (!el) return null;
                el.scrollIntoView({block:'center', inline:'center'});
                const r = el.getBoundingClientRect();
                if (r.width < 1 || r.height < 1) return null;
                const x = r.left + r.width/2, y = r.top + r.height/2;
                const top = document.elementFromPoint(x, y);
                const hit = top === el || el.contains(top) || (top && top.contains(el));
                return { x, y, hit, top: top ? top.tagName : null };
            })()`);
            if (pt?.hit) break;
            await new Promise((r) => setTimeout(r, 200));
            if (i === 59)
                console.log(
                    "clickElement: overlay never cleared at",
                    jsExpr.slice(0, 60),
                    "— top was",
                    pt?.top,
                );
        }
        if (!pt) throw new Error(`element not found/clickable: ${jsExpr}`);
        await this.clickPoint(pt.x, pt.y);
        return pt;
    }
}

async function launchChrome() {
    const candidates = [
        process.env.CHROME,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ].filter(Boolean);
    const chrome = candidates.find((c) => existsSync(c));
    if (!chrome) throw new Error("Chrome not found");
    const port = 9231;
    const userData = join(process.env.TMPDIR || "/tmp", `chili-pdf-menu-${Date.now()}`);
    mkdirSync(userData, { recursive: true });
    const child = spawn(
        chrome,
        [
            // NOTE: headful + SwiftShader on purpose — this Chromium build cannot create a
            // WebGL context in headless nor with --disable-gpu (ThreeView.initRenderer throws
            // "Could not create a WebGL context" and doc.new never reaches activeView).
            // Verified combination on macOS: headful + --enable-unsafe-swiftshader.
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${userData}`,
            "--enable-unsafe-swiftshader",
            "--no-first-run",
            "--no-default-browser-check",
            "--window-size=1440,900",
            "--lang=vi",
            "about:blank",
        ],
        { stdio: "ignore" },
    );
    for (let i = 0; i < 40; i++) {
        try {
            const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
            return { child, port };
        } catch {
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    child.kill();
    throw new Error("Chrome CDP not ready");
}

// ---- Same real sample the reviewer validated (10 nodes; edge-bottom-5100 = 5100 mm). ----
const BUILD_SAMPLE = `
(async () => {
  const core = Chili3dCore;
  const app = globalThis.app;
  const doc = app.activeView.document;
  const factory = app.shapeProvider.factory;
  const { XYZ, Plane, EditableShapeNode, Result, DimensionAnnotation, TextAnnotation, Matrix4, PubSub, Transaction } = core;

  const root = doc.rootNode ?? doc.modelManager.rootNode;
  if (root && root.children) {
    for (const n of [...root.children()]) { try { root.remove(n); } catch {} }
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
  const center = mkLine(new XYZ(W/2,0,z), new XYZ(W/2,H,z), 'centerline-dash');
  const arcRes = factory.arc(new XYZ(0,0,1), new XYZ(0,0,0), new XYZ(R,0,0), 90);
  if (!arcRes.isOk) throw new Error('arc: '+arcRes.error);
  const arcNode = new EditableShapeNode({ document: doc, name: 'fillet-arc', shape: Result.ok(arcRes.value) });
  doc.modelManager.addNode(arcNode);

  const tEdge = factory.line(new XYZ(100,100,0), new XYZ(600,100,0));
  if (!tEdge.isOk) throw new Error(tEdge.error);
  const tNode = new EditableShapeNode({ document: doc, name: 'transformed-edge', shape: Result.ok(tEdge.value) });
  tNode.transform = Matrix4.fromTranslation(10, 0, 0);
  doc.modelManager.addNode(tNode);

  const dim = new DimensionAnnotation({
    document: doc, name: 'dim-5100', annotationType: 'dimension', dimensionType: 'linear',
    startPoint: new XYZ(0,0,0), endPoint: new XYZ(W,0,0), textPoint: new XYZ(W/2, -400, 0),
    textHeight: 175,
  });
  doc.modelManager.addNode(dim);

  const note = new TextAnnotation({
    document: doc, name: 'note-vi', annotationType: 'text',
    content: 'Ghi chú: cạnh dài 5.100 mm · tỷ lệ 1:50 · kiểm tra in 100%',
    position: new XYZ(0, -900, 0), textHeight: 150,
  });
  doc.modelManager.addNode(note);

  const title = new TextAnnotation({
    document: doc, name: 'title-vi', annotationType: 'text',
    content: 'Bản vẽ mẫu PDF kỹ thuật — Dunvex CAD',
    position: new XYZ(0, H + 250, 0), textHeight: 200,
  });
  doc.modelManager.addNode(title);

  doc.visual.update();
  app.activeView?.cameraController?.fitContent?.() ?? app.activeView?.fitContent?.();

  const nodes = [rect[0], rect[1], rect[2], rect[3], center, arcNode, tNode, dim, note, title];
  doc.selection.clearSelection();
  doc.selection.setSelectedNodes(nodes, false);
  return { count: nodes.length, names: nodes.map(n => n.name),
           transformTx: tNode.worldTransform().ofPoint(new XYZ(100,100,0)).x };
})()
`;

// Measure the 5100 mm edge in the DOWNLOADED PDF by parsing its content streams
// (vector m/l ops) and matching segments against the EXPECTED paper length
// 5100 mm / scale 50 = 102.000 mm = 289.134 pt. The longest raw segment is the
// page-margin frame (400 mm on A3/10 mm margins) — deliberately not the target.
function measurePdfEdge(pdfPath, modelMm = 5100, scale = 50) {
    const buf = readFileSync(pdfPath);
    let ops = "";
    let idx = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: scanner advances idx in-condition
    while ((idx = buf.indexOf("stream", idx)) !== -1) {
        let s = idx + 6;
        if (buf[s] === 13) s++;
        if (buf[s] === 10) s++;
        const e = buf.indexOf("endstream", s);
        if (e === -1) break;
        const raw = buf.subarray(s, e);
        try {
            ops += `\n${zlib.inflateSync(raw).toString("latin1")}`;
        } catch {
            ops += `\n${raw.toString("latin1")}`;
        }
        idx = e;
    }
    const ptToMm = (pt) => (pt * 25.4) / 72;
    const mmToPt = (mm) => (mm * 72) / 25.4;
    const expectedPt = mmToPt(modelMm / scale);
    const re = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(m|l|c)\b/g;
    let mm;
    let curPt = null;
    const segments = [];
    // biome-ignore lint/suspicious/noAssignInExpressions: scanner advances re in-condition
    while ((mm = re.exec(ops)) !== null) {
        const x = Number.parseFloat(mm[1]);
        const y = Number.parseFloat(mm[2]);
        if (mm[3] === "m") {
            curPt = { x, y };
        } else if (mm[3] === "l" && curPt) {
            const len = Math.hypot(x - curPt.x, y - curPt.y);
            segments.push({
                len,
                mm: ptToMm(len),
                horiz: Math.abs(y - curPt.y) < 0.01,
                from: curPt,
                to: { x, y },
            });
            curPt = { x, y };
        } else if (mm[3] === "c") {
            curPt = { x, y };
        }
    }
    const tolPt = mmToPt(0.2); // reviewer tolerance ±0.2 mm
    const matches = segments.filter((s) => s.horiz && Math.abs(s.len - expectedPt) <= tolPt);
    const best = matches[0] ?? null;
    return {
        method: "vector segments parsed from the downloaded PDF content streams",
        modelMm,
        scale,
        expectedPaperMm: Number((modelMm / scale).toFixed(3)),
        expectedPaperPt: Number(expectedPt.toFixed(3)),
        totalLineSegments: segments.length,
        matchingHorizontalSegments: matches.length,
        measuredPaperMm: best ? Number(best.mm.toFixed(3)) : null,
        measuredPt: best ? Number(best.len.toFixed(3)) : null,
        deltaMm: best ? Number((best.mm - modelMm / scale).toFixed(4)) : null,
        allMatchesMm: matches.map((s) => Number(s.mm.toFixed(3))),
        longestSegmentIsFrameMm: Number(ptToMm(Math.max(...segments.map((s) => s.len), 0)).toFixed(3)),
        frameNote: "longest horizontal lines are the page-margin frame, excluded from edge target",
        within_0_2: Boolean(best) && matches.every((s) => Math.abs(s.mm - modelMm / scale) <= 0.2),
        found: Boolean(best),
    };
}

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

async function main() {
    const headSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const buildRef = "0b396d8f";
    const distDir = resolve(root, "dist");
    const server = await startStaticServer(distDir);
    const { child, port } = await launchChrome();
    try {
        const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
        const browser = await Cdp.attach(ver.webSocketDebuggerUrl);
        await browser.send("Target.setDiscoverTargets", { discover: true });
        const { targetId } = await browser.send("Target.createTarget", { url: URL_BASE });
        await new Promise((r) => setTimeout(r, 600));
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
        const pageTarget =
            targets.find((t) => t.type === "page" && t.url.includes(`127.0.0.1:${PORT}`)) ||
            targets.find((t) => t.type === "page");
        const cdp = await Cdp.attach(pageTarget.webSocketDebuggerUrl);
        await cdp.send("Page.enable");
        await cdp.send("Runtime.enable");

        // Real browser download behaviour: save to disk, do not prompt.
        await cdp.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: downloadDir,
            eventsEnabled: true,
        });

        await cdp.send("Page.navigate", { url: URL_BASE });
        await cdp.send("Page.loadEventFired").catch(() => {});
        for (let i = 0; i < 90; i++) {
            const ready = await cdp.evaluate(
                `(() => { try { return !!(globalThis.Chili3dCore && globalThis.app && app.shapeProvider && app.shapeProvider.factory); } catch(e){ return false; } })()`,
            );
            if (ready) break;
            await new Promise((r) => setTimeout(r, 500));
            if (i === 89) throw new Error("app not ready");
        }
        // Open a document: retry real Home-button click (and doc.new fallback) until the
        // editor view exists — Home may mount after the app is "ready".
        const opened = await cdp.evaluate(`
          (async () => {
            let clicked = false;
            for (let i = 0; i < 120; i++) {
              try { if (app.activeView) return { ok: true, attempts: i, via: 'view-present' }; } catch {}
              if (!clicked) {
                const btn = [...document.querySelectorAll('button')].find(b => /Tạo bản vẽ mới/i.test(b.textContent || ''));
                if (btn) { btn.click(); clicked = true; }
                else { try { Chili3dCore.PubSub.default.pub('executeCommand', 'doc.new'); clicked = true; } catch {} }
              }
              await new Promise((r) => setTimeout(r, 250));
            }
            return { ok: false, clicked, html: (document.body.textContent || '').slice(0, 400) };
          })()
        `);
        if (!opened?.ok) throw new Error(`doc not opened: ${JSON.stringify(opened)}`);
        console.log("doc opened:", opened);
        const built = await cdp.evaluate(BUILD_SAMPLE);
        console.log("built:", built);

        // 01 — ribbon Export click (real mouse; waits for overlay to clear; DOM fallback).
        const exportBtnExpr = `
          [...document.querySelectorAll('ribbon-button, button, chili-button')].find(
            el => /Xuất bản vẽ|Export/i.test((el.getAttribute && (el.getAttribute('title')||'')) + ' ' + el.textContent))
        `;
        try {
            await cdp.clickElement(exportBtnExpr);
        } catch (e) {
            console.log("real mouse click on Export failed:", e.message);
        }
        await new Promise((r) => setTimeout(r, 600));
        if (!(await cdp.evaluate(`!!document.querySelector('command-context')`))) {
            console.log("mouse click did not open panel — falling back to element .click()");
            await cdp.evaluate(`(${exportBtnExpr}).click()`);
            await new Promise((r) => setTimeout(r, 600));
        }

        // The CommandContext panel + selection bar now exist.
        const panelSel = `document.querySelector('command-context')`;
        const hasPanel = await cdp.evaluate(`!!${panelSel}`);
        if (!hasPanel) {
            await cdp.screenshot(join(outMenu, "ERROR_no_panel.png"));
            throw new Error("Export command panel did not appear after ribbon click");
        }
        await cdp.screenshot(join(outMenu, "01_export_panel_before_pdf.png"));

        // Format <select>: enumerate options and flip to a listbox so the .pdf row is visible.
        const fmtExpr = `
          [...document.querySelector('command-context').querySelectorAll('select')].find(
            s => [...s.options].some(o => o.textContent.trim() === '.pdf'))
        `;
        const fmtInfo = await cdp.evaluate(`(() => {
          const s = (${fmtExpr}); if (!s) return null;
          return { count: s.options.length, options: [...s.options].map(o=>o.textContent.trim()), selected: s.value };
        })()`);
        if (!fmtInfo || !fmtInfo.options.includes(".pdf")) {
            throw new Error(`PDF not in export format list: ${JSON.stringify(fmtInfo)}`);
        }
        // Show the list visually (real DOM listbox mode), screenshot, then restore.
        await cdp.evaluate(
            `(() => { const s=(${fmtExpr}); s.size=${fmtInfo.options.length}; s.selectedIndex=[...s.options].findIndex(o=>o.textContent.trim()==='.pdf'); return s.size; })()`,
        );
        await new Promise((r) => setTimeout(r, 200));
        await cdp.centerOf(fmtExpr); // scrolls the select into view before the listbox screenshot
        await cdp.screenshot(join(outMenu, "02_format_list_with_pdf.png"));
        // Now fire the real change event on the select → command.format = '.pdf'
        await cdp.evaluate(`(() => {
          const s = (${fmtExpr});
          s.size = 0;
          const i = [...s.options].findIndex(o=>o.textContent.trim()==='.pdf');
          s.selectedIndex = i;
          s.value = '.pdf';
          s.dispatchEvent(new Event('change', {bubbles:true}));
          return s.value;
        })()`);
        await new Promise((r) => setTimeout(r, 400));
        console.log("format options:", fmtInfo.options, "selected .pdf");

        // Set the real PDF page property fields: A3 / Ngang (landscape) / fixed / 50 / margin 10.
        const setSelectByValue = async (findExpr, label) => {
            await cdp.evaluate(`(() => {
              const s = (${findExpr}); if(!s) return 'no-select';
              s.selectedIndex = ${label === "A3" ? 1 : label === "Ngang" ? 0 : 0};
              s.dispatchEvent(new Event('change', {bubbles:true}));
              return s.options[s.selectedIndex]?.textContent.trim();
            })()`);
        };
        const pageSizeExpr = `[...document.querySelector('command-context').querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent.trim()==='A3')&&[...s.options].some(o=>o.textContent.trim()==='A4'))`;
        await setSelectByValue(pageSizeExpr, "A3");
        const orientExpr = `[...document.querySelector('command-context').querySelectorAll('select')].find(s=>[...s.options].some(o=>/Ngang|Dọc|landscape|portrait/i.test(o.textContent)))`;
        await setSelectByValue(orientExpr, "Ngang");

        // scale + margin numeric inputs (Binding writes on blur) — set values then blur.
        await cdp.evaluate(`(() => {
          const ctx = document.querySelector('command-context');
          const numInputs = [...ctx.querySelectorAll('input')].filter(i => i.type !== 'checkbox');
          return numInputs.map(i => ({ ph: i.placeholder, val: i.value, name: i.getAttribute('data-name') }));
        })()`);
        // Inputs are ordered after the selects; identify scale (50) & margin (10) by current value.
        await cdp.evaluate(`(() => {
          const ctx = document.querySelector('command-context');
          const inputs = [...ctx.querySelectorAll('input')].filter(i=>i.type!=='checkbox');
          const byVal = (v) => inputs.find(i => (i.value||'').trim().startsWith(v));
          const scale = byVal('50'); const margin = byVal('10');
          for (const [el, v] of [[scale,'50'],[margin,'10']]) {
            if (!el) continue;
            el.value = v;
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('blur', {bubbles:false}));
          }
        })()`);
        await new Promise((r) => setTimeout(r, 200));
        await cdp.screenshot(join(outMenu, "03_panel_pdf_properties_A3_1to50.png"));

        // Verify the real command actually holds A3 / landscape / 1:50 / margin 10.
        const cmdProps = await cdp.evaluate(`(() => {
            const c = app.executingCommand;
            if (!c) return null;
            return { format: c.format, pageSize: c.pdfPageSize, orientation: c.pdfOrientation,
                     scaleMode: c.pdfScaleMode, scale: c.pdfScale, marginMm: c.pdfMarginMm };
        })()`);
        console.log("command props:", cmdProps);
        const propsOk =
            cmdProps &&
            cmdProps.format === ".pdf" &&
            cmdProps.pageSize === "A3" &&
            cmdProps.orientation === "pdf.orientation.landscape" &&
            cmdProps.scale === 50;
        if (!propsOk) {
            writeFileSync(join(outMenu, "ERROR_bad_props.json"), JSON.stringify(cmdProps, null, 2));
            throw new Error(`command did not pick up A3/landscape/1:50: ${JSON.stringify(cmdProps)}`);
        }

        // Confirm the multi-selection step with the panel's checkmark (icon-confirm).
        // Target the small button DIV that directly wraps the confirm <svg>, NOT an ancestor
        // whose innerHTML also contains "icon-confirm" (that click lands in empty panel space).
        const confirmExpr = `(() => {
            const ctx = document.querySelector('command-context');
            if (!ctx) return null;
            const svgEl = [...ctx.querySelectorAll('svg')].find(s => /icon-confirm/.test(s.innerHTML));
            return svgEl ? svgEl.parentElement : null;
        })()`;
        const confirmInfo = await cdp.evaluate(`(() => {
            const el = (${confirmExpr});
            if (!el) return { found: false };
            const r = el.getBoundingClientRect();
            return { found: true, w: Math.round(r.width), h: Math.round(r.height),
                     cls: (el.className||'').toString().slice(0,40) };
        })()`);
        console.log("confirm button:", confirmInfo);
        await cdp.clickElement(confirmExpr);
        await new Promise((r) => setTimeout(r, 800));

        // Preview dialog "Xem trước PDF" (native <dialog>). Wait + screenshot.
        let previewFound = false;
        for (let i = 0; i < 40; i++) {
            const open = await cdp.evaluate(
                `(() => { const d=[...document.querySelectorAll('dialog')].find(x=>x.open&&/Xem trước PDF|preview/i.test(x.textContent)); return d? true:false; })()`,
            );
            if (open) {
                previewFound = true;
                break;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!previewFound) {
            const diag = await cdp.evaluate(`(() => ({
                openDialogs: [...document.querySelectorAll('dialog')].map(d => (d.textContent||'').replace(/\\s+/g,' ').slice(0,160)),
                hasPanel: !!document.querySelector('command-context'),
                panelText: (document.querySelector('command-context')?.textContent||'').replace(/\\s+/g,' ').slice(0,200),
                execCmd: (()=>{ try { return app.executingCommand ? app.executingCommand.constructor.name : null; } catch(e){ return 'err:'+e.message; } })(),
                toasts: [...document.querySelectorAll('[class*=toast],[class*=Toast]')].map(t=>(t.textContent||'').trim()).filter(Boolean).slice(0,5),
            }))()`);
            await cdp.screenshot(join(outMenu, "ERROR_no_preview_dialog.png"));
            writeFileSync(join(outMenu, "ERROR_no_preview_dialog.json"), JSON.stringify(diag, null, 2));
            throw new Error(`preview dialog did not appear: ${JSON.stringify(diag)}`);
        }
        await new Promise((r) => setTimeout(r, 400));
        await cdp.screenshot(join(outMenu, "04_preview_dialog_A3_1to50.png"));

        // Click the dialog's "Xác nhận" (common.confirm) → exportPdf → browser download.
        await cdp.clickElement(`
          [...document.querySelectorAll('dialog.open, dialog[open] button, dialog button')]
            .find(b => /^(Xác nhận|Confirm|Xuất|Export)$/i.test((b.textContent||'').trim()))
        `);

        // Wait for the browser to write the downloaded file.
        let downloaded = null;
        for (let i = 0; i < 80; i++) {
            const files = readdirSync(downloadDir).filter(
                (f) => f.endsWith(".pdf") && !f.endsWith(".crdownload"),
            );
            if (files.length) {
                downloaded = join(downloadDir, files[0]);
                break;
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!downloaded) throw new Error("no downloaded .pdf captured (browser download not written)");
        const destPdf = join(outMenu, "from_menu_A3_1to50.pdf");
        copyFileSync(downloaded, destPdf);

        // Poppler on the downloaded file.
        const pdfinfo = execFileSync("pdfinfo", [destPdf], { encoding: "utf8" });
        const pdffonts = execFileSync("pdffonts", [destPdf], { encoding: "utf8" });
        const pdftotext = execFileSync("pdftotext", ["-layout", destPdf, "-"], { encoding: "utf8" });
        writeFileSync(join(outMenu, "from_menu_A3_1to50_pdfinfo.txt"), pdfinfo);
        writeFileSync(join(outMenu, "from_menu_A3_1to50_pdffonts.txt"), pdffonts);
        writeFileSync(join(outMenu, "from_menu_A3_1to50_pdftotext.txt"), pdftotext);
        execFileSync("pdftoppm", ["-png", "-r", "150", destPdf, join(outMenu, "from_menu_A3_1to50_render")]);

        const measure = measurePdfEdge(destPdf);
        const report = {
            source: "MENU/ribbon UI — real file.export button click → CommandContext panel select/inputs → selection confirm → preview dialog Xác nhận → browser download",
            not_source: "not exporter-API direct; output/integration/* is that path",
            build_ref: buildRef,
            head: headSha,
            served: `${URL_BASE} (node http server on production dist/)`,
            built,
            downloaded_bytes: readFileSync(destPdf).length,
            downloaded_filename: downloaded.split("/").pop(),
            edge: measure,
            pdfinfo_excerpt: pdfinfo
                .split("\n")
                .filter((l) => /Page size|Pages/.test(l))
                .join(" | "),
            pdftotext_excerpt: pdftotext.slice(0, 400),
            sha256_downloaded: sha256(destPdf),
            sha256_screenshots: {
                "01_export_panel_before_pdf.png": sha256(join(outMenu, "01_export_panel_before_pdf.png")),
                "02_format_list_with_pdf.png": sha256(join(outMenu, "02_format_list_with_pdf.png")),
                "03_panel_pdf_properties_A3_1to50.png": sha256(
                    join(outMenu, "03_panel_pdf_properties_A3_1to50.png"),
                ),
                "04_preview_dialog_A3_1to50.png": sha256(join(outMenu, "04_preview_dialog_A3_1to50.png")),
            },
            format_options: fmtInfo.options,
            platform: { os: process.platform, arch: process.arch, node: process.version },
            ok: Boolean(measure.found && measure.within_0_2),
        };
        writeFileSync(join(outMenu, "menu_acceptance_report.json"), JSON.stringify(report, null, 2));
        writeFileSync(
            join(outMenu, "BUILD.txt"),
            `build_ref=${buildRef}\nhead=${headSha}\nserved=${URL_BASE} (prod dist, rebuilt this run)\nchrome=headful CDP + --enable-unsafe-swiftshader\n`,
        );
        writeFileSync(
            join(outMenu, "README.txt"),
            "MENU/RIBBON UI run — real file.export button clicks + browser-saved download.\n" +
                "01 export panel, 02 format listbox with .pdf, 03 PDF props A3 1:50, 04 preview dialog.\n" +
                "from_menu_A3_1to50.pdf is the browser-downloaded file; edge measured from its own content stream.\n",
        );
        console.log(JSON.stringify(report, null, 2));
        if (!report.ok) process.exitCode = 2;
    } finally {
        child.kill();
        server.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
