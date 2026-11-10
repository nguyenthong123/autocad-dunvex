// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { beforeEach, describe, expect, test } from "@rstest/core";
import {
    classifyError,
    clearRuntimeErrorReports,
    exportRuntimeErrorReports,
    listRuntimeErrorReports,
    recordRuntimeError,
    sanitizeArgs,
} from "../src";
import { buildTools } from "../src/tools";

describe("runtimeErrorReporter diagnostics", () => {
    beforeEach(() => {
        clearRuntimeErrorReports();
    });

    test("records runtime errors and lists them", () => {
        const report = recordRuntimeError({
            toolName: "run_program",
            operation: "box",
            error: new Error("Standard_Failure: OCCT BRep_API exception"),
            args: { method: "box", args: { dx: 10 } },
        });

        expect(report).toBeDefined();
        expect(report?.toolName).toBe("run_program");
        expect(report?.operation).toBe("box");
        expect(report?.errorClass).toBe("kernel");
        expect(report?.suspectedCause).toContain("OCCT");

        const list = listRuntimeErrorReports();
        expect(list.length).toBe(1);
        expect(list[0].id).toBe(report?.id);
    });

    test("classifies errors correctly into errorClass categories", () => {
        // Kernel
        const kernel = classifyError(new Error("BRepAlgoAPI_Cut failed in wasm"), "run_program");
        expect(kernel.errorClass).toBe("kernel");

        // Geometry precondition
        const geom = classifyError(
            new Error("Profile is open and not coplanar; cannot create solid"),
            "run_program",
            "extrude",
        );
        expect(geom.errorClass).toBe("geometry-precondition");

        // AI planning
        const planning = classifyError(
            new Error("node not found: node_123 — it may have been consumed by booleanCut"),
            "delete_node",
        );
        expect(planning.errorClass).toBe("ai-planning");

        // User input
        const input = classifyError(
            new Error("invalid parameter: radius must be positive"),
            "run_program",
            "cylinder",
        );
        expect(input.errorClass).toBe("user-input");

        // Code bug
        const codeBug = classifyError(
            new TypeError("Cannot read properties of undefined (reading 'factory')"),
            "run_program",
        );
        expect(codeBug.errorClass).toBe("code-bug");
    });

    test("deduplicates identical errors occurring within window", () => {
        const err = new Error("Repeated failure test");
        const r1 = recordRuntimeError({
            toolName: "run_program",
            operation: "fillet",
            error: err,
        });
        expect(r1).toBeDefined();

        // Immediate repeat with same tool and error
        const r2 = recordRuntimeError({
            toolName: "run_program",
            operation: "fillet",
            error: err,
        });
        expect(r2).toBeUndefined();

        expect(listRuntimeErrorReports().length).toBe(1);
    });

    test("sanitizes arguments by redacting API keys and data URLs", () => {
        const rawArgs = {
            apiKey: "sk-proj-1234567890abcdefghijklmnop",
            nvApiKey: "nvapi-abcdef1234567890abcdef123456",
            password: "supersecretpassword",
            textureUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            normalParam: 42,
            nested: {
                token: "ghp_123456789012345678901234567890123456",
                text: "box model with sk-abc1234567890123456 key inline",
            },
        };

        const sanitized = sanitizeArgs(rawArgs);
        expect(sanitized["apiKey"]).toBe("[REDACTED]");
        expect(sanitized["password"]).toBe("[REDACTED]");
        expect((sanitized["nested"] as Record<string, unknown>)["token"]).toBe("[REDACTED]");
        expect((sanitized["nested"] as Record<string, unknown>)["text"]).toContain("[REDACTED_API_KEY]");
        expect(sanitized["normalParam"]).toBe(42);
    });

    test("exports reports as Markdown and JSON", () => {
        recordRuntimeError({
            toolName: "run_program",
            operation: "booleanCut",
            error: new Error("Tool cutter does not intersect target solid"),
        });

        const md = exportRuntimeErrorReports("markdown");
        expect(md).toContain("# Báo cáo Lỗi Runtime Chili3D AI Assistant");
        expect(md).toContain("booleanCut");
        expect(md).toContain("geometry-precondition");

        const json = exportRuntimeErrorReports("json");
        const parsed = JSON.parse(json);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0].toolName).toBe("run_program");
    });

    test("diagnostic tools are registered and functional", async () => {
        const tools = buildTools();
        const listTool = tools.find((t) => t.name === "list_runtime_error_reports");
        const exportTool = tools.find((t) => t.name === "export_runtime_error_reports");
        const clearTool = tools.find((t) => t.name === "clear_runtime_error_reports");

        expect(listTool).toBeDefined();
        expect(exportTool).toBeDefined();
        expect(clearTool).toBeDefined();

        recordRuntimeError({
            toolName: "test_tool",
            error: new Error("Sample failure for diagnostic tool"),
        });

        const listResult = JSON.parse((await listTool!.handler({ limit: 10 })) as string);
        expect(listResult.count).toBe(1);
        expect(listResult.reports[0].toolName).toBe("test_tool");

        const exportResult = JSON.parse((await exportTool!.handler({ format: "markdown" })) as string);
        expect(exportResult.format).toBe("markdown");
        expect(exportResult.content).toContain("Sample failure for diagnostic tool");

        const clearResult = JSON.parse((await clearTool!.handler({})) as string);
        expect(clearResult.cleared).toBe(true);
        expect(listRuntimeErrorReports().length).toBe(0);
    });

    test("collects documentSummary from globalThis.app.activeView.document.modelManager", () => {
        const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "app");
        try {
            const rootNode = { id: "root", name: "Root" };
            const node1 = { id: "box_1", name: "Box 1", constructor: { name: "BoxNode" } };
            const node2 = { id: "cyl_2", name: "Cylinder 2", constructor: { name: "CylinderNode" } };

            Object.defineProperty(globalThis, "app", {
                value: {
                    activeView: {
                        document: {
                            modelManager: {
                                rootNode,
                                findNodes: () => [rootNode, node1, node2],
                            },
                        },
                    },
                },
                configurable: true,
                writable: true,
            });

            const report = recordRuntimeError({
                toolName: "run_program",
                operation: "fillet",
                error: new Error("Fillet radius too large"),
            });

            expect(report).toBeDefined();
            expect(report?.documentSummary).not.toBeUndefined();
            expect(report?.documentSummary?.nodeCount).toBe(2);
            expect(report?.documentSummary?.nodes.length).toBe(2);
            expect(report?.documentSummary?.nodes[0].id).toBe("box_1");
            expect(report?.documentSummary?.nodes[0].type).toBe("BoxNode");
        } finally {
            if (originalDescriptor) {
                Object.defineProperty(globalThis, "app", originalDescriptor);
            }
        }
    });

    test("host captures JSON error returned by tool handlers", async () => {
        const { createToolHost } = await import("../src/tools/host");
        const host = createToolHost();

        // Calling a tool that returns JSON error when no document is open
        const result = await host.call("delete_node", { id: "non_existent_node" });
        expect(result.ok).toBe(true); // tool returned response string containing JSON error
        expect(result.content).toContain("error");

        const reports = listRuntimeErrorReports();
        const found = reports.find((r) => r.toolName === "delete_node");
        expect(found).toBeDefined();
        expect(found?.errorMessage).toBe("ai.error.noDocument");
    });

    test("export_runtime_error_reports handles download flag", async () => {
        const tools = buildTools();
        const exportTool = tools.find((t) => t.name === "export_runtime_error_reports");

        recordRuntimeError({
            toolName: "run_program",
            operation: "extrude",
            error: new Error("Open profile error"),
        });

        const resStr = (await exportTool!.handler({ format: "json", download: false })) as string;
        const res = JSON.parse(resStr);
        expect(res.format).toBe("json");
        expect(res.filename).toContain("chili3d-error-report-");
        expect(res.downloaded).toBe(false);
        expect(res.content).toContain("Open profile error");
    });

    test("exports standalone and combined performance reports conforming to schema", () => {
        const { PerformanceProfiler } = require("@chili3d/core");
        const profiler = PerformanceProfiler.instance;
        profiler.reset();
        profiler.startRecording();
        profiler.recordInteraction("pan");
        profiler.recordFrame(20.5);
        profiler.markJank("freeze_detected");
        profiler.stopRecording();

        // 1. Standalone performance export
        const { exportPerformanceReport } = require("../src");
        const perfJsonStr = exportPerformanceReport("sha-test-456");
        const perfJson = JSON.parse(perfJsonStr);
        expect(perfJson.schemaVersion).toBe("1.0.0");
        expect(perfJson.buildSha).toBe("sha-test-456");
        expect(perfJson.aggregates.interactions.panCount).toBe(1);
        expect(perfJson.aggregates.userMarksCount).toBe(1);
        expect(perfJson.timeline.length).toBe(3);

        // 2. Backward compatibility: exportRuntimeErrorReports("json") without options returns array
        const rawArrayJson = exportRuntimeErrorReports("json");
        const parsedArray = JSON.parse(rawArrayJson);
        expect(Array.isArray(parsedArray)).toBe(true);

        // 3. Combined export with includePerformance: true
        const combinedJsonStr = exportRuntimeErrorReports("json", {
            includePerformance: true,
            buildSha: "sha-test-456",
        });
        const combined = JSON.parse(combinedJsonStr);
        expect(combined.schemaVersion).toBe("1.0.0");
        expect(Array.isArray(combined.errorReports)).toBe(true);
        expect(combined.performance).toBeDefined();
        expect(combined.performance.schemaVersion).toBe("1.0.0");
        expect(combined.performance.buildSha).toBe("sha-test-456");
        expect(combined.performance.aggregates.interactions.panCount).toBe(1);
    });
});
