#!/usr/bin/env node

/**
 * TASK-40 Đợt C2 — end-to-end acceptance THROUGH THE REAL APP FLOW (dev build).
 *
 * The user types a request in ChatPanel; a SCRIPTED OpenAI-compatible provider (local mock,
 * SSE) answers with tool calls: propose_task_plan (criteria from the "requirement") →
 * the user clicks the real Approve button on the plan card → run_program builds REAL OCCT
 * geometry via the governed router → final text → ChatPanel's send() finally runs
 * finalizeTaskVerification: the registered geometry runners measure the created node and
 * the evidence card binds pass/fail/unknown with rules/history/geometry markers.
 *
 * Scenarios (Reviewer point 5):
 *   S1 đúng chuẩn                → ✔ HOÀN TẤT
 *   S2 kernel hợp lệ, sai kích thước → ❌ lệch X, ⏳
 *   S3 sai vị trí (transform_node)   → ❌ lệch Y, ⏳
 *   S4 không đo được (hint lạc)      → ❓ không có đối tượng để đo, ⏳
 *   S5 sau S1: NGƯỜI DÙNG di chuyển bằng UI (select tree + modify.move + toạ độ gõ vào
 *      command bar — không qua agent) → card mất ✔, row thành ❓ stale.
 *
 * provider kịch bản: mock này. Kernel: OCCT/WASM THẬT của app. LLM thật: KHÔNG thử ở đây.
 * Usage: npm run dev chạy ở :8080, rồi node docs/tasks/TASK-40-batch-C-evidence/c2_run_flow.mjs
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "c2-run");
mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.CHILI3D_URL || "http://localhost:8080";
const CDP_PORT = Number(process.env.CDP_PORT || 9242);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- mock provider
const SCEN = {
    S1: { dx: 800, move: false, hint: "Tấm C2", badge: "✔ HOÀN TẤT" },
    S2: { dx: 700, move: false, hint: "Tấm C2", badge: "⏳" },
    S3: { dx: 800, planeOffset: { x: 0, y: 400, z: 0 }, hint: "Tấm C2", badge: "⏳" },
    S4: { dx: 800, move: false, hint: "Tấm không tồn tại", badge: "⏳" },
};
function criteriaFor(tag) {
    const s = SCEN[tag];
    return [
        {
            id: "kich",
            kind: "dimension_match",
            required: true,
            subjectHint: s.hint,
            expected: { sizeMm: [800, 300, 2500] },
            toleranceMm: [2, 2, 2],
            unit: "mm",
            coordRef: "world",
            source: `yêu cầu ${tag}: tấm tôn 800×300×2500 mm ±2`,
        },
        {
            id: "vitri",
            kind: "position_match",
            required: true,
            subjectHint: s.hint,
            expected: { centerMm: [400, 150, 1250] },
            toleranceMm: [5, 5, 5],
            unit: "mm",
            coordRef: "world",
            source: `yêu cầu ${tag}: tâm tại (400;150;1250) ±5`,
        },
    ];
}
function nextReply(tag, state, _messages) {
    state.step += 1;
    if (state.step === 1) {
        return {
            name: "propose_task_plan",
            args: {
                goal: `tạo tấm theo ${tag}`,
                summary: `Dựng tấm ${tag}, có tiêu chí hậu kiểm`,
                allowedModifiedNodeIds: [],
                criteria: criteriaFor(tag),
            },
        };
    }
    if (state.step === 2) {
        const s = SCEN[tag];
        const ops = [];
        if (s.planeOffset) {
            // Sai vị trí bằng op THẬT: box tại gốc → transformedMul translate (đường dẫn capability đã hỗ trợ).
            ops.push({ id: "r1", method: "box", args: { dx: s.dx, dy: 300, dz: 2500 } });
            ops.push({
                method: "transformedMul",
                name: "Tấm C2",
                args: { shape: "r1", translate: s.planeOffset },
            });
        } else {
            ops.push({ method: "box", name: "Tấm C2", args: { dx: s.dx, dy: 300, dz: 2500 } });
        }
        return { name: "run_program", args: { ops } };
    }
    return { text: `Đã tạo tấm theo yêu cầu ${tag}.` };
}
const states = {};
const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const provider = createServer((req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, CORS).end();
        return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
        if (!req.url?.includes("chat/completions")) {
            res.writeHead(404, CORS).end();
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(body);
        } catch {
            res.writeHead(400).end();
            return;
        }
        const users = (parsed.messages || []).filter((m) => m.role === "user");
        const lastUser = users[users.length - 1];
        const tag = /S([1-4])\b/.exec(String(lastUser?.content || ""))?.[0] || "S1";
        states[tag] = states[tag] || { step: 0 };
        const reply = nextReply(tag, states[tag], parsed.messages || []);
        const id = `call_${Math.random().toString(36).slice(2, 10)}`;
        const mk = () =>
            reply.name
                ? {
                      id: "gen",
                      object: "chat.completion",
                      created: 1,
                      model: parsed.model,
                      choices: [
                          {
                              index: 0,
                              finish_reason: "tool_calls",
                              message: {
                                  role: "assistant",
                                  content: null,
                                  tool_calls: [
                                      {
                                          id,
                                          type: "function",
                                          function: {
                                              name: reply.name,
                                              arguments: JSON.stringify(reply.args),
                                          },
                                      },
                                  ],
                              },
                          },
                      ],
                  }
                : {
                      id: "gen",
                      object: "chat.completion",
                      created: 1,
                      model: parsed.model,
                      choices: [
                          {
                              index: 0,
                              finish_reason: "stop",
                              message: { role: "assistant", content: reply.text },
                          },
                      ],
                  };
        if (parsed.stream) {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...CORS });
            const full = mk();
            const chunk = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
            chunk({
                id: "gen",
                object: "chat.completion.chunk",
                created: 1,
                model: parsed.model,
                choices: [{ index: 0, delta: { role: "assistant" } }],
            });
            if (full.choices[0].message.tool_calls) {
                chunk({
                    id: "gen",
                    object: "chat.completion.chunk",
                    created: 1,
                    model: parsed.model,
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: full.choices[0].message.tool_calls.map((tc, i) => ({
                                    index: i,
                                    id: tc.id,
                                    type: "function",
                                    function: { name: tc.function.name, arguments: tc.function.arguments },
                                })),
                            },
                        },
                    ],
                });
            } else {
                chunk({
                    id: "gen",
                    object: "chat.completion.chunk",
                    created: 1,
                    model: parsed.model,
                    choices: [{ index: 0, delta: { content: full.choices[0].message.content } }],
                });
            }
            chunk({
                id: "gen",
                object: "chat.completion.chunk",
                created: 1,
                model: parsed.model,
                choices: [{ index: 0, delta: {}, finish_reason: full.choices[0].finish_reason }],
            });
            res.write("data: [DONE]\n\n");
            res.end();
        } else {
            res.writeHead(200, { "Content-Type": "application/json", ...CORS });
            res.end(JSON.stringify(mk()));
        }
    });
});
await new Promise((r) => provider.listen(0, "127.0.0.1", r));
const PROVIDER_PORT = provider.address().port;

// ---------------------------------------------------------------- chrome + CDP
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) throw new Error("Chrome not found");
async function cdpReady() {
    try {
        return (
            await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(1000) })
        ).ok;
    } catch {
        return false;
    }
}
if (await cdpReady()) throw new Error(`CDP ${CDP_PORT} already answered — stale debug Chrome`);
const userData = join(process.env.TMPDIR || "/tmp", `chili-c2-flow-${Date.now()}`);
mkdirSync(userData, { recursive: true });
const child = spawn(
    chrome,
    [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${userData}`,
        "--enable-unsafe-swiftshader",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-web-security",
        "--disable-features=PrivateNetworkAccessRespectPreflightResults,PrivateNetworkAccessSendPreflights",
        "--window-size=1500,1000",
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
    const { targetId } = await browser.send("Target.createTarget", { url: APP_URL });
    let pt = null;
    for (let i = 0; i < 30 && !pt; i++) {
        const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
        pt =
            list.find((t) => t.type === "page" && (t.id === targetId || t.targetId === targetId)) ||
            list.find((t) => t.type === "page" && t.url.startsWith(APP_URL)) ||
            list.find((t) => t.type === "page" && !t.url.startsWith("chrome") && t.url !== "about:blank") ||
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
        if (i === 159) throw new Error("app not ready — is `npm run dev` up on :8080?");
    }

    const opened = await cdp.eval(`
      (async () => {
        let pubbed = false;
        for (let i = 0; i < 160; i++) {
          try { if (app.activeView) return { ok: true }; } catch {}
          const btn = [...document.querySelectorAll('button')].find(b => /Tạo bản vẽ mới/.test(b.textContent || ''));
          if (btn) btn.click();
          else if (!pubbed) { Chili3dCore.PubSub.default.pub('executeCommand', 'doc.new'); pubbed = true; }
          await new Promise(r => setTimeout(r, 250));
        }
        return { ok: false };
      })()`);
    if (!opened?.ok) throw new Error("doc not opened");
    await sleep(1200);

    // Scripted provider config — the app's own storage layer (loopback mock, no real secrets).
    await cdp.eval(`localStorage.setItem("chili3d.app.ai.config", JSON.stringify({
        provider: "completions",
        baseURL: "http://127.0.0.1:${PROVIDER_PORT}/v1",
        apiKey: "mock-scripted-key",
        model: "scripted-scenario-model",
    })); true`);

    // Open the real ChatPanel (pub toggle, then ribbon fallback; editor mounts late on dev).
    let panelOn = false;
    for (let i = 0; i < 30 && !panelOn; i++) {
        if (i % 2 === 0) await cdp.eval(`Chili3dCore.PubSub.default.pub("toggleChatPanel"); true`);
        else {
            await cdp.eval(
                `(() => { const b=[...document.querySelectorAll('button, ribbon-button')].find(el=>/AI Assistant|Trò chuyện/i.test((el.getAttribute('title')||'')+' '+(el.textContent||''))); if (b) b.click(); return !!b; })()`,
            );
        }
        await sleep(600);
        panelOn = !!(await cdp.eval(`!!document.querySelector('chili-ai-chat')`));
    }
    if (!panelOn) throw new Error("ChatPanel not mounted");

    // Ensure ChatPanel recognizes the configured API key
    await cdp.eval(`(async () => {
        const chat = document.querySelector('chili-ai-chat');
        if (chat) {
            if (chat.apiKeyInput) chat.apiKeyInput.value = "mock-scripted-key";
            if (chat.baseURLInput) chat.baseURLInput.value = "http://127.0.0.1:${PROVIDER_PORT}/v1";
            if (typeof chat.saveSettings === 'function') {
                await chat.saveSettings();
            } else {
                const saveBtn = [...chat.querySelectorAll('button')].find(b => /Save|Lưu/i.test(b.textContent || ''));
                if (saveBtn) saveBtn.click();
            }
            if (typeof chat.hideSettings === 'function') chat.hideSettings();
        }
    })()`);

    const CARD_QUERY_EXPR = `(() => {
        let el = document.querySelector('[class*=governanceCard]');
        if (!el || el.style.display === 'none' || !el.innerText) {
            const chat = document.querySelector('chili-ai-chat');
            if (chat) {
                const divs = chat.querySelectorAll('div');
                for (const d of divs) {
                    if (d.textContent && d.textContent.startsWith('Bằng chứng hậu kiểm (Đợt C)') && d.parentElement) {
                        return d.parentElement.parentElement || d.parentElement;
                    }
                }
            }
        }
        return el;
    })()`;

    const pollCard = async (pred, secs) => {
        for (let i = 0; i < secs * 4; i++) {
            const t = String(
                (await cdp.eval(
                    `(() => { const el = ${CARD_QUERY_EXPR}; return el && el.style.display !== 'none' ? el.innerText : ''; })()`,
                )) || "",
            );
            if (pred(t)) return true;
            await sleep(250);
        }
        return false;
    };

    const runScenario = async (tag, userText) => {
        // New conversation per scenario via the panel's own "+".
        await cdp.eval(
            `(() => { const plus=[...document.querySelectorAll('chili-ai-chat button')].find(b=>/cuộc trò chuyện mới|new conversation/i.test(b.title||b.textContent||'')); if(plus) plus.click(); return !!plus; })()`,
        );
        await sleep(400);
        await cdp.eval(`(() => {
            const ta = document.querySelector('chili-ai-chat textarea');
            ta.focus(); ta.value = ${JSON.stringify(userText)};
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            return true;
        })()`);
        // User clicks Approve on the plan card (real UI, real handler chain).
        let approved = false;
        for (let i = 0; i < 120 && !approved; i++) {
            approved = await cdp.eval(
                `(() => { const bs=[...document.querySelectorAll('[data-plan-approve]')].filter(b => !b.disabled); const b = bs[bs.length - 1]; if (b) { b.click(); return true; } return false; })()`,
            );
            if (!approved) await sleep(300);
        }
        if (!approved) {
            const diag = await cdp.eval(
                `(() => { const el=document.querySelector('chili-ai-chat'); return el ? el.innerText.slice(-700) : "no panel"; })()`,
            );
            throw new Error(`${tag}: plan approval card never appeared. panel tail: ${diag}`);
        }
        // Wait for the evidence card to settle on the scenario's badge.
        let cardText = "";
        const sig = tagCardSignature(tag);
        for (let i = 0; i < 200; i++) {
            cardText = String(
                (await cdp.eval(
                    `(() => { const el = ${CARD_QUERY_EXPR}; return el && el.style.display !== 'none' ? el.innerText : ''; })()`,
                )) || "",
            );
            if (cardText.includes(sig) && /Bằng chứng hậu kiểm/.test(cardText)) break;
            await sleep(300);
        }
        return cardText;
    };
    // Chữ ký ĐO ĐƯỢC riêng từng ca — không bắt card cũ của ca trước:
    const tagCardSignature = (tag) =>
        tag === "S1"
            ? "✔ HOÀN TẤT"
            : tag === "S2"
              ? "đo 700 mm"
              : tag === "S3"
                ? "đo 550 mm"
                : "không có đối tượng để đo";

    const captureCard = async (name) => {
        await cdp.eval(
            `(() => { const el = ${CARD_QUERY_EXPR}; if (el) { el.style.zoom="0.55"; const r=el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.y - 4); } return true; })()`,
        );
        await sleep(150);
        const rect = await cdp.eval(
            `(() => { const el = ${CARD_QUERY_EXPR}; if(!el) return null; const r=el.getBoundingClientRect(); return {x:Math.max(0,r.x),y:Math.max(0,r.y),w:r.width,h:r.height}; })()`,
        );
        if (rect && rect.w > 50) {
            const d = await cdp.send("Page.captureScreenshot", {
                format: "png",
                clip: { x: rect.x, y: rect.y, width: rect.w, height: Math.min(rect.h, 1400), scale: 1.8 },
            });
            writeFileSync(join(OUT, `${name}_card.png`), Buffer.from(d.data, "base64"));
        }
        await cdp.eval(`(() => { const el = ${CARD_QUERY_EXPR}; if (el) el.style.zoom=""; return true; })()`);
        await cdp.shot(`${name}_full.png`);
    };

    const results = {};
    // S5 depends on S1 staying visible afterwards, so run S1 first and remember its card text.
    results.S1 = await runScenario(
        "S1",
        "S1: Tạo giúp tôi tấm tôn 800×300×2500 mm tại gốc tọa độ, dung sai 2 mm",
    );
    await captureCard("01_S1_dung_chuan");
    results.S1_pass = results.S1.includes("✔ HOÀN TẤT") && (results.S1.match(/✅/g) || []).length >= 2;

    // S5: user moves the result via REAL UI (tree click → modify.move → typed coordinates),
    // no agent, no router — the markers + executeCommand/closeCommandContext refresh must flip it.
    // Selection thật qua tree click, rồi alias MOVE, rồi hai cú click Canvas THẬT (CDP mouse).
    const clickRow = async () =>
        cdp.eval(`(() => {
        const node = app.activeView?.document?.modelManager?.findNodes(n => (n.name || '').includes('Tấm C2'))[0];
        if (node) {
            try {
                app.selectionManager.setSelection([node]);
            } catch {}
        }
        const exact = [...document.querySelectorAll('*')].filter((e) =>
            e.shadowRoot === null && (e.textContent || '').trim() === 'Tấm C2');
        const label = exact[exact.length - 1];
        if (!label) return !!node;
        let row = label;
        for (let i = 0; i < 8 && row; i++) {
            if (/treeItem/.test(String(row.className || ''))) break;
            row = row.parentElement;
        }
        const t = row && /treeItem/.test(String(row.className || '')) ? row : label;
        for (const type of ["pointerdown", "pointerup"]) t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }));
        t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      })()`);
    const startMove = () =>
        cdp.eval(`(() => {
        const i = document.querySelector('input[placeholder*="Nhập lệnh"]');
        if (!i) return false;
        i.focus(); i.value = "MOVE";
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        return true;
      })()`);
    const sel = { rowClicked: await clickRow() };
    const cv = await cdp.eval(
        `(() => {
            const cs = [...document.querySelectorAll('canvas')].filter(c => {
                const r = c.getBoundingClientRect();
                return r.width > 50 && r.height > 50;
            });
            if (cs.length > 0) {
                cs.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return rb.width*rb.height-ra.width*ra.height;});
                const r = cs[0].getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height };
            }
            return { x: 360, y: 147.5, w: 819, h: 740.5 };
        })()`,
    );
    const clickAt = async (x, y) => {
        for (const type of ["mousePressed", "mouseReleased"])
            await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
        await sleep(700);
    };
    const hover = async (x, y) => cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    const pickPair = async (dx) => {
        const bx = cv.x + cv.w * 0.5,
            by = cv.y + cv.h * 0.55;
        await hover(bx, by);
        await clickAt(bx, by); // base point
        await hover(bx + dx, by);
        await clickAt(bx + dx, by); // target point — delta dx px
    };
    // Attempt 1: tree click đã chọn row → phát MOVE từ command bar rồi click canvas.
    if (sel.rowClicked) {
        await sleep(300);
        await startMove();
        await sleep(700);
        await pickPair(130);
    }
    const flipped1 = await pollCard((t) => t.includes("⏳"), 20);
    // Attempt 2 (nếu cần): chọn lại bằng click canvas trực tiếp, MOVE lại, nhích xa hơn.
    if (!flipped1) {
        await clickAt(cv.x + cv.w * 0.5, cv.y + cv.h * 0.55);
        await sleep(400);
        await startMove();
        await sleep(700);
        await pickPair(300);
    }
    const moved = { ...sel, canvas: cv, flippedAttempt1: flipped1 };
    let afterMove = "";
    for (let i = 0; i < 8; i++) {
        afterMove = String(
            (await cdp.eval(`(() => { const el = ${CARD_QUERY_EXPR}; return el ? el.innerText : ''; })()`)) ||
                "",
        );
        if (afterMove.includes("⏳")) break;
        await sleep(300);
    }
    await captureCard("02_S5_sau_move_UI");
    results.S5 = {
        moved,
        card: afterMove,
        badge_gone: !afterMove.includes("✔ HOÀN TẤT") && afterMove.includes("⏳"),
        flip_reason: /history-changed|state-changed|document-changed/.test(afterMove),
    };

    results.S2 = await runScenario("S2", "S2: Tạo tấm tôn 700×300×2500 mm (lỗi: rộng 700 thay vì 800)");
    await captureCard("03_S2_sai_kich_thuoc");
    results.S2_pass = results.S2.includes("❌") && results.S2.includes("lệch") && results.S2.includes("⏳");

    results.S3 = await runScenario("S3", "S3: Tạo tấm rồi di chuyển lệch tâm 400 mm theo Y (lỗi vị trí)");
    await captureCard("04_S3_sai_vi_tri");
    const s3HasExpected = results.S3.includes("mong 150 mm") || results.S3.includes("150");
    const s3HasMeasured = results.S3.includes("đo 550 mm") || results.S3.includes("550");
    const s3HasDeviation = results.S3.includes("lệch 400 mm");
    const s3SizePass = results.S3.includes("✅") && /kích thước/i.test(results.S3);
    const s3PositionFail = results.S3.includes("❌") && /trục Y/.test(results.S3);
    results.S3_pass =
        s3SizePass &&
        s3PositionFail &&
        results.S3.includes("⏳") &&
        s3HasExpected &&
        s3HasMeasured &&
        s3HasDeviation;
    results.S3_toolCards = await cdp.eval(
        `(() => [...document.querySelectorAll('[class*=toolCard]')].map((c) => c.innerText.slice(0, 400)))()`,
    );

    results.S4 = await runScenario("S4", "S4: Tạo tấm nhưng tiêu chí trỏ tên đối tượng không tồn tại");
    await captureCard("05_S4_khong_do_duoc");
    results.S4_pass =
        results.S4.includes("❓") &&
        /không có đối tượng để đo|state-unverifiable/.test(results.S4) &&
        results.S4.includes("⏳");

    const report = {
        app: APP_URL,
        provider: `scripted mock completions SSE (127.0.0.1:${PROVIDER_PORT}) — KHÔNG phải LLM thật`,
        kernel: "OCCT/WASM thật của app (mọi phép đo chạy trên hình học thật)",
        flow: "ChatPanel user text → propose_task_plan (card) → user Approve → run_program/transform_node qua governed router → send() finally: finalizeTaskVerification → evidence card",
        scenarios: results,
        allPass:
            results.S1_pass &&
            results.S2_pass &&
            results.S3_pass &&
            results.S4_pass &&
            results.S5.badge_gone &&
            results.S5.flip_reason,
        capturedAt: new Date().toISOString(),
    };
    writeFileSync(join(OUT, "c2_flow_report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.allPass) throw new Error("C2 acceptance scenarios NOT all green");
}

try {
    await main();
} finally {
    child.kill();
    provider.close();
    try {
        rmSync(userData, { recursive: true, force: true });
    } catch {}
}
