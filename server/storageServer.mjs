// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes,
    scryptSync,
    timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { handleLlmProxy } from "./llmProxy.mjs";

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
    if (!stored?.includes(":")) return false;
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
            document_json TEXT NOT NULL,
            version INTEGER DEFAULT 1
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

        CREATE TABLE IF NOT EXISTS ai_settings (
            id TEXT PRIMARY KEY,
            provider TEXT,
            model TEXT,
            base_url TEXT,
            reasoning_effort TEXT,
            context_window INTEGER,
            updated_at DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_credentials (
            vendor_id TEXT PRIMARY KEY,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            tag TEXT NOT NULL,
            key_version INTEGER DEFAULT 1,
            updated_at DATETIME NOT NULL
        );
    `);

    try {
        db.exec("ALTER TABLE projects ADD COLUMN version INTEGER DEFAULT 1;");
    } catch {}

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

export const STORAGE_MAX_BODY_BYTES = Number.parseInt(
    process.env.STORAGE_MAX_BODY_BYTES || "10485760", // 10MB default
    10,
);

export async function readBody(req, maxBytes = STORAGE_MAX_BODY_BYTES) {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
            const err = new Error("PAYLOAD_TOO_LARGE");
            err.statusCode = 413;
            throw err;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload, onEnd = null) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(JSON.stringify(payload), () => {
        if (onEnd) onEnd();
    });
}

export function getMasterEncryptionKey() {
    const raw = process.env.LLM_CREDENTIALS_ENCRYPTION_KEY?.trim();
    if (raw && raw.length > 0) {
        return scryptSync(raw, "dunvex-ai-vault-salt", 32);
    }
    return null;
}

export function encryptApiKey(apiKey, masterKey) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
    let ciphertext = cipher.update(apiKey, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return {
        ciphertext,
        iv: iv.toString("hex"),
        tag,
    };
}

export function decryptApiKey(ciphertext, ivHex, tagHex, masterKey) {
    const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

export function extractStrictAuthUserId(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        const payload = verifyJwt(token);
        if (payload?.sub) {
            return payload.sub;
        }
    }
    return null;
}

/**
 * Resolve the storage namespace for a request.
 * - No Authorization header → anonymous "guest" DB (legacy local/demo mode).
 * - Bearer present but invalid/expired → null (caller must 401). Never silently
 *   fall back to guest: that made Mac/Win look "logged in" while reading the
 *   wrong user DB, so drawings vanished across devices.
 */
export function resolveStorageUserId(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return extractStrictAuthUserId(req);
    }
    return "guest";
}

function extractAuthUserId(req) {
    return resolveStorageUserId(req) || "guest";
}

export const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization, x-api-key, anthropic-version, accept",
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
            if (!authHeader?.startsWith("Bearer ")) {
                sendJson(res, 401, { error: "Chưa đăng nhập" });
                return;
            }
            const token = authHeader.slice(7).trim();
            const payload = verifyJwt(token);
            if (!payload?.sub) {
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

        // ================= LLM PROXY ROUTES =================
        if (pathname.startsWith("/api/llm-proxy/")) {
            await handleLlmProxy(req, res, pathname, {
                getUserDb,
                verifyJwt,
                getMasterEncryptionKey,
                decryptApiKey,
            });
            return;
        }

        // ================= AI SETTINGS & CREDENTIALS VAULT =================
        if (pathname === "/api/ai/settings") {
            const userId = extractStrictAuthUserId(req);
            if (!userId) {
                sendJson(res, 401, {
                    error: "UNAUTHORIZED",
                    message: "Yêu cầu đăng nhập tài khoản để truy cập cài đặt AI",
                });
                return;
            }
            const userDb = getUserDb(userId);

            if (req.method === "GET") {
                const settingRow = userDb.prepare("SELECT * FROM ai_settings WHERE id = 'default'").get();
                const credRows = userDb.prepare("SELECT vendor_id, updated_at FROM ai_credentials").all();
                const masterKey = getMasterEncryptionKey();

                sendJson(res, 200, {
                    settings: settingRow
                        ? {
                              provider: settingRow.provider,
                              model: settingRow.model,
                              baseURL: settingRow.base_url,
                              reasoningEffort: settingRow.reasoning_effort,
                              contextWindow: settingRow.context_window,
                          }
                        : null,
                    rememberedVendors: credRows.map((r) => r.vendor_id),
                    encryptionAvailable: Boolean(masterKey),
                });
                return;
            }

            if (req.method === "PUT") {
                const body = JSON.parse((await readBody(req)) || "{}");
                const now = new Date().toISOString();

                userDb
                    .prepare(`
                    INSERT INTO ai_settings (id, provider, model, base_url, reasoning_effort, context_window, updated_at)
                    VALUES ('default', ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        provider = excluded.provider,
                        model = excluded.model,
                        base_url = excluded.base_url,
                        reasoning_effort = excluded.reasoning_effort,
                        context_window = excluded.context_window,
                        updated_at = excluded.updated_at
                `)
                    .run(
                        body.provider || null,
                        body.model || null,
                        body.baseURL || null,
                        body.reasoningEffort || null,
                        body.contextWindow || null,
                        now,
                    );

                const vendorId = body.vendor || body.provider || "openai";
                if (body.rememberKey === true) {
                    if (!body.apiKey || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
                        sendJson(res, 400, {
                            error: "MISSING_API_KEY",
                            message: "API key không được để trống khi bật ghi nhớ",
                        });
                        return;
                    }
                    const masterKey = getMasterEncryptionKey();
                    if (!masterKey) {
                        sendJson(res, 400, {
                            error: "ENCRYPTION_KEY_NOT_CONFIGURED",
                            code: "ENCRYPTION_KEY_NOT_CONFIGURED",
                            message:
                                "Khóa mã hóa master (LLM_CREDENTIALS_ENCRYPTION_KEY) chưa được cấu hình trên server",
                        });
                        return;
                    }
                    const enc = encryptApiKey(body.apiKey.trim(), masterKey);
                    userDb
                        .prepare(`
                        INSERT INTO ai_credentials (vendor_id, ciphertext, iv, tag, key_version, updated_at)
                        VALUES (?, ?, ?, ?, 1, ?)
                        ON CONFLICT(vendor_id) DO UPDATE SET
                            ciphertext = excluded.ciphertext,
                            iv = excluded.iv,
                            tag = excluded.tag,
                            key_version = excluded.key_version,
                            updated_at = excluded.updated_at
                    `)
                        .run(vendorId, enc.ciphertext, enc.iv, enc.tag, now);
                } else if (body.rememberKey === false) {
                    userDb.prepare("DELETE FROM ai_credentials WHERE vendor_id = ?").run(vendorId);
                }

                sendJson(res, 200, { ok: true, hasRememberedKey: Boolean(body.rememberKey) });
                return;
            }

            sendJson(res, 405, { error: "Method Not Allowed" });
            return;
        }

        if (pathname === "/api/ai/credentials") {
            const userId = extractStrictAuthUserId(req);
            if (!userId) {
                sendJson(res, 401, {
                    error: "UNAUTHORIZED",
                    message: "Yêu cầu đăng nhập tài khoản để thao tác kho khóa",
                });
                return;
            }
            const userDb = getUserDb(userId);

            if (req.method === "DELETE") {
                const vendorId = url.searchParams.get("vendor");
                if (vendorId) {
                    userDb.prepare("DELETE FROM ai_credentials WHERE vendor_id = ?").run(vendorId);
                } else {
                    userDb.prepare("DELETE FROM ai_credentials").run();
                }
                sendJson(res, 200, { ok: true });
                return;
            }

            sendJson(res, 405, { error: "Method Not Allowed" });
            return;
        }

        // ================= STORAGE ROUTES =================
        const incomingContentLength = req.headers["content-length"];
        if (incomingContentLength) {
            const parsedLen = Number.parseInt(incomingContentLength, 10);
            if (!Number.isNaN(parsedLen) && parsedLen > STORAGE_MAX_BODY_BYTES) {
                sendJson(
                    res,
                    413,
                    {
                        error: `Payload Too Large (Max ${Math.round(STORAGE_MAX_BODY_BYTES / (1024 * 1024))}MB)`,
                    },
                    () => {
                        req.destroy();
                    },
                );
                return;
            }
        }

        const match = pathname.match(/^\/api\/storage\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
        if (!match) {
            sendJson(res, 404, { error: "Not Found" });
            return;
        }

        const [, _dbName, table, id] = match;
        const userId = resolveStorageUserId(req);
        if (!userId) {
            sendJson(res, 401, {
                error: "UNAUTHORIZED",
                message: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
            });
            return;
        }
        const userDb = getUserDb(userId);

        // --- DOCUMENTS TABLE ---
        if (table === "documents") {
            if (req.method === "GET" && id) {
                const row = userDb
                    .prepare("SELECT document_json, version, updated_at FROM projects WHERE id = ?")
                    .get(id);
                if (!row) {
                    sendJson(res, 404, { error: "Record not found" });
                    return;
                }
                const parsed = JSON.parse(row.document_json);
                parsed.serverVersion = row.version;
                parsed.serverUpdatedAt = row.updated_at;
                sendJson(res, 200, parsed);
                return;
            }

            if (req.method === "PUT" && id) {
                const bodyStr = await readBody(req);
                const data = JSON.parse(bodyStr || "{}");
                const docName = data.name || "Dự án 1";
                const now = new Date().toISOString();
                const baseVersion =
                    data.baseVersion !== undefined
                        ? data.baseVersion
                        : data.docVersion !== undefined
                          ? data.docVersion
                          : null;

                // TASK-27 Phần C: Chuẩn hoá document, loại bỏ các trường điều khiển để dedup hash chính xác
                const cleanData = { ...data };
                delete cleanData.baseVersion;
                delete cleanData.docVersion;
                delete cleanData.serverVersion;
                delete cleanData.serverUpdatedAt;
                const cleanDocStr = JSON.stringify(cleanData);

                const existing = userDb
                    .prepare(
                        "SELECT version, updated_at, created_at, document_json FROM projects WHERE id = ?",
                    )
                    .get(id);

                if (existing) {
                    let existingCleanStr = existing.document_json;
                    try {
                        const parsedEx = JSON.parse(existing.document_json);
                        delete parsedEx.baseVersion;
                        delete parsedEx.docVersion;
                        delete parsedEx.serverVersion;
                        delete parsedEx.serverUpdatedAt;
                        existingCleanStr = JSON.stringify(parsedEx);
                    } catch {}

                    const incomingHash = createHash("sha256").update(cleanDocStr).digest("hex");
                    const existingHash = createHash("sha256").update(existingCleanStr).digest("hex");
                    if (incomingHash === existingHash) {
                        sendJson(res, 200, { ok: true, unchanged: true, version: existing.version });
                        return;
                    }

                    if (baseVersion !== null && baseVersion !== undefined) {
                        const baseNum = Number(baseVersion);
                        const curNum = Number(existing.version);
                        if (!Number.isNaN(baseNum) && !Number.isNaN(curNum) && baseNum !== curNum) {
                            sendJson(res, 409, {
                                error: "VERSION_CONFLICT",
                                currentVersion: curNum,
                                baseVersion: baseNum,
                                updatedAt: existing.updated_at,
                            });
                            return;
                        }
                    }
                }

                const newVersion = existing ? (Number(existing.version) || 1) + 1 : 1;

                userDb.exec("BEGIN IMMEDIATE");
                try {
                    // 1. Upsert projects (lưu document đã chuẩn hoá)
                    userDb
                        .prepare(`
                        INSERT INTO projects (id, name, created_at, updated_at, metadata, document_json, version)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = excluded.name,
                            updated_at = excluded.updated_at,
                            metadata = excluded.metadata,
                            document_json = excluded.document_json,
                            version = excluded.version
                    `)
                        .run(
                            id,
                            docName,
                            existing?.created_at || now,
                            now,
                            JSON.stringify(data.userData || data.metadata || {}),
                            cleanDocStr,
                            newVersion,
                        );

                    // 2. Snapshot (retain max 10) - sparse throttle: 5 minutes or isSnapshot/isClosing
                    const lastSnapshot = userDb
                        .prepare(
                            "SELECT created_at FROM project_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 1",
                        )
                        .get(id);
                    const nowMs = Date.now();
                    const shouldSnapshot =
                        Boolean(data.isSnapshot) ||
                        Boolean(data.isClosing) ||
                        !lastSnapshot ||
                        nowMs - new Date(lastSnapshot.created_at).getTime() >= 5 * 60 * 1000;

                    if (shouldSnapshot) {
                        userDb
                            .prepare(`
                            INSERT INTO project_snapshots (project_id, created_at, document_json)
                            VALUES (?, ?, ?)
                        `)
                            .run(id, now, cleanDocStr);

                        userDb
                            .prepare(`
                            DELETE FROM project_snapshots
                            WHERE project_id = ? AND id NOT IN (
                                SELECT id FROM project_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 10
                            )
                        `)
                            .run(id, id);
                    }

                    userDb.exec("COMMIT");
                    sendJson(res, 200, { ok: true, version: newVersion });
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
        if (err.statusCode === 413 || err.message === "PAYLOAD_TOO_LARGE") {
            sendJson(
                res,
                413,
                {
                    error: `Payload Too Large (Max ${Math.round(STORAGE_MAX_BODY_BYTES / (1024 * 1024))}MB)`,
                },
                () => {
                    req.destroy();
                },
            );
            return;
        }
        sendJson(res, 500, { error: String(err) });
    }
});

if (import.meta.url === `file://${process.argv[1]}`) {
    server.listen(PORT, () => {
        console.log(`Dunvex CAD SQLite Storage & Auth Server listening on port ${PORT}`);
    });
}
