// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9445;
const doc160 = JSON.parse(readFileSync(resolve("data/du_an_1_latest.json"), "utf8"));

console.log("Launching Google Chrome with window (GPU hardware acceleration Apple Metal)...");
const child = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--window-size=1280,800",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=/tmp/chrome-compare-bench",
    "http://localhost:8080",
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

    console.log("Waiting for app to settle in windowed Chrome...");
    for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const ready = await evaluate("typeof globalThis.__chiliTest !== 'undefined'").catch(() => false);
        if (ready) break;
    }
    await evaluate("globalThis.__chiliTest.settled()");
    console.log("App settled!");

    // Query hardware acceleration details
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
    console.log("GPU Hardware Acceleration:", gpuInfo);

    // Helpers
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
                stats: {
                    renderCpuTime: 0,
                    renderCount: 0,
                    panCpuTime: 0,
                    panCount: 0,
                    zoomCpuTime: 0,
                    zoomCount: 0,
                    raycastCount: 0,
                },
                _running: false,
                _lastRaf: 0,
                start() {
                    this.frameDeltas = [];
                    this.stats = {
                        renderCpuTime: 0,
                        renderCount: 0,
                        panCpuTime: 0,
                        panCount: 0,
                        zoomCpuTime: 0,
                        zoomCount: 0,
                        raycastCount: 0,
                    };
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
                        stats: {
                            renderCpuTime: Math.round(this.stats.renderCpuTime * 100) / 100,
                            renderCount: this.stats.renderCount,
                            panCpuTime: Math.round(this.stats.panCpuTime * 100) / 100,
                            panCount: this.stats.panCount,
                            zoomCpuTime: Math.round(this.stats.zoomCpuTime * 100) / 100,
                            zoomCount: this.stats.zoomCount,
                            raycastCount: this.stats.raycastCount,
                        }
                    };
                }
            };
        })()
    `);

    // Load document
    console.log("\n=== Loading 160-node document ===");
    await send("Runtime.evaluate", {
        expression: `window.__benchDocData = ${JSON.stringify(doc160)};`,
    });
    await evaluate(`
        (async () => {
            await globalThis.__chiliTest.loadDocument(window.__benchDocData);
            await globalThis.__chiliTest.settled();
        })()
    `);
    await evaluate("globalThis.__chiliTest.quietFrames(5)");

    // Instrumentation
    await evaluate(`
        (() => {
            const app = globalThis.__chiliTest.app;
            const view = app.activeView;
            const cc = view.cameraController;

            // Spy on Raycaster.prototype.intersectObjects
            const THREE = window.__THREE || (view._renderer?.constructor ? Object.getPrototypeOf(view._renderer.constructor) : null);
            // We can wrap cc.zoom to reset cache if __forceUncachedRaycast is true
            cc.__origZoom = cc.zoom.bind(cc);
            cc.zoom = function(x, y, delta) {
                if (window.__forceUncachedRaycast) {
                    cc._cachedZoomIntersect = null;
                    cc._cachedZoomX = -1;
                    window.__bench.stats.raycastCount++;
                }
                const t0 = performance.now();
                cc.__origZoom(x, y, delta);
                window.__bench.stats.zoomCpuTime += (performance.now() - t0);
                window.__bench.stats.zoomCount++;
            };

            cc.__origPan = cc.pan.bind(cc);
            cc.pan = function(dx, dy) {
                const t0 = performance.now();
                cc.__origPan(dx, dy);
                window.__bench.stats.panCpuTime += (performance.now() - t0);
                window.__bench.stats.panCount++;
            };

            view._renderer.__origRender = view._renderer.render.bind(view._renderer);
            view._renderer.render = function(...args) {
                const t0 = performance.now();
                view._renderer.__origRender(...args);
                window.__bench.stats.renderCpuTime += (performance.now() - t0);
                window.__bench.stats.renderCount++;
            };
        })()
    `);

    // =========================================================================
    // PART 1: Empirical Verification of _NodeVisualMap size during repeated pan/zoom
    // =========================================================================
    console.log("\n=== [PHẦN 1] Kiểm chứng thực nghiệm _NodeVisualMap qua các chu kỳ thao tác ===");
    const nodeVisualMapTest = await evaluate(`
        (async () => {
            const view = globalThis.__chiliTest.app.activeView;
            const ctx = view.content;
            const initialMapSize = ctx._NodeVisualMap.size;
            const initialVisualNodeMapSize = ctx._visualNodeMap.size;
            const initialChildrenCount = ctx.visualShapes.children.length;

            const measurements = [];
            measurements.push({ step: "initial", nodeVisualMapSize: initialMapSize, visualNodeMapSize: initialVisualNodeMapSize, visualShapesCount: initialChildrenCount });

            // Perform 100 pan and zoom cycles
            for (let i = 1; i <= 100; i++) {
                view.cameraController.pan(5, -5);
                view.cameraController.zoom(view.width / 2, view.height / 2, (i % 2 === 0 ? 10 : -10));
                view.update();

                if (i === 10 || i === 25 || i === 50 || i === 100) {
                    measurements.push({
                        step: \`cycle_\${i}\`,
                        nodeVisualMapSize: ctx._NodeVisualMap.size,
                        visualNodeMapSize: ctx._visualNodeMap.size,
                        visualShapesCount: ctx.visualShapes.children.length,
                    });
                }
            }

            const finalMapSize = ctx._NodeVisualMap.size;
            const isAccumulating = finalMapSize > initialMapSize;

            return {
                initialMapSize,
                finalMapSize,
                isAccumulating,
                delta: finalMapSize - initialMapSize,
                measurements,
                explanation: isAccumulating
                    ? "_NodeVisualMap tăng trưởng"
                    : "_NodeVisualMap kích thước hoàn toàn bất biến qua 100 chu kỳ pan/zoom. Không có rò rỉ hay tích lũy đối tượng."
            };
        })()
    `);
    console.log("Kết quả kiểm chứng _NodeVisualMap:", JSON.stringify(nodeVisualMapTest, null, 2));

    // =========================================================================
    // PART 2: Head-to-Head Comparison (Bản cũ vs Bản sửa)
    // =========================================================================
    console.log(
        "\n=== [PHẦN 2] Đo đối chứng Bản cũ (Không cache raycast) vs Bản sửa (Có cache raycast + Lọc ẩn) ===",
    );

    async function getCameraPose() {
        return evaluate(`
            (() => {
                const cc = globalThis.__chiliTest.app.activeView.cameraController;
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
                const cc = globalThis.__chiliTest.app.activeView.cameraController;
                cc.camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
                cc.target.set(pose.target.x, pose.target.y, pose.target.z);
                cc.camera.zoom = pose.zoom;
                cc.updateLens();
                cc.updateCameraPosionTarget();
                globalThis.__chiliTest.app.activeView.update();
            })(${JSON.stringify(pose)})
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
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

    const baselinePose = await getCameraPose();

    async function runScenarioSuite(label, forceUncached) {
        console.log(`\n--- Đang chạy kịch bản: ${label} (forceUncached=${forceUncached}) ---`);
        await evaluate(`window.__forceUncachedRaycast = ${forceUncached};`);

        const results = {};

        // 1. Drag H
        await restoreCamera(baselinePose);
        await evaluate(`
            (() => {
                const event = new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true });
                window.dispatchEvent(event);
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
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
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        results.dragH = await evaluate("window.__bench.stop()");
        results.dragH.wallTimeMs = Date.now() - t0H;
        const p1H = await getCameraPose();
        results.dragH.camera = verifyCameraDelta(p0H, p1H);
        await evaluate(`
            (() => {
                const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
                window.dispatchEvent(event);
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");

        // 2. Drag Middle
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
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        results.dragMiddle = await evaluate("window.__bench.stop()");
        results.dragMiddle.wallTimeMs = Date.now() - t0Mid;
        const p1Mid = await getCameraPose();
        results.dragMiddle.camera = verifyCameraDelta(p0Mid, p1Mid);

        // 3. Wheel Zoom
        await restoreCamera(baselinePose);
        const p0Wheel = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0Wheel = Date.now();
        await evaluate(`
            (async () => {
                const viewport = document.querySelector("chili-uiview");
                const rect = viewport.getBoundingClientRect();
                const cx = rect.width / 2;
                const cy = rect.height / 2;
                for (let i = 0; i < 20; i++) {
                    viewport.dispatchEvent(window.__createWheelEvent("wheel", {
                        deltaY: (i < 10 ? -120 : 120),
                        clientX: rect.left + cx,
                        clientY: rect.top + cy,
                        offsetX: cx,
                        offsetY: cy,
                    }));
                    await new Promise(r => setTimeout(r, 16));
                }
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        results.wheelZoom = await evaluate("window.__bench.stop()");
        results.wheelZoom.wallTimeMs = Date.now() - t0Wheel;
        const p1Wheel = await getCameraPose();
        results.wheelZoom.camera = verifyCameraDelta(p0Wheel, p1Wheel);

        // 4. Button Zoom (+/- clicks)
        await restoreCamera(baselinePose);
        const p0Btn = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0Btn = Date.now();
        await evaluate(`
            (async () => {
                const view = globalThis.__chiliTest.app.activeView;
                for (let i = 0; i < 10; i++) {
                    const delta = (i < 5 ? -5 : 5);
                    view.cameraController.zoom(view.width / 2, view.height / 2, delta);
                    view.update();
                    await new Promise(r => setTimeout(r, 30));
                }
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        results.buttonZoom = await evaluate("window.__bench.stop()");
        results.buttonZoom.wallTimeMs = Date.now() - t0Btn;
        const p1Btn = await getCameraPose();
        results.buttonZoom.camera = verifyCameraDelta(p0Btn, p1Btn);

        return results;
    }

    const unoptimizedOld = await runScenarioSuite("Bản cũ (Unoptimized Raycast)", true);
    const optimizedFixed = await runScenarioSuite("Bản sửa (Optimized Raycast Cache)", false);

    // =========================================================================
    // PART 3: CDP Trace for both
    // =========================================================================
    console.log("\n=== [PHẦN 3] Thu thập CDP Tracing cho Wheel Zoom ===");

    async function traceWheel(label, forceUncached) {
        await restoreCamera(baselinePose);
        await evaluate(`window.__forceUncachedRaycast = ${forceUncached};`);
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
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        await send("Tracing.end");
        await new Promise((r) => setTimeout(r, 1000));

        const cats = {};
        for (const ev of traceEvents) {
            if (ev.dur && ev.name) {
                cats[ev.name] = (cats[ev.name] || 0) + ev.dur / 1000;
            }
        }
        return {
            eventCount: traceEvents.length,
            categories: cats,
        };
    }

    const traceOld = await traceWheel("Bản cũ", true);
    const traceFixed = await traceWheel("Bản sửa", false);

    const fullReport = {
        gpuInfo,
        nodeVisualMapVerification: nodeVisualMapTest,
        comparison: {
            old: unoptimizedOld,
            fixed: optimizedFixed,
        },
        traces: {
            old: traceOld,
            fixed: traceFixed,
        },
    };

    writeFileSync("data/bench-comparison-report.json", JSON.stringify(fullReport, null, 2));
    console.log("\nReport written to data/bench-comparison-report.json");

    ws.close();
} finally {
    child.kill("SIGKILL");
}
