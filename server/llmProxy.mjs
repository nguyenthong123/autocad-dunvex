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
    nvidia: {
        id: "nvidia",
        baseURL: "https://integrate.api.nvidia.com",
        allowedPaths: ["/v1/models", "/models", "/v1/chat/completions", "/chat/completions"],
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

/** Max request body size: 20 MB default (for viewport screenshots / multi-modal). */
export const DEFAULT_MAX_BODY_BYTES = 20 * 1024 * 1024;

/** Concurrency limit: max 10 concurrent upstream proxy requests by default. */
export const DEFAULT_MAX_CONCURRENT = 10;
let activeProxyRequests = 0;

export function getActiveProxyRequests() {
    return activeProxyRequests;
}

export function resetActiveProxyRequests() {
    activeProxyRequests = 0;
}

/** Rate limit: 60 requests per minute per IP by default. */
export const DEFAULT_RATE_LIMIT_MAX = 60;
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

function checkRateLimit(clientIp, limit = DEFAULT_RATE_LIMIT_MAX) {
    const now = Date.now();
    let entry = ipRateLimitMap.get(clientIp);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        entry = { windowStart: now, count: 0 };
        ipRateLimitMap.set(clientIp, entry);
    }
    entry.count++;
    return entry.count <= limit;
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders,
    });
    res.end(body);
}

function _sanitizeLogMessage(msg) {
    return String(msg).replace(/(Bearer\s+|x-api-key:\s*)[a-zA-Z0-9_\-.]+/gi, "$1[REDACTED]");
}

/**
 * Handle /api/llm-proxy/<vendorId>/<subpath...>
 */
export async function handleLlmProxy(req, res, pathname, options = {}) {
    const startTime = Date.now();
    const clientIp =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "127.0.0.1";

    // 1. Concurrency limit check (fail fast with 503 + Retry-After)
    const maxConcurrent = Number.parseInt(
        options.maxConcurrent ?? process.env.LLM_PROXY_MAX_CONCURRENT ?? String(DEFAULT_MAX_CONCURRENT),
        10,
    );

    if (activeProxyRequests >= maxConcurrent) {
        sendJson(
            res,
            503,
            {
                error: "Service Unavailable - Maximum concurrent proxy requests reached. Please retry later.",
            },
            { "Retry-After": "5" },
        );
        return;
    }

    activeProxyRequests++;
    let released = false;
    const releaseConcurrency = () => {
        if (!released) {
            released = true;
            activeProxyRequests = Math.max(0, activeProxyRequests - 1);
        }
    };
    res.on("close", releaseConcurrency);
    res.on("finish", releaseConcurrency);

    // 2. Rate limiting check (configurable via LLM_PROXY_RATE_PER_MIN)
    const rateLimitMax = Number.parseInt(
        options.ratePerMin ?? process.env.LLM_PROXY_RATE_PER_MIN ?? String(DEFAULT_RATE_LIMIT_MAX),
        10,
    );

    if (!options.disableRateLimit && !checkRateLimit(clientIp, rateLimitMax)) {
        sendJson(res, 429, {
            error: `Too Many Requests - Rate limit exceeded (${rateLimitMax} req/min). Note: shared NAT IP addresses may share this quota.`,
        });
        return;
    }

    // 3. Extract vendorId and target subpath
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
    // NVIDIA NIM inference endpoints require /v1/chat/completions and /v1/models
    if (vendorId === "nvidia" && !upstreamSubpath.startsWith("/v1/")) {
        upstreamSubpath = `/v1${upstreamSubpath.startsWith("/") ? "" : "/"}${upstreamSubpath}`;
    }

    // 4. Timeouts: 15s for GET (models), 300s for POST/chat
    const isGet = req.method === "GET";
    const timeoutMs = isGet ? 15000 : 300000;

    // 5. Filter headers (strictly whitelist, never cookies or arbitrary headers)
    const upstreamHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (FORWARDED_HEADERS.has(lowerKey)) {
            upstreamHeaders[lowerKey] = value;
        }
    }

    // Parse target URL
    const targetUrl = new URL(vendor.baseURL + upstreamSubpath);
    upstreamHeaders.host = targetUrl.host;

    const requestModule = targetUrl.protocol === "http:" ? http : https;

    let responseSize = 0;
    let timedOut = false;

    // 6. Request body size check & pipe streaming
    const maxBodyBytes = Number.parseInt(
        options.maxBodyBytes ?? process.env.LLM_PROXY_MAX_BODY_BYTES ?? String(DEFAULT_MAX_BODY_BYTES),
        10,
    );

    // Pre-check Content-Length header if present
    const incomingContentLength = req.headers["content-length"];
    if (incomingContentLength) {
        const parsedLen = Number.parseInt(incomingContentLength, 10);
        if (!Number.isNaN(parsedLen) && parsedLen > maxBodyBytes) {
            sendJson(res, 413, {
                error: `Payload Too Large (Max ${Math.round(maxBodyBytes / (1024 * 1024))}MB)`,
            });
            req.resume(); // drain incoming socket
            return;
        }
        upstreamHeaders["content-length"] = incomingContentLength;
    }

    // 7. Forward request to upstream vendor via unbuffered pipe
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

            upstreamRes.on("error", (_err) => {
                res.end();
            });
        },
    );

    let streamBytesCount = 0;
    let payloadExceeded = false;

    clientReq.on("timeout", () => {
        timedOut = true;
        clientReq.destroy(new Error("GATEWAY_TIMEOUT"));
    });

    clientReq.on("error", (err) => {
        if (payloadExceeded) {
            return;
        }
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

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
        req.on("data", (chunk) => {
            streamBytesCount += chunk.length;
            if (streamBytesCount > maxBodyBytes && !payloadExceeded) {
                payloadExceeded = true;
                req.unpipe(clientReq);
                clientReq.destroy(new Error("PAYLOAD_TOO_LARGE"));
                req.resume(); // drain incoming socket
                if (!res.headersSent) {
                    sendJson(res, 413, {
                        error: `Payload Too Large (Max ${Math.round(maxBodyBytes / (1024 * 1024))}MB)`,
                    });
                }
            }
        });

        req.on("error", (err) => {
            clientReq.destroy(err);
        });

        req.pipe(clientReq);
    } else {
        clientReq.end();
    }
}
