// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger, PubSub } from "@chili3d/core";
import { rs } from "@rstest/core";
import { ApiCloudStorage } from "../src/apiCloudStorage";
import { IndexedDBStorage } from "../src/indexedDBStorage";
import { type OutboxItem, OutboxManager, resolveOutboxOwner } from "../src/outbox";
import { installFakeIndexedDB } from "./fakeIndexedDB";

describe("Outbox owner isolation & session gates", () => {
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

    beforeEach(() => {
        originalIndexedDB = Object.getOwnPropertyDescriptor(window, "indexedDB");
        fake = installFakeIndexedDB();
        localStorage.clear();
    });

    afterEach(() => {
        fake.reset();
        rs.unstubAllGlobals();
        localStorage.clear();
        if (originalIndexedDB) {
            Object.defineProperty(window, "indexedDB", originalIndexedDB);
        } else {
            delete (window as { indexedDB?: unknown }).indexedDB;
        }
    });

    const DB = "testDB";
    const TABLE = "documents";
    const USER_A = "user-aaa";
    const USER_B = "user-bbb";

    function setSession(userId: string | null, token?: string) {
        if (!userId) {
            localStorage.removeItem("dunvex_auth_user");
            localStorage.removeItem("dunvex_auth_token");
            return;
        }
        localStorage.setItem(
            "dunvex_auth_user",
            JSON.stringify({ id: userId, username: userId, storeName: userId }),
        );
        if (token) {
            localStorage.setItem("dunvex_auth_token", token);
        } else {
            localStorage.removeItem("dunvex_auth_token");
        }
    }

    test("resolveOutboxOwner prefers ownerUserId and falls back to scopedId prefix", () => {
        expect(
            resolveOutboxOwner({
                id: "k",
                database: DB,
                table: TABLE,
                recordId: "doc-1",
                scopedId: `${USER_A}:doc-1`,
                ownerUserId: USER_A,
                value: {},
                updatedAt: 1,
                attempts: 0,
            }),
        ).toBe(USER_A);

        expect(
            resolveOutboxOwner({
                id: "k",
                database: DB,
                table: TABLE,
                recordId: "doc-1",
                scopedId: `${USER_A}:doc-1`,
                ownerUserId: null,
                value: {},
                updatedAt: 1,
                attempts: 0,
            }),
        ).toBeNull();

        const legacy = {
            id: "k",
            database: DB,
            table: TABLE,
            recordId: "doc-1",
            scopedId: `${USER_A}:doc-1`,
            value: {},
            updatedAt: 1,
            attempts: 0,
        } as OutboxItem;
        expect(resolveOutboxOwner(legacy)).toBe(USER_A);
    });

    test("pending upload for A is held (not sent) after logout / switch to B, local row kept", async () => {
        const fallback = new IndexedDBStorage();
        await fallback.createDBIfNeeded(DB, [TABLE, "_outbox"]);

        let currentOwner: string | null = USER_A;
        const sentOwners: Array<string | null> = [];

        const outbox = new OutboxManager({
            fallback,
            getCurrentOwnerId: () => currentOwner,
            sendFn: async (item) => {
                sentOwners.push(resolveOutboxOwner(item));
                return { ok: true, version: 1 };
            },
        });
        await outbox.init(DB);

        // First attempt fails (simulates offline) so the item stays pending.
        outbox.setSendFn(async () => ({ ok: false, error: "offline" }));
        const item: OutboxItem = {
            id: outbox.makeKey(DB, TABLE, `${USER_A}:doc-a`),
            database: DB,
            table: TABLE,
            recordId: "doc-a",
            scopedId: `${USER_A}:doc-a`,
            ownerUserId: USER_A,
            value: { id: "doc-a", name: "Owned by A" },
            updatedAt: Date.now(),
            attempts: 0,
        };
        await outbox.enqueue(item);
        expect(outbox.getPendingCount()).toBe(1);

        // Logout → guest, then B logs in. Retry must not upload A's item as B/guest.
        currentOwner = null;
        outbox.setSendFn(async (it) => {
            sentOwners.push(resolveOutboxOwner(it));
            return { ok: true, version: 1 };
        });
        await outbox.processQueue(true);
        expect(sentOwners).toEqual([]);
        expect(outbox.getPendingCount()).toBe(1);
        expect(outbox.getPendingItems()[0].lastError).toBe("OWNER_MISMATCH");
        expect(await fallback.get(DB, "_outbox", item.id)).toBeDefined();

        currentOwner = USER_B;
        await outbox.processQueue(true);
        expect(sentOwners).toEqual([]);
        expect(outbox.getPendingCount()).toBe(1);

        // A returns — upload resumes to A's identity only.
        currentOwner = USER_A;
        await outbox.processQueue(true);
        expect(sentOwners).toEqual([USER_A]);
        expect(outbox.getPendingCount()).toBe(0);

        outbox.dispose();
    });

    test("ApiCloudStorage: expired token retry keeps local A data and does not PUT as guest", async () => {
        setSession(USER_A, "token-a-valid");
        const storage = new ApiCloudStorage({
            baseUrl: "/api/storage",
            getAuthToken: () => localStorage.getItem("dunvex_auth_token") || undefined,
        });
        await storage.createDBIfNeeded(DB, [TABLE]);

        let putCalls = 0;
        let authHeaders: Array<string | undefined> = [];
        rs.stubGlobal(
            "fetch",
            rs.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                putCalls++;
                const headers = init?.headers as Record<string, string> | undefined;
                authHeaders.push(headers?.["Authorization"]);
                if (localStorage.getItem("dunvex_auth_token") === "token-a-valid") {
                    return new Response(JSON.stringify({ ok: false }), {
                        status: 503,
                        statusText: "Unavailable",
                    });
                }
                // If a retry somehow fires with no/foreign token, fail the test intent via 200 to guest —
                // we assert putCalls stays 1 (held) or Authorization never omitted while owner is A.
                return new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200 });
            }),
        );

        await storage.put(DB, TABLE, "doc-a", { id: "doc-a", name: "A pending" });
        expect(storage.getPendingSyncCount()).toBe(1);
        expect(putCalls).toBe(1);

        // Token expires / cleared — identity kept for offline scope.
        localStorage.setItem("dunvex_auth_token", "expired-token");
        authHeaders = [];
        putCalls = 0;
        rs.stubGlobal(
            "fetch",
            rs.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                putCalls++;
                const headers = init?.headers as Record<string, string> | undefined;
                authHeaders.push(headers?.["Authorization"]);
                return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 });
            }),
        );

        await storage.flushOutbox();
        expect(putCalls).toBe(1);
        expect(authHeaders[0]).toBe("Bearer expired-token");
        expect(storage.getPendingSyncCount()).toBe(1);

        // 401 clears the JWT session; restore A identity (no token) to read scoped local data.
        setSession(USER_A);
        const local = await storage.get(DB, TABLE, "doc-a");
        expect(local?.name).toBe("A pending");
        expect(storage.getPendingSyncCount()).toBe(1);

        // Switch to B: must not send A's pending row under B.
        setSession(USER_B, "token-b");
        putCalls = 0;
        await storage.flushOutbox();
        expect(putCalls).toBe(0);
        expect(storage.getPendingSyncCount()).toBe(1);

        // Re-login A with good token → upload completes.
        setSession(USER_A, "token-a-good");
        putCalls = 0;
        rs.stubGlobal(
            "fetch",
            rs.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                putCalls++;
                const headers = init?.headers as Record<string, string> | undefined;
                expect(headers?.["Authorization"]).toBe("Bearer token-a-good");
                return new Response(JSON.stringify({ ok: true, version: 2 }), { status: 200 });
            }),
        );
        PubSub.default.pub("authChanged", {
            id: USER_A,
            username: USER_A,
            storeName: USER_A,
        });
        await storage.flushOutbox();
        expect(putCalls).toBe(1);
        expect(storage.getPendingSyncCount()).toBe(0);
    });

    test("in-flight A 401 after B login must not log out B; A pending stays owned by A", async () => {
        setSession(USER_A, "token-a");

        const invalidEvents: Array<{ userId: string | null; token: string | null } | undefined> = [];
        const onInvalid = (_reason: string, sent?: { userId: string | null; token: string | null }) => {
            invalidEvents.push(sent);
            // Simulate UI handler: only clear if the live session still matches the sender.
            const liveToken = localStorage.getItem("dunvex_auth_token");
            const liveUser = localStorage.getItem("dunvex_auth_user");
            const liveId = liveUser ? JSON.parse(liveUser).id : null;
            if (sent && sent.token === liveToken && sent.userId === liveId) {
                localStorage.removeItem("dunvex_auth_token");
                localStorage.removeItem("dunvex_auth_user");
            }
        };
        PubSub.default.sub("authSessionInvalid", onInvalid);

        let releaseA!: (value: Response) => void;
        const aResponse = new Promise<Response>((resolve) => {
            releaseA = resolve;
        });

        const storage = new ApiCloudStorage({
            baseUrl: "/api/storage",
            getAuthToken: () => localStorage.getItem("dunvex_auth_token") || undefined,
        });
        await storage.createDBIfNeeded(DB, [TABLE]);

        // Seed a pending A row first (offline), then start a flush that hangs on A's token.
        rs.stubGlobal(
            "fetch",
            rs.fn(async () => new Response("offline", { status: 503 })),
        );
        await storage.put(DB, TABLE, "doc-a", { id: "doc-a", name: "A secret" });
        expect(storage.outbox.getPendingItems()[0].ownerUserId).toBe(USER_A);

        let fetchStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            fetchStarted = resolve;
        });
        rs.stubGlobal(
            "fetch",
            rs.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                const headers = init?.headers as Record<string, string> | undefined;
                if (headers?.["Authorization"] === "Bearer token-a") {
                    fetchStarted();
                    return aResponse;
                }
                return new Response(JSON.stringify([{ id: "b-only" }]), { status: 200 });
            }),
        );

        const flushPromise = storage.flushOutbox();
        await started;

        // Switch to B while A's upload is still in flight.
        setSession(USER_B, "token-b");
        PubSub.default.pub("authChanged", {
            id: USER_B,
            username: USER_B,
            storeName: USER_B,
        });

        releaseA(new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 }));
        await flushPromise;

        expect(invalidEvents.length).toBe(0);
        expect(localStorage.getItem("dunvex_auth_token")).toBe("token-b");
        expect(JSON.parse(localStorage.getItem("dunvex_auth_user")!).id).toBe(USER_B);
        expect(storage.getPendingSyncCount()).toBe(1);
        expect(storage.outbox.getPendingItems()[0].ownerUserId).toBe(USER_A);
        expect(storage.outbox.getPendingItems()[0].scopedId).toBe(`${USER_A}:doc-a`);

        PubSub.default.remove("authSessionInvalid", onInvalid);
    });

    test("stale GET for A after B login does not write into B's cache", async () => {
        setSession(USER_A, "token-a");
        let releaseA!: (value: Response) => void;
        const aResponse = new Promise<Response>((resolve) => {
            releaseA = resolve;
        });

        rs.stubGlobal(
            "fetch",
            rs.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                const headers = init?.headers as Record<string, string> | undefined;
                if (headers?.["Authorization"] === "Bearer token-a") {
                    return aResponse;
                }
                return new Response(JSON.stringify({ id: "doc-a", name: "from-B-server" }), {
                    status: 200,
                });
            }),
        );

        const storage = new ApiCloudStorage({
            baseUrl: "/api/storage",
            getAuthToken: () => localStorage.getItem("dunvex_auth_token") || undefined,
        });
        await storage.createDBIfNeeded(DB, [TABLE]);

        const getPromise = storage.get(DB, TABLE, "doc-a");
        setSession(USER_B, "token-b");
        releaseA(
            new Response(JSON.stringify({ id: "doc-a", name: "from-A-server", serverVersion: 9 }), {
                status: 200,
            }),
        );
        const result = await getPromise;

        // Must not surface A's payload as B's document, nor cache under B.
        expect(result?.name).not.toBe("from-A-server");
        rs.stubGlobal(
            "fetch",
            rs.fn(async () => new Response("missing", { status: 404 })),
        );
        const bGet = await storage.get(DB, TABLE, "doc-a");
        expect(bGet?.name).not.toBe("from-A-server");
        expect(await storage.getVersion(DB, `${USER_B}:doc-a`)).toBeUndefined();
        expect(await storage.getVersion(DB, `${USER_A}:doc-a`)).toBeUndefined();
    });

    test("stale page for A after B login does not return A's list to B", async () => {
        setSession(USER_A, "token-a");
        let releaseA!: (value: Response) => void;
        const aResponse = new Promise<Response>((resolve) => {
            releaseA = resolve;
        });

        rs.stubGlobal(
            "fetch",
            rs.fn(async (_url: string | URL | Request, init?: RequestInit) => {
                const headers = init?.headers as Record<string, string> | undefined;
                if (headers?.["Authorization"] === "Bearer token-a") {
                    return aResponse;
                }
                return new Response(JSON.stringify([]), { status: 200 });
            }),
        );

        const storage = new ApiCloudStorage({
            baseUrl: "/api/storage",
            getAuthToken: () => localStorage.getItem("dunvex_auth_token") || undefined,
        });
        await storage.createDBIfNeeded(DB, [TABLE, "recents"]);

        const pagePromise = storage.page(DB, "recents", 0);
        setSession(USER_B, "token-b");
        releaseA(new Response(JSON.stringify([{ id: "a-doc", name: "Only A" }]), { status: 200 }));
        const list = await pagePromise;
        expect(list.some((r: { id: string }) => r.id === "a-doc")).toBe(false);
    });

    test("ApiCloudStorage put stamps ownerUserId from the session at enqueue time", async () => {
        setSession(USER_A, "tok");
        rs.stubGlobal(
            "fetch",
            rs.fn(async () => new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200 })),
        );
        const storage = new ApiCloudStorage({
            baseUrl: "/api/storage",
            getAuthToken: () => "tok",
        });
        await storage.createDBIfNeeded(DB, [TABLE]);

        // Force stay pending
        rs.stubGlobal(
            "fetch",
            rs.fn(async () => new Response("down", { status: 503 })),
        );
        await storage.put(DB, TABLE, "doc-x", { id: "doc-x", name: "x" });
        const pending = storage.outbox.getPendingItems();
        expect(pending[0].ownerUserId).toBe(USER_A);
        expect(pending[0].scopedId).toBe(`${USER_A}:doc-x`);
    });
});
