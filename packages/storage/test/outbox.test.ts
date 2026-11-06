// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger } from "@chili3d/core";
import { rs } from "@rstest/core";
import { IndexedDBStorage } from "../src/indexedDBStorage";
import { type OutboxItem, OutboxManager } from "../src/outbox";
import { installFakeIndexedDB } from "./fakeIndexedDB";

describe("OutboxManager", () => {
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

    test("should enqueue item, write to _outbox, and dequeue on successful send", async () => {
        const fallback = new IndexedDBStorage();
        await fallback.createDBIfNeeded(DB, [TABLE, "_outbox"]);

        let sendCount = 0;
        const outbox = new OutboxManager({
            fallback,
            sendFn: async (_item: OutboxItem) => {
                sendCount++;
                return { ok: true, version: 1 };
            },
        });
        await outbox.init(DB);

        const item: OutboxItem = {
            id: outbox.makeKey(DB, TABLE, "doc-1"),
            database: DB,
            table: TABLE,
            recordId: "doc-1",
            scopedId: "doc-1",
            ownerUserId: null,
            value: { id: "doc-1", name: "Doc 1" },
            updatedAt: Date.now(),
            attempts: 0,
        };

        await outbox.enqueue(item);

        expect(sendCount).toBe(1);
        expect(outbox.getPendingCount()).toBe(0);
        expect(await outbox.isDirty(DB, TABLE, "doc-1")).toBe(false);

        // Verify removed from IndexedDB _outbox table
        const inDb = await fallback.get(DB, "_outbox", item.id);
        expect(inDb).toBeUndefined();
    });

    test("should keep item in outbox when send fails and report dirty", async () => {
        const fallback = new IndexedDBStorage();
        await fallback.createDBIfNeeded(DB, [TABLE, "_outbox"]);

        let sendCount = 0;
        const outbox = new OutboxManager({
            fallback,
            sendFn: async () => {
                sendCount++;
                return { ok: false, status: 503, error: "Service Unavailable" };
            },
        });
        await outbox.init(DB);

        const item: OutboxItem = {
            id: outbox.makeKey(DB, TABLE, "doc-fail"),
            database: DB,
            table: TABLE,
            recordId: "doc-fail",
            scopedId: "doc-fail",
            ownerUserId: null,
            value: { id: "doc-fail", name: "Doc Fail" },
            updatedAt: Date.now(),
            attempts: 0,
        };

        await outbox.enqueue(item);

        expect(sendCount).toBe(1);
        expect(outbox.getPendingCount()).toBe(1);
        expect(await outbox.isDirty(DB, TABLE, "doc-fail")).toBe(true);

        // Verify persisted in IndexedDB _outbox table
        const inDb = await fallback.get(DB, "_outbox", item.id);
        expect(inDb).toBeDefined();
        expect(inDb.recordId).toBe("doc-fail");
        expect(inDb.attempts).toBe(1);

        outbox.dispose();
    });

    test("should simulate power outage/restart: persists in outbox and flushes on next boot when online", async () => {
        const fallback = new IndexedDBStorage();
        await fallback.createDBIfNeeded(DB, [TABLE, "_outbox"]);

        // 1. Session 1: user saves offline, app crashes/closes
        const session1Outbox = new OutboxManager({
            fallback,
            sendFn: async () => ({ ok: false, error: "Network down" }),
        });
        await session1Outbox.init(DB);

        const item: OutboxItem = {
            id: session1Outbox.makeKey(DB, TABLE, "doc-crash"),
            database: DB,
            table: TABLE,
            recordId: "doc-crash",
            scopedId: "doc-crash",
            ownerUserId: null,
            value: { id: "doc-crash", name: "Doc Survives Power Outage" },
            updatedAt: Date.now(),
            attempts: 0,
        };
        await session1Outbox.enqueue(item);
        session1Outbox.dispose();

        // 2. Session 2: app re-starts after power restored
        let networkRecovered = false;
        let syncedItem: OutboxItem | undefined;

        const session2Outbox = new OutboxManager({
            fallback,
            sendFn: async (it) => {
                if (networkRecovered) {
                    syncedItem = it;
                    return { ok: true, version: 2 };
                }
                return { ok: false, error: "Still offline" };
            },
        });

        // Initialize session 2
        await session2Outbox.init(DB);
        expect(session2Outbox.getPendingCount()).toBe(1);
        expect(await session2Outbox.isDirty(DB, TABLE, "doc-crash")).toBe(true);

        // Now network recovers
        networkRecovered = true;
        await session2Outbox.processQueue(true);

        expect(session2Outbox.getPendingCount()).toBe(0);
        expect(await session2Outbox.isDirty(DB, TABLE, "doc-crash")).toBe(false);
        expect(syncedItem?.value.name).toBe("Doc Survives Power Outage");

        // Verify outbox in IndexedDB is now empty
        const inDb = await fallback.get(DB, "_outbox", item.id);
        expect(inDb).toBeUndefined();

        session2Outbox.dispose();
    });
});
