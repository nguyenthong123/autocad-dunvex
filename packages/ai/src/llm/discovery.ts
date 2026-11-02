// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { getProviderById, guessVendorCandidates, type KnownVendor } from "./providerRegistry";

export interface DiscoveredModel {
    id: string;
    name?: string;
    isDefault?: boolean;
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

export function filterAndSortModels(rawModels: any[], vendor: KnownVendor): DiscoveredModel[] {
    const chatModels: DiscoveredModel[] = [];

    for (const item of rawModels) {
        if (!item || typeof item.id !== "string") continue;
        const id = item.id;
        if (!isChatModel(id)) continue;

        const displayName = typeof item.display_name === "string" ? item.display_name : undefined;
        chatModels.push({
            id,
            name: displayName,
            isDefault: id === vendor.defaultModel,
        });
    }

    // Sort: default model first, then alphabetically
    chatModels.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.id.localeCompare(b.id);
    });

    // If default model wasn't returned by upstream API (e.g. alias), prepend it
    if (!chatModels.some((m) => m.id === vendor.defaultModel)) {
        chatModels.unshift({
            id: vendor.defaultModel,
            isDefault: true,
        });
    }

    return chatModels;
}

function sanitizeErrorMessage(msg: string, keyToRedact: string): string {
    if (!keyToRedact || keyToRedact.length < 5) return msg;
    return msg.replaceAll(keyToRedact, "[REDACTED]");
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
