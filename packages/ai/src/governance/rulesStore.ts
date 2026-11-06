// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { ObjectStorage } from "@chili3d/core";
import { getDocument } from "../tools/documentContext";
import type { DesignRules } from "./types";

/**
 * Batch B minimal rules storage: ObjectStorage (localStorage), same channel as AI settings.
 * Account scope key + optional per-document key. Filesystem / IndexedDB / VPS sidecars deferred.
 *
 * Scope:
 * - account: `designRules.account` — guidance shared across documents on this browser profile
 * - document: `designRules.doc:<documentId>` — overrides account when present and linked
 *
 * Missing link: when no document is open, document id is unknown, or the document key is absent,
 * `loadEffectiveDesignRules` returns `DefaultSafeDesignRules` (source protection on; no extra grants).
 *
 * Sanitization: `sanitizeGuidanceMarkdown` strips script/HTML tags for safer UI display.
 * It is NOT a guarantee against prompt injection — treated as untrusted text in prompts.
 */

const ACCOUNT_KEY = "designRules.account";
const DOC_KEY_PREFIX = "designRules.doc:";

export function documentRulesKey(documentId: string): string {
    return `${DOC_KEY_PREFIX}${documentId}`;
}

export function defaultSafeDesignRules(documentId?: string): DesignRules {
    return {
        version: 1,
        scope: documentId ? "document" : "account",
        documentId,
        guidanceMarkdown: undefined,
        protectedNodeIds: undefined,
        missingLinkFallback: true,
        sanitizationIsNotInjectionProof: true,
        updatedAt: Date.now(),
    };
}

export function sanitizeGuidanceMarkdown(raw: string): string {
    return raw
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<\/?[^>]+>/g, "")
        .trim();
}

export function saveAccountDesignRules(partial: Partial<DesignRules>): DesignRules {
    const next: DesignRules = {
        ...defaultSafeDesignRules(),
        ...readStored(ACCOUNT_KEY),
        ...partial,
        scope: "account",
        documentId: undefined,
        missingLinkFallback: true,
        sanitizationIsNotInjectionProof: true,
        version: 1,
        updatedAt: Date.now(),
        guidanceMarkdown:
            partial.guidanceMarkdown !== undefined
                ? sanitizeGuidanceMarkdown(partial.guidanceMarkdown)
                : readStored(ACCOUNT_KEY)?.guidanceMarkdown,
    };
    ObjectStorage.default.setValue(ACCOUNT_KEY, next);
    return next;
}

export function saveDocumentDesignRules(documentId: string, partial: Partial<DesignRules>): DesignRules {
    const key = documentRulesKey(documentId);
    const next: DesignRules = {
        ...defaultSafeDesignRules(documentId),
        ...readStored(key),
        ...partial,
        scope: "document",
        documentId,
        missingLinkFallback: true,
        sanitizationIsNotInjectionProof: true,
        version: 1,
        updatedAt: Date.now(),
        guidanceMarkdown:
            partial.guidanceMarkdown !== undefined
                ? sanitizeGuidanceMarkdown(partial.guidanceMarkdown)
                : readStored(key)?.guidanceMarkdown,
    };
    ObjectStorage.default.setValue(key, next);
    return next;
}

export function loadAccountDesignRules(): DesignRules | undefined {
    return readStored(ACCOUNT_KEY);
}

export function loadDocumentDesignRules(documentId: string): DesignRules | undefined {
    return readStored(documentRulesKey(documentId));
}

/**
 * Effective rules for the open document.
 * Document scope wins when present; otherwise account; otherwise default-safe (missing link).
 */
export function loadEffectiveDesignRules(documentId?: string): {
    rules: DesignRules;
    missingLink: boolean;
    scope: "account" | "document" | "default_safe";
} {
    const id = documentId ?? getDocument()?.id;
    if (id) {
        const docRules = loadDocumentDesignRules(id);
        if (docRules) {
            return { rules: docRules, missingLink: false, scope: "document" };
        }
    }
    const account = loadAccountDesignRules();
    if (account) {
        return {
            rules: { ...account, documentId: id },
            missingLink: !id,
            scope: id ? "account" : "default_safe",
        };
    }
    return {
        rules: defaultSafeDesignRules(id),
        missingLink: true,
        scope: "default_safe",
    };
}

/** Prompt-facing summary: guidance only; never grants permissions. Keep compact for the resident prompt budget. */
export function formatRulesForPrompt(): string {
    const { rules, missingLink, scope } = loadEffectiveDesignRules();
    const lines = [
        `## Design rules (B): scope=${scope}${missingLink ? "; missing-link→default-safe" : ""}; ObjectStorage; sources protected; no self-grant; criteria/tolerances deferred to C.`,
    ];
    if (rules.guidanceMarkdown?.trim()) {
        lines.push(`Guidance (untrusted): ${rules.guidanceMarkdown.trim()}`);
    }
    return lines.join("\n");
}

function readStored(key: string): DesignRules | undefined {
    const value = ObjectStorage.default.value<DesignRules>(key);
    if (!value || typeof value !== "object") return undefined;
    return {
        ...defaultSafeDesignRules(value.documentId),
        ...value,
        missingLinkFallback: true,
        sanitizationIsNotInjectionProof: true,
    };
}

/** Test helper. */
export function clearDesignRulesForTests(): void {
    ObjectStorage.default.remove(ACCOUNT_KEY);
    // Document keys are not enumerated; tests should remove specific keys they wrote.
}
