// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { AnthropicProvider } from "../src/llm/anthropic";
import { CompletionsProvider } from "../src/llm/completions";
import { ResponsesProvider } from "../src/llm/responses";
import { resolveBaseURL, sanitizeErrorMessage } from "../src/llm/urlUtils";

describe("resolveBaseURL", () => {
    test("preserves external absolute HTTPS URLs without trailing slash", () => {
        expect(resolveBaseURL("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
        expect(resolveBaseURL("https://api.openai.com/v1///")).toBe("https://api.openai.com/v1");
        expect(resolveBaseURL("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1");
    });

    test("preserves external absolute HTTP URLs", () => {
        expect(resolveBaseURL("http://localhost:3000/api/llm-proxy/openrouter/v1")).toBe(
            "http://localhost:3000/api/llm-proxy/openrouter/v1",
        );
    });

    test("resolves relative proxy path against window.location.origin in browser", () => {
        const originalWindow = globalThis.window;
        try {
            (globalThis as any).window = {
                location: { origin: "http://localhost:8080" },
            };

            const resolved = resolveBaseURL("/api/llm-proxy/openrouter/v1");
            expect(resolved).toBe("http://localhost:8080/api/llm-proxy/openrouter/v1");
        } finally {
            (globalThis as any).window = originalWindow;
        }
    });

    test("resolves relative path without leading slash cleanly", () => {
        const originalWindow = globalThis.window;
        try {
            (globalThis as any).window = {
                location: { origin: "http://136.66.95.155" },
            };

            const resolved = resolveBaseURL("api/llm-proxy/openai/v1");
            expect(resolved).toBe("http://136.66.95.155/api/llm-proxy/openai/v1");
        } finally {
            (globalThis as any).window = originalWindow;
        }
    });

    test("falls back to defaultURL when baseURL is undefined or empty", () => {
        expect(resolveBaseURL(undefined, "https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
        expect(resolveBaseURL("", "https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
    });

    test("falls back to baseOrigin when window is undefined", () => {
        const originalWindow = globalThis.window;
        try {
            delete (globalThis as any).window;
            const resolved = resolveBaseURL(
                "/api/llm-proxy/deepseek/v1",
                "https://api.openai.com/v1",
                "http://127.0.0.1:3000",
            );
            expect(resolved).toBe("http://127.0.0.1:3000/api/llm-proxy/deepseek/v1");
        } finally {
            (globalThis as any).window = originalWindow;
        }
    });
});

describe("sanitizeErrorMessage", () => {
    test("redacts explicit API key", () => {
        const key = "sk-test-secret-123456789";
        const err = `Failed to connect with key ${key} at endpoint`;
        expect(sanitizeErrorMessage(err, key)).toBe("Failed to connect with key [REDACTED] at endpoint");
    });

    test("redacts common provider key patterns even if not explicitly passed", () => {
        expect(sanitizeErrorMessage("Error with sk-ant-api03-abcdefghijklmnop12345")).toContain("[REDACTED]");
        expect(sanitizeErrorMessage("Failed with sk-proj-1234567890abcdefghijklmnop")).toContain(
            "[REDACTED]",
        );
        expect(sanitizeErrorMessage("Groq error gsk_abcdefghijklmnopqrstuvwxyz12345")).toContain(
            "[REDACTED]",
        );
        expect(sanitizeErrorMessage("Google error AIzaSyD1234567890abcdefghij")).toContain("[REDACTED]");
    });

    test("handles empty or null error messages safely", () => {
        expect(sanitizeErrorMessage("")).toBe("");
    });
});

describe("Provider initialization with relative proxy URL", () => {
    let originalWindow: unknown;

    beforeEach(() => {
        originalWindow = globalThis.window;
        (globalThis as any).window = {
            location: { origin: "http://localhost:8080" },
        };
    });

    afterEach(() => {
        (globalThis as any).window = originalWindow;
    });

    test("CompletionsProvider does not throw Invalid URL with relative baseURL", () => {
        expect(() => {
            new CompletionsProvider({
                provider: "completions",
                apiKey: "dummy-key",
                baseURL: "/api/llm-proxy/openrouter/v1",
                model: "anthropic/claude-3.7-sonnet",
            });
        }).not.toThrow();
    });

    test("ResponsesProvider does not throw Invalid URL with relative baseURL", () => {
        expect(() => {
            new ResponsesProvider({
                provider: "responses",
                apiKey: "dummy-key",
                baseURL: "/api/llm-proxy/openai/v1",
                model: "gpt-4o",
            });
        }).not.toThrow();
    });

    test("AnthropicProvider does not throw Invalid URL with relative baseURL", () => {
        expect(() => {
            new AnthropicProvider({
                provider: "anthropic",
                apiKey: "dummy-key",
                baseURL: "/api/llm-proxy/anthropic",
                model: "claude-3-7-sonnet-20250219",
            });
        }).not.toThrow();
    });
});
