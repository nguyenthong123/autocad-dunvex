// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IStorage, Logger } from "@chili3d/core";
import { IndexedDBStorage } from "./indexedDBStorage";

export interface CloudStorageOptions {
    baseUrl?: string;
    getAuthToken?: () => string | undefined;
    enableLocalFallback?: boolean;
}

export class ApiCloudStorage implements IStorage {
    private readonly _baseUrl: string;
    private readonly _getAuthToken?: () => string | undefined;
    private readonly _fallback?: IndexedDBStorage;

    constructor(options: CloudStorageOptions = {}) {
        this._baseUrl = (options.baseUrl ?? "/api/storage").replace(/\/+$/, "");
        this._getAuthToken = options.getAuthToken;
        if (options.enableLocalFallback !== false && typeof window !== "undefined" && window.indexedDB) {
            this._fallback = new IndexedDBStorage();
        }
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

    async createDBIfNeeded(database: string, tables: string[]): Promise<void> {
        if (this._fallback) {
            await this._fallback.createDBIfNeeded(database, tables);
        }
    }

    async get(database: string, table: string, id: string): Promise<any> {
        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        const localId = this.scopedId(id);
        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.headers(),
            });
            if (response.ok) {
                const data = await response.json();
                try {
                    await this._fallback?.put(database, table, localId, data);
                } catch {
                    // Fallback cache write ignored if store not yet ready
                }
                return data;
            }
            if (response.status === 404) {
                return undefined;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        } catch (err) {
            Logger.warn(`CloudStorage get failed, falling back to IndexedDB: ${String(err)}`);
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

        const url = `${this._baseUrl}/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
        try {
            const response = await fetch(url, {
                method: "PUT",
                headers: this.headers(),
                body: JSON.stringify(value),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return true;
        } catch (err) {
            Logger.error(`CloudStorage put failed (saved locally in IndexedDB): ${String(err)}`);
            return fallbackOk || this._fallback !== undefined;
        }
    }

    async delete(database: string, table: string, id: string): Promise<boolean> {
        const localId = this.scopedId(id);
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
