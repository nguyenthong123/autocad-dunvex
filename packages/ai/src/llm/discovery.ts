// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { getProviderById, guessVendorCandidates, type KnownVendor } from "./providerRegistry";
import { resolveBaseURL, sanitizeErrorMessage } from "./urlUtils";

export type ToolCallingCapability = "supported" | "unsupported" | "unverified";

export interface DiscoveredModel {
    id: string;
    name?: string;
    isDefault?: boolean;
    toolCapability: ToolCallingCapability;
    hasVision?: boolean;
    contextLength?: number;
    description?: string;
}

export interface DiscoveryResult {
    success: boolean;
    vendor?: KnownVendor;
    models: DiscoveredModel[];
    selectedModel?: string;
    error?: string;
}

export interface DiscoveryOptions {
    customFetch?: typeof fetch;
    preferredVendor?: string;
    baseURL?: string;
    signal?: AbortSignal;
}

const EXCLUDED_KEYWORDS = [
    "embedding",
    "embed",
    "tts",
    "whisper",
    "dall-e",
    "moderation",
    "realtime",
    "babbage",
    "davinci",
    "curie",
    "ada",
    "canary",
    "audio",
    "transcription",
    "speech",
];

function isChatModel(id: string): boolean {
    const lower = id.toLowerCase();
    for (const kw of EXCLUDED_KEYWORDS) {
        if (lower.includes(kw)) return false;
    }
    return true;
}

export function detectToolCapability(item: any): ToolCallingCapability {
    if (!item || typeof item !== "object") return "unverified";

    // 1. Array of supported_parameters (e.g. OpenRouter)
    if (Array.isArray(item.supported_parameters)) {
        const params = item.supported_parameters.map((p: any) => String(p).toLowerCase());
        const hasTools = params.some(
            (p: string) => p === "tools" || p === "tool_choice" || p === "functions",
        );
        return hasTools ? "supported" : "unsupported";
    }

    // 2. Capabilities object (e.g. 9router, unified proxy gateways)
    if (item.capabilities && typeof item.capabilities === "object") {
        if (typeof item.capabilities.tools === "boolean") {
            return item.capabilities.tools ? "supported" : "unsupported";
        }
        if (typeof item.capabilities.tool_choice === "boolean") {
            return item.capabilities.tool_choice ? "supported" : "unsupported";
        }
    }

    // Default: missing or ambiguous metadata -> unverified (Do NOT guess!)
    return "unverified";
}

export function detectVisionCapability(item: any): boolean {
    if (!item || typeof item !== "object") return false;
    if (typeof item.architecture?.modality === "string") {
        return item.architecture.modality.toLowerCase().includes("image");
    }
    if (Array.isArray(item.modalities)) {
        return item.modalities.some((m: any) => String(m).toLowerCase().includes("image"));
    }
    if (item.capabilities && typeof item.capabilities === "object") {
        if (item.capabilities.vision === true) return true;
    }
    if (
        typeof item.id === "string" &&
        (item.id.toLowerCase().includes("-vision") || item.id.toLowerCase().includes("vl"))
    ) {
        return true;
    }
    return false;
}

export function detectContextLength(item: any): number | undefined {
    if (!item || typeof item !== "object") return undefined;
    const len =
        item.context_length ?? item.context_window ?? item.max_context_length ?? item.max_context_tokens;
    if (typeof len === "number" && len > 0) return len;
    return undefined;
}

export function filterAndSortModels(rawModels: any[], vendor: KnownVendor): DiscoveredModel[] {
    const chatModels: DiscoveredModel[] = [];

    for (const item of rawModels) {
        if (!item || typeof item.id !== "string") continue;
        const id = item.id;
        if (!isChatModel(id)) continue;

        const displayName =
            typeof item.name === "string"
                ? item.name
                : typeof item.display_name === "string"
                  ? item.display_name
                  : typeof item.displayName === "string"
                    ? item.displayName
                    : undefined;

        const toolCapability = detectToolCapability(item);
        const hasVision = detectVisionCapability(item);
        const contextLength = detectContextLength(item);

        chatModels.push({
            id,
            name: displayName,
            isDefault: id === vendor.defaultModel,
            toolCapability,
            hasVision,
            contextLength,
            description: typeof item.description === "string" ? item.description : undefined,
        });
    }

    // Sort: default model first, then tool-supported models, then alphabetically by ID
    chatModels.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        if (a.toolCapability === "supported" && b.toolCapability !== "supported") return -1;
        if (b.toolCapability === "supported" && a.toolCapability !== "supported") return 1;
        return a.id.localeCompare(b.id);
    });

    // If default model wasn't returned by upstream API (e.g. alias), prepend it with unverified capability
    if (!chatModels.some((m) => m.id === vendor.defaultModel)) {
        chatModels.unshift({
            id: vendor.defaultModel,
            isDefault: true,
            toolCapability: "unverified",
        });
    }

    return chatModels;
}

/**
 * Automatically discovers provider and available models using the provided API key.
 * Queries /models on the candidate vendor(s) via proxy or specified baseURL.
 */
export async function discoverProvider(
    apiKey: string,
    options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
        return {
            success: false,
            models: [],
            error: "API key is required",
        };
    }

    const fetchFn = options.customFetch ?? globalThis.fetch;
    if (!fetchFn) {
        return {
            success: false,
            models: [],
            error: "fetch is not available",
        };
    }

    // Determine candidates to try
    let candidates: KnownVendor[] = [];
    if (options.preferredVendor) {
        const v = getProviderById(options.preferredVendor);
        if (v) candidates.push(v);
    }
    if (candidates.length === 0) {
        candidates = guessVendorCandidates(cleanKey);
    }

    let lastError: string | undefined;

    for (const vendor of candidates) {
        const baseURL = (options.baseURL ?? vendor.proxyBaseURL).replace(/\/+$/, "");
        const path = vendor.modelsPath.startsWith("/") ? vendor.modelsPath : `/${vendor.modelsPath}`;
        const targetUrl = `${baseURL}${path}`;

        const headers: Record<string, string> = {
            Accept: "application/json",
        };
        if (vendor.authHeaderType === "x-api-key") {
            headers["x-api-key"] = cleanKey;
            headers["anthropic-version"] = "2023-06-01";
        } else {
            headers["Authorization"] = `Bearer ${cleanKey}`;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            if (options.signal) {
                options.signal.addEventListener("abort", () => controller.abort(), { once: true });
            }

            const res = await fetchFn(targetUrl, {
                method: "GET",
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.status === 200) {
                const data = await res.json();
                const rawList = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
                const models = filterAndSortModels(rawList, vendor);
                return {
                    success: true,
                    vendor,
                    models,
                    selectedModel: vendor.defaultModel,
                };
            }

            if (res.status === 401 || res.status === 403) {
                lastError = `Unauthorized (${res.status})`;
                // Try next candidate if available
                continue;
            }

            lastError = `HTTP ${res.status}`;
        } catch (err: any) {
            const rawMsg = err?.message || String(err);
            lastError = sanitizeErrorMessage(rawMsg, cleanKey);
        }
    }

    return {
        success: false,
        models: [],
        error: lastError ?? "Could not connect to provider",
    };
}

export interface TestModelOptions {
    provider?: string;
    protocol?: string;
    baseURL?: string;
    apiKey: string;
    model?: string;
    modelId?: string;
    customFetch?: typeof fetch;
    signal?: AbortSignal;
}

export interface TestModelResult {
    success: boolean;
    latencyMs?: number;
    error?: string;
}

/**
 * Tests a single user-chosen model on demand with a minimal prompt.
 * Never runs automatically; warns user of potential token consumption.
 * Zero logging of API keys.
 */
export async function testSingleModel(options: TestModelOptions): Promise<TestModelResult> {
    const cleanKey = options.apiKey.trim();
    if (!cleanKey) {
        return { success: false, error: "API key is required" };
    }
    const cleanModel = (options.model ?? options.modelId ?? "").trim();
    if (!cleanModel) {
        return { success: false, error: "Model ID is required" };
    }

    const fetchFn = options.customFetch ?? globalThis.fetch;
    if (!fetchFn) {
        return { success: false, error: "fetch is not available" };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    if (options.signal) {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const provider = options.provider ?? options.protocol ?? "openai";

    try {
        if (provider === "anthropic") {
            const rawBase = resolveBaseURL(options.baseURL, "https://api.anthropic.com");
            const url = `${rawBase}/v1/messages`;
            const res = await fetchFn(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": cleanKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: cleanModel,
                    max_tokens: 5,
                    messages: [{ role: "user", content: "Ping" }],
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                return { success: true, latencyMs: Date.now() - start };
            }
            const errData = await res.json().catch(() => ({}));
            const msg = errData?.error?.message || `HTTP ${res.status}`;
            return { success: false, error: sanitizeErrorMessage(msg, cleanKey) };
        }

        // completions / responses (OpenAI-compatible)
        const defaultBase = "https://api.openai.com/v1";
        const rawBase = resolveBaseURL(options.baseURL, defaultBase);
        const url = `${rawBase}/chat/completions`;
        const res = await fetchFn(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cleanKey}`,
            },
            body: JSON.stringify({
                model: cleanModel,
                max_tokens: 5,
                messages: [{ role: "user", content: "Ping" }],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            return { success: true, latencyMs: Date.now() - start };
        }
        const errData = await res.json().catch(() => ({}));
        const msg =
            errData?.error?.message ||
            (typeof errData?.detail === "string" ? errData.detail : undefined) ||
            errData?.message ||
            `HTTP ${res.status}`;
        return { success: false, error: sanitizeErrorMessage(msg, cleanKey) };
    } catch (err: any) {
        clearTimeout(timeoutId);
        const rawMsg = err?.name === "AbortError" ? "Request timed out" : err?.message || String(err);
        return { success: false, error: sanitizeErrorMessage(rawMsg, cleanKey) };
    }
}
