// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { discoverProvider, filterAndSortModels } from "../src/llm/discovery";
import { KNOWN_VENDORS } from "../src/llm/providerRegistry";

describe("discovery", () => {
    test("filterAndSortModels filters non-chat models and prioritizes defaultModel", () => {
        const vendor = KNOWN_VENDORS.openai;
        const rawList = [
            { id: "text-embedding-3-small" },
            { id: "whisper-1" },
            { id: "dall-e-3" },
            { id: "gpt-4o-mini" },
            { id: "gpt-4o" },
            { id: "tts-1-hd" },
        ];

        const filtered = filterAndSortModels(rawList, vendor);
        expect(filtered.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini"]);
        expect(filtered[0].isDefault).toBe(true);
    });

    test("filterAndSortModels adds defaultModel if missing from upstream list", () => {
        const vendor = KNOWN_VENDORS.groq;
        const rawList = [{ id: "llama-3.1-8b-instant" }];

        const filtered = filterAndSortModels(rawList, vendor);
        expect(filtered[0].id).toBe("llama-3.3-70b-versatile");
        expect(filtered[0].isDefault).toBe(true);
        expect(filtered[1].id).toBe("llama-3.1-8b-instant");
    });

    test("discoverProvider handles empty API key without calling fetch", async () => {
        const mockFetch = rs.fn();
        const result = await discoverProvider("", { customFetch: mockFetch as any });
        expect(result.success).toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test("discoverProvider discovers Anthropic with x-api-key header and proxy URL", async () => {
        let calledUrl = "";
        let calledHeaders: any = {};

        const mockFetch = async (url: string, init: any) => {
            calledUrl = url;
            calledHeaders = init.headers;
            return {
                status: 200,
                json: async () => ({
                    data: [
                        { id: "claude-3-7-sonnet-20250219", display_name: "Claude 3.7 Sonnet" },
                        { id: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" },
                    ],
                }),
            };
        };

        const result = await discoverProvider("sk-ant-api03-testkey", {
            customFetch: mockFetch as any,
        });

        expect(result.success).toBe(true);
        expect(result.vendor?.id).toBe("anthropic");
        expect(calledUrl).toBe("/api/llm-proxy/anthropic/v1/models");
        expect(calledHeaders["x-api-key"]).toBe("sk-ant-api03-testkey");
        expect(calledHeaders["anthropic-version"]).toBe("2023-06-01");
        expect(result.models.length).toBe(2);
        expect(result.models[0].id).toBe("claude-3-7-sonnet-20250219");
    });

    test("discoverProvider falls back to next candidate on 401", async () => {
        const attempts: string[] = [];

        const mockFetch = async (url: string, init: any) => {
            attempts.push(url);
            if (url.includes("/api/llm-proxy/openai")) {
                return { status: 401, json: async () => ({ error: "Invalid key" }) };
            }
            if (url.includes("/api/llm-proxy/deepseek")) {
                return {
                    status: 200,
                    json: async () => ({
                        data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
                    }),
                };
            }
            return { status: 404, json: async () => ({}) };
        };

        // Generic sk- key tries OpenAI then DeepSeek
        const result = await discoverProvider("sk-fake-deepseek-key", {
            customFetch: mockFetch as any,
        });

        expect(result.success).toBe(true);
        expect(result.vendor?.id).toBe("deepseek");
        expect(attempts).toEqual(["/api/llm-proxy/openai/v1/models", "/api/llm-proxy/deepseek/v1/models"]);
    });

    test("discoverProvider redacts secret key in error messages", async () => {
        const secretKey = "sk-ant-SUPERSECRET-KEY";
        const mockFetch = async () => {
            throw new Error(`Failed to connect with key ${secretKey} at upstream`);
        };

        const result = await discoverProvider(secretKey, {
            customFetch: mockFetch as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).not.toContain(secretKey);
        expect(result.error).toContain("[REDACTED]");
    });
});
