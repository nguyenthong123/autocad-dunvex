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
 *
 * Fingerprint: `rulesFingerprintFor` hashes the full related content (guidanceMarkdown,
 * protectedNodeIds, scope, revision). Length alone or Date.now alone never identify a revision.
 * Callers re-read ObjectStorage before each write so other-tab updates are visible.
 */

const ACCOUNT_KEY = "designRules.account";
const DOC_KEY_PREFIX = "designRules.doc:";

/** Document ids whose rules keys were written during tests (cleared by clearDesignRulesForTests). */
const touchedDocumentIdsForTests = new Set<string>();

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
        contentRevision: 0,
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
    const previous = readStored(ACCOUNT_KEY);
    const next: DesignRules = {
        ...defaultSafeDesignRules(),
        ...previous,
        ...partial,
        scope: "account",
        documentId: undefined,
        missingLinkFallback: true,
        sanitizationIsNotInjectionProof: true,
        version: 1,
        contentRevision: nextContentRevision(previous, partial.contentRevision),
        updatedAt: Date.now(),
        guidanceMarkdown:
            partial.guidanceMarkdown !== undefined
                ? sanitizeGuidanceMarkdown(partial.guidanceMarkdown)
                : previous?.guidanceMarkdown,
        protectedNodeIds:
            partial.protectedNodeIds !== undefined
                ? uniqueIds(partial.protectedNodeIds)
                : previous?.protectedNodeIds,
    };
    ObjectStorage.default.setValue(ACCOUNT_KEY, next);
    return next;
}

export function saveDocumentDesignRules(documentId: string, partial: Partial<DesignRules>): DesignRules {
    const key = documentRulesKey(documentId);
    const previous = readStored(key);
    touchedDocumentIdsForTests.add(documentId);
    const next: DesignRules = {
        ...defaultSafeDesignRules(documentId),
        ...previous,
        ...partial,
        scope: "document",
        documentId,
        missingLinkFallback: true,
        sanitizationIsNotInjectionProof: true,
        version: 1,
        contentRevision: nextContentRevision(previous, partial.contentRevision),
        updatedAt: Date.now(),
        guidanceMarkdown:
            partial.guidanceMarkdown !== undefined
                ? sanitizeGuidanceMarkdown(partial.guidanceMarkdown)
                : previous?.guidanceMarkdown,
        protectedNodeIds:
            partial.protectedNodeIds !== undefined
                ? uniqueIds(partial.protectedNodeIds)
                : previous?.protectedNodeIds,
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
 * Always re-reads ObjectStorage so other-tab / concurrent saves are visible before writes.
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

/**
 * Content fingerprint of the effective rules for `documentId`.
 * Includes full guidanceMarkdown text and sorted protectedNodeIds — not length or Date.now alone.
 */
export function rulesFingerprintFor(documentId: string): string {
    const { rules, scope, missingLink } = loadEffectiveDesignRules(documentId);
    return fingerprintDesignRules(rules, scope, missingLink);
}

/** Build a stable fingerprint from already-loaded rules (tests / diagnostics). */
export function fingerprintDesignRules(
    rules: DesignRules,
    scope: "account" | "document" | "default_safe",
    missingLink: boolean,
): string {
    const protectedIds = uniqueIds(rules.protectedNodeIds ?? []).sort();
    const guidance = rules.guidanceMarkdown ?? "";
    // Canonical payload: every field that can change rights/guidance interpretation.
    const canonical = [
        `scope=${scope}`,
        `missing=${missingLink ? "1" : "0"}`,
        `version=${rules.version}`,
        `revision=${rules.contentRevision ?? 0}`,
        `documentId=${rules.documentId ?? ""}`,
        `guidance=${guidance}`,
        `protected=${protectedIds.join("\u001f")}`,
    ].join("\n");
    return `rules:fnv1a=${fnv1aHex(canonical)}:len=${canonical.length}`;
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

function nextContentRevision(previous: DesignRules | undefined, override: number | undefined): number {
    if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
        return Math.floor(override);
    }
    return (previous?.contentRevision ?? 0) + 1;
}

function uniqueIds(values: string[]): string[] {
    return [...new Set(values.filter((id) => typeof id === "string" && id.length > 0))];
}

function fnv1aHex(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function readStored(key: string): DesignRules | undefined {
    const value = ObjectStorage.default.value<DesignRules>(key);
    if (!value || typeof value !== "object") return undefined;
    const merged = {
        ...defaultSafeDesignRules(value.documentId),
        ...value,
        missingLinkFallback: true as const,
        sanitizationIsNotInjectionProof: true as const,
        contentRevision:
            typeof value.contentRevision === "number" && Number.isFinite(value.contentRevision)
                ? Math.max(0, Math.floor(value.contentRevision))
                : 0,
        protectedNodeIds: Array.isArray(value.protectedNodeIds)
            ? uniqueIds(value.protectedNodeIds)
            : undefined,
    };
    return merged;
}

/** Test helper. */
export function clearDesignRulesForTests(): void {
    ObjectStorage.default.remove(ACCOUNT_KEY);
    for (const id of touchedDocumentIdsForTests) {
        ObjectStorage.default.remove(documentRulesKey(id));
    }
    touchedDocumentIdsForTests.clear();
}
