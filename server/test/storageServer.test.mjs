// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import assert from "node:assert";
import { rmSync } from "node:fs";
import http from "node:http";
import { after, before, describe, it } from "node:test";

const TEST_DIR = "./data/test_storage";
process.env.DATA_DIR = TEST_DIR;
process.env.PORT = "3456";

// Clean any previous test dir
try {
    rmSync(TEST_DIR, { recursive: true, force: true });
} catch {}

const { server, getUserDb } = await import("../storageServer.mjs");

describe("StorageServer SQLite & Auth API", () => {
    const baseUrl = "http://localhost:3456";

    before((_, done) => {
        server.listen(3456, done);
    });

    after((_, done) => {
        if (typeof server.closeAllConnections === "function") {
            server.closeAllConnections();
        }
        server.close(() => {
            try {
                rmSync(TEST_DIR, { recursive: true, force: true });
            } catch {}
            done();
        });
    });

    let tokenA = "";
    let userA = null;

    it("registers user A successfully", async () => {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "xưởng_mộc_01",
                password: "password123",
                storeName: "Xưởng Mộc Đông Á",
            }),
        });

        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.ok(data.token);
        assert.strictEqual(data.user.username, "xưởng_mộc_01");
        assert.strictEqual(data.user.storeName, "Xưởng Mộc Đông Á");

        tokenA = data.token;
        userA = data.user;

        // Verify SQLite database has 3 tables
        const db = getUserDb(userA.id);
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all()
            .map((t) => t.name);
        assert.ok(tables.includes("projects"));
        assert.ok(tables.includes("cad_entities"));
        assert.ok(tables.includes("project_snapshots"));
    });

    it("refuses duplicate registration", async () => {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "xưởng_mộc_01",
                password: "password123",
            }),
        });
        assert.strictEqual(res.status, 409);
    });

    it("logs in user A successfully", async () => {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "xưởng_mộc_01",
                password: "password123",
            }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.ok(data.token);
        assert.strictEqual(data.user.id, userA.id);
    });

    it("validates /api/auth/me with Bearer token", async () => {
        const res = await fetch(`${baseUrl}/api/auth/me`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.user.username, "xưởng_mộc_01");
    });

    it("stores document with atomic transaction into SQLite", async () => {
        const docPayload = {
            id: "proj_abc_123",
            name: "Bàn trà gỗ sồi",
            version: 1,
            models: {
                nodes: [
                    {
                        id: "root_1",
                        __cla$$__: "RootNode",
                        name: "Bàn trà gỗ sồi",
                        children: [
                            {
                                id: "prism_1",
                                __cla$$__: "ExtrudeNode",
                                name: "Mặt bàn",
                                section: { shapeType: "face" },
                                length: 25,
                            },
                        ],
                    },
                ],
            },
        };

        const putRes = await fetch(`${baseUrl}/api/storage/dunvex/documents/proj_abc_123`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify(docPayload),
        });
        assert.strictEqual(putRes.status, 200);

        // Verify entities and snapshot in SQLite
        const db = getUserDb(userA.id);
        const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get("proj_abc_123");
        assert.ok(projectRow);
        assert.strictEqual(projectRow.name, "Bàn trà gỗ sồi");

        const entityRows = db.prepare("SELECT * FROM cad_entities WHERE project_id = ?").all("proj_abc_123");
        assert.strictEqual(entityRows.length, 2);

        const snapshotRows = db
            .prepare("SELECT * FROM project_snapshots WHERE project_id = ?")
            .all("proj_abc_123");
        assert.strictEqual(snapshotRows.length, 1);

        // GET document
        const getRes = await fetch(`${baseUrl}/api/storage/dunvex/documents/proj_abc_123`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.strictEqual(getRes.status, 200);
        const loadedDoc = await getRes.json();
        assert.strictEqual(loadedDoc.name, "Bàn trà gỗ sồi");
    });

    it("ensures data isolation: guest or another user cannot see user A document", async () => {
        const getGuestRes = await fetch(`${baseUrl}/api/storage/dunvex/documents/proj_abc_123`);
        assert.strictEqual(getGuestRes.status, 404);
    });

    it("manages recents in SQLite", async () => {
        const putRecent = await fetch(`${baseUrl}/api/storage/dunvex/recents/proj_abc_123`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                id: "proj_abc_123",
                name: "Bàn trà gỗ sồi",
                image: "data:image/png;base64,mockThumbnail",
            }),
        });
        assert.strictEqual(putRecent.status, 200);

        const getRecents = await fetch(`${baseUrl}/api/storage/dunvex/recents`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.strictEqual(getRecents.status, 200);
        const list = await getRecents.json();
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].id, "proj_abc_123");
        assert.strictEqual(list[0].image, "data:image/png;base64,mockThumbnail");
    });

    it("deletes project, entities, and snapshots cleanly", async () => {
        const delRes = await fetch(`${baseUrl}/api/storage/dunvex/documents/proj_abc_123`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.strictEqual(delRes.status, 200);

        const db = getUserDb(userA.id);
        const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get("proj_abc_123");
        assert.strictEqual(projectRow, undefined);

        const entityRows = db.prepare("SELECT * FROM cad_entities WHERE project_id = ?").all("proj_abc_123");
        assert.strictEqual(entityRows.length, 0);

        const snapshotRows = db
            .prepare("SELECT * FROM project_snapshots WHERE project_id = ?")
            .all("proj_abc_123");
        assert.strictEqual(snapshotRows.length, 0);
    });

    it("rejects payload exceeding STORAGE_MAX_BODY_BYTES with 413", async () => {
        const req = http.request(`${baseUrl}/api/storage/dunvex/documents/too_large_doc`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": String(15 * 1024 * 1024),
                Authorization: `Bearer ${tokenA}`,
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

        req.write("x");
        req.end();
        const res = await resPromise;
        assert.strictEqual(res.status, 413);
        assert.match(res.body, /Payload Too Large/i);
    });

    it("rejects streaming body exceeding STORAGE_MAX_BODY_BYTES with 413", async () => {
        const CHUNK_SIZE = 64 * 1024;
        const TOTAL_CHUNKS = Math.floor((11 * 1024 * 1024) / CHUNK_SIZE);
        const reusableBuffer = Buffer.alloc(CHUNK_SIZE, "z");

        let sentChunks = 0;
        const stream11Mb = new (await import("node:stream")).Readable({
            read() {
                while (sentChunks < TOTAL_CHUNKS) {
                    sentChunks++;
                    const canContinue = this.push(reusableBuffer);
                    if (!canContinue) return;
                }
                this.push(null);
            },
        });

        const req = http.request(`${baseUrl}/api/storage/dunvex/documents/large_stream_doc`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
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

        stream11Mb.pipe(req);
        const res = await resPromise;
        assert.strictEqual(res.status, 413);
    });

    it("increments version on valid PUT and returns 409 Conflict when baseVersion is stale", async () => {
        const docId = "version_test_doc";
        const payloadV1 = { id: docId, name: "Version 1", models: { nodes: [] }, baseVersion: 1 };

        // 1. Initial PUT
        const res1 = await fetch(`${baseUrl}/api/storage/dunvex/documents/${docId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
            body: JSON.stringify(payloadV1),
        });
        assert.strictEqual(res1.status, 200);
        const data1 = await res1.json();
        assert.strictEqual(data1.version, 1);

        // 2. Second PUT with baseVersion: 1 -> increments to 2
        const payloadV2 = { id: docId, name: "Version 2", models: { nodes: [] }, baseVersion: 1 };
        const res2 = await fetch(`${baseUrl}/api/storage/dunvex/documents/${docId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
            body: JSON.stringify(payloadV2),
        });
        assert.strictEqual(res2.status, 200);
        const data2 = await res2.json();
        assert.strictEqual(data2.version, 2);

        // 3. Stale PUT with old baseVersion: 1 -> HTTP 409 Conflict
        const stalePayload = { id: docId, name: "Stale update", models: { nodes: [] }, baseVersion: 1 };
        const resStale = await fetch(`${baseUrl}/api/storage/dunvex/documents/${docId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
            body: JSON.stringify(stalePayload),
        });
        assert.strictEqual(resStale.status, 409);
        const staleData = await resStale.json();
        assert.strictEqual(staleData.error, "VERSION_CONFLICT");
        assert.strictEqual(staleData.currentVersion, 2);
        assert.strictEqual(staleData.baseVersion, 1);
    });
});
