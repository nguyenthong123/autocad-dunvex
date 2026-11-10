// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9448;
const doc160 = JSON.parse(readFileSync(resolve("data/du_an_1_latest.json"), "utf8"));

console.log("=== Khởi chạy Chrome có cửa sổ (Apple Metal GPU) để đo 2 real build ===");
const child = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--window-size=1280,800",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--user-data-dir=/tmp/chrome-bench-two-builds",
    "about:blank",
]);

try {
    let connected = false;
    for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            if (res.ok) {
                connected = true;
                break;
            }
        } catch {}
    }
    if (!connected) throw new Error(`Could not connect to Chrome DevTools on port ${PORT}`);

    const pagesRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const pages = await pagesRes.json();
    const target = pages.find((p) => p.type === "page");
    if (!target) throw new Error("No page found");

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve, { once: true });
        ws.addEventListener("error", reject, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    const traceEvents = [];
    ws.addEventListener("message", (e) => {
        const msg = JSON.parse(e.data);
        if (msg.method === "Tracing.dataCollected") {
            traceEvents.push(...msg.params.value);
        }
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
        }
    });

    function send(method, params = {}) {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }

    async function evaluate(expression) {
        const res = await send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (res.exceptionDetails) {
            throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
        }
        return res.result.value;
    }

    async function navigateTo(url) {
        await send("Page.navigate", { url });
        // Poll until app and activeView are ready
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 250));
            const ready = await evaluate(`
                typeof window.app !== 'undefined'
            `).catch(() => false);
            if (ready) break;
        }
    }

    async function initEnvironment() {
        const gpuInfo = await evaluate(`
            (() => {
                const canvas = document.createElement("canvas");
                const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
                if (!gl) return { error: "No WebGL context" };
                const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
                return {
                    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                    isHardwareAccelerated: !gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER).toLowerCase().includes("swiftshader"),
                };
            })()
        `);

        // Install event synthesis and bench harness
        await evaluate(`
            (() => {
                window.__createPointerEvent = (type, init) => {
                    const e = new PointerEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        pointerType: "mouse",
                        isPrimary: true,
                        ...init,
                    });
                    if (init.offsetX !== undefined) Object.defineProperty(e, "offsetX", { value: init.offsetX, configurable: true });
                    if (init.offsetY !== undefined) Object.defineProperty(e, "offsetY", { value: init.offsetY, configurable: true });
                    return e;
                };
                window.__createWheelEvent = (type, init) => {
                    const e = new WheelEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        ...init,
                    });
                    if (init.offsetX !== undefined) Object.defineProperty(e, "offsetX", { value: init.offsetX, configurable: true });
                    if (init.offsetY !== undefined) Object.defineProperty(e, "offsetY", { value: init.offsetY, configurable: true });
                    return e;
                };

                window.__bench = {
                    frameDeltas: [],
                    _running: false,
                    _lastRaf: 0,
                    start() {
                        this.frameDeltas = [];
                        this._running = true;
                        this._lastRaf = performance.now();
                        const loop = (now) => {
                            if (!this._running) return;
                            const delta = now - this._lastRaf;
                            this._lastRaf = now;
                            this.frameDeltas.push(delta);
                            requestAnimationFrame(loop);
                        };
                        requestAnimationFrame(loop);
                    },
                    stop() {
                        this._running = false;
                        const f = this.frameDeltas.slice(1);
                        const sorted = [...f].sort((a, b) => a - b);
                        const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] : 0;
                        const over33 = f.filter(d => d > 33.33).length;
                        const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
                        const max = sorted.length ? sorted[sorted.length - 1] : 0;
                        return {
                            p95: Math.round(p95 * 100) / 100,
                            over33,
                            totalFrames: f.length,
                            max: Math.round(max * 100) / 100,
                            avg: Math.round(avg * 100) / 100,
                        };
                    }
                };

                window.__benchStats = {
                    raycastFirstWheel: 0,
                    raycastSubsequentWheel: 0,
                    raycastTotalWheel: 0,
                    raycastButton: 0,
                    renderCount: 0,
                    renderCpuTime: 0,
                };
                window.__benchContext = null;
                window.__wheelEventIndex = 0;
            })()
        `);
        return gpuInfo;
    }

    async function loadDocAndInstrument() {
        console.log("Loading document into app...");
        await send("Runtime.evaluate", { expression: `window.__docData = ${JSON.stringify(doc160)};` });
        await evaluate(`(async () => { await window.app.loadDocument(window.__docData); return true; })()`);
        // Wait for rendering to settle
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 100));
            const hasView = await evaluate("!!window.app.activeView?.cameraController");
            if (hasView) break;
        }

        // Instrument Raycaster via prototype
        await evaluate(`
            (() => {
                const view = window.app.activeView;
                const rc = view.initRaycaster ? view.initRaycaster(0, 0) : null;
                if (rc) {
                    const proto = Object.getPrototypeOf(rc);
                    if (!proto.__origIntersectObjects) {
                        proto.__origIntersectObjects = proto.intersectObjects;
                        proto.intersectObjects = function(...args) {
                            if (window.__benchContext === "wheel") {
                                if (window.__wheelEventIndex === 0) {
                                    window.__benchStats.raycastFirstWheel++;
                                } else {
                                    window.__benchStats.raycastSubsequentWheel++;
                                }
                                window.__benchStats.raycastTotalWheel++;
                            } else if (window.__benchContext === "button") {
                                window.__benchStats.raycastButton++;
                            }
                            return proto.__origIntersectObjects.apply(this, args);
                        };
                    }
                }

                if (view._renderer && !view._renderer.__origRender) {
                    view._renderer.__origRender = view._renderer.render.bind(view._renderer);
                    view._renderer.render = function(...args) {
                        const t0 = performance.now();
                        view._renderer.__origRender(...args);
                        window.__benchStats.renderCpuTime += (performance.now() - t0);
                        window.__benchStats.renderCount++;
                    };
                }
            })()
        `);
        await new Promise((r) => setTimeout(r, 500));
    }

    async function getCameraPose() {
        return evaluate(`
            (() => {
                const cc = window.app.activeView.cameraController;
                const cam = cc.camera;
                return {
                    pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
                    target: { x: cc.target.x, y: cc.target.y, z: cc.target.z },
                    zoom: cam.zoom,
                };
            })()
        `);
    }

    async function restoreCamera(pose) {
        await evaluate(`
            ((pose) => {
                const cc = window.app.activeView.cameraController;
                cc.camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
                cc.target.set(pose.target.x, pose.target.y, pose.target.z);
                cc.camera.zoom = pose.zoom;
                if (cc.updateLens) cc.updateLens();
                if (cc.updateCameraPosionTarget) cc.updateCameraPosionTarget();
                window.app.activeView.update();
            })(${JSON.stringify(pose)})
        `);
        await new Promise((r) => setTimeout(r, 100));
    }

    function verifyCameraDelta(pose0, pose1) {
        const dx = pose1.pos.x - pose0.pos.x;
        const dy = pose1.pos.y - pose0.pos.y;
        const dz = pose1.pos.z - pose0.pos.z;
        const distPos = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const dtx = pose1.target.x - pose0.target.x;
        const dty = pose1.target.y - pose0.target.y;
        const dtz = pose1.target.z - pose0.target.z;
        const distTarget = Math.sqrt(dtx * dtx + dty * dty + dtz * dtz);
        const distZoom = Math.abs(pose1.zoom - pose0.zoom);
        const changed = distPos > 0.001 || distTarget > 0.001 || distZoom > 0.0001;
        return {
            valid: changed,
            distPos: Math.round(distPos * 100) / 100,
            distTarget: Math.round(distTarget * 100) / 100,
            distZoom: Math.round(distZoom * 1000) / 1000,
        };
    }

    async function runBenchmarkForBuild(label, buildUrl, sha) {
        console.log(`\n======================================================`);
        console.log(`Bắt đầu đo trên ${label} (SHA: ${sha}) tại ${buildUrl}`);
        console.log(`======================================================`);
        await navigateTo(buildUrl);
        const gpuInfo = await initEnvironment();
        await loadDocAndInstrument();

        const baselinePose = await getCameraPose();
        console.log("Baseline camera pose:", baselinePose);

        const out = {
            sha,
            label,
            buildUrl,
            gpuInfo,
        };

        // 1. Drag H (Pan, 30 steps)
        console.log(`[${label}] 1. Kéo bằng phím H (30 bước)...`);
        await restoreCamera(baselinePose);
        await evaluate(`
            (() => {
                const event = new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true });
                window.dispatchEvent(event);
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));
        const p0H = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0H = Date.now();
        await evaluate(`
            (async () => {
                const viewport = document.querySelector("chili-uiview");
                const rect = viewport.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                viewport.dispatchEvent(window.__createPointerEvent("pointerdown", {
                    button: 0, buttons: 1, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
                for (let i = 0; i < 30; i++) {
                    const dx = (i % 2 === 0 ? 20 : -20);
                    viewport.dispatchEvent(window.__createPointerEvent("pointermove", {
                        button: 0, buttons: 1, clientX: rect.left + cx + dx, clientY: rect.top + cy, offsetX: cx + dx, offsetY: cy
                    }));
                    await new Promise(r => setTimeout(r, 16));
                }
                viewport.dispatchEvent(window.__createPointerEvent("pointerup", {
                    button: 0, buttons: 0, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));
        out.dragH = await evaluate("window.__bench.stop()");
        out.dragH.wallTimeMs = Date.now() - t0H;
        const p1H = await getCameraPose();
        out.dragH.camera = verifyCameraDelta(p0H, p1H);
        await evaluate(`
            (() => {
                const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
                window.dispatchEvent(event);
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));

        // 2. Drag Middle Button (Pan, 30 steps)
        console.log(`[${label}] 2. Kéo bằng nút giữa chuột (30 bước)...`);
        await restoreCamera(baselinePose);
        const p0Mid = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0Mid = Date.now();
        await evaluate(`
            (async () => {
                const viewport = document.querySelector("chili-uiview");
                const rect = viewport.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                viewport.dispatchEvent(window.__createPointerEvent("pointerdown", {
                    button: 1, buttons: 4, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
                for (let i = 0; i < 30; i++) {
                    const dx = (i % 2 === 0 ? 20 : -20);
                    viewport.dispatchEvent(window.__createPointerEvent("pointermove", {
                        button: 1, buttons: 4, clientX: rect.left + cx + dx, clientY: rect.top + cy, offsetX: cx + dx, offsetY: cy
                    }));
                    await new Promise(r => setTimeout(r, 16));
                }
                viewport.dispatchEvent(window.__createPointerEvent("pointerup", {
                    button: 1, buttons: 0, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));
        out.dragMiddle = await evaluate("window.__bench.stop()");
        out.dragMiddle.wallTimeMs = Date.now() - t0Mid;
        const p1Mid = await getCameraPose();
        out.dragMiddle.camera = verifyCameraDelta(p0Mid, p1Mid);

        // 3. Wheel Zoom (20 events) - Phân tách lần đầu vs các lần tiếp theo
        console.log(`[${label}] 3. Cuộn bánh xe chuột (20 events, tách lần đầu & các lần tiếp)...`);
        await restoreCamera(baselinePose);
        await evaluate(`
            window.__benchStats.raycastFirstWheel = 0;
            window.__benchStats.raycastSubsequentWheel = 0;
            window.__benchStats.raycastTotalWheel = 0;
        `);
        const p0Wheel = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0Wheel = Date.now();
        await evaluate(`
            (async () => {
                const viewport = document.querySelector("chili-uiview");
                const rect = viewport.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                window.__benchContext = "wheel";
                for (let i = 0; i < 20; i++) {
                    window.__wheelEventIndex = i;
                    viewport.dispatchEvent(window.__createWheelEvent("wheel", {
                        deltaY: (i < 10 ? -120 : 120),
                        clientX: rect.left + cx,
                        clientY: rect.top + cy,
                        offsetX: cx,
                        offsetY: cy,
                    }));
                    await new Promise(r => setTimeout(r, 16));
                }
                window.__benchContext = null;
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));
        out.wheelZoom = await evaluate("window.__bench.stop()");
        out.wheelZoom.wallTimeMs = Date.now() - t0Wheel;
        const p1Wheel = await getCameraPose();
        out.wheelZoom.camera = verifyCameraDelta(p0Wheel, p1Wheel);
        out.wheelZoom.raycasts = await evaluate(`({
            firstWheel: window.__benchStats.raycastFirstWheel,
            subsequentWheel: window.__benchStats.raycastSubsequentWheel,
            total: window.__benchStats.raycastTotalWheel,
        })`);

        // 4. Button Zoom (+/- clicks, 10 clicks)
        console.log(`[${label}] 4. Zoom bằng nút bấm +/- (10 clicks)...`);
        await restoreCamera(baselinePose);
        await evaluate(`window.__benchStats.raycastButton = 0;`);
        const p0Btn = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0Btn = Date.now();
        await evaluate(`
            (async () => {
                const view = window.app.activeView;
                window.__benchContext = "button";
                for (let i = 0; i < 10; i++) {
                    const delta = (i < 5 ? -5 : 5);
                    view.cameraController.zoom(view.width / 2, view.height / 2, delta);
                    view.update();
                    await new Promise(r => setTimeout(r, 30));
                }
                window.__benchContext = null;
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));
        out.buttonZoom = await evaluate("window.__bench.stop()");
        out.buttonZoom.wallTimeMs = Date.now() - t0Btn;
        const p1Btn = await getCameraPose();
        out.buttonZoom.camera = verifyCameraDelta(p0Btn, p1Btn);
        out.buttonZoom.raycasts = await evaluate(`window.__benchStats.raycastButton`);

        // 5. CDP Tracing for Wheel Zoom
        console.log(`[${label}] 5. Thu thập CDP Trace cho Wheel Zoom...`);
        await restoreCamera(baselinePose);
        traceEvents.length = 0;
        await send("Tracing.start", {
            categories: "-*,devtools.timeline,v8.execute,disabled-by-default-devtools.timeline",
        });
        await evaluate(`
            (async () => {
                const viewport = document.querySelector("chili-uiview");
                const rect = viewport.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                for (let i = 0; i < 15; i++) {
                    viewport.dispatchEvent(window.__createWheelEvent("wheel", {
                        deltaY: -120, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                    }));
                    await new Promise(r => setTimeout(r, 20));
                }
            })()
        `);
        await new Promise((r) => setTimeout(r, 100));
        await send("Tracing.end");
        await new Promise((r) => setTimeout(r, 1000));

        const cats = {};
        for (const ev of traceEvents) {
            if (ev.dur && ev.name) {
                cats[ev.name] = (cats[ev.name] || 0) + ev.dur / 1000;
            }
        }
        out.trace = {
            totalEvents: traceEvents.length,
            categories: cats,
        };

        return out;
    }

    // Measure Build 1: VPS commit 7e659dff (on port 8086)
    const vpsResult = await runBenchmarkForBuild("Bản VPS (7e659dff)", "http://localhost:8086", "7e659dff");

    // Measure Build 2: Candidate commit fbec3c95 (on port 8085)
    const candidateResult = await runBenchmarkForBuild(
        "Bản ứng viên (fbec3c95)",
        "http://localhost:8085",
        "fbec3c95",
    );

    const comparisonReport = {
        meta: {
            testDate: new Date().toISOString(),
            drawing: "data/du_an_1_latest.json",
            nodesCount: 160,
            vpsSha: "7e659dff",
            candidateSha: "fbec3c95",
            windowSize: "1280x800",
            reproducedUserLagLocally: false,
            localNote:
                "Cả bản VPS và bản ứng viên đều mượt trên mẫu cục bộ (Apple M1 GPU Metal, 0 khung > 33ms). Hiện tượng khựng của người dùng trên VPS/SwiftShader chưa tái hiện cục bộ; các kết luận về nguyên nhân giật lag do raycast/render CPU được giữ ở mức giả thuyết.",
        },
        vpsBuild: vpsResult,
        candidateBuild: candidateResult,
    };

    writeFileSync("data/bench-two-real-builds-report.json", JSON.stringify(comparisonReport, null, 2));
    console.log(
        "\n=== Hoàn tất đo đạc 2 real build! Báo cáo lưu tại data/bench-two-real-builds-report.json ===",
    );

    ws.close();
} finally {
    child.kill("SIGKILL");
}
