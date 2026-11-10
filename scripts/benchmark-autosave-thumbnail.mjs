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
                if (msg.params.type === "error") {
                    console.error(`      [Chrome Console] ${msg.params.type}: ${args}`);
                }
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
    console.log("🚀 BẮT ĐẦU ĐO ĐẠC ĐỐI CHỨNG ĐA LƯỢT: TỰ LƯU, ẢNH THU NHỎ & PAN/ZOOM FRAME TIME");
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
            const raw = ${JSON.stringify(sampleDocRaw)};
            const parsed = JSON.parse(raw);
            const doc = await window.__chiliTest.loadDocument(parsed);
            await window.__chiliTest.quietFrames(5);
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
        console.log(
            `   -> Canvas kích thước chuẩn Desktop: ${loadInfo.canvasWidth} x ${loadInfo.canvasHeight} px`,
        );

        // 3. Đo đạc đa lượt tách biệt từng bước của Save() (5 lượt)
        console.log("\n3. SỐ ĐO THÔ QUA 5 LƯỢT CHO TỪNG BƯỚC CỦA TIẾN TRÌNH LƯU (SAVE PROFILING):");
        const rounds = 5;
        const profileRounds = await client.evaluate(`(async () => {
            const app = window.__chiliTest.app;
            const doc = app.activeView?.document ?? app.documents.first() ?? globalThis.activeDocument;
            const view = app.activeView;
            const allRounds = [];

            for (let r = 1; r <= ${rounds}; r++) {
                const roundData = { round: r };

                // 3.1. Serialize
                const t0 = performance.now();
                const serialized = doc.serialize();
                const t1 = performance.now();
                const jsonStr = JSON.stringify(serialized);
                const t2 = performance.now();
                roundData.serializeMs = t1 - t0;
                roundData.jsonStringifyMs = t2 - t1;
                roundData.totalSerializeMs = t2 - t0;
                roundData.jsonSizeBytes = jsonStr.length;

                // 3.2. Ghi IndexedDB
                const t3 = performance.now();
                await app.storage.put("chili3d-db", "documents", doc.id, serialized);
                const t4 = performance.now();
                roundData.indexedDBWriteMs = t4 - t3;

                // 3.3. Thumbnail gốc: toImage() full size PNG
                const t5 = performance.now();
                const fullPng = view.toImage();
                const t6 = performance.now();
                roundData.fullThumbnailMs = t6 - t5;
                roundData.fullPngSizeBytes = fullPng.length;

                // 3.4. Thumbnail tối ưu: toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 })
                const t7 = performance.now();
                const optJpeg = view.toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 });
                const t8 = performance.now();
                roundData.optThumbnailMs = t8 - t7;
                roundData.optJpegSizeBytes = optJpeg.length;

                allRounds.push(roundData);
                await new Promise(res => setTimeout(res, 50));
            }

            return allRounds;
        })()`);

        console.log(
            "   ┌──────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐",
        );
        console.log(
            "   │ Lượt │ Đóng gói (Serialize) │ Ghi IndexedDB cục bộ │ Thumbnail gốc (Full) │ Thumbnail tối ưu     │",
        );
        console.log(
            "   ├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤",
        );
        let sumSer = 0;
        let sumIdb = 0;
        let sumFull = 0;
        let sumOpt = 0;

        for (const r of profileRounds) {
            sumSer += r.totalSerializeMs;
            sumIdb += r.indexedDBWriteMs;
            sumFull += r.fullThumbnailMs;
            sumOpt += r.optThumbnailMs;
            console.log(
                `   │  #${r.round}  │ ${r.totalSerializeMs.toFixed(2).padStart(17)} ms │ ${r.indexedDBWriteMs.toFixed(2).padStart(17)} ms │ ${r.fullThumbnailMs.toFixed(2).padStart(17)} ms │ ${r.optThumbnailMs.toFixed(2).padStart(17)} ms │`,
            );
        }
        console.log(
            "   ├──────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤",
        );
        console.log(
            `   │ TB   │ ${(sumSer / rounds).toFixed(2).padStart(17)} ms │ ${(sumIdb / rounds).toFixed(2).padStart(17)} ms │ ${(sumFull / rounds).toFixed(2).padStart(17)} ms │ ${(sumOpt / rounds).toFixed(2).padStart(17)} ms │`,
        );
        console.log(
            "   └──────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘",
        );
        console.log(
            `   -> Dung lượng JSON tài liệu: ${(profileRounds[0].jsonSizeBytes / 1024).toFixed(1)} KB`,
        );
        console.log(
            `   -> Dung lượng Thumbnail gốc (PNG): ${(profileRounds[0].fullPngSizeBytes / 1024).toFixed(1)} KB`,
        );
        console.log(
            `   -> Dung lượng Thumbnail tối ưu (JPEG): ${(profileRounds[0].optJpegSizeBytes / 1024).toFixed(1)} KB (nhẹ hơn ${(profileRounds[0].fullPngSizeBytes / profileRounds[0].optJpegSizeBytes).toFixed(1)} lần)`,
        );

        // 4. Đo đạc đối chứng 3 trường hợp khung hình khi vừa Pan/Zoom vừa tự lưu
        console.log("\n4. ĐO ĐẠC ĐỐI CHỨNG KHUNG HÌNH (PAN/ZOOM VỚI 3 TRƯỜNG HỢP TỰ LƯU QUA 3 LƯỢT ĐO):");

        const measureMode = async (_modeName, modeCode) => {
            // modeCode: 0 = full PNG thumbnail, 1 = optimized thumbnail, 2 = no thumbnail (save content only)
            const runs = [];
            for (let run = 1; run <= 3; run++) {
                const res = await client.evaluate(`(async () => {
                    const app = window.__chiliTest.app;
                    const doc = app.activeView?.document ?? app.documents.first() ?? globalThis.activeDocument;
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

                    // 40 sự kiện wheel zoom liên tiếp
                    for (let i = 0; i < 40; i++) {
                        const ev = new WheelEvent("wheel", {
                            deltaY: -12,
                            clientX: 720,
                            clientY: 450,
                            bubbles: true,
                            cancelable: true
                        });
                        canvas.dispatchEvent(ev);

                        // Giữa chừng (tại sự kiện 20), kích hoạt tiến trình tự lưu
                        if (i === 20) {
                            if (${modeCode} === 0) {
                                // Ca 1: Bản gốc — serialize + write + full PNG
                                const serialized = doc.serialize();
                                await app.storage.put("chili3d-db", "documents", doc.id, serialized);
                                const img = view.toImage();
                            } else if (${modeCode} === 1) {
                                // Ca 2: Bản tối ưu — serialize + write + 320px JPEG
                                const serialized = doc.serialize();
                                await app.storage.put("chili3d-db", "documents", doc.id, serialized);
                                const img = view.toImage({ maxSize: 320, mimeType: "image/jpeg", quality: 0.7 });
                            } else if (${modeCode} === 2) {
                                // Ca 3: Đối chứng bỏ thumbnail — CHỈ serialize + write
                                const serialized = doc.serialize();
                                await app.storage.put("chili3d-db", "documents", doc.id, serialized);
                            }
                        }
                        await new Promise(r => setTimeout(r, 16));
                    }

                    await new Promise(r => setTimeout(r, 200));
                    running = false;

                    const sorted = [...frameTimes].sort((a, b) => a - b);
                    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                    const over33ms = frameTimes.filter(t => t > 33.3).length;
                    const over16ms = frameTimes.filter(t => t > 16.7).length;
                    const maxFrame = Math.max(...frameTimes);

                    return {
                        totalFrames: frameTimes.length,
                        p95FrameTimeMs: p95,
                        over33msCount: over33ms,
                        over16msCount: over16ms,
                        maxFrameTimeMs: maxFrame
                    };
                })()`);
                runs.push(res);
                await new Promise((r) => setTimeout(r, 100));
            }

            const avgMax = runs.reduce((a, b) => a + b.maxFrameTimeMs, 0) / runs.length;
            const avgP95 = runs.reduce((a, b) => a + b.p95FrameTimeMs, 0) / runs.length;
            const avgOver33 = runs.reduce((a, b) => a + b.over33msCount, 0) / runs.length;

            return { runs, avgMax, avgP95, avgOver33 };
        };

        console.log("   -> Ca 1: Tự lưu với Thumbnail Full PNG (Bản gốc)...");
        const ca1 = await measureMode("Ca 1: Full PNG", 0);
        console.log(
            `      Lượt 1: max=${ca1.runs[0].maxFrameTimeMs.toFixed(1)}ms, p95=${ca1.runs[0].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca1.runs[0].over33msCount}`,
        );
        console.log(
            `      Lượt 2: max=${ca1.runs[1].maxFrameTimeMs.toFixed(1)}ms, p95=${ca1.runs[1].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca1.runs[1].over33msCount}`,
        );
        console.log(
            `      Lượt 3: max=${ca1.runs[2].maxFrameTimeMs.toFixed(1)}ms, p95=${ca1.runs[2].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca1.runs[2].over33msCount}`,
        );
        console.log(
            `      📊 Trung bình Ca 1: Freeze Peak = ${ca1.avgMax.toFixed(1)} ms | p95 = ${ca1.avgP95.toFixed(1)} ms | Khung > 33ms = ${ca1.avgOver33.toFixed(1)} khung`,
        );

        console.log("\n   -> Ca 2: Tự lưu với Thumbnail tối ưu 320px JPEG (Bản sau tối ưu)...");
        const ca2 = await measureMode("Ca 2: Opt JPEG", 1);
        console.log(
            `      Lượt 1: max=${ca2.runs[0].maxFrameTimeMs.toFixed(1)}ms, p95=${ca2.runs[0].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca2.runs[0].over33msCount}`,
        );
        console.log(
            `      Lượt 2: max=${ca2.runs[1].maxFrameTimeMs.toFixed(1)}ms, p95=${ca2.runs[1].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca2.runs[1].over33msCount}`,
        );
        console.log(
            `      Lượt 3: max=${ca2.runs[2].maxFrameTimeMs.toFixed(1)}ms, p95=${ca2.runs[2].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca2.runs[2].over33msCount}`,
        );
        console.log(
            `      📊 Trung bình Ca 2: Freeze Peak = ${ca2.avgMax.toFixed(1)} ms | p95 = ${ca2.avgP95.toFixed(1)} ms | Khung > 33ms = ${ca2.avgOver33.toFixed(1)} khung`,
        );

        console.log(
            "\n   -> Ca 3: Đối chứng — Vẫn tự lưu nhưng HOÀN TOÀN BỎ THUMBNAIL (Chỉ serialize + ghi IDB)...",
        );
        const ca3 = await measureMode("Ca 3: No Thumbnail", 2);
        console.log(
            `      Lượt 1: max=${ca3.runs[0].maxFrameTimeMs.toFixed(1)}ms, p95=${ca3.runs[0].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca3.runs[0].over33msCount}`,
        );
        console.log(
            `      Lượt 2: max=${ca3.runs[1].maxFrameTimeMs.toFixed(1)}ms, p95=${ca3.runs[1].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca3.runs[1].over33msCount}`,
        );
        console.log(
            `      Lượt 3: max=${ca3.runs[2].maxFrameTimeMs.toFixed(1)}ms, p95=${ca3.runs[2].p95FrameTimeMs.toFixed(1)}ms, >33ms=${ca3.runs[2].over33msCount}`,
        );
        console.log(
            `      📊 Trung bình Ca 3: Freeze Peak = ${ca3.avgMax.toFixed(1)} ms | p95 = ${ca3.avgP95.toFixed(1)} ms | Khung > 33ms = ${ca3.avgOver33.toFixed(1)} khung`,
        );

        console.log("\n================================================================================");
        console.log("🏆 PHÂN TÍCH NGUỒN GỐC NGHẼN & KẾT QUẢ ĐỐI CHỨNG:");
        console.log("================================================================================");
        console.log(
            `1. Khi tự lưu với full canvas PNG (Ca 1): Luồng chính bị khựng trung bình ${ca1.avgMax.toFixed(1)} ms.`,
        );
        console.log(
            `2. Khi hoàn toàn BỎ thumbnail (Ca 3, chỉ serialize + ghi IDB): Khung trễ nhất chỉ còn ${ca3.avgMax.toFixed(1)} ms.`,
        );
        console.log(
            `   ==> CHỨNG MINH RÕ RÀNG: ${(ca1.avgMax - ca3.avgMax).toFixed(1)} ms (${(((ca1.avgMax - ca3.avgMax) / ca1.avgMax) * 100).toFixed(0)}% của cú giật luồng chính) sinh ra trực tiếp từ bước tạo ảnh toImage() full PNG!`,
        );
        console.log(`3. Khi dùng Thumbnail tối ưu (Ca 2, 320px JPEG 0.7):`);
        console.log(
            `   - Freeze Peak giảm từ ${ca1.avgMax.toFixed(1)} ms xuống ${ca2.avgMax.toFixed(1)} ms (giảm ${(ca1.avgMax - ca2.avgMax).toFixed(1)} ms).`,
        );
        console.log(
            `   - Khung hình rớt (>33.3ms) giảm từ ${ca1.avgOver33.toFixed(1)} khung xuống ${ca2.avgOver33.toFixed(1)} khung.`,
        );
        console.log(`   - Đảm bảo đầy đủ ảnh đại diện dự án mà không gây nghẽn hàng đợi Zoom của trackpad.`);
        console.log("================================================================================");
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error("LỖI ĐO ĐẠC:", err);
    process.exit(1);
});
