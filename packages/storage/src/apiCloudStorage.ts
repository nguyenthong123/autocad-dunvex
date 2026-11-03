// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IStorage, Logger, PubSub } from "@chili3d/core";
import { IndexedDBStorage } from "./indexedDBStorage";
import { type OutboxItem, OutboxManager, type SyncStatus } from "./outbox";

export interface CloudStorageOptions {
    baseUrl?: string;
    getAuthToken?: () => string | undefined;
    enableLocalFallback?: boolean;
    onStatusChange?: (status: SyncStatus, pendingCount: number) => void;
}

export class ApiCloudStorage implements IStorage {
    private readonly _baseUrl: string;
    private readonly _getAuthToken?: () => string | undefined;
    private readonly _fallback?: IndexedDBStorage;
    private readonly _outbox: OutboxManager;

    constructor(options: CloudStorageOptions = {}) {
        this._baseUrl = (options.baseUrl ?? "/api/storage").replace(/\/+$/, "");
        this._getAuthToken = options.getAuthToken;
        if (options.enableLocalFallback !== false && typeof window !== "undefined" && window.indexedDB) {
            this._fallback = new IndexedDBStorage();
        }

        this._outbox = new OutboxManager({
            fallback: this._fallback,
            sendFn: (item) => this.sendToServer(item),
            onStatusChange: (status, count) => {
                options.onStatusChange?.(status, count);
                try {
                    PubSub.default.pub("syncStatusChanged", status, count);
                } catch {
                    // PubSub might not be wired in headless tests
                }
            },
        });
    }

    get outbox(): OutboxManager {
        return this._outbox;
    }

    getPendingSyncCount(): number {
        return this._outbox.getPendingCount();
    }

    async isDirty(database: string, table: string, id: string): Promise<boolean> {
        return this._outbox.isDirty(database, table, this.scopedId(id));
    }

    async flushOutbox(): Promise<void> {
        await this._outbox.processQueue(true);
    }

    private getUserId(): string | undefined {
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                const raw = localStorage.getItem("dunvex_auth_user");
                if (raw) {
                    const u = JSON.parse(raw);
                    if (u?.id) return String(u.id);
                }
            }
        } catch {}
        return undefined;
    }

    private scopedId(id: string): string {
        const uid = this.getUserId();
        return uid ? `${uid}:${id}` : id;
    }

    private headers(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        let token = this._getAuthToken?.();
        if (!token && typeof window !== "undefined" && window.localStorage) {
            token = localStorage.getItem("dunvex_auth_token") || undefined;
        }
        if (token) {
            // biome-ignore lint/complexity/useLiteralKeys: required by noPropertyAccessFromIndexSignature
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    }

    private async readLocal(database: string, table: string, localId: string, id: string): Promise<any> {
        try {
            let res = await this._fallback?.get(database, table, localId);
            if (res === undefined && localId !== id) {
                res = await this._fallback?.get(database, table, id);
            }
            return res;
        } catch {
            return undefined;
        }
    }

    private async sendToServer(
        item: OutboxItem,
    ): Promise<{ ok: boolean; status?: number; error?: string; version?: number }> {
        const url = `${this._baseUrl}/${encodeURIComponent(item.database)}/${encodeURIComponent(item.table)}/${encodeURIComponent(item.recordId)}`;
        try {
            const response = await fetch(url, {
                method: "PUT",
                headers: this.headers(),
                body: JSON.stringify(item.value),
            });
            if (response.ok) {
                const resData = await response.json().catch(() => ({}));
                return { ok: true, status: response.status, version: resData?.version };
            }
            if (response.status === 409) {
                const errData = await response.json().catch(() => ({}));
                return { ok: false, status: 409, error: errData?.error || "VERSION_CONFLICT" };
            }
            return {
                ok: false,
                status: response.status,
                error: `HTTP ${response.status}: ${response.statusText}`,
            };
        } catch (err) {
            return { ok: false, error: String(err) };
        }
    }

    async createDBIfNeeded(database: string, tables: string[]): Promise<void> {
        if (this._fallback) {
            const allTables = Array.from(new Set([...tables, "_outbox"]));
            await this._fallback.createDBIfNeeded(database, allTables);
            await this._outbox.init(database);
        }
    }

    async get(database: string, table: string, id: string): Promise<any> {
        const localId = this.scopedId(id);
        const isDirty = await this._outbox.isDirty(database, table, localId);

        // If local copy is dirty (has unpushed edits), NEVER allow server to overwrite it!
        if (isDirty) {
            Logger.info(
                `Local data for ${table}/${id} is marked dirty; prioritizing local copy to prevent data loss`,
            );
            const localData = await this.readLocal(database, table, localId, id);
            if (localData !== undefined) {
                return localData;
            }
        }

        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.headers(),
            });
            if (response.ok) {
                const data = await response.json();
                const stillDirty = await this._outbox.isDirty(database, table, localId);
                if (!stillDirty) {
                    try {
                        await this._fallback?.put(database, table, localId, data);
                    } catch {
                        // Fallback cache write ignored if store not yet ready
                    }
                }
                return data;
            }
            if (response.status === 404) {
                return undefined;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        } catch (err) {
            Logger.warn(`CloudStorage get failed, falling back to IndexedDB: ${String(err)}`);
            return this.readLocal(database, table, localId, id);
        }
    }

    async put(database: string, table: string, id: string, value: any): Promise<boolean> {
        let fallbackOk = false;
        const localId = this.scopedId(id);
        if (this._fallback) {
            try {
                await this._fallback.put(database, table, localId, value);
                fallbackOk = true;
            } catch {
                fallbackOk = false;
            }
        }

        const key = this._outbox.makeKey(database, table, localId);
        const baseVersion =
            typeof value?.docVersion === "number" ? value.docVersion - 1 : (value?.baseVersion ?? 1);
        await this._outbox.enqueue({
            id: key,
            database,
            table,
            recordId: id,
            scopedId: localId,
            value,
            baseVersion,
            updatedAt: Date.now(),
            attempts: 0,
        });

        return fallbackOk || this._fallback !== undefined;
    }

    async delete(database: string, table: string, id: string): Promise<boolean> {
        const localId = this.scopedId(id);
        await this._outbox.dequeue(database, table, localId);

        if (this._fallback) {
            try {
                await this._fallback.delete(database, table, localId);
            } catch {
                // Ignore fallback error
            }
        }

        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        try {
            const response = await fetch(url, {
                method: "DELETE",
                headers: this.headers(),
            });
            return response.ok;
        } catch (err) {
            Logger.warn(`CloudStorage delete failed: ${String(err)}`);
            return false;
        }
    }

    async page(database: string, table: string, page: number): Promise<any[]> {
        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}?page=${page}&count=20`;
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.headers(),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const items = (await response.json()) as any[];
            return items;
        } catch (err) {
            Logger.warn(`CloudStorage page failed, falling back to IndexedDB: ${String(err)}`);
            const fallbackItems = (await this._fallback?.page(database, table, page)) ?? [];
            const uid = this.getUserId();
            if (uid) {
                const prefix = `${uid}:`;
                return fallbackItems
                    .filter((item: any) => typeof item?.id === "string" && item.id.startsWith(prefix))
                    .map((item: any) => ({
                        ...item,
                        id: item.id.slice(prefix.length),
                    }));
            }
            return fallbackItems.filter(
                (item: any) => typeof item?.id !== "string" || !item.id.includes(":"),
            );
        }
    }
}
