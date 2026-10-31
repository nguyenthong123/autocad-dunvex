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
});
