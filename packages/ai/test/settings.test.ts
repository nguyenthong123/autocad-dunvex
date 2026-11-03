// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { ObjectStorage } from "@chili3d/core";
import { mockLocalStorage } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import {
    deleteRemoteCredential,
    fetchRemoteSettings,
    hasRememberedVaultKey,
    loadConfig,
    saveConfig,
    saveRemoteSettings,
    setRememberedVaultKey,
} from "../src/settings";

describe("ai settings", () => {
    beforeEach(() => {
        mockLocalStorage();
    });

    test("keeps the api key in session memory and out of persistent storage", () => {
        saveConfig({ provider: "anthropic", apiKey: "sk-secret", model: "m" });

        const raw = localStorage.getItem("chili3d.app.ai.config");
        expect(raw).not.toBeNull();
        expect(raw).not.toContain("sk-secret");
        expect(JSON.parse(raw as string).apiKey).toBeUndefined();

        const loaded = loadConfig();
        expect(loaded?.apiKey).toBe("sk-secret");
        expect(loaded?.provider).toBe("anthropic");
        expect(loaded?.model).toBe("m");
    });

    test("keeps the thinking depth the user chose, and leaves it out when they did not", () => {
        saveConfig({ provider: "anthropic", apiKey: "k", model: "m", reasoningEffort: "low" });
        expect(loadConfig()?.reasoningEffort).toBe("low");

        // Unset is not "medium": nothing is sent, and the endpoint's own default stands.
        saveConfig({ provider: "anthropic", apiKey: "k", model: "m" });
        expect(loadConfig()?.reasoningEffort).toBeUndefined();
    });

    test("migrates a plaintext key persisted by older versions into session memory", () => {
        ObjectStorage.default.setValue("ai.config", {
            provider: "openai-compatible",
            baseURL: "https://example.com/v1",
            apiKey: "old-key",
            model: "gpt",
        });

        const loaded = loadConfig();
        expect(loaded?.apiKey).toBe("old-key");
        expect(loaded?.baseURL).toBe("https://example.com/v1");

        const raw = localStorage.getItem("chili3d.app.ai.config");
        expect(raw).not.toBeNull();
        expect(raw).not.toContain("old-key");
    });

    test("returns undefined when nothing is stored", () => {
        expect(loadConfig()).toBeUndefined();
    });

    describe("remote settings & vault restoration flow", () => {
        beforeEach(() => {
            setRememberedVaultKey(false);
        });

        afterEach(() => {
            rs.unstubAllGlobals();
        });

        test("fetchRemoteSettings returns null when user is not logged in", async () => {
            localStorage.removeItem("dunvex_auth_token");
            const res = await fetchRemoteSettings();
            expect(res).toBeNull();
            expect(hasRememberedVaultKey()).toBe(false);
        });

        test("fetchRemoteSettings restores remote settings and sets hasRememberedVaultKey", async () => {
            localStorage.setItem("dunvex_auth_token", "mock.jwt.token");

            const mockFetch = rs.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe("/api/ai/settings");
                expect(init?.headers).toEqual({ Authorization: "Bearer mock.jwt.token" });
                return {
                    ok: true,
                    json: async () => ({
                        settings: {
                            provider: "nvidia",
                            model: "meta/llama-3.3-70b-instruct",
                            baseURL: "/api/llm-proxy/nvidia",
                            reasoningEffort: "medium",
                            contextWindow: 128000,
                        },
                        rememberedVendors: ["nvidia"],
                        encryptionAvailable: true,
                    }),
                };
            });
            rs.stubGlobal("fetch", mockFetch);

            const res = await fetchRemoteSettings();
            expect(res).not.toBeNull();
            expect(res?.rememberedVendors).toEqual(["nvidia"]);
            expect(hasRememberedVaultKey()).toBe(true);

            // Verify configuration was merged and saved locally
            const cfg = loadConfig();
            expect(cfg?.provider).toBe("nvidia");
            expect(cfg?.model).toBe("meta/llama-3.3-70b-instruct");
            expect(cfg?.baseURL).toBe("/api/llm-proxy/nvidia");
            expect(cfg?.reasoningEffort).toBe("medium");
            // API key is never stored in persistent local storage
            const raw = localStorage.getItem("chili3d.app.ai.config");
            expect(raw).not.toBeNull();
            expect(JSON.parse(raw as string).apiKey).toBeUndefined();
        });

        test("saveRemoteSettings sends PUT /api/ai/settings with encrypted vault flag", async () => {
            localStorage.setItem("dunvex_auth_token", "mock.jwt.token");

            let capturedBody: any = null;
            const mockFetch = rs.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe("/api/ai/settings");
                expect(init?.method).toBe("PUT");
                capturedBody = JSON.parse(init?.body as string);
                return {
                    ok: true,
                    json: async () => ({ ok: true, hasRememberedKey: true }),
                };
            });
            rs.stubGlobal("fetch", mockFetch);

            const res = await saveRemoteSettings(
                {
                    provider: "nvidia" as any,
                    model: "meta/llama-3.3-70b-instruct",
                    baseURL: "/api/llm-proxy/nvidia",
                    apiKey: "nvapi-secret-key-12345",
                },
                true,
                "nvidia",
            );

            expect(res.ok).toBe(true);
            expect(capturedBody.rememberKey).toBe(true);
            expect(capturedBody.vendor).toBe("nvidia");
            expect(capturedBody.apiKey).toBe("nvapi-secret-key-12345");
            expect(hasRememberedVaultKey()).toBe(true);
        });

        test("deleteRemoteCredential sends DELETE to /api/ai/credentials", async () => {
            localStorage.setItem("dunvex_auth_token", "mock.jwt.token");

            const mockFetch = rs.fn(async (url: string, init?: RequestInit) => {
                expect(url).toBe("/api/ai/credentials?vendor=nvidia");
                expect(init?.method).toBe("DELETE");
                return {
                    ok: true,
                    json: async () => ({ ok: true }),
                };
            });
            rs.stubGlobal("fetch", mockFetch);

            const ok = await deleteRemoteCredential("nvidia");
            expect(ok).toBe(true);
        });
    });
});
