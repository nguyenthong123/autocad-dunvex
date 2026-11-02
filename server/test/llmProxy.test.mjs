// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import assert from "node:assert";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { ALLOWED_VENDORS, handleLlmProxy } from "../llmProxy.mjs";

describe("LLM Proxy Server Unit Tests", () => {
    let mockUpstreamPort;
    let mockUpstreamServer;
    let lastUpstreamRequest = null;

    let proxyPort;
    let proxyServer;
    let mockVendors;

    before((_, done) => {
        // 1. Mock upstream server simulating an LLM vendor API
        mockUpstreamServer = http.createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk;
            });
            req.on("end", () => {
                lastUpstreamRequest = {
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body,
                };

                if (req.url === "/v1/models" && req.method === "GET") {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(
                        JSON.stringify({
                            data: [
                                { id: "gpt-4o", object: "model" },
                                { id: "text-embedding-3-small", object: "model" },
                            ],
                        }),
                    );
                    return;
                }

                if (req.url === "/v1/chat/completions" && req.method === "POST") {
                    res.writeHead(200, { "Content-Type": "text/event-stream" });
                    res.write('data: {"choices":[{"delta":{"content":"Xin chào"}}]}\n\n');
                    res.end("data: [DONE]\n\n");
                    return;
                }

                if (req.url === "/slow") {
                    // Do not respond immediately to test timeout if needed
                    setTimeout(() => {
                        res.writeHead(200);
                        res.end("slow");
                    }, 500);
                    return;
                }

                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Not found" }));
            });
        });

        mockUpstreamServer.listen(0, () => {
            mockUpstreamPort = mockUpstreamServer.address().port;

            // Configure mock vendor pointing to local mock upstream
            mockVendors = {
                ...ALLOWED_VENDORS,
                testmock: {
                    id: "testmock",
                    baseURL: `http://127.0.0.1:${mockUpstreamPort}`,
                    allowedPaths: ["/v1/models", "/v1/chat/completions", "/slow"],
                },
            };

            // 2. Local test server running handleLlmProxy
            proxyServer = http.createServer(async (req, res) => {
                const url = new URL(req.url, `http://${req.headers.host}`);
                await handleLlmProxy(req, res, url.pathname, {
                    vendors: mockVendors,
                    silent: true,
                });
            });

            proxyServer.listen(0, () => {
                proxyPort = proxyServer.address().port;
                done();
            });
        });
    });

    after((_, done) => {
        proxyServer.close(() => {
            mockUpstreamServer.close(done);
        });
    });

    it("rejects unknown vendor with 404", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/unknown_vendor/v1/models`);
        assert.strictEqual(res.status, 404);
        const json = await res.json();
        assert.match(json.error, /Vendor not supported/i);
    });

    it("rejects disallowed path for valid vendor with 404", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/v1/forbidden_path`);
        assert.strictEqual(res.status, 404);
        const json = await res.json();
        assert.match(json.error, /Path not allowed/i);
    });

    it("forwards GET /v1/models to upstream and strips unsafe headers", async () => {
        const fakeSecretKey = "sk-test-SECRET-KEY-12345";
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/v1/models`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${fakeSecretKey}`,
                Cookie: "session_id=12345; super_secret_cookie=yes",
                "X-Custom-Untrusted": "evil_payload",
                "Content-Type": "application/json",
            },
        });

        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.data.length, 2);

        // Verify upstream received only whitelisted headers
        assert.strictEqual(lastUpstreamRequest.method, "GET");
        assert.strictEqual(lastUpstreamRequest.url, "/v1/models");
        assert.strictEqual(lastUpstreamRequest.headers.authorization, `Bearer ${fakeSecretKey}`);
        assert.strictEqual(lastUpstreamRequest.headers.cookie, undefined);
        assert.strictEqual(lastUpstreamRequest.headers["x-custom-untrusted"], undefined);
    });

    it("forwards POST streaming response chunk by chunk", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer sk-test-any",
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: "hello" }],
            }),
        });

        assert.strictEqual(res.status, 200);
        const text = await res.text();
        assert.match(text, /Xin chào/);
        assert.match(text, /\[DONE\]/);
    });

    it("never returns raw API key in error responses", async () => {
        const fakeSecretKey = "sk-SECRET-NEVER-LEAK";
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nonexistent/v1/models`, {
            headers: {
                Authorization: `Bearer ${fakeSecretKey}`,
            },
        });
        const text = await res.text();
        assert.doesNotMatch(text, new RegExp(fakeSecretKey));
    });

    it("rejects oversized request bodies > 20MB with 413", async () => {
        // Send a request slightly over 20MB
        // To test streaming rejection without huge memory overhead, we can test handleLlmProxy directly with chunked stream
        const largeStream = new (await import("node:stream")).Readable({
            read() {
                // emit 21MB in chunks of 1MB
                for (let i = 0; i < 21; i++) {
                    this.push(Buffer.alloc(1024 * 1024, "a"));
                }
                this.push(null);
            },
        });

        // Use node http client to send large body
        const req = http.request(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        const statusPromise = new Promise((resolve) => {
            req.on("response", (res) => {
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => resolve({ status: res.statusCode, body: data }));
            });
            req.on("error", () => resolve({ status: 413 }));
        });

        largeStream.pipe(req);
        const result = await statusPromise;
        assert.strictEqual(result.status, 413);
    });
});
