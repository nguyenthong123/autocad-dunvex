// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "@chili3d/core";
import { afterAll, beforeAll, describe, expect, test } from "@rstest/core";
import { ApiCloudStorage } from "../src/apiCloudStorage";
import { installFakeIndexedDB } from "./fakeIndexedDB";

describe("Real Client <-> Server Integration (Optimistic Locking & 409 Resolution)", () => {
    let testDataDir: string;
    let server: Server;
    let baseUrl: string;
    let originalIndexedDB: PropertyDescriptor | undefined;

    beforeAll(async () => {
        rs.spyOn(Logger, "info").mockImplementation(() => {});
        rs.spyOn(Logger, "warn").mockImplementation(() => {});
        rs.spyOn(Logger, "error").mockImplementation(() => {});

        testDataDir = mkdtempSync(join(tmpdir(), "chili3d-sync-int-"));
        process.env["DATA_DIR"] = testDataDir;

        const serverModule = await import("../../../server/storageServer.mjs");
        server = serverModule.server;

        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address() as any;
                baseUrl = `http://127.0.0.1:${addr.port}/api/storage`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        rs.restoreAllMocks();
        if (server) {
            await new Promise<void>((resolve) => {
                if (typeof (server as any).closeAllConnections === "function") {
                    (server as any).closeAllConnections();
                }
                server.close(() => resolve());
            });
        }
        if (testDataDir) {
            try {
                rmSync(testDataDir, { recursive: true, force: true });
            } catch {}
        }
    });

    beforeEach(() => {
        originalIndexedDB = Object.getOwnPropertyDescriptor(window, "indexedDB");
        installFakeIndexedDB();
    });

    afterEach(() => {
        if (originalIndexedDB) {
            Object.defineProperty(window, "indexedDB", originalIndexedDB);
        }
    });

    test("client saves A1 -> A2 -> A3 cleanly without false 409s", async () => {
        const clientA = new ApiCloudStorage({ baseUrl });
        await clientA.createDBIfNeeded("dunvex", ["documents"]);

        const docId = `doc_${Date.now()}_clean`;
        const initialDoc = { id: docId, name: "Bản vẽ 1", models: { nodes: [] } };

        // Save 1 (new document -> baseVersion is undefined, server sets version: 1)
        await clientA.put("dunvex", "documents", docId, initialDoc);
        await clientA.flushOutbox();

        expect(clientA.getPendingSyncCount()).toBe(0);
        expect(await clientA.getVersion("dunvex", docId)).toBe(1);

        // Save 2 (identical content -> dedup returns unchanged: true, version stays 1)
        await clientA.put("dunvex", "documents", docId, initialDoc);
        await clientA.flushOutbox();

        expect(clientA.getPendingSyncCount()).toBe(0);
        expect(await clientA.getVersion("dunvex", docId)).toBe(1);

        // Save 3 (content modified -> sends baseVersion: 1, server increments to version: 2)
        const updatedDoc = { ...initialDoc, name: "Bản vẽ 1 (Sửa lần 1)" };
        await clientA.put("dunvex", "documents", docId, updatedDoc);
        await clientA.flushOutbox();

        expect(clientA.getPendingSyncCount()).toBe(0);
        expect(await clientA.getVersion("dunvex", docId)).toBe(2);

        // GET must strip serverVersion from document, while getVersion returns 2
        const loaded = await clientA.get("dunvex", "documents", docId);
        expect(loaded.serverVersion).toBeUndefined();
        expect(loaded.serverUpdatedAt).toBeUndefined();
        expect(loaded.name).toBe("Bản vẽ 1 (Sửa lần 1)");
    });

    test("concurrent edit triggers 409 Conflict and tests all 3 resolution branches", async () => {
        const clientA = new ApiCloudStorage({ baseUrl });
        await clientA.createDBIfNeeded("dunvex", ["documents"]);

        const docId = `doc_${Date.now()}_conflict`;
        const doc = { id: docId, name: "Dự án chung", models: { nodes: [] } };

        // 1. Client A creates document (version 1)
        await clientA.put("dunvex", "documents", docId, doc);
        await clientA.flushOutbox();
        expect(await clientA.getVersion("dunvex", docId)).toBe(1);

        // 2. Client B opens document and updates to version 2
        const clientB = new ApiCloudStorage({ baseUrl });
        await clientB.createDBIfNeeded("dunvex", ["documents"]);
        const docOnB = await clientB.get("dunvex", "documents", docId);
        expect(await clientB.getVersion("dunvex", docId)).toBe(1);

        await clientB.put("dunvex", "documents", docId, { ...docOnB, name: "B đã sửa trước" });
        await clientB.flushOutbox();
        expect(await clientB.getVersion("dunvex", docId)).toBe(2);

        // 3. Client A (still on baseVersion 1) attempts to save -> triggers 409 Conflict!
        await clientA.put("dunvex", "documents", docId, { ...doc, name: "A sửa đè lúc sau" });
        await clientA.flushOutbox();

        const pending = clientA.outbox.getPendingItems();
        expect(pending.length).toBe(1);
        expect(pending[0].conflict).toBe(true);
        expect(pending[0].currentServerVersion).toBe(2);

        // Branch 1: [Ghi đè lên máy chủ] (resolveConflictOverwrite)
        await clientA.outbox.resolveConflictOverwrite(pending[0].id);
        await clientA.flushOutbox();

        // Server accepts baseVersion 2 and bumps to version 3
        expect(clientA.getPendingSyncCount()).toBe(0);
        expect(await clientA.getVersion("dunvex", docId)).toBe(3);

        const verifyOverwrite = await clientA.get("dunvex", "documents", docId);
        expect(verifyOverwrite.name).toBe("A sửa đè lúc sau");

        // 4. Now Client B pulls latest version (3) and updates to version 4
        const docOnB2 = await clientB.get("dunvex", "documents", docId);
        expect(await clientB.getVersion("dunvex", docId)).toBe(3);

        await clientB.put("dunvex", "documents", docId, { ...docOnB2, name: "B sửa tiếp lần 2" });
        await clientB.flushOutbox();
        expect(await clientB.getVersion("dunvex", docId)).toBe(4);

        // Client A tries to save with stale version 3 -> triggers 409 Conflict again
        await clientA.put("dunvex", "documents", docId, { ...verifyOverwrite, name: "A sửa xung đột lần 2" });
        await clientA.flushOutbox();

        const pending2 = clientA.outbox.getPendingItems();
        expect(pending2.length).toBe(1);
        expect(pending2[0].conflict).toBe(true);
        expect(pending2[0].currentServerVersion).toBe(4);

        // Branch 2: [Tải bản máy chủ về] (resolveConflictDiscard)
        await clientA.outbox.resolveConflictDiscard(pending2[0].id);
        expect(clientA.getPendingSyncCount()).toBe(0);

        const serverDocAfterDiscard = await clientA.get("dunvex", "documents", docId);
        expect(serverDocAfterDiscard.name).toBe("B sửa tiếp lần 2");
        expect(await clientA.getVersion("dunvex", docId)).toBe(4);

        // 5. Now Client B pulls and updates to version 5
        const docOnB3 = await clientB.get("dunvex", "documents", docId);
        expect(await clientB.getVersion("dunvex", docId)).toBe(4);

        await clientB.put("dunvex", "documents", docId, { ...docOnB3, name: "B cập nhật bản 5" });
        await clientB.flushOutbox();
        expect(await clientB.getVersion("dunvex", docId)).toBe(5);

        // Client A edits with stale version 4 -> triggers 409 Conflict again
        await clientA.put("dunvex", "documents", docId, {
            ...serverDocAfterDiscard,
            name: "A có ý tưởng khác biệt",
        });
        await clientA.flushOutbox();

        const pending3 = clientA.outbox.getPendingItems();
        expect(pending3.length).toBe(1);
        expect(pending3[0].conflict).toBe(true);

        // Branch 3: [Lưu thành bản sao] (resolveConflictSaveCopy)
        const copyId = await clientA.resolveConflictSaveCopy(pending3[0].id);
        expect(copyId).toBeDefined();
        await clientA.flushOutbox();

        // Original document conflict is cleared
        expect(clientA.getPendingSyncCount()).toBe(0);

        // Verify copy was saved on server under new ID
        const copyOnServer = await clientA.get("dunvex", "documents", copyId!);
        expect(copyOnServer).toBeDefined();
        expect(copyOnServer.name).toContain("(Bản sao xung đột)");
        expect(copyOnServer.name).toContain("A có ý tưởng khác biệt");

        // Verify original document still has B's version 5 on server intact
        const originalDocStillIntact = await clientA.get("dunvex", "documents", docId);
        expect(originalDocStillIntact.name).toBe("B cập nhật bản 5");
    });

    test("dual session same account: A saves → server ACK → B lists and opens same version", async () => {
        const origin = baseUrl.replace(/\/api\/storage\/?$/, "");
        const regA = await fetch(`${origin}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: `dual_a_${Date.now()}`,
                password: "password123",
                storeName: "Dual A",
            }),
        });
        expect(regA.status).toBe(200);
        const { token, user } = await regA.json();

        localStorage.setItem("dunvex_auth_token", token);
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));

        const clientA = new ApiCloudStorage({
            baseUrl,
            getAuthToken: () => localStorage.getItem("dunvex_auth_token") || undefined,
        });
        await clientA.createDBIfNeeded("chili3d", ["documents", "recents"]);

        const docId = `dual_${Date.now()}`;
        const doc = { id: docId, name: "Fixture Dual Session", models: { nodes: [] }, version: "0.7.1" };
        await clientA.put("chili3d", "documents", docId, doc);
        await clientA.flushOutbox();
        expect(clientA.getPendingSyncCount()).toBe(0);
        expect(await clientA.getVersion("chili3d", `${user.id}:${docId}`)).toBe(1);

        // Client B = second browser session, same account JWT + user id
        localStorage.setItem("dunvex_auth_token", token);
        localStorage.setItem("dunvex_auth_user", JSON.stringify(user));
        const clientB = new ApiCloudStorage({
            baseUrl,
            getAuthToken: () => token,
        });
        const list = await clientB.page("chili3d", "recents", 0);
        expect(list.some((r: { id: string }) => r.id === docId)).toBe(true);
        const loaded = await clientB.get("chili3d", "documents", docId);
        expect(loaded).toBeDefined();
        expect(loaded.name).toBe("Fixture Dual Session");
        expect(await clientB.getVersion("chili3d", `${user.id}:${docId}`)).toBe(1);

        // Prove guest cannot see it
        localStorage.removeItem("dunvex_auth_token");
        localStorage.removeItem("dunvex_auth_user");
        const guest = new ApiCloudStorage({ baseUrl });
        const guestDoc = await guest.get("chili3d", "documents", docId);
        expect(guestDoc).toBeUndefined();
    });

    test("owner isolation on real server: A pending → B login must not land A's doc in B's DB", async () => {
        const origin = baseUrl.replace(/\/api\/storage\/?$/, "");
        const stamp = Date.now();
        const regA = await fetch(`${origin}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: `own_a_${stamp}`,
                password: "password123",
                storeName: "Own A",
            }),
        });
        const regB = await fetch(`${origin}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: `own_b_${stamp}`,
                password: "password123",
                storeName: "Own B",
            }),
        });
        expect(regA.status).toBe(200);
        expect(regB.status).toBe(200);
        const sessionA = await regA.json();
        const sessionB = await regB.json();

        localStorage.setItem("dunvex_auth_token", sessionA.token);
        localStorage.setItem("dunvex_auth_user", JSON.stringify(sessionA.user));

        let allowNetwork = false;
        const realFetch = globalThis.fetch.bind(globalThis);
        rs.stubGlobal(
            "fetch",
            rs.fn(async (input: string | URL | Request, init?: RequestInit) => {
                const url = String(input);
                if (url.includes("/documents/") && init?.method === "PUT" && !allowNetwork) {
                    return new Response("offline", { status: 503 });
                }
                return realFetch(input, init);
            }),
        );

        const client = new ApiCloudStorage({
            baseUrl,
            getAuthToken: () => localStorage.getItem("dunvex_auth_token") || undefined,
        });
        await client.createDBIfNeeded("chili3d", ["documents"]);

        const docId = `own_doc_${stamp}`;
        await client.put("chili3d", "documents", docId, {
            id: docId,
            name: "Secret A only",
            models: { nodes: [] },
        });
        expect(client.getPendingSyncCount()).toBe(1);
        expect(client.outbox.getPendingItems()[0].ownerUserId).toBe(sessionA.user.id);

        // Switch to B while A's upload is pending
        localStorage.setItem("dunvex_auth_token", sessionB.token);
        localStorage.setItem("dunvex_auth_user", JSON.stringify(sessionB.user));
        allowNetwork = true;
        await client.flushOutbox();
        expect(client.getPendingSyncCount()).toBe(1);

        const asB = await realFetch(`${baseUrl}/chili3d/documents/${docId}`, {
            headers: { Authorization: `Bearer ${sessionB.token}` },
        });
        expect(asB.status).toBe(404);

        const asGuest = await realFetch(`${baseUrl}/chili3d/documents/${docId}`);
        expect(asGuest.status).toBe(404);

        // Re-login A → flush to A's DB only
        localStorage.setItem("dunvex_auth_token", sessionA.token);
        localStorage.setItem("dunvex_auth_user", JSON.stringify(sessionA.user));
        await client.flushOutbox();
        expect(client.getPendingSyncCount()).toBe(0);

        const asA = await realFetch(`${baseUrl}/chili3d/documents/${docId}`, {
            headers: { Authorization: `Bearer ${sessionA.token}` },
        });
        expect(asA.status).toBe(200);
        const body = await asA.json();
        expect(body.name).toBe("Secret A only");
        expect(body.serverVersion).toBe(1);

        rs.unstubAllGlobals();
    });
});
