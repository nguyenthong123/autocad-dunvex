// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger } from "@chili3d/core";
import { rs } from "@rstest/core";
import { ApiCloudStorage } from "../src/apiCloudStorage";
import { installFakeIndexedDB } from "./fakeIndexedDB";

describe("ApiCloudStorage", () => {
    let fake: ReturnType<typeof installFakeIndexedDB>;
    let originalIndexedDB: PropertyDescriptor | undefined;

    beforeAll(() => {
        rs.spyOn(Logger, "info").mockImplementation(() => {});
        rs.spyOn(Logger, "warn").mockImplementation(() => {});
        rs.spyOn(Logger, "error").mockImplementation(() => {});
    });

    afterAll(() => {
        rs.restoreAllMocks();
    });

    beforeEach(async () => {
        originalIndexedDB = Object.getOwnPropertyDescriptor(window, "indexedDB");
        fake = installFakeIndexedDB();
        const initStorage = new ApiCloudStorage({ baseUrl: "/api/storage" });
        await initStorage.createDBIfNeeded(DB, [TABLE, "recents"]);
    });

    afterEach(() => {
        fake.reset();
        rs.unstubAllGlobals();
        if (originalIndexedDB) {
            Object.defineProperty(window, "indexedDB", originalIndexedDB);
        } else {
            delete (window as { indexedDB?: unknown }).indexedDB;
        }
    });

    const DB = "testDB";
    const TABLE = "documents";
    const ID = "doc-123";

    describe("constructor & headers", () => {
        test("should strip trailing slash from baseUrl", async () => {
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify({ id: ID }), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "https://example.com/api/storage///" });
            await storage.get(DB, TABLE, ID);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const calledUrl = String(fetchSpy.mock.calls[0][0]);
            expect(calledUrl.startsWith("https://example.com/api/storage/")).toBe(true);
            expect(calledUrl).not.toContain("///");
        });

        test("should include Authorization header when getAuthToken returns a token", async () => {
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify({ id: ID }), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({
                baseUrl: "/api/storage",
                getAuthToken: () => "secret-jwt-token",
            });
            await storage.get(DB, TABLE, ID);

            const options = fetchSpy.mock.calls[0][1];
            const headers = options?.headers as Record<string, string>;
            expect(headers["Authorization"]).toBe("Bearer secret-jwt-token");
        });
    });

    describe("createDBIfNeeded", () => {
        test("should forward createDBIfNeeded to local fallback", async () => {
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE, "recents"]);

            const db = fake.databases.get(DB);
            expect(db).toBeDefined();
            expect(db!.objectStoreNames.contains(TABLE)).toBe(true);
            expect(db!.objectStoreNames.contains("recents")).toBe(true);
        });
    });

    describe("get", () => {
        test("should return data and cache in fallback when response is 200 OK", async () => {
            const docData = { id: ID, name: "Plan A", date: 1000 };
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify(docData), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            const result = await storage.get(DB, TABLE, ID);
            expect(result).toEqual(docData);

            // Check cached in fallback
            const cached = await storage.get(DB, TABLE, ID);
            expect(cached).toEqual(docData);
        });

        test("should return undefined when response is 404 Not Found", async () => {
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            const result = await storage.get(DB, TABLE, "nonexistent");
            expect(result).toBeUndefined();
        });

        test("should fallback to local IndexedDB when fetch throws network error", async () => {
            const localData = { id: ID, name: "Offline Saved Plan" };
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            // Save to local fallback first
            const fallback = (storage as any)._fallback;
            await fallback.put(DB, TABLE, ID, localData);

            // Fetch throws network failure
            const fetchSpy = rs.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
                throw new Error("Network offline");
            });
            rs.stubGlobal("fetch", fetchSpy);

            const result = await storage.get(DB, TABLE, ID);
            expect(result).toEqual(localData);
        });
    });

    describe("put", () => {
        test("should store in fallback and call PUT API", async () => {
            const docData = { id: ID, name: "Draft Plan" };
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify({ ok: true }), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            const success = await storage.put(DB, TABLE, ID, docData);
            expect(success).toBe(true);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [url, init] = fetchSpy.mock.calls[0];
            expect(String(url)).toContain(`/api/storage/${DB}/${TABLE}/${ID}`);
            expect(init?.method).toBe("PUT");
            expect(JSON.parse(init?.body as string)).toEqual(docData);

            // Check also stored in local fallback
            const fallback = (storage as any)._fallback;
            const locallyStored = await fallback.get(DB, TABLE, ID);
            expect(locallyStored).toEqual(docData);
        });

        test("should return true when API fails but fallback succeeds", async () => {
            const docData = { id: ID, name: "Offline Plan" };
            const fetchSpy = rs.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
                throw new Error("Connection refused");
            });
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            const success = await storage.put(DB, TABLE, ID, docData);
            expect(success).toBe(true);

            // Data must be safely stored in fallback
            const fallback = (storage as any)._fallback;
            const locallyStored = await fallback.get(DB, TABLE, ID);
            expect(locallyStored).toEqual(docData);
        });
    });

    describe("delete", () => {
        test("should delete from fallback and call DELETE API", async () => {
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify({ ok: true }), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            const fallback = (storage as any)._fallback;
            await fallback.put(DB, TABLE, ID, { id: ID });

            const success = await storage.delete(DB, TABLE, ID);
            expect(success).toBe(true);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [url, init] = fetchSpy.mock.calls[0];
            expect(String(url)).toContain(`/api/storage/${DB}/${TABLE}/${ID}`);
            expect(init?.method).toBe("DELETE");

            const deleted = await fallback.get(DB, TABLE, ID);
            expect(deleted).toBeUndefined();
        });

        test("should return false when DELETE API fails", async () => {
            const fetchSpy = rs.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
                throw new Error("Network timeout");
            });
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            const success = await storage.delete(DB, TABLE, ID);
            expect(success).toBe(false);
        });
    });

    describe("page", () => {
        test("should return items array on 200 OK", async () => {
            const items = [
                { id: "1", date: 200 },
                { id: "2", date: 100 },
            ];
            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response(JSON.stringify(items), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            const result = await storage.page(DB, TABLE, 0);

            expect(result).toEqual(items);
            const [url] = fetchSpy.mock.calls[0];
            expect(String(url)).toContain("page=0&count=20");
        });

        test("should fallback to local storage on API failure", async () => {
            const localItems = [{ id: "local-1", date: 50 }];
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            const fallback = (storage as any)._fallback;
            await fallback.put(DB, TABLE, "local-1", localItems[0]);

            const fetchSpy = rs.fn(
                async (_input: string | URL | Request, _init?: RequestInit) =>
                    new Response("Server error", { status: 500 }),
            );
            rs.stubGlobal("fetch", fetchSpy);

            const result = await storage.page(DB, TABLE, 0);
            expect(result.length).toBe(1);
            expect(result[0]).toEqual(localItems[0]);
        });
    });

    describe("safe local read & write (anti-overwrite)", () => {
        test("should not overwrite local dirty data when server returns older data", async () => {
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            // Simulate offline PUT: server fails, local is saved and marked dirty in outbox
            const fetchFailSpy = rs.fn(async () => {
                throw new Error("Network unreachable");
            });
            rs.stubGlobal("fetch", fetchFailSpy);

            const localNewData = { id: ID, name: "Bản vẽ mới cục bộ", updatedAt: 5000, docVersion: 2 };
            await storage.put(DB, TABLE, ID, localNewData);

            expect(await storage.isDirty(DB, TABLE, ID)).toBe(true);
            expect(storage.getPendingSyncCount()).toBe(1);

            // Now simulate server coming back online, but server only has older version 1
            const serverOldData = { id: ID, name: "Bản vẽ cũ máy chủ", updatedAt: 1000, docVersion: 1 };
            const fetchServerOldSpy = rs.fn(
                async () => new Response(JSON.stringify(serverOldData), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchServerOldSpy);

            // User opens document: get() must return the local newer copy and NOT overwrite it!
            const retrieved = await storage.get(DB, TABLE, ID);
            expect(retrieved.name).toBe("Bản vẽ mới cục bộ");
            expect(retrieved.docVersion).toBe(2);

            // Verify local IndexedDB was NOT overwritten
            const fallback = (storage as any)._fallback;
            const inLocalDb = await fallback.get(DB, TABLE, ID);
            expect(inLocalDb.name).toBe("Bản vẽ mới cục bộ");
        });

        test("should allow server data to update local cache when local is clean (not dirty)", async () => {
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            // Normal successful PUT: both local and server updated, outbox emptied
            const fetchPutOkSpy = rs.fn(
                async () => new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchPutOkSpy);

            const initialData = { id: ID, name: "Bản vẽ ban đầu", docVersion: 1 };
            await storage.put(DB, TABLE, ID, initialData);

            // Wait a tick for outbox queue to process
            await storage.flushOutbox();
            expect(await storage.isDirty(DB, TABLE, ID)).toBe(false);

            // Server has update from another machine
            const serverUpdatedData = { id: ID, name: "Bản vẽ cập nhật từ máy khác", docVersion: 2 };
            const fetchGetSpy = rs.fn(
                async () => new Response(JSON.stringify(serverUpdatedData), { status: 200 }),
            );
            rs.stubGlobal("fetch", fetchGetSpy);

            const retrieved = await storage.get(DB, TABLE, ID);
            expect(retrieved.name).toBe("Bản vẽ cập nhật từ máy khác");

            // Local cache is updated with server copy because local wasn't dirty
            const fallback = (storage as any)._fallback;
            const inLocalDb = await fallback.get(DB, TABLE, ID);
            expect(inLocalDb.name).toBe("Bản vẽ cập nhật từ máy khác");
        });

        test("TASK-27: should track version in _versions store and strip serverVersion from document", async () => {
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            // Server returns document with serverVersion and serverUpdatedAt
            const serverDoc = {
                id: ID,
                name: "Tài liệu mẫu",
                serverVersion: 3,
                serverUpdatedAt: "2026-11-03T00:00:00Z",
            };
            rs.stubGlobal(
                "fetch",
                rs.fn(async () => new Response(JSON.stringify(serverDoc), { status: 200 })),
            );

            const doc = await storage.get(DB, TABLE, ID);
            // serverVersion and serverUpdatedAt must be removed from returned doc
            expect(doc.serverVersion).toBeUndefined();
            expect(doc.serverUpdatedAt).toBeUndefined();
            expect(doc.name).toBe("Tài liệu mẫu");

            // Version must be stored in _versions table
            const version = await storage.getVersion(DB, ID);
            expect(version).toBe(3);

            // Local cache must NOT contain serverVersion
            const fallback = (storage as any)._fallback;
            const cached = await fallback.get(DB, TABLE, ID);
            expect(cached.serverVersion).toBeUndefined();
            expect(cached.serverUpdatedAt).toBeUndefined();

            // Next PUT must include baseVersion: 3 in outgoing payload
            let sentPayload: any = null;
            rs.stubGlobal(
                "fetch",
                rs.fn(async (_url: string, opts: any) => {
                    sentPayload = JSON.parse(opts.body);
                    return new Response(JSON.stringify({ ok: true, version: 4 }), { status: 200 });
                }),
            );

            await storage.put(DB, TABLE, ID, { ...doc, name: "Tài liệu sửa đổi" });
            await storage.flushOutbox();

            expect(sentPayload).not.toBeNull();
            expect(sentPayload.baseVersion).toBe(3);
            expect(sentPayload.name).toBe("Tài liệu sửa đổi");

            // Version must be updated to 4
            const updatedVersion = await storage.getVersion(DB, ID);
            expect(updatedVersion).toBe(4);
        });

        test("TASK-27: should handle 409 conflict and support overwrite, discard, and save-as-copy", async () => {
            const storage = new ApiCloudStorage({ baseUrl: "/api/storage" });
            await storage.createDBIfNeeded(DB, [TABLE]);

            // Set initial version to 2
            await storage.setVersion(DB, ID, 2);

            // PUT triggers 409
            rs.stubGlobal(
                "fetch",
                rs.fn(async () => {
                    return new Response(
                        JSON.stringify({
                            error: "VERSION_CONFLICT",
                            currentVersion: 5,
                            baseVersion: 2,
                        }),
                        { status: 409 },
                    );
                }),
            );

            await storage.put(DB, TABLE, ID, { id: ID, name: "Bản sửa bị xung đột" });
            await storage.flushOutbox();

            const pending = storage.outbox.getPendingItems();
            expect(pending.length).toBe(1);
            expect(pending[0].conflict).toBe(true);
            expect(pending[0].currentServerVersion).toBe(5);

            // Test resolveConflictSaveCopy
            let copyPutPayload: any = null;
            rs.stubGlobal(
                "fetch",
                rs.fn(async (_url: string, opts: any) => {
                    copyPutPayload = JSON.parse(opts.body);
                    return new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200 });
                }),
            );

            const copyId = await storage.resolveConflictSaveCopy(pending[0].id);
            expect(copyId).toBeDefined();
            expect(copyId).toContain("_copy_");

            await storage.flushOutbox();

            // Verify original conflict item was dequeued and copy was sent
            expect(copyPutPayload.id).toBe(copyId);
            expect(copyPutPayload.name).toContain("(Bản sao xung đột)");
            expect(storage.getPendingSyncCount()).toBe(0);
        });
    });
});
