// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import assert from "node:assert";
import http from "node:http";
import { ALLOWED_VENDORS, handleLlmProxy } from "../server/llmProxy.mjs";

console.log("=== LOCAL LLM PROXY VERIFICATION (MOCK UPSTREAM) ===");

// 1. Mock upstream server simulating LLM vendor
const mockUpstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
        body += chunk;
    });
    req.on("end", () => {
        if (req.url === "/v1/models" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ data: [{ id: "mock-model-1" }, { id: "mock-model-2" }] }));
            return;
        }

        if (req.url === "/v1/chat/completions" && req.method === "POST") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write('data: {"choices":[{"delta":{"content":"Chunk 1"}}]}\n\n');
            setTimeout(() => {
                res.write('data: {"choices":[{"delta":{"content":"Chunk 2"}}]}\n\n');
                res.end("data: [DONE]\n\n");
            }, 30);
            return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
    });
});

await new Promise((r) => mockUpstream.listen(0, r));
const mockPort = mockUpstream.address().port;

// Intercept console.log to inspect logged messages for secret leakage
const capturedLogs = [];
const origLog = console.log;
console.log = (...args) => {
    capturedLogs.push(args.join(" "));
    origLog(...args);
};

// 2. Proxy test server
const proxyServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const vendors = {
        ...ALLOWED_VENDORS,
        testmock: {
            id: "testmock",
            baseURL: `http://127.0.0.1:${mockPort}`,
            allowedPaths: ["/v1/models", "/v1/chat/completions"],
        },
    };
    await handleLlmProxy(req, res, url.pathname, { vendors });
});

await new Promise((r) => proxyServer.listen(0, r));
const proxyPort = proxyServer.address().port;
const proxyBase = `http://127.0.0.1:${proxyPort}`;

const FAKE_SECRET_KEY = "sk-test-SECRET-123456789";

try {
    // Điều kiện A: đường dẫn ngoài whitelist trả 404
    console.log("\n--- Checking Condition A: Forbidden subpath outside whitelist ---");
    const resA = await fetch(`${proxyBase}/api/llm-proxy/testmock/v1/forbidden_subpath`, {
        headers: { Authorization: `Bearer ${FAKE_SECRET_KEY}` },
    });
    console.log(`Condition A Response: status=${resA.status}`);
    const jsonA = await resA.json();
    console.log(`Condition A Body: ${JSON.stringify(jsonA)}`);
    assert.strictEqual(resA.status, 404);
    assert.match(jsonA.error, /Path not allowed/i);

    // Điều kiện B: vendor không có trong allowlist bị từ chối (404)
    console.log("\n--- Checking Condition B: Unknown vendor outside allowlist ---");
    const resB = await fetch(`${proxyBase}/api/llm-proxy/untrusted_vendor/v1/models`, {
        headers: { Authorization: `Bearer ${FAKE_SECRET_KEY}` },
    });
    console.log(`Condition B Response: status=${resB.status}`);
    const jsonB = await resB.json();
    console.log(`Condition B Body: ${JSON.stringify(jsonB)}`);
    assert.strictEqual(resB.status, 404);
    assert.match(jsonB.error, /Vendor not supported/i);

    // Điều kiện C: khóa giả sk-test-SECRET không xuất hiện trong log
    console.log("\n--- Checking Condition C: Zero-key leakage in logs ---");
    const resC = await fetch(`${proxyBase}/api/llm-proxy/testmock/v1/models`, {
        headers: {
            Authorization: `Bearer ${FAKE_SECRET_KEY}`,
            "x-api-key": FAKE_SECRET_KEY,
        },
    });
    const jsonC = await resC.json();
    console.log(`Condition C Response: status=${resC.status}, modelsCount=${jsonC.data?.length}`);

    // Đợi log kết thúc stream
    await new Promise((r) => setTimeout(r, 50));
    const leakedLog = capturedLogs.find((l) => l.includes(FAKE_SECRET_KEY));
    console.log(`Key leakage found in logs? ${Boolean(leakedLog)}`);
    assert.strictEqual(Boolean(leakedLog), false, "SECRET KEY LEAKED IN SERVER LOGS!");

    // Điều kiện D: streaming SSE truyền từng đoạn
    console.log("\n--- Checking Condition D: SSE chunked streaming ---");
    const resD = await fetch(`${proxyBase}/api/llm-proxy/testmock/v1/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${FAKE_SECRET_KEY}`,
        },
        body: JSON.stringify({ model: "mock-model-1", stream: true }),
    });

    assert.strictEqual(resD.status, 200);
    assert.strictEqual(resD.headers.get("content-type"), "text/event-stream");

    const chunks = [];
    const reader = resD.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        chunks.push(text);
        console.log(`Received SSE chunk (${text.length}B): ${JSON.stringify(text)}`);
    }

    console.log(`Total SSE chunks received: ${chunks.length}`);
    assert.ok(chunks.length >= 2, "Expected multiple streamed chunks");
    assert.ok(chunks.some((c) => c.includes("Chunk 1")));
    assert.ok(chunks.some((c) => c.includes("Chunk 2")));
    assert.ok(chunks.some((c) => c.includes("[DONE]")));

    console.log("\n✅ ALL 4 LOCAL PROXY CONDITIONS VERIFIED SUCCESSFULLY!");
} finally {
    console.log = origLog;
    proxyServer.close();
    mockUpstream.close();
}
