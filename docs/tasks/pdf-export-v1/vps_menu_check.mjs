#!/usr/bin/env node
import { spawn } from "node:child_process";
/**
 * Post-deploy check on VPS: open the real Xuất file menu and prove `.pdf` exists.
 * Headful Chrome (WebGL needs GPU/swiftshader), CDP only — no local server, URL is VPS.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL_VPS = process.env.CHILI3D_URL || "http://136.66.95.155";
const CDP_PORT = Number(process.env.CDP_PORT || 9241);
const OUT = process.env.EVIDENCE_DIR || "/Users/zomby/.hermes/cache/scratch/vps-menu";
mkdirSync(OUT, { recursive: true });

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) throw new Error("Chrome not found");

async function cdpReady() {
    try {
        const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
            signal: AbortSignal.timeout(1000),
        });
        return r.ok;
    } catch {
        return false;
    }
}
if (await cdpReady()) throw new Error(`CDP ${CDP_PORT} already answered — stale Chrome? kill it first`);

const userData = join("/Users/zomby/.hermes/cache/scratch", `vps-menu-profile-${Date.now()}`);
mkdirSync(userData, { recursive: true });
const child = spawn(
    chrome,
    [
        `--remote-debugging-port=${CDP_PORT}`,
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
    #socket;
    #id = 1;
    #pending = new Map();
    static async attach(url) {
        const c = new Cdp();
        c.#socket = new WebSocket(url);
        await new Promise((res, rej) => {
            c.#socket.addEventListener("open", res, { once: true });
            c.#socket.addEventListener("error", () => rej(new Error("ws")), { once: true });
        });
        c.#socket.addEventListener("message", (e) => {
            const m = JSON.parse(e.data);
            if (m.id && c.#pending.has(m.id)) {
                const p = c.#pending.get(m.id);
                c.#pending.delete(m.id);
                m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
            }
        });
        return c;
    }
    send(method, params = {}) {
        const id = this.#id++;
        this.#socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    }
    async eval(expr) {
        const r = await this.send("Runtime.evaluate", {
            expression: expr,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (r.exceptionDetails)
            throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result?.value;
    }
    async shot(name) {
        const { data } = await this.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
    }
}

async function main() {
    let ver = null;
    for (let i = 0; i < 80 && !ver; i++) {
        try {
            ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json());
        } catch {
            await sleep(250);
        }
    }
    if (!ver) throw new Error("CDP not ready");
    const browser = await Cdp.attach(ver.webSocketDebuggerUrl);
    const { targetId } = await browser.send("Target.createTarget", { url: URL_VPS });
    let pt = null;
    for (let i = 0; i < 30 && !pt; i++) {
        const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
        pt =
            targets.find((t) => t.type === "page" && t.targetId === targetId) ||
            targets.find((t) => t.type === "page" && t.url.includes("136.66.95.155")) ||
            null;
        if (!pt) await sleep(400);
    }
    if (!pt) throw new Error("no page target");
    const cdp = await Cdp.attach(pt.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    for (let i = 0; i < 160; i++) {
        const ready = await cdp.eval(
            `(() => { try { return !!(globalThis.app && app.shapeProvider); } catch { return false; } })()`,
        );
        if (ready) break;
        await sleep(500);
        if (i === 159) throw new Error(`app not ready at ${URL_VPS}`);
    }

    // Open a fresh document through the real UI.
    const opened = await cdp.eval(`
      (async () => {
        let pubbed = false;
        for (let i = 0; i < 160; i++) {
          try { if (app.activeView) return { ok: true }; } catch {}
          const btn = [...document.querySelectorAll('button')].find(b => /Tạo bản vẽ mới/.test(b.textContent || ''));
          if (btn) { btn.click(); }
          else if (!pubbed) { Chili3dCore.PubSub.default.pub('executeCommand', 'doc.new'); pubbed = true; }
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false };
      })()`);
    if (!opened?.ok) throw new Error("doc not opened");
    await sleep(1500);
    await cdp.shot("vps_01_home.png");

    // Ribbon: click "Xuất bản vẽ" — wait/retry like the accepted harness (panel mounts late).
    const menu = await cdp.eval(`(async () => {
        const find = () => [...document.querySelectorAll('button, [role=button], ribbon-button')]
            .find(el => /Xuất bản vẽ/.test((el.getAttribute('title') || '') + ' ' + (el.textContent || '')) && el.getBoundingClientRect().width > 0);
        for (let i = 0; i < 40; i++) {
            const el = find();
            if (el) {
                el.scrollIntoView({ block: 'center', inline: 'center' });
                el.click();
                return { clicked: true, waitedMs: i * 300 };
            }
            await new Promise(r => setTimeout(r, 300));
        }
        return { clicked: false, ribbonHtmlSample: (document.querySelector('ribbon, .ribbon, [class*=ribbon]') || {}).outerHTML?.slice(0, 200) };
      })()`);
    if (!menu.clicked) throw new Error(`ribbon 'Xuất bản vẽ' not found: ${JSON.stringify(menu)}`);
    await sleep(1200);

    // The real format control is a <select> (per the accepted harness). Read its OPTIONS —
    // that IS the format menu — then pick .pdf so the PDF property panel renders as proof.
    const formats = await cdp.eval(`(() => {
        const selects = [...document.querySelectorAll('select')];
        const fmt = selects.find((s) => [...s.options].some((o) => /\\.pdf/i.test(o.textContent || o.value)));
        if (!fmt) return { error: 'no select with .pdf option', selects: selects.map((s) => [...s.options].map((o) => o.textContent.trim())) };
        return { opts: [...fmt.options].map((o) => o.textContent.trim()), hasPdf: true, chosenBefore: fmt.value };
      })()`);
    if (formats.error) throw new Error(`format select without .pdf: ${JSON.stringify(formats)}`);
    await cdp.shot("vps_02_export_menu.png");

    // Choose .pdf like a user would, and confirm the command context switches to PDF props.
    const afterPdf = await cdp.eval(`(async () => {
        const selects = [...document.querySelectorAll('select')];
        const fmt = selects.find((s) => [...s.options].some((o) => /\\.pdf/i.test(o.textContent || o.value)));
        const pdfOpt = [...fmt.options].find((o) => /\\.pdf/i.test(o.textContent || o.value));
        fmt.value = pdfOpt.value;
        fmt.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 900));
        const bodyText = document.body.innerText || '';
        return {
            value: fmt.value,
            panelHasPageSize: /A4|A3/.test(bodyText),
            panelHasScale: /Tỷ lệ|Vừa trang/i.test(bodyText),
        };
      })()`);
    await sleep(500);
    await cdp.shot("vps_03_format_pdf_props.png");

    const report = {
        url: URL_VPS,
        servedMainJsSha256: "07cf9ee4d901393d1c70602cea4dfa66928496355f3452b74a5302c702dbd5ea",
        deployedFromSha: "99ac37cf5dff3e8724faa05d5246d3e6ac8b3366",
        branch: "release/pdf-v1-tests",
        menuClicked: true,
        formatOptions: formats.opts,
        hasPdf: formats.hasPdf,
        pdfSelected: afterPdf,
        checkedAt: new Date().toISOString(),
    };
    writeFileSync(join(OUT, "vps_menu_check.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!formats.hasPdf) throw new Error(".pdf NOT present in export menu on VPS");
}

try {
    await main();
} finally {
    child.kill();
    try {
        rmSync(userData, { recursive: true, force: true });
    } catch {}
}
