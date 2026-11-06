// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Logger } from "@chili3d/core";
import type { IndexedDBStorage } from "./indexedDBStorage";

export interface OutboxItem {
    id: string; // Format: `${database}:${table}:${scopedId}`
    database: string;
    table: string;
    recordId: string;
    scopedId: string;
    value: any;
    baseVersion?: number;
    currentServerVersion?: number;
    updatedAt: number;
    attempts: number;
    lastAttemptAt?: number;
    lastError?: string;
    conflict?: boolean;
}

/**
 * Sync pipeline status (never treat IndexedDB-only success as VPS-synced):
 * - local: written on this device, not yet ACKed by server
 * - saving: upload in flight
 * - pending: waiting to retry (offline / backlog)
 * - saved: server ACK — present in the account DB on VPS
 * - error: last upload failed (auth/network/5xx)
 * - conflict: version conflict; local copy kept until user resolves
 */
export type SyncStatus = "local" | "saved" | "saving" | "pending" | "error" | "conflict";

export interface OutboxOptions {
    fallback?: IndexedDBStorage;
    sendFn?: (
        item: OutboxItem,
    ) => Promise<{ ok: boolean; status?: number; error?: string; version?: number; currentVersion?: number }>;
    onStatusChange?: (status: SyncStatus, pendingCount: number) => void;
}

export class OutboxManager {
    private readonly _fallback?: IndexedDBStorage;
    private readonly _dirtyKeys = new Set<string>();
    private readonly _pendingItems = new Map<string, OutboxItem>();
    private readonly _initializedDbs = new Set<string>();
    private _currentProcessPromise?: Promise<void>;
    private _retryTimer?: any;
    private _sendFn?: (
        item: OutboxItem,
    ) => Promise<{ ok: boolean; status?: number; error?: string; version?: number; currentVersion?: number }>;
    private _onStatusChange?: (status: SyncStatus, pendingCount: number) => void;

    constructor(options: OutboxOptions = {}) {
        this._fallback = options.fallback;
        this._sendFn = options.sendFn;
        this._onStatusChange = options.onStatusChange;

        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            window.addEventListener("online", this.handleOnline);
        }
    }

    private readonly handleOnline = () => {
        Logger.info("Network restored to online: immediately flushing outbox queue");
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = undefined;
        }
        this.processQueue(true).catch((err) => {
            Logger.warn("Error while processing outbox on network reconnect:", err);
        });
    };

    setSendFn(
        sendFn: (item: OutboxItem) => Promise<{
            ok: boolean;
            status?: number;
            error?: string;
            version?: number;
            currentVersion?: number;
        }>,
    ) {
        this._sendFn = sendFn;
    }

    setOnStatusChange(callback: (status: SyncStatus, pendingCount: number) => void) {
        this._onStatusChange = callback;
    }

    private emitStatus(status: SyncStatus) {
        const count = this._pendingItems.size;
        this._onStatusChange?.(status, count);
    }

    makeKey(database: string, table: string, scopedId: string): string {
        return `${database}:${table}:${scopedId}`;
    }

    async init(database: string): Promise<void> {
        if (this._initializedDbs.has(database)) return;
        this._initializedDbs.add(database);
        if (!this._fallback) {
            return;
        }

        try {
            let page = 0;
            while (true) {
                const items = (await this._fallback.page(database, "_outbox", page)) as OutboxItem[];
                if (!items || items.length === 0) break;
                for (const item of items) {
                    if (item?.id) {
                        this._dirtyKeys.add(item.id);
                        this._pendingItems.set(item.id, item);
                    }
                }
                if (items.length < 20) break;
                page++;
            }
        } catch (e) {
            Logger.warn(`OutboxManager failed to read _outbox store for ${database}:`, e);
        }

        if (this._pendingItems.size > 0) {
            this.emitStatus("pending");
            this.scheduleNextProcess();
        } else {
            this.emitStatus("saved");
        }
    }

    async isDirty(database: string, table: string, scopedId: string): Promise<boolean> {
        if (!this._initializedDbs.has(database)) {
            await this.init(database);
        }
        const key = this.makeKey(database, table, scopedId);
        return this._dirtyKeys.has(key);
    }

    getPendingCount(): number {
        return this._pendingItems.size;
    }

    getPendingItems(): OutboxItem[] {
        return Array.from(this._pendingItems.values());
    }

    getItem(id: string): OutboxItem | undefined {
        return this._pendingItems.get(id);
    }

    /** Ghi đè lên máy chủ: cập nhật baseVersion bằng currentServerVersion rồi gửi lại */
    async resolveConflictOverwrite(key: string): Promise<void> {
        const item = this._pendingItems.get(key);
        if (!item) return;
        if (typeof item.currentServerVersion === "number") {
            item.baseVersion = item.currentServerVersion;
        }
        item.conflict = false;
        item.attempts = 0;
        item.lastError = undefined;
        if (this._fallback) {
            await this._fallback.put(item.database, "_outbox", item.id, item).catch(() => {});
        }
        await this.processQueue(true);
    }

    /** Bỏ bản local xung đột khỏi outbox để nạp lại bản máy chủ */
    async resolveConflictDiscard(key: string): Promise<void> {
        const item = this._pendingItems.get(key);
        if (!item) return;
        await this.dequeue(item.database, item.table, item.scopedId);
    }

    async enqueue(item: OutboxItem): Promise<void> {
        if (!this._initializedDbs.has(item.database)) {
            await this.init(item.database);
        }

        this._dirtyKeys.add(item.id);
        this._pendingItems.set(item.id, item);

        if (this._fallback) {
            try {
                await this._fallback.put(item.database, "_outbox", item.id, item);
            } catch (err) {
                Logger.error(`Failed to persist outbox item ${item.id}:`, err);
            }
        }

        // Local write is durable; VPS sync is a separate phase.
        this.emitStatus("local");
        this.emitStatus("saving");
        await this.processQueue();
    }

    async dequeue(database: string, table: string, scopedId: string): Promise<void> {
        const key = this.makeKey(database, table, scopedId);
        this._dirtyKeys.delete(key);
        this._pendingItems.delete(key);

        if (this._fallback) {
            try {
                await this._fallback.delete(database, "_outbox", key);
            } catch (err) {
                Logger.warn(`Failed to delete outbox item ${key}:`, err);
            }
        }

        if (this._pendingItems.size === 0) {
            this.emitStatus("saved");
        } else {
            this.emitStatus("pending");
        }
    }

    private getBackoffDelay(attempts: number): number {
        // Backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
        const base = Math.min(1000 * 2 ** Math.max(0, attempts - 1), 60000);
        const jitter = Math.floor(Math.random() * (base * 0.15));
        return base + jitter;
    }

    private scheduleNextProcess(minDelay?: number) {
        if (this._retryTimer || this._pendingItems.size === 0) return;

        let delay = minDelay ?? 60000;
        if (minDelay === undefined) {
            for (const item of this._pendingItems.values()) {
                if (!item.conflict) {
                    const itemDelay = this.getBackoffDelay(item.attempts);
                    if (itemDelay < delay) delay = itemDelay;
                }
            }
        }

        this._retryTimer = setTimeout(() => {
            this._retryTimer = undefined;
            this.processQueue().catch((err) => {
                Logger.warn("Scheduled outbox process error:", err);
            });
        }, delay);
    }

    async processQueue(force = false): Promise<void> {
        if (this._currentProcessPromise) {
            await this._currentProcessPromise;
            if (this._pendingItems.size === 0) return;
        }

        this._currentProcessPromise = this._doProcessQueue(force);
        try {
            await this._currentProcessPromise;
        } finally {
            this._currentProcessPromise = undefined;
        }
    }

    private async _doProcessQueue(force: boolean): Promise<void> {
        if (!this._sendFn || this._pendingItems.size === 0) return;

        let hasError = false;
        let hasConflict = false;

        const items = Array.from(this._pendingItems.values());
        for (const item of items) {
            if (item.conflict && !force) {
                hasConflict = true;
                continue;
            }

            item.attempts++;
            item.lastAttemptAt = Date.now();

            try {
                const res = await this._sendFn(item);
                if (res.ok) {
                    await this.dequeue(item.database, item.table, item.scopedId);
                } else if (res.status === 409) {
                    item.conflict = true;
                    item.lastError = res.error || "Conflict";
                    item.currentServerVersion = res.currentVersion ?? res.version;
                    hasConflict = true;
                    if (this._fallback) {
                        await this._fallback.put(item.database, "_outbox", item.id, item).catch(() => {});
                    }
                } else {
                    hasError = true;
                    item.lastError = res.error || `HTTP ${res.status}`;
                    if (this._fallback) {
                        await this._fallback.put(item.database, "_outbox", item.id, item).catch(() => {});
                    }
                }
            } catch (netErr) {
                hasError = true;
                item.lastError = String(netErr);
                if (this._fallback) {
                    await this._fallback.put(item.database, "_outbox", item.id, item).catch(() => {});
                }
            }
        }

        if (this._pendingItems.size === 0) {
            // Empty queue only after successful dequeue → server ACK.
            this.emitStatus("saved");
        } else if (hasConflict) {
            this.emitStatus("conflict");
        } else if (hasError) {
            this.emitStatus("error");
            this.scheduleNextProcess();
        } else {
            this.emitStatus("pending");
            this.scheduleNextProcess();
        }
    }

    dispose() {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = undefined;
        }
        if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
            window.removeEventListener("online", this.handleOnline);
        }
        this._dirtyKeys.clear();
        this._pendingItems.clear();
    }
}
