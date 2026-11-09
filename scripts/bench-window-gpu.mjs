// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9444;
const doc160 = JSON.parse(readFileSync(resolve("data/du_an_1_latest.json"), "utf8"));

// Launch Chrome WITH A REAL WINDOW (Hardware GPU accelerated, no SwiftShader)
console.log("Launching Google Chrome with window (GPU hardware acceleration)...");
const child = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    "--window-size=1280,800",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=/tmp/chrome-window-bench",
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

    // Query hardware acceleration details from WebGL context
    const gpuInfo = await evaluate(`
        (() => {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
            if (!gl) return { error: "No WebGL context" };
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            return {
                vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                isHardwareAccelerated: !gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER).toLowerCase().includes("swiftshader"),
            };
        })()
    `);
    console.log("GPU Hardware Acceleration Info:", gpuInfo);

    // Install helper methods in page
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
                        }
                    };
                }
            };
        })()
    `);

    async function instrumentView() {
        await evaluate(`
            (() => {
                const app = globalThis.__chiliTest.app;
                const view = app.activeView;
                if (!view) return;

                if (!view.cameraController.__origPan) {
                    view.cameraController.__origPan = view.cameraController.pan.bind(view.cameraController);
                    view.cameraController.pan = function(dx, dy) {
                        const t0 = performance.now();
                        view.cameraController.__origPan(dx, dy);
                        window.__bench.stats.panCpuTime += (performance.now() - t0);
                        window.__bench.stats.panCount++;
                    };
                }

                if (!view.cameraController.__origZoom) {
                    view.cameraController.__origZoom = view.cameraController.zoom.bind(view.cameraController);
                    view.cameraController.zoom = function(x, y, delta) {
                        const t0 = performance.now();
                        view.cameraController.__origZoom(x, y, delta);
                        window.__bench.stats.zoomCpuTime += (performance.now() - t0);
                        window.__bench.stats.zoomCount++;
                    };
                }

                if (!view._renderer.__origRender) {
                    view._renderer.__origRender = view._renderer.render.bind(view._renderer);
                    view._renderer.render = function(...args) {
                        const t0 = performance.now();
                        view._renderer.__origRender(...args);
                        window.__bench.stats.renderCpuTime += (performance.now() - t0);
                        window.__bench.stats.renderCount++;
                    };
                }
            })()
        `);
    }

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

    function verifyCameraDelta(pose0, pose1, requireChange = true) {
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
            valid: requireChange ? changed : !changed,
            distPos: Math.round(distPos * 100) / 100,
            distTarget: Math.round(distTarget * 100) / 100,
            distZoom: Math.round(distZoom * 1000) / 1000,
        };
    }

    async function loadDoc(data, name) {
        console.log(`\n=== Loading document: ${name} ===`);
        await send("Runtime.evaluate", {
            expression: `window.__benchDocData = ${JSON.stringify(data)};`,
        });
        await evaluate(`
            (async () => {
                await globalThis.__chiliTest.loadDocument(window.__benchDocData);
                await globalThis.__chiliTest.settled();
            })()
        `);
        await instrumentView();
        await evaluate("globalThis.__chiliTest.quietFrames(5)");
    }

    async function runBenchmarkActions(sessionLabel) {
        const out = {};

        // 1. Drag H
        console.log(`[${sessionLabel}] 1. Dragging with 'H' (Pan, 30 steps)`);
        await evaluate(`
            (() => {
                const event = new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true });
                window.dispatchEvent(event);
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");

        const pose0DragH = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0DragH = Date.now();
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
                    const curX = cx + dx;
                    const curY = cy;
                    viewport.dispatchEvent(window.__createPointerEvent("pointermove", {
                        button: 0, buttons: 1, clientX: rect.left + curX, clientY: rect.top + curY, offsetX: curX, offsetY: curY
                    }));
                    await new Promise(r => setTimeout(r, 16));
                }

                viewport.dispatchEvent(window.__createPointerEvent("pointerup", {
                    button: 0, buttons: 0, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        out.dragH = await evaluate("window.__bench.stop()");
        out.dragH.wallTimeMs = Date.now() - t0DragH;
        const pose1DragH = await getCameraPose();
        out.dragH.camera = verifyCameraDelta(pose0DragH, pose1DragH, true);

        // Cancel pan command
        await evaluate(`
            (() => {
                const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
                window.dispatchEvent(event);
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");

        // 2. Drag Middle Button
        console.log(`[${sessionLabel}] 2. Dragging with Middle Mouse Button (30 steps)`);
        const pose0DragMid = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0DragMid = Date.now();
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
                    const curX = cx + dx;
                    const curY = cy;
                    viewport.dispatchEvent(window.__createPointerEvent("pointermove", {
                        button: 1, buttons: 4, clientX: rect.left + curX, clientY: rect.top + curY, offsetX: curX, offsetY: curY
                    }));
                    await new Promise(r => setTimeout(r, 16));
                }

                viewport.dispatchEvent(window.__createPointerEvent("pointerup", {
                    button: 1, buttons: 0, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
            })()
        `);
        await evaluate("globalThis.__chiliTest.quietFrames(3)");
        out.dragMiddle = await evaluate("window.__bench.stop()");
        out.dragMiddle.wallTimeMs = Date.now() - t0DragMid;
        const pose1DragMid = await getCameraPose();
        out.dragMiddle.camera = verifyCameraDelta(pose0DragMid, pose1DragMid, true);

        // 3. Wheel Zoom (20 events)
        console.log(`[${sessionLabel}] 3. Mouse Wheel Zoom (20 events)`);
        const pose0Wheel = await getCameraPose();
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
        out.wheelZoom = await evaluate("window.__bench.stop()");
        out.wheelZoom.wallTimeMs = Date.now() - t0Wheel;
        const pose1Wheel = await getCameraPose();
        out.wheelZoom.camera = verifyCameraDelta(pose0Wheel, pose1Wheel, true);

        // 4. Button Zoom (+ / - buttons, 10 clicks)
        console.log(`[${sessionLabel}] 4. Button Zoom (+/- clicks, 10 steps)`);
        const pose0Button = await getCameraPose();
        await evaluate("window.__bench.start()");
        const t0Button = Date.now();
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
        out.buttonZoom = await evaluate("window.__bench.stop()");
        out.buttonZoom.wallTimeMs = Date.now() - t0Button;
        const pose1Button = await getCameraPose();
        out.buttonZoom.camera = verifyCameraDelta(pose0Button, pose1Button, true);

        return out;
    }

    // Step A: Load 160-node document & simulate long-running session
    await loadDoc(doc160, "Dự án 1 (160 nodes, phiên chạy lâu / long session)");
    console.log("Simulating long-running user session (accumulating undo history, interaction cycles)...");
    await evaluate(`
        (async () => {
            const app = globalThis.__chiliTest.app;
            const view = app.activeView;
            // Run 30 interactive cycles of pan/zoom/camera movements simulating continuous editing
            for (let i = 0; i < 30; i++) {
                view.cameraController.pan(5, -5);
                view.cameraController.zoom(view.width / 2, view.height / 2, (i % 2 === 0 ? 10 : -10));
                view.update();
                if (i % 5 === 0) await new Promise(r => setTimeout(r, 20));
            }
            await globalThis.__chiliTest.quietFrames(5);
        })()
    `);
    const initialPose = await getCameraPose();

    console.log("\n--- [PHẦN 1] Đo trên PHIÊN CHẠY LÂU (Trước khi tải lại) ---");
    const sessionLong = await runBenchmarkActions("Phiên chạy lâu");

    // Step B: Reload document cleanly (Sau khi tải lại)
    console.log("\n--- [PHẦN 2] Đo SAU KHI TẢI LẠI (Fresh reload cùng bản vẽ) ---");
    await loadDoc(doc160, "Dự án 1 (160 nodes, vừa tải lại)");
    // Restore exact initial camera pose
    await evaluate(`
        ((pose) => {
            const cc = globalThis.__chiliTest.app.activeView.cameraController;
            cc.camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
            cc.target.set(pose.target.x, pose.target.y, pose.target.z);
            cc.camera.zoom = pose.zoom;
            cc.updateLens();
            cc.updateCameraPosionTarget();
            globalThis.__chiliTest.app.activeView.update();
        })(${JSON.stringify(initialPose)})
    `);
    await evaluate("globalThis.__chiliTest.quietFrames(5)");
    const sessionFresh = await runBenchmarkActions("Sau khi tải lại");

    // Step C: Test with slat/lam/nano array HIDDEN on a copy of the drawing
    console.log("\n--- [PHẦN 3] Đo KHI ẨN NHÓM LAM/NANO (Trên bản sao) ---");
    const hiddenCount = await evaluate(`
        (() => {
            const doc = globalThis.__chiliTest.app.activeView.document;
            let count = 0;
            function hideRec(node) {
                if (node.name && (node.name.toLowerCase().includes('lam') || node.name.toLowerCase().includes('nano') || node.name.toLowerCase().includes('mảng'))) {
                    node.visible = false;
                    count++;
                }
                if (node._children) {
                    for (let c = node.firstChild; c; c = c.nextSibling) {
                        hideRec(c);
                    }
                }
            }
            hideRec(doc.modelManager.rootNode);
            globalThis.__chiliTest.app.activeView.update();
            return count;
        })()
    `);
    console.log("Hidden slat count:", hiddenCount);
    await evaluate("globalThis.__chiliTest.quietFrames(5)");
    const sessionHidden = await runBenchmarkActions("Ẩn nhóm lam/nano");

    // Step D: Deep Chrome CDP Trace on Hardware GPU
    console.log("\n--- [PHẦN 4] Thu thập Chrome CDP Tracing trên Hardware GPU ---");
    traceEvents.length = 0;
    await send("Tracing.start", {
        categories: "-*,devtools.timeline,v8.execute,disabled-by-default-devtools.timeline",
    });

    // Wheel zoom trace
    await evaluate(`
        (async () => {
            const viewport = document.querySelector("chili-uiview");
            const rect = viewport.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            for (let i = 0; i < 10; i++) {
                viewport.dispatchEvent(window.__createWheelEvent("wheel", {
                    deltaY: -120, clientX: rect.left + cx, clientY: rect.top + cy, offsetX: cx, offsetY: cy
                }));
                await new Promise(r => setTimeout(r, 20));
            }
        })()
    `);
    await evaluate("globalThis.__chiliTest.quietFrames(3)");

    // Button zoom trace
    await evaluate(`
        (async () => {
            const view = globalThis.__chiliTest.app.activeView;
            for (let i = 0; i < 5; i++) {
                view.cameraController.zoom(view.width / 2, view.height / 2, -5);
                view.update();
                await new Promise(r => setTimeout(r, 30));
            }
        })()
    `);
    await evaluate("globalThis.__chiliTest.quietFrames(5)");

    await send("Tracing.end");
    await new Promise((r) => setTimeout(r, 1000));
    console.log(`Trace finished, collected ${traceEvents.length} events!`);

    const breakdown = {
        totalEvents: traceEvents.length,
        taskCategories: {},
    };
    for (const ev of traceEvents) {
        if (ev.dur && ev.name) {
            breakdown.taskCategories[ev.name] = (breakdown.taskCategories[ev.name] || 0) + ev.dur / 1000;
        }
    }

    const report = {
        gpuInfo,
        sessionLong,
        sessionFresh,
        sessionHidden,
        traceBreakdown: breakdown,
    };

    writeFileSync("data/bench-window-gpu-report.json", JSON.stringify(report, null, 2));
    console.log("Full GPU benchmark report saved to data/bench-window-gpu-report.json");

    ws.close();
} finally {
    child.kill("SIGKILL");
}
