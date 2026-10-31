// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data/storage");

function sanitizeSegment(seg) {
    return decodeURIComponent(seg).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getTableDir(db, table) {
    return path.join(DATA_DIR, sanitizeSegment(db), sanitizeSegment(table));
}

function getRecordPath(db, table, id) {
    return path.join(getTableDir(db, table), `${sanitizeSegment(id)}.json`);
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(JSON.stringify(payload));
}

export const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const match = url.pathname.match(/^\/api\/storage\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) {
        sendJson(res, 404, { error: "Not Found" });
        return;
    }

    const [, db, table, id] = match;

    try {
        if (req.method === "GET" && !id) {
            const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10));
            const count = Math.max(1, Number.parseInt(url.searchParams.get("count") ?? "20", 10));
            const dir = getTableDir(db, table);
            await mkdir(dir, { recursive: true });
            const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
            const items = [];
            for (const f of files) {
                try {
                    const raw = await readFile(path.join(dir, f), "utf8");
                    items.push(JSON.parse(raw));
                } catch {
                    // ignore corrupted entry
                }
            }
            items.sort((a, b) => Number(b?.date ?? 0) - Number(a?.date ?? 0));
            const slice = items.slice(page * count, (page + 1) * count);
            sendJson(res, 200, slice);
            return;
        }

        if (req.method === "GET" && id) {
            const filePath = getRecordPath(db, table, id);
            try {
                const raw = await readFile(filePath, "utf8");
                sendJson(res, 200, JSON.parse(raw));
            } catch {
                sendJson(res, 404, { error: "Record not found" });
            }
            return;
        }

        if (req.method === "PUT" && id) {
            const dir = getTableDir(db, table);
            await mkdir(dir, { recursive: true });
            const body = await readBody(req);
            const parsed = JSON.parse(body);
            await writeFile(getRecordPath(db, table, id), JSON.stringify(parsed), "utf8");
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "DELETE" && id) {
            await rm(getRecordPath(db, table, id), { force: true });
            sendJson(res, 200, { ok: true });
            return;
        }

        sendJson(res, 405, { error: "Method Not Allowed" });
    } catch (err) {
        sendJson(res, 500, { error: String(err) });
    }
});

if (import.meta.url === `file://${process.argv[1]}`) {
    server.listen(PORT, () => {
        console.log(`Dunvex CAD Cloud Storage API listening on port ${PORT}`);
    });
}
