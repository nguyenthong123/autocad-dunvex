// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

/**
 * Strict allowlist of upstream LLM providers.
 * Requests can ONLY be forwarded to these hardcoded base URLs.
 * Clients cannot specify or override the target host.
 */
export const ALLOWED_VENDORS = {
    anthropic: {
        id: "anthropic",
        baseURL: "https://api.anthropic.com",
        allowedPaths: ["/v1/models", "/v1/messages"],
    },
    openai: {
        id: "openai",
        baseURL: "https://api.openai.com",
        allowedPaths: ["/v1/models", "/v1/chat/completions", "/v1/responses"],
    },
    deepseek: {
        id: "deepseek",
        baseURL: "https://api.deepseek.com",
        allowedPaths: ["/v1/models", "/models", "/v1/chat/completions", "/chat/completions"],
    },
    google: {
        id: "google",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        allowedPaths: ["/v1/models", "/models", "/v1/chat/completions", "/chat/completions"],
    },
    groq: {
        id: "groq",
        baseURL: "https://api.groq.com/openai",
        allowedPaths: ["/v1/models", "/v1/chat/completions"],
    },
    openrouter: {
        id: "openrouter",
        baseURL: "https://openrouter.ai/api",
        allowedPaths: ["/v1/models", "/v1/chat/completions"],
    },
};

/** Forwarded headers whitelist (all other headers including Cookie are stripped). */
const FORWARDED_HEADERS = new Set([
    "authorization",
    "x-api-key",
    "anthropic-version",
    "content-type",
    "accept",
]);

/** Max request body size: 20 MB (for viewport screenshots). */
const MAX_BODY_BYTES = 20 * 1024 * 1024;

/** Rate limit: 60 requests per minute per IP. */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ipRateLimitMap = new Map();

/** Periodically clean up stale rate limit entries */
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipRateLimitMap.entries()) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
            ipRateLimitMap.delete(ip);
        }
    }
}, 60000).unref();

function checkRateLimit(clientIp) {
    const now = Date.now();
    let entry = ipRateLimitMap.get(clientIp);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        entry = { windowStart: now, count: 0 };
        ipRateLimitMap.set(clientIp, entry);
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX;
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
}

function sanitizeLogMessage(msg) {
    return String(msg).replace(/(Bearer\s+|x-api-key:\s*)[a-zA-Z0-9_\-.]+/gi, "$1[REDACTED]");
}

/**
 * Handle /api/llm-proxy/<vendorId>/<subpath...>
 */
export async function handleLlmProxy(req, res, pathname, options = {}) {
    const startTime = Date.now();
    const clientIp =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "127.0.0.1";

    // 1. Rate limiting check
    if (!options.disableRateLimit && !checkRateLimit(clientIp)) {
        sendJson(res, 429, { error: "Too Many Requests - Rate limit exceeded (60 req/min)" });
        return;
    }

    // 2. Extract vendorId and target subpath
    // URL pattern: /api/llm-proxy/:vendorId(/.*)?
    const prefix = "/api/llm-proxy/";
    if (!pathname.startsWith(prefix)) {
        sendJson(res, 404, { error: "Not Found" });
        return;
    }

    const rest = pathname.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    const vendorId = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    const subpath = slashIdx >= 0 ? rest.slice(slashIdx) : "/";

    const vendor = (options.vendors || ALLOWED_VENDORS)[vendorId];
    if (!vendor) {
        sendJson(res, 404, { error: "Vendor not supported in proxy allowlist" });
        return;
    }

    // Normalize subpath (strip trailing slashes for comparison)
    const normalizedSubpath = subpath.replace(/\/+$/, "") || "/";
    const isAllowedPath = vendor.allowedPaths.some((p) => {
        const normP = p.replace(/\/+$/, "") || "/";
        return normalizedSubpath === normP;
    });

    if (!isAllowedPath) {
        sendJson(res, 404, { error: "Path not allowed by proxy allowlist" });
        return;
    }

    // Google Generative AI OpenAI-compat endpoint uses /models and /chat/completions
    let upstreamSubpath = subpath;
    if (vendorId === "google" && upstreamSubpath.startsWith("/v1/")) {
        upstreamSubpath = upstreamSubpath.slice(3);
    }

    // 3. Timeouts: 15s for GET (models), 300s for POST/chat
    const isGet = req.method === "GET";
    const timeoutMs = isGet ? 15000 : 300000;

    // 4. Filter headers (strictly whitelist, never cookies or arbitrary headers)
    const upstreamHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (FORWARDED_HEADERS.has(lowerKey)) {
            upstreamHeaders[lowerKey] = value;
        }
    }

    // Parse target URL
    const targetUrl = new URL(vendor.baseURL + upstreamSubpath);
    upstreamHeaders["host"] = targetUrl.host;

    const requestModule = targetUrl.protocol === "http:" ? http : https;

    let responseSize = 0;
    let timedOut = false;

    // 5. Buffer incoming request body with size check
    let bodyBuffer = null;
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        try {
            bodyBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                let totalBytes = 0;
                req.on("data", (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_BODY_BYTES) {
                        reject(new Error("PAYLOAD_TOO_LARGE"));
                        return;
                    }
                    chunks.push(chunk);
                });
                req.on("end", () => resolve(Buffer.concat(chunks)));
                req.on("error", reject);
            });
            upstreamHeaders["content-length"] = bodyBuffer.length;
        } catch (err) {
            if (err.message === "PAYLOAD_TOO_LARGE") {
                sendJson(res, 413, { error: "Payload Too Large (Max 20MB)" });
                return;
            }
            sendJson(res, 400, { error: "Failed to read request body" });
            return;
        }
    }

    // 6. Forward request to upstream vendor
    const clientReq = requestModule.request(
        targetUrl,
        {
            method: req.method,
            headers: upstreamHeaders,
            timeout: timeoutMs,
        },
        (upstreamRes) => {
            // Forward status and safe response headers
            const forwardRespHeaders = {
                "content-type": upstreamRes.headers["content-type"] || "application/json",
                "access-control-allow-origin": "*",
            };
            if (upstreamRes.headers["cache-control"]) {
                forwardRespHeaders["cache-control"] = upstreamRes.headers["cache-control"];
            }

            res.writeHead(upstreamRes.statusCode || 500, forwardRespHeaders);

            // Stream response chunk by chunk without buffering (SSE transparent)
            upstreamRes.on("data", (chunk) => {
                responseSize += chunk.length;
                res.write(chunk);
            });

            upstreamRes.on("end", () => {
                res.end();
                const durationMs = Date.now() - startTime;
                // Zero-key logging: only vendor, normalized path, status, duration, size
                if (!options.silent) {
                    console.log(
                        `[LLM-PROXY] vendor=${vendorId} path=${normalizedSubpath} status=${upstreamRes.statusCode} duration=${durationMs}ms size=${responseSize}B`,
                    );
                }
            });

            upstreamRes.on("error", (err) => {
                res.end();
            });
        },
    );

    clientReq.on("timeout", () => {
        timedOut = true;
        clientReq.destroy(new Error("GATEWAY_TIMEOUT"));
    });

    clientReq.on("error", (err) => {
        if (res.headersSent) {
            res.end();
            return;
        }
        if (timedOut || err.message === "GATEWAY_TIMEOUT") {
            sendJson(res, 504, { error: "Gateway Timeout" });
            return;
        }
        sendJson(res, 502, { error: "Bad Gateway - upstream connection failed" });
    });

    if (bodyBuffer) {
        clientReq.write(bodyBuffer);
    }
    clientReq.end();
}
