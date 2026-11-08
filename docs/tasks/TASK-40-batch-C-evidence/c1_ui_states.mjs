#!/usr/bin/env node

/**
 * TASK-40 Đợt C1 — live UI state captures on the real ChatPanel (dev build).
 *
 * Drives headful Chrome via CDP against `npm run dev` (localhost:8080). The evidence
 * store is exercised through `__chiliTest.governance` (dev/preview-only surface) — the
 * data path is the SAME store/UI production uses; only the trigger is scripted instead
 * of a natural LLM turn (documented honestly in README).
 *
 * States captured: mixed pass/fail/unknown, stale-after-invalidate, all-required-pass
 * completion badge, plus the governance status line text for each step.
 *
 * Usage: node docs/tasks/TASK-40-batch-C-evidence/c1_ui_states.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "c1-ui");
mkdirSync(OUT, { recursive: true });

const URL_BASE = process.env.CHILI3D_URL ?? "http://localhost:8080";
const CDP_PORT = 9233;

const chromeCandidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chrome = chromeCandidates.find((c) => existsSync(c));
if (!chrome) throw new Error("Chrome not found");

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
if (await cdpReady()) throw new Error(`CDP port ${CDP_PORT} already answered — stale debug Chrome?`);

const userData = join(process.env.TMPDIR || "/tmp", `chili-c1-demo-${Date.now()}`);
mkdirSync(userData, { recursive: true });
const child = spawn(
    chrome,
    [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${userData}`,
        "--enable-unsafe-swiftshader",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1500,1400",
        "--lang=vi",
        "about:blank",
    ],
    { stdio: "ignore" },
);

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
        c.#socket.addEventListener("message", (e) => c.#on(e.data));
        return c;
    }
    #on(data) {
        const m = JSON.parse(data);
        if (m.id && this.#pending.has(m.id)) {
            const p = this.#pending.get(m.id);
            this.#pending.delete(m.id);
            m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
        }
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
    async shot(path) {
        const { data } = await this.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(path, Buffer.from(data, "base64"));
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    let ver = null;
    for (let i = 0; i < 60 && !ver; i++) {
        try {
            ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json());
        } catch {
            await sleep(250);
        }
    }
    if (!ver) throw new Error("Chrome CDP not ready");
    const { targetId } = await (await Cdp.attach(ver.webSocketDebuggerUrl)).send("Target.createTarget", {
        url: URL_BASE,
    });
    await sleep(600);
    let pt = null;
    for (let i = 0; i < 20 && !pt; i++) {
        const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
        pt =
            targets.find((t) => t.type === "page" && t.targetId === targetId) ||
            targets.find((t) => t.type === "page" && t.url.includes(":8080")) ||
            null;
        if (!pt) await sleep(400);
    }
    if (!pt) throw new Error("no page target");
    const cdp = await Cdp.attach(pt.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1500,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
    });

    for (let i = 0; i < 120; i++) {
        const ready = await cdp.eval(
            `(() => { try { return !!(globalThis.__chiliTest && globalThis.app && app.shapeProvider); } catch { return false; } })()`,
        );
        if (ready) break;
        await sleep(500);
        if (i === 119) throw new Error(`dev app not ready on ${URL_BASE}`);
    }

    const opened = await cdp.eval(`
      (async () => {
        let pubbed = false;
        for (let i = 0; i < 160; i++) {
          try { if (app.activeView) return { ok: true, i }; } catch {}
          const btn = [...document.querySelectorAll('button')].find(b => /Tạo bản vẽ mới/.test(b.textContent || ''));
          if (btn) { btn.click(); }
          else if (!pubbed) { Chili3dCore.PubSub.default.pub('executeCommand', 'doc.new'); pubbed = true; }
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false };
      })()`);
    if (!opened?.ok) throw new Error("doc not opened");
    await sleep(1200);

    const model = await cdp.eval(`(async () => {
        const doc = app.activeView.document;
        const m = await __chiliTest.createTestModel(doc);
        return { box1Id: m.box1.id, box1Name: m.box1.name };
    })()`);

    // Open the real ChatPanel through the app's own channel (with diagnostics + fallback).
    const toggleDiag = await cdp.eval(`(async () => {
        const before = document.querySelectorAll('*').length;
        Chili3dCore.PubSub.default.pub('toggleChatPanel');
        await new Promise(r => setTimeout(r, 600));
        let panel = document.querySelector('chili-ai-chat');
        if (!panel) {
            // Fallback: click the ribbon AI Assistant button if the pub had no subscriber yet.
            const btn = [...document.querySelectorAll('ribbon-button, button')].find(
                el => /AI Assistant|Trò chuyện/i.test((el.getAttribute('title') || '') + ' ' + (el.textContent || '')));
            if (btn) { btn.click(); await new Promise(r => setTimeout(r, 600)); panel = document.querySelector('chili-ai-chat'); }
        }
        return {
            found: !!panel,
            before,
            after: document.querySelectorAll('*').length,
            editors: document.querySelectorAll('chili-editor').length,
            bodyTail: (document.body.innerHTML || '').slice(-220),
        };
    })()`);
    console.log("chat toggle:", toggleDiag);
    if (!toggleDiag.found) {
        writeFileSync(join(OUT, "ERROR_chat_panel.json"), JSON.stringify(toggleDiag, null, 2));
        throw new Error("ChatPanel not mounted after toggle");
    }

    // The panel auto-opens the settings modal on first mount (no API key configured).
    // The evidence card is independent of the key, so dismiss the modal and shoot the panel itself.
    const dismissed = await cdp.eval(`(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /^(Cancel|Hủy|Hủy bỏ)$/i.test((b.textContent || '').trim()));
        if (btn) { btn.click(); return true; }
        return false;
    })()`);
    await sleep(400);
    console.log("settings dismissed:", dismissed);

    async function shootState(name) {
        await sleep(300);
        // Prefer the evidence card's own rect (badge lives at its bottom, below the panel fold).
        await cdp.eval(`(() => {
            const el = document.querySelector('[class*=governanceCard]');
            if (!el) return false;
            el.style.zoom = "0.6";
            const r = el.getBoundingClientRect();
            window.scrollTo(0, window.scrollY + r.y - 4);
            return true;
        })()`);
        await sleep(150);
        const rect = await cdp.eval(`(() => {
            const el = document.querySelector('[class*=governanceCard]') || document.querySelector('chili-ai-chat');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), w: r.width, h: r.height };
        })()`);
        if (rect && rect.w > 50 && rect.h > 50) {
            const d = await cdp.send("Page.captureScreenshot", {
                format: "png",
                clip: { x: rect.x, y: rect.y, width: rect.w, height: Math.min(rect.h, 1390), scale: 1.6 },
            });
            writeFileSync(join(OUT, `${name}_panel.png`), Buffer.from(d.data, "base64"));
        }
        await cdp.eval(
            `(() => { const el = document.querySelector('[class*=governanceCard]'); if (el) el.style.zoom = ""; return true; })()`,
        );
        await cdp.shot(join(OUT, `${name}_full.png`));
    }

    const init = await cdp.eval(`(async () => {
        const g = await __chiliTest.governance();
        g.registerDefaultGeometryRunners();
        return g.formatGovernanceStatusLine();
    })()`);

    // State A: mixed pass / fail / unknown (all required).
    const mixed = await cdp.eval(`(async () => {
        const g = await __chiliTest.governance();
        const doc = app.activeView.document;
        g.approveTaskPlan({ taskId: "demo-c1", allowedModifiedNodeIds: ["${model.box1Id}"] }, doc);
        g.defineTaskCriteria("demo-c1", [
            { id: "kich-thuoc", kind: "dimension_match", required: true, subjectNodeIds: ["${model.box1Id}"],
              expected: { sizeMm: [100, 50, 20] }, toleranceMm: [2, 2, 2], source: "yêu cầu: hộp 100×50×20 ±2 mm" },
            { id: "vi-tri", kind: "position_match", required: true, subjectNodeIds: ["${model.box1Id}"],
              expected: { centerMm: [50, 500, 10] }, toleranceMm: [5, 5, 5], source: "yêu cầu: tâm tại (50;500;10)" },
            { id: "thieu-dung-sai", kind: "dimension_match", required: true, subjectNodeIds: ["${model.box1Id}"],
              expected: { sizeMm: [100, 50, 20] }, source: "task chưa chốt dung sai → unknown" },
        ]);
        const ev = await g.runTaskCriterionChecks("demo-c1", doc);
        return { rows: ev.rows.map(r => ({ id: r.spec.id, s: r.status, reason: r.reason.slice(0, 90) })),
                 completable: ev.completable, statusLine: g.formatGovernanceStatusLine(),
                 cardText: (document.querySelector('[class*=governanceCard]') || {}).innerText };
    })()`);
    await shootState("01_mixed_pass_fail_unknown");

    // State B: stale after invalidation.
    const stale = await cdp.eval(`(async () => {
        const g = await __chiliTest.governance();
        const doc = app.activeView.document;
        g.invalidateEvidenceForNodeIds(["${model.box1Id}"], "demo: đối tượng vừa bị sửa hình");
        const ev = g.evaluateTaskCriteria("demo-c1", doc);
        return { rows: ev.rows.map(r => ({ id: r.spec.id, s: r.status, stale: r.stale })),
                 completable: ev.completable, statusLine: g.formatGovernanceStatusLine(),
                 cardText: (document.querySelector('[class*=governanceCard]') || {}).innerText };
    })()`);
    await shootState("02_stale_after_invalidate");

    // State C: every required criterion passing → completion badge.
    const done = await cdp.eval(`(async () => {
        const g = await __chiliTest.governance();
        const doc = app.activeView.document;
        g.defineTaskCriteria("demo-c1", [
            { id: "kich-thuoc", kind: "dimension_match", required: true, subjectNodeIds: ["${model.box1Id}"],
              expected: { sizeMm: [100, 50, 20] }, toleranceMm: [2, 2, 2] },
            { id: "vi-tri", kind: "position_match", required: true, subjectNodeIds: ["${model.box1Id}"],
              expected: { centerMm: [50, 25, 10] }, toleranceMm: [5, 5, 5] },
        ]);
        const ev = await g.runTaskCriterionChecks("demo-c1", doc);
        return { rows: ev.rows.map(r => ({ id: r.spec.id, s: r.status })),
                 completable: ev.completable, statusLine: g.formatGovernanceStatusLine(),
                 cardText: (document.querySelector('[class*=governanceCard]') || {}).innerText };
    })()`);
    await shootState("03_all_required_pass_complete");

    writeFileSync(
        join(OUT, "c1_ui_states.json"),
        JSON.stringify(
            {
                note:
                    "dev-build (__chiliTest.governance) drives the SAME store + real ChatPanel component; " +
                    "trigger is scripted, not a natural LLM turn (LLM end-to-end = Đợt D). Box node 100x50x20 from __chiliTest.createTestModel.",
                init,
                model,
                chatToggle: toggleDiag,
                statusAfterRegister: init,
                stateA_mixed: mixed,
                stateB_stale: stale,
                stateC_complete: done,
                capturedAt: new Date().toISOString(),
            },
            null,
            2,
        ),
    );
    console.log(
        JSON.stringify({ statusAfterRegister: init, stateA: mixed, stateB: stale, stateC: done }, null, 2),
    );
}

try {
    await main();
} finally {
    child.kill();
    try {
        rmSync(userData, { recursive: true, force: true });
    } catch {}
}
