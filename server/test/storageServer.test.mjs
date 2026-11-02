// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import assert from "node:assert";
import { rmSync } from "node:fs";
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
});
