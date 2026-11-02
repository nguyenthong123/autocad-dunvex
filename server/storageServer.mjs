// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data/storage");

fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Secret Key for JWT ---
function getJwtSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0) {
        return process.env.JWT_SECRET.trim();
    }
    const secretPath = path.join(DATA_DIR, ".jwt_secret");
    try {
        if (fs.existsSync(secretPath)) {
            const secret = fs.readFileSync(secretPath, "utf8").trim();
            if (secret.length > 0) return secret;
        }
    } catch {}
    const newSecret = randomBytes(32).toString("hex");
    try {
        fs.writeFileSync(secretPath, newSecret, "utf8");
    } catch {}
    return newSecret;
}

const JWT_SECRET = getJwtSecret();

function sanitizeSegment(seg) {
    if (!seg) return "_";
    return decodeURIComponent(seg).replace(/[^a-zA-Z0-9._-]/g, "_");
}

// --- JWT Helpers ---
function signJwt(payload) {
    const header = { alg: "HS256", typ: "JWT" };
    const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", JWT_SECRET).update(`${b64Header}.${b64Payload}`).digest("base64url");
    return `${b64Header}.${b64Payload}.${sig}`;
}

function verifyJwt(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const expectedSig = createHmac("sha256", JWT_SECRET)
        .update(`${parts[0]}.${parts[1]}`)
        .digest("base64url");
    const sigBuf = Buffer.from(parts[2]);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload.exp && Date.now() / 1000 > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

// --- Password Hashing Helpers ---
function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || !stored.includes(":")) return false;
    const [salt, hash] = stored.split(":");
    const calcHash = scryptSync(password, salt, 64).toString("hex");
    const calcBuf = Buffer.from(calcHash);
    const hashBuf = Buffer.from(hash);
    if (calcBuf.length !== hashBuf.length) return false;
    return timingSafeEqual(calcBuf, hashBuf);
}

// --- Auth Database ---
const authDbPath = path.join(DATA_DIR, "auth.sqlite");
const authDb = new DatabaseSync(authDbPath);
authDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        store_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// --- Per-User SQLite Database Manager ---
const userDbs = new Map();

export function getUserDb(userId) {
    const safeId = sanitizeSegment(userId || "guest");
    if (userDbs.has(safeId)) {
        return userDbs.get(safeId);
    }

    const userDir = path.join(DATA_DIR, "users", safeId);
    fs.mkdirSync(userDir, { recursive: true });

    const dbPath = path.join(userDir, "dunvex_cad.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            thumbnail TEXT,
            metadata TEXT,
            document_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cad_entities (
            id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            parent_id TEXT,
            entity_type TEXT NOT NULL,
            name TEXT,
            geometry_data TEXT,
            transform_matrix TEXT,
            parameters TEXT,
            display_order INTEGER NOT NULL,
            raw_json TEXT NOT NULL,
            PRIMARY KEY (project_id, id)
        );

        CREATE TABLE IF NOT EXISTS project_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            document_json TEXT NOT NULL
        );
    `);

    userDbs.set(safeId, db);
    return db;
}

// Helper to extract entities from document structure
function extractAllNodes(nodes, parentId = null) {
    const list = [];
    if (!Array.isArray(nodes)) return list;
    for (const node of nodes) {
        if (!node) continue;
        list.push({ ...node, parentId });
        if (node.children && Array.isArray(node.children)) {
            list.push(...extractAllNodes(node.children, node.id));
        }
    }
    return list;
}

function extractParams(node) {
    const copy = { ...node };
    delete copy.id;
    delete copy.parentId;
    delete copy.__cla$$__;
    delete copy.name;
    delete copy.children;
    delete copy.shape;
    delete copy.section;
    delete copy.transform;
    return copy;
}

// --- Data Migration from Legacy .json files ---
async function migrateLegacyJsonIfNeeded() {
    try {
        const legacyDirs = [path.join(DATA_DIR, "chili3d", "documents"), path.join(DATA_DIR, "documents")];
        const guestDb = getUserDb("guest");

        for (const dir of legacyDirs) {
            if (!fs.existsSync(dir)) continue;
            const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
            for (const f of files) {
                try {
                    const raw = await readFile(path.join(dir, f), "utf8");
                    const doc = JSON.parse(raw);
                    const docId = doc.id || path.basename(f, ".json");
                    const existing = guestDb.prepare("SELECT id FROM projects WHERE id = ?").get(docId);
                    if (!existing) {
                        const now = new Date().toISOString();
                        const docName = doc.name || "Dự án 1";
                        guestDb
                            .prepare(`
                            INSERT INTO projects (id, name, created_at, updated_at, document_json)
                            VALUES (?, ?, ?, ?, ?)
                        `)
                            .run(docId, docName, now, now, raw);
                    }
                } catch {}
            }
        }
    } catch (e) {
        console.warn("Legacy JSON migration error:", e);
    }
}

migrateLegacyJsonIfNeeded().catch(() => {});

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
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(JSON.stringify(payload));
}

function extractAuthUserId(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        const payload = verifyJwt(token);
        if (payload && payload.sub) {
            return payload.sub;
        }
    }
    return "guest";
}

export const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    try {
        // ================= AUTH ROUTES =================
        if (pathname === "/api/auth/register" && req.method === "POST") {
            const body = JSON.parse((await readBody(req)) || "{}");
            const username = typeof body.username === "string" ? body.username.trim() : "";
            const password = typeof body.password === "string" ? body.password : "";
            const storeName =
                typeof body.storeName === "string" && body.storeName.trim()
                    ? body.storeName.trim()
                    : username;

            if (username.length < 2) {
                sendJson(res, 400, { error: "Tên người dùng phải có ít nhất 2 ký tự" });
                return;
            }
            if (password.length < 6) {
                sendJson(res, 400, { error: "Mật khẩu phải có ít nhất 6 ký tự" });
                return;
            }

            const existing = authDb.prepare("SELECT id FROM users WHERE username = ?").get(username);
            if (existing) {
                sendJson(res, 409, { error: "Tên người dùng hoặc số điện thoại đã tồn tại" });
                return;
            }

            const userId = randomBytes(16).toString("hex");
            const passwordHash = hashPassword(password);

            authDb
                .prepare(`
                INSERT INTO users (id, username, password_hash, store_name)
                VALUES (?, ?, ?, ?)
            `)
                .run(userId, username, passwordHash, storeName);

            // Initialize user SQLite database immediately
            getUserDb(userId);

            const token = signJwt({
                sub: userId,
                username,
                storeName,
                exp: Math.floor(Date.now() / 1000) + 30 * 86400,
            });

            sendJson(res, 200, {
                token,
                user: { id: userId, username, storeName },
            });
            return;
        }

        if (pathname === "/api/auth/login" && req.method === "POST") {
            const body = JSON.parse((await readBody(req)) || "{}");
            const username = typeof body.username === "string" ? body.username.trim() : "";
            const password = typeof body.password === "string" ? body.password : "";

            const user = authDb
                .prepare(`
                SELECT id, username, password_hash, store_name FROM users WHERE username = ?
            `)
                .get(username);

            if (!user || !verifyPassword(password, user.password_hash)) {
                sendJson(res, 401, { error: "Tên đăng nhập hoặc mật khẩu không chính xác" });
                return;
            }

            const token = signJwt({
                sub: user.id,
                username: user.username,
                storeName: user.store_name,
                exp: Math.floor(Date.now() / 1000) + 30 * 86400,
            });

            sendJson(res, 200, {
                token,
                user: { id: user.id, username: user.username, storeName: user.store_name },
            });
            return;
        }

        if (pathname === "/api/auth/me" && req.method === "GET") {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                sendJson(res, 401, { error: "Chưa đăng nhập" });
                return;
            }
            const token = authHeader.slice(7).trim();
            const payload = verifyJwt(token);
            if (!payload || !payload.sub) {
                sendJson(res, 401, { error: "Phiên làm việc đã hết hạn hoặc không hợp lệ" });
                return;
            }

            const user = authDb
                .prepare(`
                SELECT id, username, store_name FROM users WHERE id = ?
            `)
                .get(payload.sub);

            if (!user) {
                sendJson(res, 401, { error: "Tài khoản không tồn tại" });
                return;
            }

            sendJson(res, 200, {
                user: { id: user.id, username: user.username, storeName: user.store_name },
            });
            return;
        }

        // ================= STORAGE ROUTES =================
        const match = pathname.match(/^\/api\/storage\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
        if (!match) {
            sendJson(res, 404, { error: "Not Found" });
            return;
        }

        const [, dbName, table, id] = match;
        const userId = extractAuthUserId(req);
        const userDb = getUserDb(userId);

        // --- DOCUMENTS TABLE ---
        if (table === "documents") {
            if (req.method === "GET" && id) {
                const row = userDb.prepare("SELECT document_json FROM projects WHERE id = ?").get(id);
                if (!row) {
                    sendJson(res, 404, { error: "Record not found" });
                    return;
                }
                sendJson(res, 200, JSON.parse(row.document_json));
                return;
            }

            if (req.method === "PUT" && id) {
                const bodyStr = await readBody(req);
                const data = JSON.parse(bodyStr || "{}");
                const docName = data.name || "Dự án 1";
                const now = new Date().toISOString();

                userDb.exec("BEGIN IMMEDIATE");
                try {
                    // 1. Upsert projects
                    userDb
                        .prepare(`
                        INSERT INTO projects (id, name, created_at, updated_at, metadata, document_json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            updated_at = excluded.updated_at,
                            metadata = excluded.metadata,
                            document_json = excluded.document_json
                    `)
                        .run(
                            id,
                            docName,
                            now,
                            now,
                            JSON.stringify(data.userData || data.metadata || {}),
                            bodyStr,
                        );

                    // 2. Clear old entities and populate cad_entities
                    userDb.prepare("DELETE FROM cad_entities WHERE project_id = ?").run(id);

                    const nodes = extractAllNodes(data.models?.nodes || []);
                    const stmtInsertEntity = userDb.prepare(`
                        INSERT INTO cad_entities (id, project_id, parent_id, entity_type, name, geometry_data, transform_matrix, parameters, display_order, raw_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        stmtInsertEntity.run(
                            node.id || `${id}_entity_${i}`,
                            id,
                            node.parentId || null,
                            node.__cla$$__ || "Node",
                            node.name || "",
                            JSON.stringify(node.section || node.shape || {}),
                            JSON.stringify(node.transform || {}),
                            JSON.stringify(extractParams(node)),
                            i,
                            JSON.stringify(node),
                        );
                    }

                    // 3. Snapshot (retain max 10)
                    userDb
                        .prepare(`
                        INSERT INTO project_snapshots (project_id, created_at, document_json)
                        VALUES (?, ?, ?)
                    `)
                        .run(id, now, bodyStr);

                    userDb
                        .prepare(`
                        DELETE FROM project_snapshots
                        WHERE project_id = ? AND id NOT IN (
                            SELECT id FROM project_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 10
                        )
                    `)
                        .run(id, id);

                    userDb.exec("COMMIT");
                    sendJson(res, 200, { ok: true });
                } catch (err) {
                    userDb.exec("ROLLBACK");
                    throw err;
                }
                return;
            }

            if (req.method === "DELETE" && id) {
                userDb.exec("BEGIN IMMEDIATE");
                try {
                    userDb.prepare("DELETE FROM cad_entities WHERE project_id = ?").run(id);
                    userDb.prepare("DELETE FROM project_snapshots WHERE project_id = ?").run(id);
                    userDb.prepare("DELETE FROM projects WHERE id = ?").run(id);
                    userDb.exec("COMMIT");
                    sendJson(res, 200, { ok: true });
                } catch (e) {
                    userDb.exec("ROLLBACK");
                    throw e;
                }
                return;
            }
        }

        // --- RECENTS TABLE ---
        if (table === "recents") {
            if (req.method === "GET" && !id) {
                const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10));
                const count = Math.max(1, Number.parseInt(url.searchParams.get("count") ?? "20", 10));

                const rows = userDb
                    .prepare(`
                    SELECT id, name, updated_at, thumbnail as image
                    FROM projects
                    ORDER BY updated_at DESC
                    LIMIT ? OFFSET ?
                `)
                    .all(count, page * count);

                const recents = rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    date: new Date(r.updated_at).getTime(),
                    image: r.image,
                }));
                sendJson(res, 200, recents);
                return;
            }

            if (req.method === "GET" && id) {
                const row = userDb
                    .prepare(`
                    SELECT id, name, updated_at, thumbnail as image
                    FROM projects
                    WHERE id = ?
                `)
                    .get(id);

                if (!row) {
                    sendJson(res, 404, { error: "Record not found" });
                    return;
                }
                sendJson(res, 200, {
                    id: row.id,
                    name: row.name,
                    date: new Date(row.updated_at).getTime(),
                    image: row.image,
                });
                return;
            }

            if (req.method === "PUT" && id) {
                const body = JSON.parse((await readBody(req)) || "{}");
                const now = new Date().toISOString();

                userDb
                    .prepare(`
                    INSERT INTO projects (id, name, created_at, updated_at, thumbnail, document_json)
                    VALUES (?, ?, ?, ?, ?, '{}')
                    ON CONFLICT(id) DO UPDATE SET
                        name = COALESCE(?, projects.name),
                        thumbnail = COALESCE(?, projects.thumbnail),
                        updated_at = ?
                `)
                    .run(
                        id,
                        body.name || "Dự án 1",
                        now,
                        now,
                        body.image || null,
                        body.name || null,
                        body.image || null,
                        now,
                    );
                sendJson(res, 200, { ok: true });
                return;
            }

            if (req.method === "DELETE" && id) {
                userDb.exec("BEGIN IMMEDIATE");
                try {
                    userDb.prepare("DELETE FROM cad_entities WHERE project_id = ?").run(id);
                    userDb.prepare("DELETE FROM project_snapshots WHERE project_id = ?").run(id);
                    userDb.prepare("DELETE FROM projects WHERE id = ?").run(id);
                    userDb.exec("COMMIT");
                    sendJson(res, 200, { ok: true });
                } catch (e) {
                    userDb.exec("ROLLBACK");
                    throw e;
                }
                return;
            }
        }

        // --- GENERIC TABLE FALLBACK (FILE STORAGE FOR EXTENSIONS) ---
        const genericDir = path.join(DATA_DIR, "users", sanitizeSegment(userId), sanitizeSegment(table));
        if (req.method === "GET" && !id) {
            await mkdir(genericDir, { recursive: true });
            const files = (await readdir(genericDir)).filter((f) => f.endsWith(".json"));
            const items = [];
            for (const f of files) {
                try {
                    const raw = await readFile(path.join(genericDir, f), "utf8");
                    items.push(JSON.parse(raw));
                } catch {}
            }
            sendJson(res, 200, items);
            return;
        }

        if (req.method === "GET" && id) {
            const filePath = path.join(genericDir, `${sanitizeSegment(id)}.json`);
            try {
                const raw = await readFile(filePath, "utf8");
                sendJson(res, 200, JSON.parse(raw));
            } catch {
                sendJson(res, 404, { error: "Record not found" });
            }
            return;
        }

        if (req.method === "PUT" && id) {
            await mkdir(genericDir, { recursive: true });
            const body = await readBody(req);
            await writeFile(path.join(genericDir, `${sanitizeSegment(id)}.json`), body, "utf8");
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === "DELETE" && id) {
            await rm(path.join(genericDir, `${sanitizeSegment(id)}.json`), { force: true });
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
        console.log(`Dunvex CAD SQLite Storage & Auth Server listening on port ${PORT}`);
    });
}
