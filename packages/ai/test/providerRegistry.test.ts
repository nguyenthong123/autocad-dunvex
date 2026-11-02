// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    findProviderByHint,
    getProviderById,
    guessVendorCandidates,
    KNOWN_VENDORS,
} from "../src/llm/providerRegistry";

describe("providerRegistry", () => {
    test("has 6 verified vendors with complete metadata", () => {
        const expectedVendors = ["anthropic", "openai", "deepseek", "google", "groq", "openrouter"];
        for (const id of expectedVendors) {
            const v = getProviderById(id);
            expect(v).toBeDefined();
            expect(v?.id).toBe(id);
            expect(v?.proxyBaseURL.startsWith("/api/llm-proxy/")).toBe(true);
            expect(v?.directBaseURL.startsWith("https://")).toBe(true);
            expect(v?.docsUrl.startsWith("https://")).toBe(true);
            expect(typeof v?.corsDirect).toBe("boolean");
            expect(typeof v?.defaultModel).toBe("string");
            expect(v?.defaultModel.length).toBeGreaterThan(0);
        }
    });

    test("guessVendorCandidates correctly identifies key prefixes", () => {
        // Anthropic
        const ant = guessVendorCandidates("sk-ant-api03-abcdef12345");
        expect(ant).toHaveLength(1);
        expect(ant[0].id).toBe("anthropic");

        // OpenAI project key
        const oai = guessVendorCandidates("sk-proj-1234567890abcdef");
        expect(oai).toHaveLength(1);
        expect(oai[0].id).toBe("openai");

        // Generic sk- key (tries OpenAI then DeepSeek)
        const gen = guessVendorCandidates("sk-generic-key-here");
        expect(gen.map((v) => v.id)).toEqual(["openai", "deepseek"]);

        // OpenRouter
        const or = guessVendorCandidates("sk-or-v1-abcdef");
        expect(or).toHaveLength(1);
        expect(or[0].id).toBe("openrouter");

        // Groq
        const groq = guessVendorCandidates("gsk_123456abcdef");
        expect(groq).toHaveLength(1);
        expect(groq[0].id).toBe("groq");

        // Google Gemini
        const gem = guessVendorCandidates("AIzaSyD-123456789abcdef");
        expect(gem).toHaveLength(1);
        expect(gem[0].id).toBe("google");

        // Empty key
        expect(guessVendorCandidates("")).toEqual([]);

        // Unknown prefix falls back to all known vendors
        const unknown = guessVendorCandidates("unknown_prefix_xyz");
        expect(unknown.length).toBe(Object.keys(KNOWN_VENDORS).length);
    });

    test("findProviderByHint matches by ID, Name or BaseURL", () => {
        expect(findProviderByHint("anthropic")?.id).toBe("anthropic");
        expect(findProviderByHint("Anthropic")?.id).toBe("anthropic");
        expect(findProviderByHint("https://api.openai.com/v1")?.id).toBe("openai");
        expect(findProviderByHint("/api/llm-proxy/groq/v1")?.id).toBe("groq");
        expect(findProviderByHint("nonexistent")).toBeUndefined();
    });
});
