// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { download } from "@chili3d/core";
import { clearRuntimeErrorReports, exportRuntimeErrorReports, listRuntimeErrorReports } from "../diagnostics";
import type { Tool } from "../llm/types";

export function buildDiagnosticTools(): Tool[] {
    return [
        {
            name: "list_runtime_error_reports",
            description:
                "List recent runtime error reports captured during tool/command execution, categorized by error class (kernel, geometry-precondition, ai-planning, user-input, code-bug).",
            parameters: {
                type: "object",
                properties: {
                    limit: {
                        type: "number",
                        description: "Maximum number of recent reports to return (default: 20).",
                    },
                },
            },
            handler: (args) => {
                const limit = typeof args["limit"] === "number" ? (args["limit"] as number) : 20;
                const reports = listRuntimeErrorReports().slice(0, limit);
                return Promise.resolve(JSON.stringify({ count: reports.length, reports }));
            },
        },
        {
            name: "export_runtime_error_reports",
            description:
                "Export recorded runtime error reports as a formatted Markdown or JSON document for developer debugging and troubleshooting.",
            parameters: {
                type: "object",
                properties: {
                    format: {
                        type: "string",
                        enum: ["markdown", "json"],
                        description: "Export format ('markdown' or 'json', default: 'markdown').",
                    },
                    download: {
                        type: "boolean",
                        description: "Trigger a browser file download of the report (default: false).",
                    },
                },
            },
            handler: (args) => {
                const format = args["format"] === "json" ? "json" : "markdown";
                const content = exportRuntimeErrorReports(format);
                const shouldDownload = args["download"] === true;
                const ext = format === "json" ? "json" : "md";
                const dateStr = new Date().toISOString().split("T")[0];
                const filename = `chili3d-error-report-${dateStr}.${ext}`;

                if (shouldDownload) {
                    try {
                        download([content], filename);
                        return Promise.resolve(
                            JSON.stringify({ format, filename, downloaded: true, content }),
                        );
                    } catch {
                        // Environment without DOM download capability
                    }
                }

                return Promise.resolve(
                    JSON.stringify({ format, filename, downloaded: shouldDownload, content }),
                );
            },
        },
        {
            name: "clear_runtime_error_reports",
            description: "Clear and reset all stored runtime error reports from memory and storage.",
            parameters: {
                type: "object",
                properties: {},
            },
            handler: () => {
                clearRuntimeErrorReports();
                return Promise.resolve(JSON.stringify({ cleared: true }));
            },
        },
    ];
}
