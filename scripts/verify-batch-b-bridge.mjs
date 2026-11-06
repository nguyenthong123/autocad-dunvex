#!/usr/bin/env node
// Part of the Chili3d Project, under the AGPL-3.0 License.
// Minimal bridge daemon + HTTP control for live Batch B UI checks.

import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.BRIDGE_PORT || 17373);
const HTTP_PORT = Number(process.env.BRIDGE_HTTP_PORT || 17374);

const pending = new Map();
let pageSocket = null;
let hello = null;

function sendCall(name, args = {}) {
    if (!pageSocket || pageSocket.readyState !== 1) {
        return Promise.reject(new Error("page bridge not connected"));
    }
    const id = `call-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`timeout calling ${name}`));
        }, 20000);
        pending.set(id, { resolve, reject, timer });
        pageSocket.send(JSON.stringify({ type: "call", id, name, args }));
    });
}

async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
}

const httpServer = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    try {
        if (req.method === "GET" && req.url === "/status") {
            res.end(
                JSON.stringify({
                    ok: true,
                    connected: Boolean(pageSocket && pageSocket.readyState === 1),
                    hello: Boolean(hello),
                    toolCount: hello?.tools?.length ?? 0,
                    tools: hello?.tools?.map((t) => t.name) ?? [],
                }),
            );
            return;
        }
        if (req.method === "POST" && req.url === "/call") {
            const body = await readJson(req);
            const result = await sendCall(body.name, body.args || {});
            res.end(JSON.stringify({ ok: true, name: body.name, reply: result }));
            return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
    } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
});

const wsServer = createServer();
const wss = new WebSocketServer({ server: wsServer, path: "/ws" });
wss.on("connection", (socket) => {
    if (pageSocket && pageSocket.readyState === 1) {
        pageSocket.close(4002, "replaced");
    }
    pageSocket = socket;
    hello = null;
    console.log(JSON.stringify({ event: "connection" }));
    socket.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(String(raw));
        } catch {
            return;
        }
        if (msg.type === "hello") {
            hello = msg;
            console.log(
                JSON.stringify({
                    event: "hello",
                    protocol: msg.protocol,
                    toolCount: msg.tools?.length,
                }),
            );
            return;
        }
        if (msg.type === "result" && pending.has(msg.id)) {
            const entry = pending.get(msg.id);
            pending.delete(msg.id);
            clearTimeout(entry.timer);
            entry.resolve(msg);
        }
    });
    socket.on("close", () => {
        if (pageSocket === socket) pageSocket = null;
        console.log(JSON.stringify({ event: "disconnect" }));
    });
});

wsServer.listen(PORT, "127.0.0.1", () => {
    console.log(JSON.stringify({ event: "ws-listening", port: PORT }));
});
httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
    console.log(JSON.stringify({ event: "http-listening", port: HTTP_PORT }));
});
