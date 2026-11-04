// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export type ErrorClass =
    | "code-bug"
    | "application"
    | "kernel"
    | "geometry-precondition"
    | "ai-planning"
    | "user-input";

export interface RuntimeErrorNodeSummary {
    id: string;
    name: string;
    type?: string;
}

export interface RuntimeErrorDocumentSummary {
    nodeCount: number;
    nodes: RuntimeErrorNodeSummary[];
}

export interface RuntimeErrorReport {
    id: string;
    timestamp: number;
    toolName: string;
    commandKey?: string;
    operation?: string;
    errorClass: ErrorClass;
    errorMessage: string;
    stack?: string;
    sanitizedArgs: Record<string, unknown>;
    documentSummary?: RuntimeErrorDocumentSummary;
    suspectedCause: string;
    suggestedFixForDeveloper: string;
}

export interface RecordRuntimeErrorOptions {
    toolName: string;
    commandKey?: string;
    operation?: string;
    error: unknown;
    args?: unknown;
    overrideErrorClass?: ErrorClass;
    suspectedCause?: string;
    suggestedFixForDeveloper?: string;
}
