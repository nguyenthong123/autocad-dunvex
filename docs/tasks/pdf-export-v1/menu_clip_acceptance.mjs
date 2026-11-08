#!/usr/bin/env node
/**
 * MENU clip-flow acceptance (companion of menu_ui_acceptance.mjs).
 *
 * Same build/Chrome/static-server approach, but drives the CLIP path through the real
 * menu: ribbon Xuất bản vẽ → panel .pdf → A4 / Ngang / fixed / 1:15 (content wider than
 * the printable frame) → ✓ selection → preview dialog shows "Nội dung vượt khổ — thừa"
 * with buttons "Xuất (cắt mép)" / "Hủy bỏ".
 *
 * Phase 1 (cancel): click Hủy bỏ — assert ZERO browser downloads (Page.downloadWillBegin
 * event count + download dir file count before/after).
 * Phase 2 (confirm): re-run the same real menu flow and click "Xuất (cắt mép)" — the
 * BROWSER saves the clip PDF; we then measure its content stream to prove the full
 * 340 mm paper edge (5100 @ 1:15) is ABSENT (clipped) and the frame/preview agree.
 *
 * Usage:  node docs/tasks/pdf-export-v1/menu_clip_acceptance.mjs
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
for (const f of readdirSync(downloadDir)) {
    const p = join(downloadDir, f);
    if (statSync(p).isFile()) {
        try {
            unlinkSync(p);
        } catch {}
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
};

function startStaticServer(distDir) {
    const server = createServer((req, res) => {
        let path = decodeURIComponent(req.url.split("?")[0]);
        if (path === "/") path = "/index.html";
        const file = resolve(distDir, `.${path}`);
        if (!existsSync(file) || statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end("not found");
            return;
        }
        res.writeHead(200, {
            "Content-Type": MIME[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream",
        });
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
    async clickElement(jsExpr) {
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
                return { x, y, hit };
            })()`);
            if (pt?.hit) break;
            await new Promise((r) => setTimeout(r, 200));
        }
        if (!pt) throw new Error(`element not found/clickable: ${jsExpr}`);
        await this.clickPoint(pt.x, pt.y);
        return pt;
    }
    async screenshot(path) {
        const { data } = await this.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(path, Buffer.from(data, "base64"));
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
    const port = 9232;
    // Never attach to a stale daemon from a previous (or other agent's) run: if the port
    // answers before we spawn, the runner is dead-set on contamination — refuse, after a
    // targeted kill of OUR old debug instances (user-data-dir filter, not all Chrome).
    const stale = await fetch(`http://127.0.0.1:${port}/json/version`)
        .then((r) => r.ok)
        .catch(() => false);
    if (stale) throw new Error(`CDP port ${port} already answered — kill stale debug Chrome first`);
    const userData = join(process.env.TMPDIR || "/tmp", `chili-pdf-clip-${Date.now()}`);
    mkdirSync(userData, { recursive: true });
    const child = spawn(
        chrome,
        [
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
            if (ver.Browser && /Chrome\//.test(ver.Browser)) return { child, port };
        } catch {}
        await sleep(250);
    }
    child.kill();
    throw new Error("Chrome CDP not ready");
}

// Identical real sample as the accepted runs (10 nodes; edge-bottom-5100 = 5100 mm).
const BUILD_SAMPLE = readFileSync(resolve(__dirname, "menu_ui_acceptance.mjs"), "utf8").match(
    /const BUILD_SAMPLE = `\n([\s\S]*?)\n`;/,
)[1];

const EXPORT_OPTIONS = { pageSize: "A4", landscape: true, scale: 15 };

// Walk m/l/c segments of every Flate stream in the PDF; report paper-mm lengths.
function pdfSegments(pdfPath) {
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
    const re = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(m|l|c)\b/g;
    let mm;
    let cur = null;
    const segs = [];
    // biome-ignore lint/suspicious/noAssignInExpressions: scanner advances re in-condition
    while ((mm = re.exec(ops)) !== null) {
        const x = Number.parseFloat(mm[1]);
        const y = Number.parseFloat(mm[2]);
        if (mm[3] === "m") cur = { x, y };
        else if (mm[3] === "l" && cur) {
            segs.push({
                len: Math.hypot(x - cur.x, y - cur.y),
                horiz: Math.abs(y - cur.y) < 0.01,
                from: cur,
                to: { x, y },
            });
            cur = { x, y };
        } else if (mm[3] === "c") cur = { x, y };
    }
    return segs.map((s) => ({ ...s, mmPaper: (s.len * 25.4) / 72 }));
}

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pdfFiles = () =>
    readdirSync(downloadDir).filter((f) => f.endsWith(".pdf") && !f.endsWith(".crdownload"));

// Decode every Flate stream and find clip paths: `x y m (x y l){1,3} h W n`
// (writer emits moveTo + lineTo x3 + closePath + clip + endPath). Operators h/W/n
// carry NO operands, so tokenize them standalone on a whitespace-flattened stream.
// Returns rect(s) in mm.
function pdfClipRectsMm(pdfPath) {
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
    const flat = ops.replace(/\s+/g, " ");
    const re = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(m|l)\b|(?<![\w.])(h|W|n)(?![\w.])/g;
    let mm2;
    let pts = [];
    const rects = [];
    // biome-ignore lint/suspicious/noAssignInExpressions: scanner advances re in-condition
    while ((mm2 = re.exec(flat)) !== null) {
        if (mm2[3]) {
            const x = Number.parseFloat(mm2[1]);
            const y = Number.parseFloat(mm2[2]);
            if (mm2[3] === "m") pts = [{ x, y }];
            else if (mm2[3] === "l") pts.push({ x, y });
        } else if (mm2[4] === "W") {
            if (pts.length >= 4) {
                const xs = pts.map((p) => p.x);
                const ys = pts.map((p) => p.y);
                rects.push({
                    xMm: Number(((Math.min(...xs) * 25.4) / 72).toFixed(3)),
                    yMm: Number(((Math.min(...ys) * 25.4) / 72).toFixed(3)),
                    wMm: Number((((Math.max(...xs) - Math.min(...xs)) * 25.4) / 72).toFixed(3)),
                    hMm: Number((((Math.max(...ys) - Math.min(...ys)) * 25.4) / 72).toFixed(3)),
                });
            }
            pts = [];
        } else if (mm2[4] === "n") {
            pts = [];
        }
    }
    return rects;
}

// Visible (post-clip) length of a horizontal segment against a clip rect (all in pt).
function visibleLengthMm(seg, rectPt) {
    if (!seg.horiz) return null;
    const x1 = Math.min(seg.from.x, seg.to.x);
    const x2 = Math.max(seg.from.x, seg.to.x);
    const vis = Math.max(0, Math.min(x2, rectPt.x + rectPt.w) - Math.max(x1, rectPt.x));
    return Number(((vis * 25.4) / 72).toFixed(3));
}

/** Drive the real menu once: ribbon Export → panel fields (A4/Ngang/fixed/15) → ✓.
 *  Resolves after the preview dialog is open. */
async function driveExportToDialog(cdp, log) {
    const exportBtnExpr = `[...document.querySelectorAll('ribbon-button')].find(el => /Xuất bản vẽ|Export/i.test((el.getAttribute('title')||'') + ' ' + el.textContent))`;
    try {
        await cdp.clickElement(exportBtnExpr);
    } catch (e) {
        log.push(`ribbon mouse click failed (${e.message}) — DOM click fallback`);
        await cdp.evaluate(`(${exportBtnExpr}).click()`);
    }
    await sleep(500);
    if (!(await cdp.evaluate(`!!document.querySelector('command-context')`))) {
        log.push("panel missing after mouse click — DOM click fallback");
        await cdp.evaluate(`(${exportBtnExpr}).click()`);
        await sleep(500);
    }

    const fmtExpr = `[...document.querySelector('command-context').querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent.trim()==='.pdf'))`;
    await cdp.evaluate(
        `(() => { const s=(${fmtExpr}); s.selectedIndex=[...s.options].findIndex(o=>o.textContent.trim()==='.pdf'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );
    await sleep(300);

    const pageSizeExpr = `[...document.querySelector('command-context').querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent.trim()==='A3')&&[...s.options].some(o=>o.textContent.trim()==='A4'))`;
    await cdp.evaluate(
        `(() => { const s=(${pageSizeExpr}); s.selectedIndex=[...s.options].findIndex(o=>o.textContent.trim()==='A4'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );

    const orientExpr = `[...document.querySelector('command-context').querySelectorAll('select')].find(s=>[...s.options].some(o=>/Ngang/.test(o.textContent)))`;
    await cdp.evaluate(
        `(() => { const s=(${orientExpr}); s.selectedIndex=[...s.options].findIndex(o=>o.textContent.trim()==='Ngang'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );

    const modeExpr = `[...document.querySelector('command-context').querySelectorAll('select')].find(s=>[...s.options].some(o=>/cố định/.test(o.textContent)))`;
    await cdp.evaluate(
        `(() => { const s=(${modeExpr}); s.selectedIndex=[...s.options].findIndex(o=>/cố định/.test(o.textContent)); s.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );

    // Tỷ lệ 1:n input: real click to focus, real keys (Ctrl+A, type 15, Enter blurs).
    const scaleBox = await cdp.evaluate(`(() => {
        const items=[...document.querySelectorAll('command-context div')];
        const row=items.find(d=>d.querySelector('label')&&/Tỷ lệ 1:n/.test(d.querySelector('label').textContent)&&d.querySelector('input'));
        if(!row) return null; const i=row.querySelector('input'); i.focus(); i.select();
        const r=i.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 };
    })()`);
    if (!scaleBox) throw new Error("scale input not found");
    await cdp.send("Input.insertText", { text: "15" });
    await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
    });
    await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
    });
    await sleep(200);

    const props = await cdp.evaluate(
        `(() => { const c=app.executingCommand; return c && { format:c.format, pageSize:c.pdfPageSize, orientation:c.pdfOrientation, scaleMode:c.pdfScaleMode, scale:c.pdfScale, marginMm:c.pdfMarginMm }; })()`,
    );
    log.push(`command props before confirm: ${JSON.stringify(props)}`);
    if (
        !props ||
        props.format !== ".pdf" ||
        props.pageSize !== "A4" ||
        props.scale !== 15 ||
        props.scaleMode !== "pdf.scaleMode.fixed"
    ) {
        throw new Error(`panel did not commit A4/fixed/15 to the command: ${JSON.stringify(props)}`);
    }

    const confirmExpr = `(() => { const ctx=document.querySelector('command-context'); if(!ctx) return null; const s=[...ctx.querySelectorAll('svg')].find(x=>/icon-confirm/.test(x.innerHTML)); return s?s.parentElement:null; })()`;
    await cdp.clickElement(confirmExpr);
    await sleep(600);

    for (let i = 0; i < 40; i++) {
        const open = await cdp.evaluate(
            `(() => { const d=[...document.querySelectorAll('dialog')].find(x=>x.open&&/Xem trước PDF/.test(x.textContent)); return d?true:false; })()`,
        );
        if (open) return props;
        await sleep(250);
    }
    throw new Error("preview dialog did not appear after confirm click");
}

async function dialogText(cdp) {
    return cdp.evaluate(
        `(() => { const d=[...document.querySelectorAll('dialog')].find(x=>x.open&&/Xem trước PDF/.test(x.textContent)); return d?(d.textContent||'').replace(/\\s+/g,' ').trim():null; })()`,
    );
}

async function main() {
    const headSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const log = [];
    const server = await startStaticServer(resolve(root, "dist"));
    const { child, port } = await launchChrome();
    const evidence = {
        source: "MENU/ribbon UI — real clicks; clip flow A4 fixed 1:15 (oversize) on build 0b396d8f",
        build_ref: "0b396d8f",
        head: headSha,
        served: `${URL_BASE} (node http server on production dist/)`,
        options: EXPORT_OPTIONS,
    };
    try {
        const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
        const browser = await Cdp.attach(ver.webSocketDebuggerUrl);
        await browser.send("Target.setDiscoverTargets", { discover: true });
        await browser.send("Target.createTarget", { url: URL_BASE });
        await sleep(600);
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
        const pageTarget =
            targets.find((t) => t.type === "page" && t.url.includes(`127.0.0.1:${PORT}`)) ||
            targets.find((t) => t.type === "page");
        const cdp = await Cdp.attach(pageTarget.webSocketDebuggerUrl);
        await cdp.send("Page.enable");
        await cdp.send("Runtime.enable");
        await cdp.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: downloadDir,
            eventsEnabled: true,
        });
        let downloadEvents = [];
        cdp.on("Page.downloadWillBegin", (p) =>
            downloadEvents.push({ url: p.url, suggestedFilename: p.suggestedFilename }),
        );

        await cdp.send("Page.navigate", { url: URL_BASE });
        await cdp.send("Page.loadEventFired").catch(() => {});
        for (let i = 0; i < 90; i++) {
            const ready = await cdp.evaluate(
                `(() => { try { return !!(globalThis.Chili3dCore && globalThis.app && app.shapeProvider && app.shapeProvider.factory); } catch(e){ return false; } })()`,
            );
            if (ready) break;
            await sleep(500);
            if (i === 89) throw new Error("app not ready");
        }
        const opened = await cdp.evaluate(`
          (async () => {
            let pubbed = false, clicks = 0;
            for (let i = 0; i < 120; i++) {
              try { if (app.activeView) return { ok: true, attempts: i, clicks }; } catch {}
              const btn = [...document.querySelectorAll('button')].find(b => /Tạo bản vẽ mới/i.test(b.textContent || ''));
              if (btn && clicks < 3) { btn.click(); clicks++; }
              else if (!btn && !pubbed) {
                // Before Home mounts the pub can land with no subscriber yet — one early try only.
                try { Chili3dCore.PubSub.default.pub('executeCommand', 'doc.new'); pubbed = true; } catch {}
              }
              await new Promise(r => setTimeout(r, 250));
            }
            return { ok: false, clicks, html: (document.body.textContent || '').slice(0, 200) };
          })()
        `);
        if (!opened?.ok) throw new Error("doc not opened");
        evidence.opened = opened;

        const built = await cdp.evaluate(BUILD_SAMPLE);
        evidence.built = built;
        console.log("built:", built.count, "nodes");

        // ---------- Phase 1: dialog → Hủy bỏ → assert NO download ----------
        evidence.props_phase1 = await driveExportToDialog(cdp, log);
        const dialog1 = await dialogText(cdp);
        evidence.dialog_text_phase1 = dialog1;
        if (!/Nội dung vượt khổ/.test(dialog1)) throw new Error(`clip warning missing in dialog: ${dialog1}`);
        const excessMatch = dialog1.match(/thừa:?\s*([\d.,]+)\s*[×x]\s*([\d.,]+)/);
        evidence.dialog_clip_excess_mm = excessMatch
            ? { x: Number(excessMatch[1].replace(",", ".")), y: Number(excessMatch[2].replace(",", ".")) }
            : null;
        const buttons1 = await cdp.evaluate(
            `(() => { const d=[...document.querySelectorAll('dialog')].find(x=>x.open&&/Xem trước PDF/.test(x.textContent)); return [...d.querySelectorAll('button')].map(b=>b.textContent.trim()); })()`,
        );
        evidence.dialog_buttons_phase1 = buttons1;
        await cdp.screenshot(join(outMenu, "05_clip_dialog_A4_1to15_before_cancel.png"));

        const filesBeforeCancel = pdfFiles().length;
        downloadEvents = [];
        await cdp.clickElement(
            `[...document.querySelectorAll('dialog')].find(x=>x.open&&/Xem trước PDF/.test(x.textContent)) ? [...document.querySelectorAll('dialog button')].find(b=>/^(Hủy bỏ|Hủy|Cancel)$/i.test(b.textContent.trim())) : null`,
        );
        await sleep(3000);
        const filesAfterCancel = pdfFiles().length;
        evidence.cancel_phase = {
            files_before: filesBeforeCancel,
            files_after: filesAfterCancel,
            downloadWillBegin_events: downloadEvents.length,
            noDownload: filesAfterCancel === filesBeforeCancel && downloadEvents.length === 0,
        };
        if (!evidence.cancel_phase.noDownload)
            throw new Error(`HỦY produced a download: ${JSON.stringify(evidence.cancel_phase)}`);
        console.log("cancel phase:", JSON.stringify(evidence.cancel_phase));

        // ---------- Phase 2: same real flow → "Xuất (cắt mép)" → browser download ----------
        downloadEvents = [];
        evidence.props_phase2 = await driveExportToDialog(cdp, log);
        const dialog2 = await dialogText(cdp);
        if (!/Nội dung vượt khổ/.test(dialog2)) throw new Error("clip warning missing in 2nd dialog");
        await cdp.screenshot(join(outMenu, "06_clip_dialog_A4_1to15_before_export_clip.png"));
        await cdp.clickElement(
            `(() => { const d=[...document.querySelectorAll('dialog')].find(x=>x.open&&/Xem trước PDF/.test(x.textContent)); return d?[...d.querySelectorAll('button')].find(b=>/Xuất \\(cắt mép\\)/.test(b.textContent.trim())):null; })()`,
        );

        let downloaded = null;
        for (let i = 0; i < 80; i++) {
            const files = pdfFiles();
            if (files.length) {
                downloaded = join(downloadDir, files[0]);
                break;
            }
            await sleep(250);
        }
        if (!downloaded) throw new Error("browser never wrote the clip pdf");
        evidence.confirm_phase = {
            downloadWillBegin_events: downloadEvents.map((e) => e.suggestedFilename),
            downloaded_filename: downloaded.split("/").pop(),
        };

        const destPdf = join(outMenu, "from_menu_A4_1to15_CLIP.pdf");
        copyFileSync(downloaded, destPdf);
        const pdfinfo = execFileSync("pdfinfo", [destPdf], { encoding: "utf8" });
        const pdffonts = execFileSync("pdffonts", [destPdf], { encoding: "utf8" });
        const pdftotext = execFileSync("pdftotext", ["-layout", destPdf, "-"], { encoding: "utf8" });
        writeFileSync(join(outMenu, "from_menu_A4_1to15_CLIP_pdfinfo.txt"), pdfinfo);
        writeFileSync(join(outMenu, "from_menu_A4_1to15_CLIP_pdffonts.txt"), pdffonts);
        writeFileSync(join(outMenu, "from_menu_A4_1to15_CLIP_pdftotext.txt"), pdftotext);
        execFileSync("pdftoppm", [
            "-png",
            "-r",
            "150",
            destPdf,
            join(outMenu, "from_menu_A4_1to15_CLIP_render"),
        ]);

        // ---------- Prove the clip: writer KEEPS full coordinates but installs a clip
        // rect equal to the printable frame; rendered/visible length is frame-cut. ----------
        const segs = pdfSegments(destPdf);
        const clipRects = pdfClipRectsMm(destPdf);
        const integrationClipPath = resolve(__dirname, "output/integration/from_ui_A4_1to15_CLIP.pdf");
        const integrationRects = pdfClipRectsMm(integrationClipPath);
        const tolMm = 0.5;
        const fullEdgeMm = 5100 / 15; // 340 mm paper if unclipped
        const near = (v) => (s) => Math.abs(s.mmPaper - v) <= tolMm;
        const horiz = (s) => s.horiz;
        const expectedRect = { x: 10, y: 10, w: 277, h: 190 };
        const rectMatches = (r) =>
            Math.abs(r.xMm - expectedRect.x) <= 0.05 &&
            Math.abs(r.yMm - expectedRect.y) <= 0.05 &&
            Math.abs(r.wMm - expectedRect.w) <= 0.05 &&
            Math.abs(r.hMm - expectedRect.h) <= 0.05;
        const mmToPt = (v) => (v * 72) / 25.4;
        const ptToMm = (v) => (v * 25.4) / 72;
        const clipRectMm = clipRects.find(rectMatches);
        const clipRectPt = clipRectMm && {
            x: mmToPt(clipRectMm.xMm),
            y: mmToPt(clipRectMm.yMm),
            w: mmToPt(clipRectMm.wMm),
            h: mmToPt(clipRectMm.hMm),
        };
        const fullSegs = segs.filter(horiz).filter(near(fullEdgeMm));
        const fullSeg = fullSegs.length
            ? fullSegs.reduce((a, b) => (Math.max(a.from.x, a.to.x) > Math.max(b.from.x, b.to.x) ? a : b))
            : null;
        const visibleMm = fullSeg && clipRectPt ? visibleLengthMm(fullSeg, clipRectPt) : null;
        const overflowMm = fullSeg
            ? ptToMm(Math.max(fullSeg.from.x, fullSeg.to.x)) - (clipRectMm.xMm + clipRectMm.wMm)
            : null;
        const analysis = {
            total_segments: segs.length,
            full_340mm_segments_in_stream: fullSegs.length,
            clip_rects_menu_pdf: clipRects,
            clip_rect_equals_print_frame_A4: clipRects.some(rectMatches),
            full_edge_visible_after_clip_mm: visibleMm,
            full_edge_overflow_past_frame_mm: overflowMm === null ? null : Number(overflowMm.toFixed(3)),
            visible_plus_overflow_equals_full:
                visibleMm !== null &&
                overflowMm !== null &&
                Math.abs(visibleMm + overflowMm - fullEdgeMm) <= 0.01,
            clip_rects_integration_pdf: integrationRects,
            integration_clip_rect_equals_print_frame_A4: integrationRects.some(rectMatches),
            clip_rects_identical_menu_vs_integration:
                clipRects.length > 0 &&
                clipRects.every((r) => integrationRects.some((q) => JSON.stringify(r) === JSON.stringify(q))),
            longest_segment_mm: Number(Math.max(...segs.map((s) => s.mmPaper)).toFixed(3)),
            visible_length_note:
                "340 mm edge kept in stream; overflow past the 277 mm frame rect is clip-cut",
        };
        evidence.clip_analysis = analysis;
        if (!analysis.clip_rect_equals_print_frame_A4) {
            throw new Error(`no A4 print-frame clip rect in downloaded file: ${JSON.stringify(clipRects)}`);
        }
        if (!analysis.visible_plus_overflow_equals_full) {
            throw new Error(
                `clip arithmetic inconsistent (visible ${visibleMm} + overflow ${overflowMm} != 340)`,
            );
        }
        if (!analysis.integration_clip_rect_equals_print_frame_A4) {
            throw new Error("integration CLIP pdf lacks matching clip rect (cross-check source invalid)");
        }
        if (analysis.full_340mm_segments_in_stream < 1) {
            throw new Error(
                "expected unclipped 340 mm coordinates present + clip rect installed; found neither",
            );
        }
        if (!/841\.89 x 595\.2\d+ pts \(A4\)/.test(pdfinfo)) {
            throw new Error(
                `downloaded page is not A4: ${pdfinfo.split("\n").find((l) => l.includes("Page size"))}`,
            );
        }

        // Preview-vs-download agreement: dialog excess + shared clip rect geometry.
        const integration = JSON.parse(
            readFileSync(resolve(__dirname, "output/integration/clip_cancel_confirm_evidence.json"), "utf8"),
        );
        evidence.agreement_with_integration_evidence = {
            integration_excess_mm: integration.clipExcessMm,
            menu_dialog_excess_mm: evidence.dialog_clip_excess_mm,
            menu_file_overflow_past_frame_mm: overflowMm === null ? null : Number(overflowMm.toFixed(3)),
            file_overflow_matches_dialog_excess:
                overflowMm !== null && Math.abs(overflowMm - integration.clipExcessMm[0]) <= 0.05,
            excess_match:
                evidence.dialog_clip_excess_mm &&
                Math.abs(evidence.dialog_clip_excess_mm.x - integration.clipExcessMm[0]) < 0.15 &&
                Math.abs(evidence.dialog_clip_excess_mm.y - integration.clipExcessMm[1]) < 0.15,
            integration_clip_pdf_bytes: integration.confirmBytes,
            menu_clip_pdf_bytes: readFileSync(destPdf).length,
        };
        if (!evidence.agreement_with_integration_evidence.excess_match) {
            throw new Error(
                `dialog excess differs from integration: ${JSON.stringify(evidence.agreement_with_integration_evidence)}`,
            );
        }
        if (!evidence.agreement_with_integration_evidence.file_overflow_matches_dialog_excess) {
            throw new Error(
                `downloaded-file overflow differs from preview excess: ${JSON.stringify(evidence.agreement_with_integration_evidence)}`,
            );
        }

        evidence.downloaded_bytes = readFileSync(destPdf).length;
        evidence.sha256_downloaded = sha256(destPdf);
        evidence.sha256_screenshots = {
            "05_clip_dialog_A4_1to15_before_cancel.png": sha256(
                join(outMenu, "05_clip_dialog_A4_1to15_before_cancel.png"),
            ),
            "06_clip_dialog_A4_1to15_before_export_clip.png": sha256(
                join(outMenu, "06_clip_dialog_A4_1to15_before_export_clip.png"),
            ),
            "from_menu_A4_1to15_CLIP_render-1.png": sha256(
                join(outMenu, "from_menu_A4_1to15_CLIP_render-1.png"),
            ),
        };
        evidence.log = log;
        evidence.ok = true;
    } catch (err) {
        evidence.error = String((err && err.message) || err);
        evidence.ok = false;
    } finally {
        child.kill();
        server.close();
    }
    writeFileSync(join(outMenu, "menu_clip_report.json"), JSON.stringify(evidence, null, 4));
    writeFileSync(
        join(outMenu, "clip_cancel_confirm_evidence.json"),
        JSON.stringify(
            {
                channel: "menu/ribbon clicks (menu_clip_acceptance.mjs)",
                build_ref: "0b396d8f",
                options: EXPORT_OPTIONS,
                cancel: evidence.cancel_phase,
                confirm: evidence.confirm_phase,
                clip_analysis: evidence.clip_analysis,
                sha256: evidence.sha256_downloaded,
            },
            null,
            4,
        ),
    );
    console.log(JSON.stringify(evidence, null, 2));
    if (!evidence.ok) process.exitCode = 2;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
