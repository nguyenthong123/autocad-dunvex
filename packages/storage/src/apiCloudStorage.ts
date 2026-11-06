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
    private readonly _versionCache = new Map<string, number>();

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

    async getVersion(database: string, scopedId: string): Promise<number | undefined> {
        if (this._versionCache.has(scopedId)) {
            return this._versionCache.get(scopedId);
        }
        if (this._fallback) {
            try {
                const rec = await this._fallback.get(database, "_versions", scopedId);
                if (rec && typeof rec.version === "number") {
                    this._versionCache.set(scopedId, rec.version);
                    return rec.version;
                }
            } catch {
                // Ignore fallback error
            }
        }
        return undefined;
    }

    async setVersion(database: string, scopedId: string, version: number): Promise<void> {
        this._versionCache.set(scopedId, version);
        if (this._fallback) {
            try {
                await this._fallback.put(database, "_versions", scopedId, {
                    id: scopedId,
                    version,
                    updatedAt: Date.now(),
                });
            } catch {
                // Ignore fallback error
            }
        }
    }

    async removeVersion(database: string, scopedId: string): Promise<void> {
        this._versionCache.delete(scopedId);
        if (this._fallback) {
            try {
                await this._fallback.delete(database, "_versions", scopedId);
            } catch {
                // Ignore fallback error
            }
        }
    }

    private handleUnauthorized(): void {
        try {
            PubSub.default.pub("authSessionInvalid", "expired");
        } catch {
            // PubSub may be absent in headless tests
        }
    }

    private async sendToServer(
        item: OutboxItem,
    ): Promise<{ ok: boolean; status?: number; error?: string; version?: number; currentVersion?: number }> {
        const url = `${this._baseUrl}/${encodeURIComponent(item.database)}/${encodeURIComponent(item.table)}/${encodeURIComponent(item.recordId)}`;
        try {
            const payload = {
                ...item.value,
                ...(item.baseVersion !== undefined ? { baseVersion: item.baseVersion } : {}),
            };
            const response = await fetch(url, {
                method: "PUT",
                headers: this.headers(),
                body: JSON.stringify(payload),
            });
            if (response.ok) {
                const resData = await response.json().catch(() => ({}));
                if (typeof resData?.version === "number") {
                    await this.setVersion(item.database, item.scopedId, resData.version);
                }
                return { ok: true, status: response.status, version: resData?.version };
            }
            if (response.status === 401) {
                this.handleUnauthorized();
                return { ok: false, status: 401, error: "UNAUTHORIZED" };
            }
            if (response.status === 409) {
                const errData = await response.json().catch(() => ({}));
                return {
                    ok: false,
                    status: 409,
                    error: errData?.error || "VERSION_CONFLICT",
                    currentVersion: errData?.currentVersion ?? errData?.version,
                };
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
            const allTables = Array.from(new Set([...tables, "_outbox", "_versions"]));
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
                if (typeof data?.serverVersion === "number") {
                    await this.setVersion(database, localId, data.serverVersion);
                }
                // Loại bỏ serverVersion và serverUpdatedAt khỏi data trước khi cache và trả về
                if (data && typeof data === "object") {
                    delete data.serverVersion;
                    delete data.serverUpdatedAt;
                }

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
            if (response.status === 401) {
                this.handleUnauthorized();
                throw new Error("HTTP 401: Unauthorized");
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
        const localId = this.scopedId(id);
        const cleanValue = { ...value };
        delete cleanValue.serverVersion;
        delete cleanValue.serverUpdatedAt;

        let fallbackOk = false;
        if (this._fallback) {
            try {
                await this._fallback.put(database, table, localId, cleanValue);
                fallbackOk = true;
            } catch {
                fallbackOk = false;
            }
        }

        const key = this._outbox.makeKey(database, table, localId);
        // Bỏ mặc định ?? 1 và docVersion - 1
        const baseVersion =
            typeof value?.baseVersion === "number"
                ? value.baseVersion
                : await this.getVersion(database, localId);

        await this._outbox.enqueue({
            id: key,
            database,
            table,
            recordId: id,
            scopedId: localId,
            value: cleanValue,
            baseVersion,
            updatedAt: Date.now(),
            attempts: 0,
        });

        return fallbackOk || this._fallback !== undefined;
    }

    async resolveConflictSaveCopy(key: string, newName?: string): Promise<string | undefined> {
        const item = this._outbox.getItem(key);
        if (!item) return undefined;
        const oldId = item.recordId;
        const newId = `${oldId}_copy_${Date.now()}`;
        const docName = item.value?.name || "Bản vẽ";
        const copyName = newName ?? `${docName} (Bản sao xung đột)`;
        const copyData = {
            ...item.value,
            id: newId,
            name: copyName,
        };
        await this.put(item.database, item.table, newId, copyData);
        await this._outbox.resolveConflictDiscard(key);
        return newId;
    }

    async delete(database: string, table: string, id: string): Promise<boolean> {
        const localId = this.scopedId(id);
        await this._outbox.dequeue(database, table, localId);
        await this.removeVersion(database, localId);

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
            if (response.status === 401) {
                this.handleUnauthorized();
                throw new Error("HTTP 401: Unauthorized");
            }
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
