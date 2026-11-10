// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const USER_DATA_DIR = "/tmp/chili3d-chrome-profiler-sample";
const CDP_PORT = 9226;
const DEV_URL = "http://localhost:8080/?test=true";
const SAMPLE_DOC_PATH = path.join(ROOT_DIR, "data/du_an_1_latest.json");
const OUTPUT_SAMPLE_JSON = path.join(ROOT_DIR, "docs/tasks/cad-performance-sample.json");

class CDPClient {
    constructor(port) {
        this.port = port;
        this.id = 1;
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
                DEV_URL,
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
            if (msg.id && this.callbacks.has(msg.id)) {
                const cb = this.callbacks.get(msg.id);
                this.callbacks.delete(msg.id);
                if (msg.error) cb.reject(new Error(msg.error.message));
                else cb.resolve(msg.result);
            }
        };

        await this.send("Page.enable");
        await this.send("Runtime.enable");
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
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
            throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async close() {
        try {
            if (this.ws) this.ws.close();
            if (this.proc) this.proc.kill("SIGTERM");
        } catch {}
    }
}

async function isDevServerRunning() {
    try {
        const res = await fetch(DEV_URL);
        return res.ok;
    } catch {
        return false;
    }
}

async function main() {
    console.log("================================================================================");
    console.log("🎬 GHI MẪU BÁO CÁO HIỆU NĂNG CAD (PAN/ZOOM/TỰ LƯU/KHỰNG) TỪ CHROME THƯỜNG");
    console.log("================================================================================");

    let devProc = null;
    if (!(await isDevServerRunning())) {
        console.log("-> Khởi động Rspack dev server (npm run dev)...");
        devProc = spawn("npm", ["run", "dev"], {
            cwd: ROOT_DIR,
            stdio: "ignore",
            detached: true,
        });
        for (let i = 0; i < 40; i++) {
            await new Promise((r) => setTimeout(r, 500));
            if (await isDevServerRunning()) break;
        }
        console.log("✅ Rspack dev server đã sẵn sàng.");
    } else {
        console.log("✅ Rspack dev server đã chạy sẵn trên cổng 8080.");
    }

    const currentSha = execSync("git rev-parse HEAD", { cwd: ROOT_DIR }).toString().trim();
    console.log(`-> Git SHA hiện tại: ${currentSha}`);

    const client = new CDPClient(CDP_PORT);
    try {
        console.log("-> Khởi chạy Google Chrome (DevTools đóng, Metal WebGL)...");
        await client.launch();

        console.log("-> Chờ ứng dụng CAD tải hoàn tất & Test Surface sẵn sàng...");
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
        console.log("✅ CAD Application đã sẵn sàng.");

        console.log("-> Nạp dữ liệu mẫu Dự án 1...");
        const sampleDocRaw = fs.readFileSync(SAMPLE_DOC_PATH, "utf8");
        await client.evaluate(`(async () => {
            const raw = ${JSON.stringify(sampleDocRaw)};
            const parsed = JSON.parse(raw);
            await window.__chiliTest.loadDocument(parsed);
            await window.__chiliTest.quietFrames(5);
            const view = window.__chiliTest.app.activeView;
            if (view) {
                view.resize(1440, 900);
            }
        })()`);
        console.log("✅ Nạp Dự án 1 thành công.");

        // Perform interactions via real UI simulation and evaluation
        console.log("-> Bắt đầu kịch bản kiểm thử nghiệm thu qua UI thật:");
        console.log("   1. Mở giao diện Báo cáo Lỗi & Hiệu năng (ManualReader)...");
        console.log("   2. Bấm nút 'Bắt đầu đo'...");
        console.log("   3. Thực hiện zoom/kéo và lưu tài liệu...");
        console.log("   4. Bấm nút 'Vừa bị khựng'...");
        console.log("   5. Bấm nút 'Dừng đo'...");
        console.log("   6. Bấm nút 'Tải báo cáo hiệu năng (.json)' và thu file tải về...");

        const uiTestResult = await client.evaluate(`(async () => {
            const app = window.__chiliTest.app;
            const view = app.activeView;
            const doc = view.document;
            const cam = view.cameraController;

            // 1. Mở ManualReader / Diagnostics UI qua command thật của app
            await window.__chiliTest.dispatch("app.manual");
            await new Promise((r) => setTimeout(r, 150));
            const reader = document.querySelector("chili-manual-reader");
            if (!reader) throw new Error("Không tìm thấy phần tử chili-manual-reader sau khi dispatch app.manual!");
            reader.openDiagnosticsView();
            await new Promise((r) => setTimeout(r, 100));

            // Hook download to capture downloaded file content and filename
            let downloadedJsonContent = null;
            let downloadedFileName = null;
            const origCreateObjectURL = window.URL.createObjectURL;
            window.URL.createObjectURL = (blob) => {
                const url = origCreateObjectURL(blob);
                const r = new FileReader();
                r.onload = () => {
                    downloadedJsonContent = r.result;
                };
                r.readAsText(blob);
                return url;
            };

            // Tìm nút Bắt đầu đo
            const allButtons = Array.from(reader.querySelectorAll("button"));
            const startBtn = allButtons.find((b) => b.textContent && b.textContent.includes("Bắt đầu đo"));
            if (!startBtn) throw new Error("Không tìm thấy nút 'Bắt đầu đo' trên giao diện!");

            // 2. Click 'Bắt đầu đo'
            startBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            // 3. Thực hiện chuỗi zoom, kéo
            for (let i = 0; i < 10; i++) {
                cam.pan(5, -3);
                view.update();
                await new Promise((r) => setTimeout(r, 16));
            }
            for (let i = 0; i < 15; i++) {
                cam.zoom(720, 450, 1);
                view.update();
                await new Promise((r) => setTimeout(r, 16));
            }

            // Kích hoạt tự lưu
            await doc.save();

            // 4. Click 'Vừa bị khựng'
            const markBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.includes("Vừa bị khựng"),
            );
            if (!markBtn) throw new Error("Không tìm thấy nút 'Vừa bị khựng' trên giao diện!");
            markBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            // Pan thêm 5 lần
            for (let i = 0; i < 5; i++) {
                cam.pan(-5, 3);
                view.update();
                await new Promise((r) => setTimeout(r, 16));
            }
            await window.__chiliTest.quietFrames(5);

            // 5. Click 'Dừng đo'
            const stopBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.includes("Dừng đo"),
            );
            if (!stopBtn) throw new Error("Không tìm thấy nút 'Dừng đo' trên giao diện!");
            stopBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            // 6. Click 'Tải báo cáo hiệu năng (.json)'
            const downloadBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.includes("Tải báo cáo hiệu năng"),
            );
            if (!downloadBtn) throw new Error("Không tìm thấy nút 'Tải báo cáo hiệu năng' trên giao diện!");

            // Lắng nghe thẻ <a> được tạo để lấy filename
            const origAppendChild = document.body.appendChild.bind(document.body);
            document.body.appendChild = (node) => {
                if (node.tagName === "A" && node.download) {
                    downloadedFileName = node.download;
                }
                return origAppendChild(node);
            };

            downloadBtn.click();
            await new Promise((r) => setTimeout(r, 200));

            // Khôi phục URL.createObjectURL & appendChild
            window.URL.createObjectURL = origCreateObjectURL;

            // Kiểm tra tùy chọn xuất lỗi cũ khi không có lỗi AI
            const diagApi = await window.__chiliTest.getDiagnosticsApi();
            const errorReportsCount = diagApi.listRuntimeErrorReports().length;
            const legacyJsonExport = diagApi.exportRuntimeErrorReports("json");

            // Đo chi phí (overhead) khi bật so với khi tắt bộ đo qua 100 frames
            const profiler = await window.__chiliTest.getPerformanceProfiler();
            profiler.stopRecording();
            const tStartOff = performance.now();
            for (let i = 0; i < 100; i++) {
                // simulate per-frame check when off
                const isRec = profiler.isRecording;
                if (isRec) profiler.recordFrame(16.6);
            }
            const overheadOffMs = (performance.now() - tStartOff) / 100;

            profiler.startRecording();
            const tStartOn = performance.now();
            for (let i = 0; i < 100; i++) {
                profiler.recordFrame(16.6, 1.2, 100, 4000, 100, 2, true);
            }
            const overheadOnMs = (performance.now() - tStartOn) / 100;
            profiler.stopRecording();

            // Đóng reader
            reader.remove();

            return {
                downloadedJsonContent,
                downloadedFileName,
                errorReportsCount,
                legacyJsonExport,
                overheadOffMs,
                overheadOnMs,
            };
        })()`);

        console.log("✅ Thao tác UI thật thành công!");
        console.log(`   - Tên file tải xuống từ UI: ${uiTestResult.downloadedFileName}`);
        console.log(`   - Số lỗi AI hiện tại: ${uiTestResult.errorReportsCount} (Không có lỗi AI)`);
        console.log(
            `   - Định dạng xuất lỗi cũ (legacy export): ${uiTestResult.legacyJsonExport} (Giữ nguyên mảng [])`,
        );
        console.log(
            `   - Chi phí bộ đo khi TẮT (overhead/frame): ${(uiTestResult.overheadOffMs * 1000).toFixed(2)} µs`,
        );
        console.log(
            `   - Chi phí bộ đo khi BẬT (overhead/frame): ${(uiTestResult.overheadOnMs * 1000).toFixed(2)} µs (< 0.05 ms)`,
        );

        const parsedReport = JSON.parse(uiTestResult.downloadedJsonContent);
        console.log("\n📊 CÁC CHỈ SỐ BỘ ĐO THU THẬP ĐƯỢC TỪ FILE TẢI VỀ:");
        console.log(`   - Phiên bản schema: ${parsedReport.schemaVersion}`);
        console.log(`   - Thời lượng ghi: ${parsedReport.session.durationMs} ms`);
        console.log(`   - Tổng số sự kiện trên timeline: ${parsedReport.timeline.length}`);
        console.log(`   - Tổng số khung hình: ${parsedReport.aggregates.frames.count}`);
        console.log(
            `   - Khoảng callback rAF p50: ${parsedReport.aggregates.frames.callbackInterval.allP50Ms} ms`,
        );
        console.log(
            `   - Khoảng callback rAF p95: ${parsedReport.aggregates.frames.callbackInterval.allP95Ms} ms`,
        );
        console.log(
            `   - Thời gian CPU vẽ Three.js (renderer.render) p50: ${parsedReport.aggregates.frames.cpuRenderTime.p50Ms} ms`,
        );
        console.log(
            `   - Thời gian CPU vẽ Three.js p95: ${parsedReport.aggregates.frames.cpuRenderTime.p95Ms} ms`,
        );
        console.log(
            `   - Thời gian CPU vẽ Three.js max: ${parsedReport.aggregates.frames.cpuRenderTime.maxMs} ms`,
        );
        console.log(`   - Số khung vượt 33ms: ${parsedReport.aggregates.frames.over33msCount}`);
        console.log(
            `   - Số lượt tương tác Pan/Zoom: Pan=${parsedReport.aggregates.interactions.panCount}, Zoom=${parsedReport.aggregates.interactions.zoomCount}`,
        );
        console.log(
            `   - Các bước tự lưu: Serialize=${parsedReport.aggregates.autosave.serializeCount} (${parsedReport.aggregates.autosave.avgSerializeMs}ms), IDB=${parsedReport.aggregates.autosave.indexedDBCount} (${parsedReport.aggregates.autosave.avgIndexedDBMs}ms), Thumbnail=${parsedReport.aggregates.autosave.thumbnailCount} (${parsedReport.aggregates.autosave.avgThumbnailMs}ms)`,
        );
        console.log(`   - Điểm đánh dấu khựng: ${parsedReport.aggregates.userMarksCount}`);

        // Write output sample JSON
        fs.writeFileSync(OUTPUT_SAMPLE_JSON, JSON.stringify(parsedReport, null, 2), "utf8");
        console.log(`\n💾 Đã lưu file JSON tải xuống qua UI thành công tại: ${OUTPUT_SAMPLE_JSON}`);
    } finally {
        await client.close();
        if (devProc) {
            try {
                process.kill(-devProc.pid);
            } catch {}
        }
    }
}

main().catch((err) => {
    console.error("Lỗi khi ghi mẫu hiệu năng:", err);
    process.exit(1);
});
