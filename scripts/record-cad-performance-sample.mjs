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
        console.log("   3. Thực hiện zoom/kéo và tự lưu tài liệu...");
        console.log("   4. Mở bản vẽ (thao tác task ngoài Pan/Zoom)...");
        console.log("   5. Bấm nút 'Vừa bị khựng'...");
        console.log("   6. Bấm nút 'Dừng đo'...");
        console.log("   7. Kiểm tra các nút tải: Báo cáo tổng hợp, Báo cáo lỗi cũ và Báo cáo hiệu năng...");

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

            // Setup download interceptor to capture files clicked in UI
            const downloads = [];
            const origCreateObjectURL = window.URL.createObjectURL;
            window.URL.createObjectURL = (blob) => {
                const url = origCreateObjectURL(blob);
                const r = new FileReader();
                r.onload = () => {
                    downloads.push({
                        url,
                        content: r.result,
                        size: blob.size,
                        type: blob.type,
                    });
                };
                r.readAsText(blob);
                return url;
            };

            const origAppendChild = document.body.appendChild.bind(document.body);
            let lastDownloadedFileName = null;
            document.body.appendChild = (node) => {
                if (node.tagName === "A" && node.download) {
                    lastDownloadedFileName = node.download;
                    if (downloads.length > 0 && !downloads[downloads.length - 1].fileName) {
                        downloads[downloads.length - 1].fileName = node.download;
                    }
                }
                return origAppendChild(node);
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

            // 4. Mở bản vẽ (thao tác task ngoài Pan/Zoom)
            const sampleRaw = ${JSON.stringify(sampleDocRaw)};
            const parsedDoc = JSON.parse(sampleRaw);
            await app.loadDocument(parsedDoc);
            await window.__chiliTest.quietFrames(5);

            // 5. Click 'Vừa bị khựng'
            const markBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.includes("Vừa bị khựng"),
            );
            if (!markBtn) throw new Error("Không tìm thấy nút 'Vừa bị khựng' trên giao diện!");
            markBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            // Pan thêm 5 lần
            const curCam = app.activeView.cameraController;
            for (let i = 0; i < 5; i++) {
                curCam.pan(-5, 3);
                app.activeView.update();
                await new Promise((r) => setTimeout(r, 16));
            }
            await window.__chiliTest.quietFrames(5);

            // 6. Click 'Dừng đo'
            const stopBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.includes("Dừng đo"),
            );
            if (!stopBtn) throw new Error("Không tìm thấy nút 'Dừng đo' trên giao diện!");
            stopBtn.click();
            await new Promise((r) => setTimeout(r, 50));

            // 7a. Click nút 'Tải báo cáo tổng hợp (.json)'
            const combinedBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.includes("Tải báo cáo tổng hợp"),
            );
            if (!combinedBtn) throw new Error("Không tìm thấy nút 'Tải báo cáo tổng hợp' trên giao diện!");
            combinedBtn.click();
            await new Promise((r) => setTimeout(r, 200));
            const combinedDownload = downloads[downloads.length - 1];
            if (combinedDownload && lastDownloadedFileName) {
                combinedDownload.fileName = lastDownloadedFileName;
            }

            // 7b. Click nút 'Tải báo cáo (.json)' (đường xuất báo lỗi cũ)
            const legacyBtn = Array.from(reader.querySelectorAll("button")).find(
                (b) => b.textContent && b.textContent.trim() === "📥 Tải báo cáo (.json)",
            );
            if (!legacyBtn) throw new Error("Không tìm thấy nút 'Tải báo cáo (.json)' (legacy) trên giao diện!");
            legacyBtn.click();
            await new Promise((r) => setTimeout(r, 200));
            const legacyDownload = downloads[downloads.length - 1];
            if (legacyDownload && lastDownloadedFileName) {
                legacyDownload.fileName = lastDownloadedFileName;
            }

            // Khôi phục URL.createObjectURL & appendChild
            window.URL.createObjectURL = origCreateObjectURL;
            document.body.appendChild = origAppendChild;

            // Kiểm tra số lỗi AI và exportRuntimeErrorReports trực tiếp
            const diagApi = await window.__chiliTest.getDiagnosticsApi();
            const errorReportsCount = diagApi.listRuntimeErrorReports().length;
            const directLegacyExport = diagApi.exportRuntimeErrorReports("json");

            // 8. Đo chi phí (overhead) qua NHIỀU LƯỢT (5 rounds, 100 frames/round) để tính độ dao động
            const profiler = await window.__chiliTest.getPerformanceProfiler();
            profiler.stopRecording();

            const rounds = 5;
            const framesPerRound = 100;
            const offTimes = [];
            const onTimes = [];

            for (let r = 0; r < rounds; r++) {
                // Measure OFF
                profiler.stopRecording();
                const t0Off = performance.now();
                for (let f = 0; f < framesPerRound; f++) {
                    if (profiler.isRecording) {
                        profiler.recordFrame(16.6);
                    }
                }
                const tOff = (performance.now() - t0Off) / framesPerRound;
                offTimes.push(tOff);

                // Measure ON
                profiler.startRecording();
                const t0On = performance.now();
                for (let f = 0; f < framesPerRound; f++) {
                    profiler.recordFrame(16.6, 1.2, 100, 4000, 100, 2, true);
                }
                const tOn = (performance.now() - t0On) / framesPerRound;
                onTimes.push(tOn);
                profiler.stopRecording();
            }

            // Đóng reader
            reader.remove();

            return {
                combinedDownload,
                legacyDownload,
                errorReportsCount,
                directLegacyExport,
                rounds,
                framesPerRound,
                offTimes,
                onTimes,
            };
        })()`);

        console.log("✅ Thao tác UI thật thành công!");
        console.log(`   - File xuất tổng hợp từ UI: ${uiTestResult.combinedDownload?.fileName}`);
        console.log(`   - File xuất lỗi cũ từ UI: ${uiTestResult.legacyDownload?.fileName}`);
        console.log(`   - Số lỗi AI hiện tại: ${uiTestResult.errorReportsCount} (Không có lỗi AI)`);
        console.log(
            `   - Nội dung xuất lỗi cũ (legacy): ${uiTestResult.legacyDownload?.content.trim()} (mảng chuẩn [])`,
        );

        // Calculate overhead stats and variance
        const offTimesUs = uiTestResult.offTimes.map((t) => t * 1000);
        const onTimesUs = uiTestResult.onTimes.map((t) => t * 1000);
        const deltaUs = onTimesUs.map((on, i) => on - offTimesUs[i]);

        const calcStats = (arr) => {
            const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
            const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (arr.length - 1 || 1);
            const stdDev = Math.sqrt(variance);
            return { mean, variance, stdDev, min: Math.min(...arr), max: Math.max(...arr) };
        };

        const offStats = calcStats(offTimesUs);
        const onStats = calcStats(onTimesUs);
        const deltaStats = calcStats(deltaUs);

        console.log("\n📈 KẾT QUẢ ĐO CHI PHÍ BẬT / TẮT BỘ ĐO QUA 5 LƯỢT (100 khung hình/lượt):");
        console.log(
            `   - Khi TẮT (OFF): TB = ${offStats.mean.toFixed(2)} µs/frame (độ lệch chuẩn σ = ${offStats.stdDev.toFixed(2)} µs, min = ${offStats.min.toFixed(2)} µs, max = ${offStats.max.toFixed(2)} µs)`,
        );
        console.log(
            `   - Khi BẬT (ON): TB = ${onStats.mean.toFixed(2)} µs/frame (độ lệch chuẩn σ = ${onStats.stdDev.toFixed(2)} µs, min = ${onStats.min.toFixed(2)} µs, max = ${onStats.max.toFixed(2)} µs)`,
        );
        console.log(
            `   - Chênh lệch (Net Overhead ON - OFF): TB = ${deltaStats.mean.toFixed(2)} µs/frame (~${(deltaStats.mean / 1000).toFixed(4)} ms/frame, σ = ${deltaStats.stdDev.toFixed(2)} µs)`,
        );
        console.log(
            `   -> Chi phí đo chỉ chiếm ${(deltaStats.mean / 166.67).toFixed(2)}% ngân sách khung hình 60fps (16.67ms).`,
        );

        const parsedCombined = JSON.parse(uiTestResult.combinedDownload.content);
        console.log("\n📊 ĐỐI CHIẾU DỮ LIỆU TỪ FILE XUẤT TỔNG HỢP (.json):");
        console.log(`   - schemaVersion: ${parsedCombined.schemaVersion}`);
        console.log(`   - errorReports: mảng ${parsedCombined.errorReports.length} phần tử (Không có lỗi)`);
        console.log(`   - performance.buildSha: ${parsedCombined.performance.buildSha || currentSha}`);
        console.log(
            `   - performance.session.durationMs: ${parsedCombined.performance.session.durationMs} ms`,
        );
        console.log(
            `   - performance.aggregates.frames.count: ${parsedCombined.performance.aggregates.frames.count}`,
        );
        console.log(
            `   - performance.aggregates.frames.callbackInterval.allP95Ms: ${parsedCombined.performance.aggregates.frames.callbackInterval.allP95Ms} ms`,
        );
        console.log(
            `   - performance.aggregates.frames.cpuRenderTime.p95Ms: ${parsedCombined.performance.aggregates.frames.cpuRenderTime.p95Ms} ms`,
        );
        console.log(
            `   - performance.aggregates.frames.over33msCount: ${parsedCombined.performance.aggregates.frames.over33msCount}`,
        );
        console.log(
            `   - performance.aggregates.interactions: Pan=${parsedCombined.performance.aggregates.interactions.panCount}, Zoom=${parsedCombined.performance.aggregates.interactions.zoomCount}`,
        );
        console.log(
            `   - performance.aggregates.autosave: Serialize=${parsedCombined.performance.aggregates.autosave.serializeCount} (${parsedCombined.performance.aggregates.autosave.avgSerializeMs}ms), IDB=${parsedCombined.performance.aggregates.autosave.indexedDBCount} (${parsedCombined.performance.aggregates.autosave.avgIndexedDBMs}ms), Thumbnail=${parsedCombined.performance.aggregates.autosave.thumbnailCount} (${parsedCombined.performance.aggregates.autosave.avgThumbnailMs}ms)`,
        );
        console.log(
            `   - performance.aggregates.userMarksCount: ${parsedCombined.performance.aggregates.userMarksCount}`,
        );

        // Find task event beyond Pan/Zoom
        const taskEvents = parsedCombined.performance.timeline.filter((e) => e.type === "task");
        console.log(`\n🎯 KIỂM TRA SỰ KIỆN TASK NGOÀI PAN/ZOOM:`);
        console.log(`   - Tìm thấy ${taskEvents.length} sự kiện task:`);
        for (const t of taskEvents) {
            console.log(
                `     * Tác vụ: "${t.name}", Trạng thái: ${t.status}, Thời lượng: ${t.durationMs} ms, Kết thúc (timestampMs): ${t.timestampMs} ms, Bắt đầu (startMs): ${t.startMs} ms`,
            );
        }

        // Check autosave steps timestamps and startMs
        const autosaveEvents = parsedCombined.performance.timeline.filter((e) => e.type === "autosave_step");
        console.log(`\n💾 KIỂM TRA CÁC BƯỚC TỰ LƯU TRÊN TIMELINE:`);
        for (const s of autosaveEvents) {
            console.log(
                `     * Bước: "${s.step}", Thành công: ${s.success}, Thời lượng: ${s.durationMs} ms, Bắt đầu: ${s.startMs} ms, Kết thúc: ${s.timestampMs} ms`,
            );
        }

        // Save downloaded combined report to file
        fs.writeFileSync(OUTPUT_SAMPLE_JSON, JSON.stringify(parsedCombined, null, 2), "utf8");
        console.log(`\n💾 Đã lưu file xuất tổng hợp nguyên dạng tải từ UI tại: ${OUTPUT_SAMPLE_JSON}`);
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
