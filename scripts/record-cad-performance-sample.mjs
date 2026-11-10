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

        // Perform interactions via evaluation
        console.log("-> Thực hiện chuỗi tương tác (Pan, Zoom, Đánh dấu khựng, Tự lưu)...");
        const profilerResult = await client.evaluate(`(async () => {
            const app = window.__chiliTest.app;
            const view = app.activeView;
            const doc = view.document;
            const cam = view.cameraController;

            const profiler = await window.__chiliTest.getPerformanceProfiler();
            if (!profiler) throw new Error("Không thể tìm thấy PerformanceProfiler");

            profiler.reset();
            profiler.startRecording();

            // 1. Pan 10 lần
            for (let i = 0; i < 10; i++) {
                cam.pan(5, -3);
                view.update();
                await new Promise((r) => setTimeout(r, 16));
            }

            // 2. Zoom in 15 lần
            for (let i = 0; i < 15; i++) {
                cam.zoom(720, 450, 1);
                view.update();
                await new Promise((r) => setTimeout(r, 16));
            }

            // 3. Người dùng phát hiện khựng và bấm nút 'Vừa bị khựng'
            profiler.markJank("user_freeze_marked", "Khựng 45ms khi trackpad phát sinh nhiều sự kiện cuộn");

            // 4. Kích hoạt lượt tự lưu (để serialize, indexeddb và thumbnail cùng nằm trên 1 timeline)
            await doc.save();

            // 5. Pan thêm 5 lần sau khi lưu
            for (let i = 0; i < 5; i++) {
                cam.pan(-5, 3);
                view.update();
                await new Promise((r) => setTimeout(r, 16));
            }

            await window.__chiliTest.quietFrames(5);
            profiler.stopRecording();

            return profiler.exportReport("${currentSha}");
        })()`);

        console.log("✅ Thu thập dữ liệu hiệu năng thành công!");
        console.log(`   - Tổng số sự kiện trên timeline: ${profilerResult.timeline.length}`);
        console.log(`   - Số khung hình ghi nhận: ${profilerResult.aggregates.frames.count}`);
        console.log(`   - Đỉnh khung trễ (max): ${profilerResult.aggregates.frames.maxMs} ms`);
        console.log(`   - Khung hình > 33ms: ${profilerResult.aggregates.frames.over33msCount}`);
        console.log(
            `   - Số lượt Pan/Zoom: Pan=${profilerResult.aggregates.interactions.panCount}, Zoom=${profilerResult.aggregates.interactions.zoomCount}`,
        );
        console.log(
            `   - Các bước tự lưu: Serialize=${profilerResult.aggregates.autosave.serializeCount}, IndexedDB=${profilerResult.aggregates.autosave.indexedDBCount}, Thumbnail=${profilerResult.aggregates.autosave.thumbnailCount}`,
        );
        console.log(`   - Điểm đánh dấu khựng: ${profilerResult.aggregates.userMarksCount}`);

        // Write output sample JSON
        fs.writeFileSync(OUTPUT_SAMPLE_JSON, JSON.stringify(profilerResult, null, 2), "utf8");
        console.log(`\n💾 Đã lưu JSON mẫu thành công tại: ${OUTPUT_SAMPLE_JSON}`);
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
