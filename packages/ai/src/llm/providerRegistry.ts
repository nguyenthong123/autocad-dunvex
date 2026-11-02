// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export interface KnownVendor {
    id: string;
    name: string;
    protocol: "anthropic" | "completions" | "responses";
    proxyBaseURL: string;
    directBaseURL: string;
    modelsPath: string;
    corsDirect: boolean;
    docsUrl: string;
    verifiedDate: string;
    defaultModel: string;
    keyPrefixes: string[];
    authHeaderType: "x-api-key" | "bearer";
}

export type KnownVendorId = "anthropic" | "openai" | "deepseek" | "google" | "groq" | "openrouter";

export const KNOWN_VENDORS: Record<KnownVendorId, KnownVendor> = {
    anthropic: {
        id: "anthropic",
        name: "Anthropic",
        protocol: "anthropic",
        proxyBaseURL: "/api/llm-proxy/anthropic",
        directBaseURL: "https://api.anthropic.com",
        modelsPath: "/v1/models",
        corsDirect: false,
        docsUrl: "https://console.anthropic.com/",
        verifiedDate: "2026-03-24",
        defaultModel: "claude-3-7-sonnet-20250219",
        keyPrefixes: ["sk-ant-"],
        authHeaderType: "x-api-key",
    },
    openai: {
        id: "openai",
        name: "OpenAI",
        protocol: "responses",
        proxyBaseURL: "/api/llm-proxy/openai/v1",
        directBaseURL: "https://api.openai.com/v1",
        modelsPath: "/models",
        corsDirect: false,
        docsUrl: "https://platform.openai.com/",
        verifiedDate: "2026-03-24",
        defaultModel: "gpt-4o",
        keyPrefixes: ["sk-proj-"],
        authHeaderType: "bearer",
    },
    deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        protocol: "completions",
        proxyBaseURL: "/api/llm-proxy/deepseek/v1",
        directBaseURL: "https://api.deepseek.com/v1",
        modelsPath: "/models",
        corsDirect: false,
        docsUrl: "https://platform.deepseek.com/",
        verifiedDate: "2026-03-24",
        defaultModel: "deepseek-chat",
        keyPrefixes: ["sk-"],
        authHeaderType: "bearer",
    },
    google: {
        id: "google",
        name: "Google Gemini",
        protocol: "completions",
        proxyBaseURL: "/api/llm-proxy/google",
        directBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        modelsPath: "/models",
        corsDirect: false,
        docsUrl: "https://aistudio.google.com/",
        verifiedDate: "2026-03-24",
        defaultModel: "gemini-2.0-flash",
        keyPrefixes: ["AIza"],
        authHeaderType: "bearer",
    },
    groq: {
        id: "groq",
        name: "Groq",
        protocol: "completions",
        proxyBaseURL: "/api/llm-proxy/groq/v1",
        directBaseURL: "https://api.groq.com/openai/v1",
        modelsPath: "/models",
        corsDirect: false,
        docsUrl: "https://console.groq.com/",
        verifiedDate: "2026-03-24",
        defaultModel: "llama-3.3-70b-versatile",
        keyPrefixes: ["gsk_"],
        authHeaderType: "bearer",
    },
    openrouter: {
        id: "openrouter",
        name: "OpenRouter",
        protocol: "completions",
        proxyBaseURL: "/api/llm-proxy/openrouter/v1",
        directBaseURL: "https://openrouter.ai/api/v1",
        modelsPath: "/models",
        corsDirect: true,
        docsUrl: "https://openrouter.ai/",
        verifiedDate: "2026-03-24",
        defaultModel: "anthropic/claude-3.7-sonnet",
        keyPrefixes: ["sk-or-v1-"],
        authHeaderType: "bearer",
    },
};

export function getProviderById(id: string): KnownVendor | undefined {
    return (KNOWN_VENDORS as Record<string, KnownVendor>)[id];
}

export function findProviderByHint(hint: string): KnownVendor | undefined {
    const lower = hint.toLowerCase();
    for (const v of Object.values(KNOWN_VENDORS)) {
        if (
            v.id === lower ||
            v.name.toLowerCase() === lower ||
            v.proxyBaseURL === hint ||
            v.directBaseURL === hint
        ) {
            return v;
        }
    }
    return undefined;
}

/**
 * Guess which vendor(s) an API key might belong to based on known prefixes.
 * Returns ordered array of vendor candidates to try.
 */
export function guessVendorCandidates(apiKey: string): KnownVendor[] {
    const key = apiKey.trim();
    if (!key) return [];

    if (key.startsWith("sk-ant-")) {
        return [KNOWN_VENDORS.anthropic];
    }
    if (key.startsWith("sk-or-v1-")) {
        return [KNOWN_VENDORS.openrouter];
    }
    if (key.startsWith("gsk_")) {
        return [KNOWN_VENDORS.groq];
    }
    if (key.startsWith("AIza")) {
        return [KNOWN_VENDORS.google];
    }
    if (key.startsWith("sk-proj-")) {
        return [KNOWN_VENDORS.openai];
    }
    if (key.startsWith("sk-")) {
        // OpenAI or DeepSeek or other OpenAI-compatible
        return [KNOWN_VENDORS.openai, KNOWN_VENDORS.deepseek];
    }

    // Unrecognized prefix: fallback to trying all vendors in priority order
    return Object.values(KNOWN_VENDORS);
}
