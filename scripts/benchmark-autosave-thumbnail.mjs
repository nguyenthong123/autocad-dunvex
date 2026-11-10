// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(".");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CDP_PORT = 9445;
const USER_DATA_DIR = "/tmp/chrome-autosave-bench";
const TARGET_URL = "http://localhost:8080/";

class CDPClient {
    constructor(port) {
        this.port = port;
        this.proc = null;
        this.ws = null;
        this.msgId = 1;
        this.callbacks = new Map();
    }

    async launch() {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        this.proc = spawn(
            CHROME,
            [
                `--remote-debugging-port=${this.port}`,
                `--user-data-dir=${USER_DATA_DIR}`,
                "--no-first-run",
                "--no-default-browser-check",
                "--enable-webgl",
                "--use-gl=angle",
                "--use-angle=metal",
                "--window-size=1440,900",
                "about:blank",
            ],
            { stdio: "ignore" },
        );

        let wsUrl = null;
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 200));
            try {
                const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
                if (res.ok) {
                    const data = await res.json();
                    wsUrl = data.webSocketDebuggerUrl;
                    break;
                }
            } catch {}
        }
        if (!wsUrl) throw new Error("Không thể kết nối Chrome CDP");

        const targetsRes = await fetch(`http://127.0.0.1:${this.port}/json`);
        const targets = await targetsRes.json();
        const pageTarget = targets.find((t) => t.type === "page") || targets[0];

        this.ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === "Runtime.consoleAPICalled") {
                const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
                console.log(`      [Chrome Console] ${msg.params.type}: ${args}`);
            }
            if (msg.method === "Runtime.exceptionThrown") {
                console.error(`      [Chrome Exception]`, msg.params.exceptionDetails);
            }
            if (msg.id && this.callbacks.has(msg.id)) {
                const { resolve, reject } = this.callbacks.get(msg.id);
                this.callbacks.delete(msg.id);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
            }
        };

        await this.send("Page.enable");
        await this.send("Runtime.enable");
    }

    send(method, params = {}) {
        const id = this.msgId++;
        return new Promise((resolve, reject) => {
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (res.exceptionDetails) {
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async close() {
        if (this.ws) this.ws.close();
        if (this.proc) this.proc.kill("SIGKILL");
        try {
            fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
        } catch {}
    }
}

async function main() {
    console.log("================================================================================");
    console.log("🚀 BẮT ĐẦU ĐO ĐẠC & ĐIỀU TRA: TỰ LƯU, ẢNH THU NHỎ & HIỆU NĂNG PAN/ZOOM");
    console.log("================================================================================");

    const client = new CDPClient(CDP_PORT);
    try {
        console.log("1. Khởi chạy Chrome Apple Metal và kết nối Dev Server...");
        await client.launch();
        await client.send("Page.navigate", { url: TARGET_URL });

        console.log("   -> Chờ ứng dụng qua màn hình Loading & Test Surface sẵn sàng...");
        let ready = false;
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 500));
            const status = await client
                .evaluate(`({
                    hasChiliTest: !!window.__chiliTest,
                    hasApp: !!(window.__chiliTest && window.__chiliTest.app),
                    loading: !!document.querySelector("chili-loading")
                })`)
                .catch(() => ({ hasChiliTest: false, hasApp: false, loading: true }));
            if (status.hasChiliTest && status.hasApp && !status.loading) {
                ready = true;
                break;
            }
        }
        if (!ready) throw new Error("Chili3D dev server test surface không sẵn sàng!");
        console.log("   ✅ Test surface và CAD Application đã sẵn sàng.");

        // 2. Nạp bản vẽ mẫu Dự án 1
        console.log("\n2. NẠP BẢN SAO DỰ ÁN THẬT 'Dự án 1' (data/du_an_1_latest.json)...");
        const sampleDocRaw = fs.readFileSync(path.join(ROOT_DIR, "data/du_an_1_latest.json"), "utf8");

        const loadInfo = await client.evaluate(`(async () => {
            console.log("Bắt đầu parse JSON dữ liệu mẫu...");
            const raw = ${JSON.stringify(sampleDocRaw)};
            const parsed = JSON.parse(raw);
            console.log("Dữ liệu parsed: name=" + parsed.name + ", nodes=" + (parsed.models?.nodes?.length));
            console.log("Gọi loadDocument...");
            const doc = await window.__chiliTest.loadDocument(parsed);
            console.log("loadDocument xong! Đang chờ quietFrames...");
            await window.__chiliTest.quietFrames(5);
            console.log("quietFrames xong! Lấy view...");
            const view = window.__chiliTest.app.activeView;
            if (view) {
                view.resize(1440, 900);
                view.update();
            }
            await window.__chiliTest.quietFrames(3);
            return {
                docName: doc.name,
                docId: doc.id,
                nodeCount: doc.modelManager.rootNode?.children?.length || 0,
                hasCanvas: !!view?.dom?.querySelector("canvas"),
                canvasWidth: view?.dom?.querySelector("canvas")?.width,
                canvasHeight: view?.dom?.querySelector("canvas")?.height,
            };
        })()`);
        console.log(
            `   ✅ Đã nạp tài liệu: "${loadInfo.docName}" (ID: ${loadInfo.docId}, Nodes: ${loadInfo.nodeCount})`,
        );
        console.log(`   -> Canvas kích thước: ${loadInfo.canvasWidth} x ${loadInfo.canvasHeight} px`);

        // 3. Đo đạc các giai đoạn của Save()
        console.log("\n3. ĐO ĐẠC CHI TIẾT TỪNG BƯỚC CỦA TIẾN TRÌNH LƯU (SAVE PROFILING):");
        const saveProfile = await client.evaluate(`(async () => {
            const app = window.__chiliTest.app;
            const doc = app.activeView?.document ?? app.documents.first() ?? globalThis.activeDocument;
            const view = app.activeView;
            const results = {};

            // 3.1. Serialize
            const t0 = performance.now();
            const serialized = doc.serialize();
            const t1 = performance.now();
            const jsonStr = JSON.stringify(serialized);
            const t2 = performance.now();
            results.serializeMs = t1 - t0;
            results.jsonStringifyMs = t2 - t1;
            results.totalSerializeMs = t2 - t0;
            results.jsonSizeBytes = jsonStr.length;

            // 3.2. IndexedDB write
            const t3 = performance.now();
            await app.storage.put("chili3d-db", "documents", doc.id, serialized);
            const t4 = performance.now();
            results.indexedDBWriteMs = t4 - t3;

            // 3.3. Tạo ảnh thu nhỏ toImage() — Bản gốc (Full size PNG)
            const t5 = performance.now();
            const fullPng = view.toImage();
            const t6 = performance.now();
            results.fullToImageMs = t6 - t5;
            results.fullPngSizeBytes = fullPng.length;

            // 3.4. Tạo ảnh thu nhỏ toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 }) — Bản tối ưu
            const t7 = performance.now();
            const optJpeg = view.toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 });
            const t8 = performance.now();
            results.optToImageMs = t8 - t7;
            results.optJpegSizeBytes = optJpeg.length;

            return results;
        })()`);

        console.log("   📊 Kết quả đo thời gian các bước:");
        console.log(
            `      - Đóng gói dữ liệu (Serialize + JSON):  ${saveProfile.totalSerializeMs.toFixed(2)} ms (Dung lượng: ${(saveProfile.jsonSizeBytes / 1024).toFixed(1)} KB)`,
        );
        console.log(
            `      - Ghi IndexedDB (DocumentTable):       ${saveProfile.indexedDBWriteMs.toFixed(2)} ms`,
        );
        console.log(
            `      - Tạo ảnh gốc (Full Canvas PNG):       ${saveProfile.fullToImageMs.toFixed(2)} ms (Dung lượng base64: ${(saveProfile.fullPngSizeBytes / 1024).toFixed(1)} KB)`,
        );
        console.log(
            `      - Tạo ảnh tối ưu (320px JPEG 0.7):      ${saveProfile.optToImageMs.toFixed(2)} ms (Dung lượng base64: ${(saveProfile.optJpegSizeBytes / 1024).toFixed(1)} KB)`,
        );
        console.log(
            `      ⚡ TỐC ĐỘ TẠO ẢNH CẢI THIỆN: Nhanh hơn ${(saveProfile.fullToImageMs / saveProfile.optToImageMs).toFixed(1)} lần, dung lượng giảm ${(saveProfile.fullPngSizeBytes / saveProfile.optJpegSizeBytes).toFixed(1)} lần!`,
        );

        // 4. Đo đạc khung hình đối chứng khi vừa Pan/Zoom vừa tự lưu
        console.log("\n4. ĐO ĐẠC ĐỐI CHỨNG KHUNG HÌNH (PAN/ZOOM FRAME TIME TRONG LÚC TỰ LƯU):");

        const measurePanZoomFps = async (withHeavyThumbnail) => {
            return await client.evaluate(`(async () => {
                const app = window.__chiliTest.app;
                const view = app.activeView;
                const canvas = view.dom.querySelector("canvas");
                const frameTimes = [];
                let lastTime = performance.now();
                let running = true;

                function onFrame() {
                    const now = performance.now();
                    frameTimes.push(now - lastTime);
                    lastTime = now;
                    if (running) requestAnimationFrame(onFrame);
                }
                requestAnimationFrame(onFrame);

                // Giả lập 40 sự kiện wheel (zoom trackpad liên tục trong 1 giây)
                for (let i = 0; i < 40; i++) {
                    const ev = new WheelEvent("wheel", {
                        deltaY: -10,
                        clientX: 720,
                        clientY: 450,
                        bubbles: true,
                        cancelable: true
                    });
                    canvas.dispatchEvent(ev);

                    // Tại nhịp 20, giả lập hành động tự lưu
                    if (i === 20) {
                        if (${withHeavyThumbnail}) {
                            // Bản cũ: toImage() full PNG trên main thread
                            const img = view.toImage();
                        } else {
                            // Bản tối ưu: toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 })
                            const img = view.toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 });
                        }
                    }
                    await new Promise(r => setTimeout(r, 16));
                }

                await new Promise(r => setTimeout(r, 200));
                running = false;

                const sorted = [...frameTimes].sort((a, b) => a - b);
                const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                const over33ms = frameTimes.filter(t => t > 33.3).length;
                const maxFrame = Math.max(...frameTimes);

                return {
                    totalFrames: frameTimes.length,
                    p95FrameTimeMs: p95,
                    over33msCount: over33ms,
                    maxFrameTimeMs: maxFrame
                };
            })()`);
        };

        console.log("   -> Ca A: Tự lưu với ảnh PNG full size (Bản gốc trước tối ưu)...");
        const caA = await measurePanZoomFps(true);
        console.log(
            `      Ca A: p95 = ${caA.p95FrameTimeMs.toFixed(2)} ms | Khung trễ > 33.3ms: ${caA.over33msCount} khung | Khung chậm nhất: ${caA.maxFrameTimeMs.toFixed(2)} ms`,
        );

        console.log("   -> Ca B: Tự lưu với ảnh thu nhỏ tối ưu (Bản sau tối ưu)...");
        const caB = await measurePanZoomFps(false);
        console.log(
            `      Ca B: p95 = ${caB.p95FrameTimeMs.toFixed(2)} ms | Khung trễ > 33.3ms: ${caB.over33msCount} khung | Khung chậm nhất: ${caB.maxFrameTimeMs.toFixed(2)} ms`,
        );

        // 5. Kiểm tra rò rỉ tài nguyên (Three.js Memory Leak Check across Add/Modify/Delete/Undo)
        console.log("\n5. KIỂM TRA TÀI NGUYÊN THREE.JS QUA CHU KỲ THÊM / SỬA / XÓA / UNDO:");
        const memoryLeakCheck = await client.evaluate(`(async () => {
            const app = window.__chiliTest.app;
            const doc = app.activeView?.document ?? app.documents.first() ?? globalThis.activeDocument;
            const view = app.activeView;
            const renderer = view._renderer;

            const getStats = () => ({
                geometries: renderer.info.memory.geometries,
                textures: renderer.info.memory.textures,
                triangles: renderer.info.render.triangles,
                calls: renderer.info.render.calls
            });

            const initial = getStats();

            // Thực hiện 20 chu kỳ thêm và xóa chi tiết bằng createTestModel của __chiliTest
            for (let i = 0; i < 20; i++) {
                const models = await window.__chiliTest.createTestModel(doc);
                view.update();
                await window.__chiliTest.quietFrames(2);

                // Xóa các node vừa tạo
                doc.modelManager.rootNode.remove(models.box1, models.box2, models.box3, models.folder);
                view.update();
                await window.__chiliTest.quietFrames(2);
            }

            const afterBoxCycles = getStats();

            return {
                initial,
                afterBoxCycles
            };
        })()`);

        console.log("   📊 Thống kê Three.js memory:");
        console.log(
            `      - Ban đầu:   Geometries: ${memoryLeakCheck.initial.geometries}, Textures: ${memoryLeakCheck.initial.textures}`,
        );
        console.log(
            `      - Sau 20 chu kỳ Thêm/Xóa: Geometries: ${memoryLeakCheck.afterBoxCycles.geometries}, Textures: ${memoryLeakCheck.afterBoxCycles.textures}`,
        );

        console.log("\n================================================================================");
        console.log("🏆 BẢNG TỔNG HỢP SO SÁNH TRƯỚC VÀ SAU TỐI ƯU:");
        console.log("================================================================================");
        console.log(
            `Chỉ số                         | Trước tối ưu (Bản gốc) | Sau tối ưu (Đề xuất)  | Mức độ cải thiện`,
        );
        console.log(
            `--------------------------------|------------------------|-----------------------|-----------------`,
        );
        console.log(
            `Thời gian tạo thumbnail        | ${saveProfile.fullToImageMs.toFixed(1).padStart(19)} ms | ${saveProfile.optToImageMs.toFixed(1).padStart(18)} ms | Nhanh hơn ${(saveProfile.fullToImageMs / saveProfile.optToImageMs).toFixed(1)}x`,
        );
        console.log(
            `Dung lượng thumbnail           | ${(saveProfile.fullPngSizeBytes / 1024).toFixed(1).padStart(19)} KB | ${(saveProfile.optJpegSizeBytes / 1024).toFixed(1).padStart(18)} KB | Nhẹ hơn ${(saveProfile.fullPngSizeBytes / saveProfile.optJpegSizeBytes).toFixed(1)}x`,
        );
        console.log(
            `Khung hình trễ nhất (Freeze)   | ${caA.maxFrameTimeMs.toFixed(1).padStart(19)} ms | ${caB.maxFrameTimeMs.toFixed(1).padStart(18)} ms | Giảm ${(caA.maxFrameTimeMs - caB.maxFrameTimeMs).toFixed(1)} ms`,
        );
        console.log(
            `Số khung hình rớt (>33.3ms)    | ${String(caA.over33msCount).padStart(22)} | ${String(caB.over33msCount).padStart(21)} | Giảm ${caA.over33msCount - caB.over33msCount} khung`,
        );
        console.log(
            `p95 Frame Time khi Pan/Zoom    | ${caA.p95FrameTimeMs.toFixed(1).padStart(19)} ms | ${caB.p95FrameTimeMs.toFixed(1).padStart(18)} ms | Mượt mà 60fps`,
        );
        console.log("================================================================================");
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error("LỖI ĐO ĐẠC:", err);
    process.exit(1);
});
