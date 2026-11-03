// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    detectContextLength,
    detectToolCapability,
    detectVisionCapability,
    discoverProvider,
    filterAndSortModels,
    testSingleModel,
} from "../src/llm/discovery";
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

    test("discoverProvider discovers NVIDIA NIM with nvapi- key, bearer auth and completions protocol", async () => {
        let calledUrl = "";
        let calledHeaders: any = {};

        const mockFetch = async (url: string, init: any) => {
            calledUrl = url;
            calledHeaders = init.headers;
            return {
                status: 200,
                json: async () => ({
                    object: "list",
                    data: [
                        {
                            id: "meta/llama-3.3-70b-instruct",
                            object: "model",
                            capabilities: { tools: true },
                        },
                        {
                            id: "nvidia/llama-3.1-nemotron-70b-instruct",
                            object: "model",
                            capabilities: { tools: true },
                        },
                    ],
                }),
            };
        };

        const result = await discoverProvider("nvapi-test-nvidia-key-12345", {
            customFetch: mockFetch as any,
        });

        expect(result.success).toBe(true);
        expect(result.vendor?.id).toBe("nvidia");
        expect(result.vendor?.protocol).toBe("completions");
        expect(calledUrl).toBe("/api/llm-proxy/nvidia/v1/models");
        expect(calledHeaders["Authorization"]).toBe("Bearer nvapi-test-nvidia-key-12345");
        expect(result.models.length).toBe(2);
        expect(result.models[0].id).toBe("meta/llama-3.3-70b-instruct");
        expect(result.models[0].toolCapability).toBe("supported");
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

    describe("capability detection", () => {
        test("detectToolCapability correctly identifies supported, unsupported, and unverified", () => {
            // Supported via supported_parameters
            expect(detectToolCapability({ id: "m1", supported_parameters: ["tools", "temperature"] })).toBe(
                "supported",
            );
            expect(detectToolCapability({ id: "m2", supported_parameters: ["tool_choice"] })).toBe(
                "supported",
            );
            expect(detectToolCapability({ id: "m3", supported_parameters: ["functions"] })).toBe("supported");

            // Supported via capabilities object
            expect(detectToolCapability({ id: "m4", capabilities: { tools: true } })).toBe("supported");

            // Explicitly unsupported
            expect(detectToolCapability({ id: "m5", capabilities: { tools: false } })).toBe("unsupported");
            expect(detectToolCapability({ id: "m6", supported_parameters: ["temperature", "top_p"] })).toBe(
                "unsupported",
            );

            // Missing metadata -> strictly "unverified" (do not guess)
            expect(detectToolCapability({ id: "m7" })).toBe("unverified");
            expect(detectToolCapability({ id: "m8", capabilities: {} })).toBe("unverified");
        });

        test("detectVisionCapability detects modalities and architecture", () => {
            expect(detectVisionCapability({ id: "m1", architecture: { modality: "text+image->text" } })).toBe(
                true,
            );
            expect(detectVisionCapability({ id: "m2", modalities: ["text", "image"] })).toBe(true);
            expect(detectVisionCapability({ id: "m3-vision" })).toBe(true);
            expect(detectVisionCapability({ id: "m4-text-only" })).toBe(false);
        });

        test("detectContextLength parses context_length and max_context_tokens", () => {
            expect(detectContextLength({ id: "m1", context_length: 128000 })).toBe(128000);
            expect(detectContextLength({ id: "m2", max_context_tokens: 64000 })).toBe(64000);
            expect(detectContextLength({ id: "m3" })).toBeUndefined();
        });
    });

    describe("testSingleModel", () => {
        test("testSingleModel reports success and latency on valid completions response", async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = rs.fn(async () => {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        choices: [{ message: { content: "Pong" } }],
                    }),
                } as any;
            });

            try {
                const result = await testSingleModel({
                    apiKey: "sk-test-secret-12345",
                    modelId: "gpt-4o",
                    protocol: "openai",
                    baseURL: "https://api.openai.com/v1",
                });

                expect(result.success).toBe(true);
                expect(typeof result.latencyMs).toBe("number");
                expect(result.latencyMs).toBeGreaterThanOrEqual(0);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        test("testSingleModel sanitizes errors and never leaks API key", async () => {
            const secret = "sk-super-secret-user-key-999";
            const originalFetch = globalThis.fetch;
            globalThis.fetch = rs.fn(async () => {
                return {
                    ok: false,
                    status: 401,
                    json: async () => ({
                        error: { message: `Unauthorized request with key ${secret}` },
                    }),
                } as any;
            });

            try {
                const result = await testSingleModel({
                    apiKey: secret,
                    modelId: "claude-3-5-sonnet",
                    protocol: "anthropic",
                    baseURL: "https://api.anthropic.com",
                });

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
                expect(result.error).not.toContain(secret);
                expect(result.error).toContain("[REDACTED]");
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
