// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Resolves a configured LLM base URL to an absolute URL suitable for SDK clients.
 *
 * Browsers and LLM SDKs (OpenAI SDK, Anthropic SDK) require an absolute URL when
 * constructing requests (passing a relative path like `/api/llm-proxy/...` throws
 * `Failed to construct 'URL': Invalid URL`).
 *
 * - If the URL is already absolute (`http://` or `https://`), strips trailing slashes and returns it.
 * - If the URL is a relative path (`/api/llm-proxy/openrouter/v1`), resolves it against
 *   the current browser origin (`window.location.origin`), keeping requests on the same origin proxy.
 * - In Node/test environments without window.location, falls back to `baseOrigin` or `http://127.0.0.1:3000`.
 * - Does NOT hard-code production hostnames.
 * - Strips trailing slashes to avoid double slashes when SDK appends endpoints (`/chat/completions`, `/responses`).
 */
export function resolveBaseURL(
    baseURL?: string,
    defaultURL = "https://api.openai.com/v1",
    baseOrigin?: string,
): string {
    const raw = (baseURL ?? defaultURL).trim();
    if (!raw) return defaultURL.replace(/\/+$/, "");

    // Already absolute URL
    if (/^https?:\/\//i.test(raw)) {
        return raw.replace(/\/+$/, "");
    }

    const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;

    // Explicit baseOrigin provided (e.g. tests or custom caller)
    if (baseOrigin) {
        try {
            return new URL(normalizedPath, baseOrigin.replace(/\/+$/, "")).toString().replace(/\/+$/, "");
        } catch {
            return `${baseOrigin.replace(/\/+$/, "")}${normalizedPath}`.replace(/\/+$/, "");
        }
    }

    // Browser environment
    if (typeof window !== "undefined" && window.location?.origin) {
        try {
            return new URL(normalizedPath, window.location.origin).toString().replace(/\/+$/, "");
        } catch {
            // fallback below
        }
    }

    // Worker or global environment with location
    if (typeof globalThis !== "undefined" && (globalThis as any).location?.origin) {
        try {
            return new URL(normalizedPath, (globalThis as any).location.origin)
                .toString()
                .replace(/\/+$/, "");
        } catch {
            // fallback below
        }
    }

    // Custom fallback origin (e.g. tests or local server)
    const origin = (baseOrigin ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
    try {
        return new URL(normalizedPath, origin).toString().replace(/\/+$/, "");
    } catch {
        return `${origin}${normalizedPath}`.replace(/\/+$/, "");
    }
}

/**
 * Scrubs API keys and sensitive tokens from error messages before presenting to the user or logging.
 */
export function sanitizeErrorMessage(msg: string, keyToRedact?: string): string {
    if (!msg) return "";
    let cleaned = msg;

    if (keyToRedact && keyToRedact.length >= 5) {
        cleaned = cleaned.replaceAll(keyToRedact, "[REDACTED]");
    }

    // Common API key patterns across vendors
    cleaned = cleaned.replace(/sk-ant-[a-zA-Z0-9_-]+/g, "[REDACTED]");
    cleaned = cleaned.replace(/sk-proj-[a-zA-Z0-9_-]+/g, "[REDACTED]");
    cleaned = cleaned.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED]");
    cleaned = cleaned.replace(/gsk_[a-zA-Z0-9_-]+/g, "[REDACTED]");
    cleaned = cleaned.replace(/AIza[a-zA-Z0-9_-]+/g, "[REDACTED]");

    return cleaned;
}
