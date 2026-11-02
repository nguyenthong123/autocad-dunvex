// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { fork } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(__dirname, "loadtest-reports");

// Helper to compute percentiles
function computeStats(latenciesMs, statusCodes, peakRssBytes) {
    if (latenciesMs.length === 0) {
        return {
            count: 0,
            p50: 0,
            p95: 0,
            p99: 0,
            min: 0,
            max: 0,
            mean: 0,
            errors: 0,
            errorRate: "0.00%",
            statusCodes,
            peakRssMb: (peakRssBytes / 1024 / 1024).toFixed(2),
        };
    }
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = (sum / sorted.length).toFixed(1);

    let errorCount = 0;
    for (const [code, count] of Object.entries(statusCodes)) {
        const c = Number.parseInt(code, 10);
        if (c >= 400 && c !== 413 && c !== 503) {
            // Note: 413 and 503 are expected shedding responses in specific tests
            errorCount += count;
        }
    }
    const errorRate = ((errorCount / sorted.length) * 100).toFixed(2);

    return {
        count: sorted.length,
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        min: Math.round(min),
        max: Math.round(max),
        mean: Number(mean),
        statusCodes,
        errors: errorCount,
        errorRate: `${errorRate}%`,
        peakRssMb: Number((peakRssBytes / 1024 / 1024).toFixed(2)),
    };
}

// HTTP request helper with latency and status tracking
function sendHttpRequest(options, bodyBuffer = null) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const req = http.request(options, (res) => {
            let receivedBytes = 0;
            res.on("data", (chunk) => {
                receivedBytes += chunk.length;
            });
            res.on("end", () => {
                const duration = Date.now() - startTime;
                resolve({
                    statusCode: res.statusCode,
                    duration,
                    receivedBytes,
                    error: null,
                });
            });
        });

        req.on("error", (err) => {
            const duration = Date.now() - startTime;
            resolve({
                statusCode: 0,
                duration,
                receivedBytes: 0,
                error: err.message,
            });
        });

        if (bodyBuffer) {
            req.write(bodyBuffer);
        }
        req.end();
    });
}

// Generate realistic dummy CAD document JSON
function generateCadDoc(targetSizeBytes) {
    const base = {
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: "Dự án Thử tải",
        userData: { version: "1.0" },
        models: { nodes: [] },
    };
    const nodeTemplate = {
        id: "node_1",
        __cla$$__: "PrismNode",
        name: "Tấm Gỗ 1",
        section: { type: "rectangle", width: 100, height: 200 },
        transform: { x: 0, y: 0, z: 0 },
        padding: "A".repeat(1024), // 1KB per node
    };

    const baseLen = JSON.stringify(base).length;
    const nodeLen = JSON.stringify(nodeTemplate).length;
    const count = Math.max(1, Math.floor((targetSizeBytes - baseLen) / nodeLen));

    for (let i = 0; i < count; i++) {
        base.models.nodes.push({
            ...nodeTemplate,
            id: `node_${i}`,
            name: `Khối chi tiết ${i}`,
        });
    }

    let jsonStr = JSON.stringify(base);
    if (jsonStr.length < targetSizeBytes) {
        // Pad exact difference
        base.pad = "X".repeat(targetSizeBytes - jsonStr.length);
        jsonStr = JSON.stringify(base);
    }
    return Buffer.from(jsonStr, "utf8");
}

// Concurrency worker runner
async function runConcurrentTest({
    title,
    concurrency,
    totalRequests,
    serverPort,
    makeRequestFn,
    getServerStatsFn,
}) {
    process.stdout.write(`  ▶ ${title} (Concurrency=${concurrency}, N=${totalRequests})... `);
    let completed = 0;
    let inFlight = 0;
    let nextIndex = 0;
    const latencies = [];
    const statusCodes = {};
    let peakRss = 0;

    // Background poller for server RSS
    const statsInterval = setInterval(async () => {
        const stats = await getServerStatsFn();
        if (stats && stats.rss > peakRss) {
            peakRss = stats.rss;
        }
    }, 20);

    await new Promise((resolve) => {
        function spawnWorker() {
            if (completed >= totalRequests) {
                if (inFlight === 0) resolve();
                return;
            }
            while (inFlight < concurrency && nextIndex < totalRequests) {
                const reqIndex = nextIndex++;
                inFlight++;
                makeRequestFn(reqIndex, serverPort)
                    .then((result) => {
                        latencies.push(result.duration);
                        const codeKey = String(result.statusCode || 0);
                        statusCodes[codeKey] = (statusCodes[codeKey] || 0) + 1;
                    })
                    .catch((_err) => {
                        latencies.push(0);
                        statusCodes.error = (statusCodes.error || 0) + 1;
                    })
                    .finally(() => {
                        inFlight--;
                        completed++;
                        spawnWorker();
                    });
            }
        }
        spawnWorker();
    });

    clearInterval(statsInterval);
    const finalStats = await getServerStatsFn();
    if (finalStats && finalStats.rss > peakRss) {
        peakRss = finalStats.rss;
    }

    const summary = computeStats(latencies, statusCodes, peakRss);
    console.log(
        `p50=${summary.p50}ms | p95=${summary.p95}ms | p99=${summary.p99}ms | peakRSS=${summary.peakRssMb}MB | errors=${summary.errors} (${summary.errorRate})`,
    );
    return summary;
}

// MAIN RUNNER
async function main() {
    const mode = process.argv.includes("--after") ? "after" : "baseline";
    console.log("==================================================================");
    console.log(`🚀 BẮT ĐẦU ĐO TẢI HỆ THỐNG CỤC BỘ (MODE: ${mode.toUpperCase()})`);
    console.log("==================================================================");

    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    // 1. Khởi chạy Child Process Server
    const childServerScript = path.join(__dirname, "loadTestServer.mjs");
    const childEnv = {
        ...process.env,
        PORT: "3999",
        DATA_DIR: path.join(ROOT_DIR, "data", "loadtest_storage"),
        SILENT_PROXY: "1",
    };

    const serverProcess = fork(childServerScript, [], {
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    let serverPort = 3999;
    await new Promise((resolve, reject) => {
        serverProcess.on("message", (msg) => {
            if (msg.type === "READY") {
                serverPort = msg.port;
                resolve();
            }
        });
        serverProcess.on("error", reject);
        setTimeout(() => reject(new Error("Timeout waiting for serverProcess to start")), 5000);
    });

    console.log(`[TEST-RUNNER] Child test server is ready on port ${serverPort}`);

    // Helper to query server stats
    async function getServerStats() {
        return new Promise((resolve) => {
            const req = http.get(
                {
                    hostname: "127.0.0.1",
                    port: serverPort,
                    path: "/__stats",
                    timeout: 1000,
                },
                (res) => {
                    let raw = "";
                    res.on("data", (chunk) => (raw += chunk));
                    res.on("end", () => {
                        try {
                            resolve(JSON.parse(raw));
                        } catch {
                            resolve(null);
                        }
                    });
                },
            );
            req.on("error", () => resolve(null));
        });
    }

    const report = {
        date: new Date().toISOString(),
        mode,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        scenarios: {},
    };

    // Pre-generate payloads so client time doesn't contaminate measurements
    console.log("📦 Chuẩn bị dữ liệu mẫu...");
    const payload100Kb = generateCadDoc(100 * 1024);
    const payload1Mb = generateCadDoc(1024 * 1024);
    const proxyPayload50Kb = Buffer.from(
        JSON.stringify({
            model: "mock-chat",
            messages: [{ role: "user", content: "M".repeat(50 * 1024) }],
            stream: true,
        }),
    );
    const proxyPayload2Mb = Buffer.from(
        JSON.stringify({
            model: "mock-chat",
            messages: [{ role: "user", content: "P".repeat(2 * 1024 * 1024) }],
            stream: true,
        }),
    );
    console.log("   -> 100 KB Doc:", payload100Kb.length, "bytes");
    console.log("   -> 1 MB Doc:", payload1Mb.length, "bytes");
    console.log("   -> 50 KB Proxy:", proxyPayload50Kb.length, "bytes");
    console.log("   -> 2 MB Proxy:", proxyPayload2Mb.length, "bytes");

    const concurrencyLevels = [10, 50, 100];

    try {
        // ==========================================
        // SCENARIO A: GET / (Trang web tĩnh)
        // ==========================================
        console.log("\n--- [A] KIỂM THỬ GET / (Trang web tĩnh / index.html) ---");
        report.scenarios.GET_root = {};
        for (const c of concurrencyLevels) {
            const total = c * 5; // 50, 250, 500 reqs
            const res = await runConcurrentTest({
                title: `GET / [c=${c}]`,
                concurrency: c,
                totalRequests: total,
                serverPort,
                getServerStatsFn: getServerStats,
                makeRequestFn: (_idx, port) => {
                    return sendHttpRequest({
                        hostname: "127.0.0.1",
                        port,
                        path: "/",
                        method: "GET",
                    });
                },
            });
            report.scenarios.GET_root[`c${c}`] = res;
        }

        // ==========================================
        // SCENARIO B1: PUT /api/storage/default/documents/:id (100 KB)
        // ==========================================
        console.log("\n--- [B1] KIỂM THỬ PUT /api/storage/ (Lưu Dự án 100 KB) ---");
        report.scenarios.PUT_storage_100KB = {};
        for (const c of concurrencyLevels) {
            const total = c * 3; // 30, 150, 300 reqs
            const res = await runConcurrentTest({
                title: `PUT Storage 100KB [c=${c}]`,
                concurrency: c,
                totalRequests: total,
                serverPort,
                getServerStatsFn: getServerStats,
                makeRequestFn: (idx, port) => {
                    const docId = `doc_100k_${c}_${idx % 20}`;
                    return sendHttpRequest(
                        {
                            hostname: "127.0.0.1",
                            port,
                            path: `/api/storage/default/documents/${docId}`,
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                                "Content-Length": payload100Kb.length,
                            },
                        },
                        payload100Kb,
                    );
                },
            });
            report.scenarios.PUT_storage_100KB[`c${c}`] = res;
        }

        // ==========================================
        // SCENARIO B2: PUT /api/storage/default/documents/:id (1 MB)
        // ==========================================
        console.log("\n--- [B2] KIỂM THỬ PUT /api/storage/ (Lưu Dự án 1 MB) ---");
        report.scenarios.PUT_storage_1MB = {};
        for (const c of concurrencyLevels) {
            const total = c * 2; // 20, 100, 200 reqs
            const res = await runConcurrentTest({
                title: `PUT Storage 1MB [c=${c}]`,
                concurrency: c,
                totalRequests: total,
                serverPort,
                getServerStatsFn: getServerStats,
                makeRequestFn: (idx, port) => {
                    const docId = `doc_1m_${c}_${idx % 20}`;
                    return sendHttpRequest(
                        {
                            hostname: "127.0.0.1",
                            port,
                            path: `/api/storage/default/documents/${docId}`,
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                                "Content-Length": payload1Mb.length,
                            },
                        },
                        payload1Mb,
                    );
                },
            });
            report.scenarios.PUT_storage_1MB[`c${c}`] = res;
        }

        // ==========================================
        // SCENARIO C1: LLM Proxy (50 KB Body, SSE Stream)
        // ==========================================
        console.log("\n--- [C1] KIỂM THỬ LLM Proxy (Body 50 KB, SSE Stream) ---");
        report.scenarios.PROXY_stream_50KB = {};
        for (const c of concurrencyLevels) {
            const total = c * 3; // 30, 150, 300 reqs
            const res = await runConcurrentTest({
                title: `Proxy 50KB [c=${c}]`,
                concurrency: c,
                totalRequests: total,
                serverPort,
                getServerStatsFn: getServerStats,
                makeRequestFn: (idx, port) => {
                    const fakeClientIp = `192.168.1.${(idx % 120) + 1}`;
                    return sendHttpRequest(
                        {
                            hostname: "127.0.0.1",
                            port,
                            path: "/api/llm-proxy/testmock/v1/chat/completions",
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Content-Length": proxyPayload50Kb.length,
                                Authorization: "Bearer sk-test-mock-key",
                                "X-Forwarded-For": fakeClientIp,
                            },
                        },
                        proxyPayload50Kb,
                    );
                },
            });
            report.scenarios.PROXY_stream_50KB[`c${c}`] = res;
        }

        // ==========================================
        // SCENARIO C2: LLM Proxy (2 MB Body, SSE Stream)
        // ==========================================
        console.log("\n--- [C2] KIỂM THỬ LLM Proxy (Body 2 MB, SSE Stream) ---");
        report.scenarios.PROXY_stream_2MB = {};
        for (const c of concurrencyLevels) {
            const total = c * 2; // 20, 100, 200 reqs
            const res = await runConcurrentTest({
                title: `Proxy 2MB [c=${c}]`,
                concurrency: c,
                totalRequests: total,
                serverPort,
                getServerStatsFn: getServerStats,
                makeRequestFn: (idx, port) => {
                    const fakeClientIp = `192.168.2.${(idx % 120) + 1}`;
                    return sendHttpRequest(
                        {
                            hostname: "127.0.0.1",
                            port,
                            path: "/api/llm-proxy/testmock/v1/chat/completions",
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Content-Length": proxyPayload2Mb.length,
                                Authorization: "Bearer sk-test-mock-key",
                                "X-Forwarded-For": fakeClientIp,
                            },
                        },
                        proxyPayload2Mb,
                    );
                },
            });
            report.scenarios.PROXY_stream_2MB[`c${c}`] = res;
        }

        // Save report file
        const todayStr = new Date().toISOString().slice(0, 10);
        const reportPath = path.join(REPORTS_DIR, `${todayStr}-${mode}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
        console.log("\n==================================================================");
        console.log(`✅ ĐÃ LƯU BÁO CÁO THỬ TẢI: ${reportPath}`);
        console.log("==================================================================");
    } finally {
        serverProcess.kill();
    }
}

main().catch((err) => {
    console.error("Lỗi khi chạy đo tải:", err);
    process.exit(1);
});
