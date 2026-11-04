// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { redactDataUrls } from "../llm/redact";
import type {
    ErrorClass,
    RecordRuntimeErrorOptions,
    RuntimeErrorDocumentSummary,
    RuntimeErrorNodeSummary,
    RuntimeErrorReport,
} from "./types";

const STORAGE_KEY = "chili3d:ai:error_reports";
const MAX_REPORTS = 50;
const DEDUP_WINDOW_MS = 2000;

let inMemoryReports: RuntimeErrorReport[] = [];
const recentReportTimes = new Map<string, number>();

/**
 * Checks whether localStorage is available and writable.
 */
function isLocalStorageAvailable(): boolean {
    try {
        if (typeof window === "undefined" || !window.localStorage) return false;
        const testKey = "__chili_ls_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

function loadStoredReports(): RuntimeErrorReport[] {
    if (!isLocalStorageAvailable()) return inMemoryReports;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return inMemoryReports;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : inMemoryReports;
    } catch {
        return inMemoryReports;
    }
}

function persistReports(reports: RuntimeErrorReport[]): void {
    inMemoryReports = reports;
    if (!isLocalStorageAvailable()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch {
        // Storage quota exceeded or blocked; in-memory copy retains it.
    }
}

/**
 * Redacts API keys, bearer tokens, passwords, and base64 images from arguments.
 */
export function sanitizeArgs(args: unknown): Record<string, unknown> {
    if (!args || typeof args !== "object") return {};
    return sanitizeValue(args) as Record<string, unknown>;
}

function sanitizeValue(val: unknown): unknown {
    if (typeof val === "string") {
        let clean = redactDataUrls(val);
        // Redact typical API keys: sk-..., nvapi-..., bearer tokens
        clean = clean.replace(/\b(sk-[a-zA-Z0-9_-]{16,})\b/g, "[REDACTED_API_KEY]");
        clean = clean.replace(/\b(nvapi-[a-zA-Z0-9_-]{16,})\b/g, "[REDACTED_NVIDIA_KEY]");
        clean = clean.replace(/\b(ghp_[a-zA-Z0-9]{30,})\b/g, "[REDACTED_TOKEN]");
        return clean;
    }
    if (Array.isArray(val)) {
        return val.map((item) => sanitizeValue(item));
    }
    if (val !== null && typeof val === "object") {
        const res: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            const lowerK = k.toLowerCase();
            if (
                lowerK.includes("key") ||
                lowerK.includes("token") ||
                lowerK.includes("secret") ||
                lowerK.includes("password") ||
                lowerK.includes("auth")
            ) {
                res[k] = "[REDACTED]";
            } else {
                res[k] = sanitizeValue(v);
            }
        }
        return res;
    }
    return val;
}

/**
 * Classifies an error and suggests causes and developer fixes.
 */
export function classifyError(
    err: unknown,
    toolName: string,
    operation?: string,
): {
    errorClass: ErrorClass;
    suspectedCause: string;
    suggestedFixForDeveloper: string;
} {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();

    // 1. Kernel errors (OCCT / WebAssembly)
    if (
        /occt|standard_failure|brepoffset|brepalgo|brepcheck|brepfillet|geom|wasm|sigsegv|abort/i.test(
            message,
        )
    ) {
        return {
            errorClass: "kernel",
            suspectedCause: `OCCT C++ kernel exception or failure during ${operation || toolName}: ${message}`,
            suggestedFixForDeveloper:
                "Inspect cpp/src/factory.cpp or geometry.cpp. Guard against degenerate inputs, null shapes, or self-intersecting surfaces before calling OCCT algorithms.",
        };
    }

    // 2. Geometry precondition failures
    if (
        /open profile|non-planar|not coplanar|intersect|self-intersect|radius too large|fillet failed|chamfer failed|degenerate|zero length|zero area|slack|too far|sharp-edged/i.test(
            lower,
        )
    ) {
        return {
            errorClass: "geometry-precondition",
            suspectedCause: `Geometric preconditions violated: profile is open/non-coplanar, cutter does not intersect target, or blend radius exceeds adjacent face bounds.`,
            suggestedFixForDeveloper:
                "Check commandGuide.ts geometry constraints for this operation. Ensure cutters overshoot both faces for through-holes and fillet radii are pre-checked with shape.findSubShapes.",
        };
    }

    // 3. AI planning failures
    if (
        /node not found|consumed by|removed|unknown ref|already deleted|requires an? ["']?ops["']? array|referenced node|planid|dangling ref/i.test(
            lower,
        )
    ) {
        return {
            errorClass: "ai-planning",
            suspectedCause: `AI agent referenced a deleted/consumed node, passed an invalid ref, or violated planning lifecycle rules: ${message}`,
            suggestedFixForDeveloper:
                "Ensure agent checks sessionMemory's removedNodeIds before referencing nodes. Edit methods (booleanCut, fillet) consume their inputs.",
        };
    }

    // 4. User input failures
    if (
        /invalid parameter|out of range|missing required|not a number|must be positive|cannot be empty/i.test(
            lower,
        )
    ) {
        return {
            errorClass: "user-input",
            suspectedCause: `User supplied parameters failed validation: ${message}`,
            suggestedFixForDeveloper:
                "Verify input validation in tool schemas and prompt rules before passing parameters to modeling methods.",
        };
    }

    // 5. Code bug / application exceptions (TypeError, null reference, unhandled code paths)
    if (
        err instanceof TypeError ||
        err instanceof ReferenceError ||
        /cannot read propert|is not a function|undefined|null/i.test(lower)
    ) {
        return {
            errorClass: "code-bug",
            suspectedCause: `JavaScript/TypeScript runtime exception in ${toolName}: ${message}`,
            suggestedFixForDeveloper:
                "Check the stack trace below. Verify null/undefined guards in tool handler or capability execution pipeline.",
        };
    }

    return {
        errorClass: "application",
        suspectedCause: `Application level failure during ${toolName}: ${message}`,
        suggestedFixForDeveloper:
            "Examine tool handler logic and verify application state in active document.",
    };
}

/**
 * Collects a summary of nodes in the active document for the error report.
 */
function getDocumentSummary(): RuntimeErrorDocumentSummary | undefined {
    try {
        const app = (globalThis as unknown as { app?: { activeView?: { document?: unknown } } }).app;
        const doc = app?.activeView?.document as
            | {
                  modelManager?: {
                      rootNode?: unknown;
                      findNodes?: (
                          p?: () => boolean,
                      ) => Array<{ id: unknown; name?: unknown; constructor?: { name?: string } }>;
                  };
              }
            | undefined;
        if (!doc?.modelManager?.findNodes) return undefined;
        const rootNode = doc.modelManager.rootNode;
        const allNodes = doc.modelManager.findNodes(() => true);
        const filteredNodes = rootNode ? allNodes.filter((n) => n !== rootNode) : allNodes;
        const nodeCount = filteredNodes.length;
        const nodes: RuntimeErrorNodeSummary[] = filteredNodes.slice(0, 30).map((n) => ({
            id: String(n.id),
            name: String(n.name ?? ""),
            type: n.constructor?.name,
        }));
        return {
            nodeCount,
            nodes,
        };
    } catch {
        return undefined;
    }
}

/**
 * Records a runtime error report. Automatically deduplicates within 2 seconds.
 */
export function recordRuntimeError(opts: RecordRuntimeErrorOptions): RuntimeErrorReport | undefined {
    const errorObj = opts.error;
    const message = errorObj instanceof Error ? errorObj.message : String(errorObj);
    const stack = errorObj instanceof Error ? errorObj.stack : undefined;

    // Symbol check to avoid double recording the exact same Error instance
    if (errorObj !== null && typeof errorObj === "object") {
        if (Reflect.get(errorObj, "__chiliReported")) {
            return undefined;
        }
        Reflect.set(errorObj, "__chiliReported", true);
    }

    // Deduplication key
    const dedupKey = `${opts.toolName}:${opts.operation || ""}:${message}`;
    const now = Date.now();
    const lastTime = recentReportTimes.get(dedupKey) || 0;
    if (now - lastTime < DEDUP_WINDOW_MS) {
        return undefined;
    }
    recentReportTimes.set(dedupKey, now);

    const classification = classifyError(opts.error, opts.toolName, opts.operation);
    const errorClass = opts.overrideErrorClass || classification.errorClass;
    const suspectedCause = opts.suspectedCause || classification.suspectedCause;
    const suggestedFix = opts.suggestedFixForDeveloper || classification.suggestedFixForDeveloper;

    const report: RuntimeErrorReport = {
        id: `err_${now}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: now,
        toolName: opts.toolName,
        commandKey: opts.commandKey,
        operation: opts.operation,
        errorClass,
        errorMessage: message,
        stack,
        sanitizedArgs: sanitizeArgs(opts.args),
        documentSummary: getDocumentSummary(),
        suspectedCause,
        suggestedFixForDeveloper: suggestedFix,
    };

    const existing = loadStoredReports();
    const updated = [report, ...existing].slice(0, MAX_REPORTS);
    persistReports(updated);

    return report;
}

/**
 * Returns all current runtime error reports.
 */
export function listRuntimeErrorReports(): RuntimeErrorReport[] {
    return loadStoredReports();
}

/**
 * Clears all recorded runtime error reports.
 */
export function clearRuntimeErrorReports(): void {
    persistReports([]);
    recentReportTimes.clear();
}

/**
 * Exports runtime error reports as a formatted Markdown or JSON string.
 */
export function exportRuntimeErrorReports(format: "markdown" | "json" = "markdown"): string {
    const reports = loadStoredReports();
    if (format === "json") {
        return JSON.stringify(reports, null, 2);
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const lines: string[] = [
        `# Báo cáo Lỗi Runtime Chili3D AI Assistant (${dateStr})`,
        "",
        `> **Tổng số lỗi ghi nhận:** ${reports.length}`,
        "",
    ];

    if (reports.length === 0) {
        lines.push("*(Hiện không có lỗi runtime nào được ghi nhận)*");
        return lines.join("\n");
    }

    lines.push("## 1. Bảng Tổng hợp Lỗi");
    lines.push("| Thời gian | Tool / Lệnh | Phân loại | Thông điệp lỗi |");
    lines.push("| --- | --- | --- | --- |");

    for (const r of reports) {
        const time = new Date(r.timestamp).toLocaleTimeString();
        const toolInfo = r.operation ? `${r.toolName} (${r.operation})` : r.toolName;
        const msgSnippet = r.errorMessage.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 70);
        lines.push(`| ${time} | \`${toolInfo}\` | \`${r.errorClass}\` | ${msgSnippet} |`);
    }

    lines.push("");
    lines.push("## 2. Chi tiết Từng Lỗi và Gợi ý Sửa lỗi cho Lập trình viên");

    for (const [idx, r] of reports.entries()) {
        const timeStr = new Date(r.timestamp).toLocaleString();
        lines.push(`### Lỗi #${idx + 1}: \`${r.toolName}\` [${r.errorClass.toUpperCase()}]`);
        lines.push(`- **ID:** \`${r.id}\``);
        lines.push(`- **Thời gian:** ${timeStr}`);
        if (r.commandKey) lines.push(`- **Command Key:** \`${r.commandKey}\``);
        if (r.operation) lines.push(`- **Operation:** \`${r.operation}\``);
        lines.push(`- **Thông điệp:** \`${r.errorMessage}\``);
        lines.push(`- **Nguyên nhân dự đoán:** ${r.suspectedCause}`);
        lines.push(`- **Gợi ý khắc phục:** ${r.suggestedFixForDeveloper}`);
        lines.push("");
        lines.push("**Tham số đã khử nhạy cảm (Sanitized Arguments):**");
        lines.push("```json");
        lines.push(JSON.stringify(r.sanitizedArgs, null, 2));
        lines.push("```");

        if (r.documentSummary) {
            lines.push("");
            lines.push(`**Trạng thái tài liệu lúc xảy ra lỗi (${r.documentSummary.nodeCount} nodes):**`);
            lines.push(
                r.documentSummary.nodes.map((n) => `  - \`${n.id}\`: ${n.name}`).join("\n") || "  (trống)",
            );
        }

        if (r.stack) {
            lines.push("");
            lines.push("**Stack trace:**");
            lines.push("```");
            lines.push(r.stack);
            lines.push("```");
        }
        lines.push("");
        lines.push("---");
    }

    return lines.join("\n");
}
