// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import http from "node:http";
import { ALLOWED_VENDORS, handleLlmProxy } from "../server/llmProxy.mjs";
import { server as storageAppServer } from "../server/storageServer.mjs";

const PORT = Number.parseInt(process.env.PORT || "3999", 10);

// 1. Mock upstream server simulating LLM Provider
const mockUpstream = http.createServer((req, res) => {
    // Drain incoming body stream
    req.on("data", () => {});
    req.on("end", () => {
        if (req.url === "/v1/chat/completions" && req.method === "POST") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write('data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n');
            setTimeout(() => {
                res.write('data: {"choices":[{"delta":{"content":"from mock."}}]}\n\ndata: [DONE]\n\n');
                res.end();
            }, 15);
            return;
        }

        if (req.url === "/v1/models" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ data: [{ id: "mock-chat" }] }));
            return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Upstream Not Found" }));
    });
});

await new Promise((resolve) => mockUpstream.listen(0, "127.0.0.1", resolve));
const mockPort = mockUpstream.address().port;

const mockVendors = {
    ...ALLOWED_VENDORS,
    testmock: {
        id: "testmock",
        baseURL: `http://127.0.0.1:${mockPort}`,
        allowedPaths: ["/v1/models", "/v1/chat/completions"],
    },
};

// 2. Track peak RSS
let peakRss = process.memoryUsage().rss;
setInterval(() => {
    const currentRss = process.memoryUsage().rss;
    if (currentRss > peakRss) {
        peakRss = currentRss;
    }
}, 20).unref();

const STATIC_HTML = `<!DOCTYPE html><html><head><title>Chili3D CAD</title><meta charset="utf-8"></head><body><div id="app">Chili3D Web CAD</div></body></html>`;

// 3. Main combined server
const mainServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;

    // Internal stats endpoint for load test runner
    if (pathname === "/__stats" && req.method === "GET") {
        const mem = process.memoryUsage();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                rss: mem.rss,
                heapUsed: mem.heapUsed,
                peakRss,
            }),
        );
        return;
    }

    // Static root GET /
    if (pathname === "/" && req.method === "GET") {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": Buffer.byteLength(STATIC_HTML),
        });
        res.end(STATIC_HTML);
        return;
    }

    // Proxy routes
    if (pathname.startsWith("/api/llm-proxy/")) {
        await handleLlmProxy(req, res, pathname, {
            vendors: mockVendors,
            silent: Boolean(process.env.SILENT_PROXY),
        });
        return;
    }

    // All other /api/storage/ and /api/auth/ handled by storageServer
    storageAppServer.emit("request", req, res);
});

mainServer.listen(PORT, "127.0.0.1", () => {
    if (process.send) {
        process.send({ type: "READY", port: PORT });
    }
});

// Clean shutdown
process.on("SIGTERM", () => {
    mainServer.close();
    mockUpstream.close();
    process.exit(0);
});
process.on("SIGINT", () => {
    mainServer.close();
    mockUpstream.close();
    process.exit(0);
});
