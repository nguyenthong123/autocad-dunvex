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
                if (body.length < 10000) {
                    body += chunk;
                }
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
                openrouter: {
                    id: "openrouter",
                    baseURL: `http://127.0.0.1:${mockUpstreamPort}`,
                    allowedPaths: ["/v1/models", "/v1/chat/completions"],
                },
                nvidia: {
                    id: "nvidia",
                    baseURL: `http://127.0.0.1:${mockUpstreamPort}`,
                    allowedPaths: ["/v1/models", "/models", "/v1/chat/completions", "/chat/completions"],
                },
            };

            // 2. Local test server running handleLlmProxy
            proxyServer = http.createServer(async (req, res) => {
                const url = new URL(req.url, `http://${req.headers.host}`);
                await handleLlmProxy(req, res, url.pathname, {
                    vendors: mockVendors,
                    silent: true,
                    verifyJwt: (token) => (token === "valid.mock.jwt" ? { sub: "user-vault-123" } : null),
                    getUserDb: (_userId) => ({
                        prepare: () => ({
                            get: (vendorId) =>
                                vendorId === "nvidia"
                                    ? { ciphertext: "mock-enc-hex", iv: "mock-iv", tag: "mock-tag" }
                                    : null,
                        }),
                    }),
                    getMasterEncryptionKey: () => Buffer.alloc(32, 1),
                    decryptApiKey: () => "nvapi-decrypted-from-vault-999",
                });
            });

            proxyServer.listen(0, () => {
                proxyPort = proxyServer.address().port;
                done();
            });
        });
    });

    after((_, done) => {
        if (typeof proxyServer.closeAllConnections === "function") {
            proxyServer.closeAllConnections();
        }
        if (typeof mockUpstreamServer.closeAllConnections === "function") {
            mockUpstreamServer.closeAllConnections();
        }
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

    it("successfully streams 19MB request body without buffering in RAM", async () => {
        const initialRss = process.memoryUsage().rss;
        const CHUNK_SIZE = 64 * 1024;
        const TOTAL_CHUNKS = Math.floor((19 * 1024 * 1024) / CHUNK_SIZE);
        const reusableBuffer = Buffer.alloc(CHUNK_SIZE, "x");

        let sentChunks = 0;
        const nineteenMbStream = new (await import("node:stream")).Readable({
            read() {
                while (sentChunks < TOTAL_CHUNKS) {
                    sentChunks++;
                    const canContinue = this.push(reusableBuffer);
                    if (!canContinue) return;
                }
                this.push(null);
            },
        });

        const req = http.request(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": String(TOTAL_CHUNKS * CHUNK_SIZE),
            },
        });

        const resPromise = new Promise((resolve, reject) => {
            req.on("response", (res) => {
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => resolve({ status: res.statusCode, body: data }));
            });
            req.on("error", reject);
        });

        nineteenMbStream.pipe(req);
        const res = await resPromise;
        assert.strictEqual(res.status, 200);

        const finalRss = process.memoryUsage().rss;
        const rssDeltaMb = (finalRss - initialRss) / 1024 / 1024;
        // Verify proxy didn't allocate 19MB in RAM (delta must be much less than 15MB)
        assert.ok(rssDeltaMb < 10, `Expected RSS delta < 10MB, got ${rssDeltaMb.toFixed(2)}MB`);
    });

    it("rejects 21MB request body with 413 Payload Too Large", async () => {
        const CHUNK_SIZE = 64 * 1024;
        const TOTAL_CHUNKS = Math.floor((21 * 1024 * 1024) / CHUNK_SIZE);
        const reusableBuffer = Buffer.alloc(CHUNK_SIZE, "y");

        let sentChunks = 0;
        const stream21Mb = new (await import("node:stream")).Readable({
            read() {
                while (sentChunks < TOTAL_CHUNKS) {
                    sentChunks++;
                    const canContinue = this.push(reusableBuffer);
                    if (!canContinue) return;
                }
                this.push(null);
            },
        });

        const req = http.request(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": String(TOTAL_CHUNKS * CHUNK_SIZE),
            },
        });

        const resPromise = new Promise((resolve) => {
            req.on("response", (res) => {
                let data = "";
                res.on("data", (c) => (data += c));
                res.on("end", () => resolve({ status: res.statusCode, body: data }));
            });
            req.on("error", () => resolve({ status: 413 }));
        });

        stream21Mb.pipe(req);
        const res = await resPromise;
        assert.strictEqual(res.status, 413);
    });

    it("enforces concurrency limit: 11 concurrent requests yield 10 accepted and 1 received 503", async () => {
        // Send 11 concurrent requests to /slow endpoint (takes 500ms)
        const promises = [];
        for (let i = 0; i < 11; i++) {
            promises.push(
                fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/testmock/slow`, {
                    headers: { "X-Forwarded-For": `10.0.0.${i + 1}` },
                }).then(async (r) => {
                    const _body = await r.text();
                    return {
                        status: r.status,
                        retryAfter: r.headers.get("retry-after"),
                    };
                }),
            );
        }

        const results = await Promise.all(promises);
        const status503 = results.filter((r) => r.status === 503);
        const status200 = results.filter((r) => r.status === 200);

        assert.strictEqual(status503.length, 1, "Expected exactly 1 request to get 503");
        assert.strictEqual(status200.length, 10, "Expected exactly 10 requests to get 200");
        assert.strictEqual(status503[0].retryAfter, "5", "Expected Retry-After header to be 5");
    });

    it("routes openrouter chat completions /api/llm-proxy/openrouter/v1/chat/completions to upstream correctly", async () => {
        const res = await fetch(
            `http://127.0.0.1:${proxyPort}/api/llm-proxy/openrouter/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer mock-token-sk-test",
                },
                body: JSON.stringify({
                    model: "anthropic/claude-3.7-sonnet",
                    messages: [{ role: "user", content: "hello" }],
                    stream: true,
                }),
            },
        );

        assert.strictEqual(res.status, 200);
        assert.strictEqual(lastUpstreamRequest.method, "POST");
        assert.strictEqual(lastUpstreamRequest.url, "/v1/chat/completions");
        assert.strictEqual(lastUpstreamRequest.headers.authorization, "Bearer mock-token-sk-test");
        const bodyText = await res.text();
        assert.ok(bodyText.includes("Xin chào"));
    });

    it("verifies NVIDIA NIM in ALLOWED_VENDORS has fixed upstream and strict allowed paths", () => {
        assert.ok(ALLOWED_VENDORS.nvidia, "Expected nvidia in ALLOWED_VENDORS");
        assert.strictEqual(
            ALLOWED_VENDORS.nvidia.baseURL,
            "https://integrate.api.nvidia.com",
            "NVIDIA upstream must be integrate.api.nvidia.com",
        );
        assert.ok(
            ALLOWED_VENDORS.nvidia.allowedPaths.includes("/v1/chat/completions"),
            "Must allow /v1/chat/completions",
        );
        assert.ok(ALLOWED_VENDORS.nvidia.allowedPaths.includes("/v1/models"), "Must allow /v1/models");
    });

    it("routes NVIDIA NIM chat completions /api/llm-proxy/nvidia/v1/chat/completions to upstream with streaming and bearer auth", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nvidia/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer nvapi-mock-test-key-999",
            },
            body: JSON.stringify({
                model: "meta/llama-3.3-70b-instruct",
                messages: [{ role: "user", content: "Test ping" }],
                stream: true,
            }),
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(lastUpstreamRequest.method, "POST");
        assert.strictEqual(lastUpstreamRequest.url, "/v1/chat/completions");
        assert.strictEqual(lastUpstreamRequest.headers.authorization, "Bearer nvapi-mock-test-key-999");
        const parsedBody = JSON.parse(lastUpstreamRequest.body);
        assert.strictEqual(parsedBody.model, "meta/llama-3.3-70b-instruct");
        const text = await res.text();
        assert.ok(text.includes("Xin chào"));
    });

    it("normalizes NVIDIA NIM subpaths without /v1 prefix: /api/llm-proxy/nvidia/chat/completions maps to /v1/chat/completions", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nvidia/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer nvapi-mock-test-key-999",
            },
            body: JSON.stringify({
                model: "meta/llama-3.3-70b-instruct",
                messages: [{ role: "user", content: "Test ping" }],
            }),
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(lastUpstreamRequest.url, "/v1/chat/completions");
    });

    it("rejects unauthorized NVIDIA path with 404", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nvidia/v1/admin`, {
            method: "GET",
            headers: {
                Authorization: "Bearer nvapi-mock-test-key-999",
            },
        });
        assert.strictEqual(res.status, 404);
        const body = await res.json();
        assert.strictEqual(body.error, "Path not allowed by proxy allowlist");
    });

    it("resolves stored encrypted credential from user vault when client key is placeholder/vault", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nvidia/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-user-token": "valid.mock.jwt",
                Authorization: "Bearer stored-vault",
            },
            body: JSON.stringify({
                model: "meta/llama-3.3-70b-instruct",
                messages: [{ role: "user", content: "Test vault resolution" }],
            }),
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(lastUpstreamRequest.method, "POST");
        assert.strictEqual(lastUpstreamRequest.url, "/v1/chat/completions");
        // Verify real decrypted key was attached
        assert.strictEqual(
            lastUpstreamRequest.headers.authorization,
            "Bearer nvapi-decrypted-from-vault-999",
        );
        // Verify user JWT token was NOT forwarded upstream
        assert.strictEqual(lastUpstreamRequest.headers["x-user-token"], undefined);
    });

    it("rejects stored vault request with 401 when user is not authenticated (guest)", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nvidia/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer stored-vault",
            },
            body: JSON.stringify({
                model: "meta/llama-3.3-70b-instruct",
                messages: [{ role: "user", content: "Guest vault access" }],
            }),
        });

        assert.strictEqual(res.status, 401);
        const body = await res.json();
        assert.match(body.error, /Authentication required to access stored credential/i);
    });

    it("rejects stored vault request with 401 when user JWT is invalid or expired", async () => {
        const res = await fetch(`http://127.0.0.1:${proxyPort}/api/llm-proxy/nvidia/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-user-token": "invalid.or.expired.jwt",
                Authorization: "Bearer stored-vault",
            },
            body: JSON.stringify({
                model: "meta/llama-3.3-70b-instruct",
                messages: [{ role: "user", content: "Invalid JWT vault access" }],
            }),
        });

        assert.strictEqual(res.status, 401);
        const body = await res.json();
        assert.match(body.error, /Invalid or expired user session/i);
    });

    it("rejects stored vault request with 401 on provider mismatch (saved nvidia, requesting openrouter)", async () => {
        const res = await fetch(
            `http://127.0.0.1:${proxyPort}/api/llm-proxy/openrouter/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-token": "valid.mock.jwt",
                    Authorization: "Bearer stored-vault",
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-3-8b",
                    messages: [{ role: "user", content: "Provider mismatch test" }],
                }),
            },
        );

        assert.strictEqual(res.status, 401);
        const body = await res.json();
        assert.match(body.error, /No stored API credential found for vendor 'openrouter'/i);
    });
});
