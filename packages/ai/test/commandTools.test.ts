// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { buildCommandTools } from "../src/tools/commandTools";

describe("commandTools", () => {
    const tools = buildCommandTools();
    const runCommandTool = tools.find((t) => t.name === "run_command");

    let originalApp: PropertyDescriptor | undefined;
    let mockSelectedNodes: any[] = [];
    let mockDoc: any;

    beforeEach(() => {
        mockSelectedNodes = [];
        mockDoc = {
            selection: {
                getSelectedNodes: () => mockSelectedNodes,
            },
        };

        originalApp = Object.getOwnPropertyDescriptor(globalThis, "app");
        Object.defineProperty(globalThis, "app", {
            value: {
                activeView: {
                    document: mockDoc,
                },
            },
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        if (originalApp) {
            Object.defineProperty(globalThis, "app", originalApp);
        } else {
            delete (globalThis as any).app;
        }
    });

    test("tool metadata is properly defined", () => {
        expect(runCommandTool).toBeDefined();
        interface ToolParams {
            properties: { command?: unknown };
            required: string[];
        }
        const params = runCommandTool?.parameters as unknown as ToolParams;
        expect(params.properties.command).toBeDefined();
        expect(params.required).toContain("command");
    });

    test("resolves aliases and blocks interactive commands with full guide", async () => {
        const resultStr = (await runCommandTool!.handler({ command: "EXTRUDE" })) as string;
        const result = JSON.parse(resultStr);

        expect(result.interactiveCommandBlocked).toBe(true);
        expect(result.commandKey).toBe("create.extrude");
        expect(result.aliasMatched).toBe("extrude");
        expect(result.message).toContain("lệnh tương tác trực tiếp");
        expect(result.guide).toBeDefined();
        expect(result.guide.commandKey).toBe("create.extrude");
        expect(result.guide.userStepByStepGuide).toBeDefined();
        expect(result.guide.geometryConstraints).toBeDefined();
    });

    test("rejects unknown command key", async () => {
        const resultStr = (await runCommandTool!.handler({ command: "non_existent_command_xyz" })) as string;
        const result = JSON.parse(resultStr);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Không tìm thấy lệnh hoặc bí danh");
    });

    test("redirects dialog commands like BOM and manual to uiDialogOpened", async () => {
        let executedCommand: string | null = null;
        const callback = (key: unknown) => {
            executedCommand = key as string;
        };
        PubSub.default.sub("executeCommand", callback);

        try {
            // 1. Alias BOM -> measure.bom
            const resBomStr = (await runCommandTool!.handler({ command: "BOM" })) as string;
            const resBom = JSON.parse(resBomStr);
            expect(resBom.success).toBe(true);
            expect(resBom.uiDialogOpened).toBe(true);
            expect(resBom.commandKey).toBe("measure.bom");
            expect(resBom.message).toContain("bom_report");
            expect(executedCommand).toBe("measure.bom");

            // 2. app.manual
            executedCommand = null;
            const resManualStr = (await runCommandTool!.handler({ command: "app.manual" })) as string;
            const resManual = JSON.parse(resManualStr);
            expect(resManual.success).toBe(true);
            expect(resManual.uiDialogOpened).toBe(true);
            expect(resManual.commandKey).toBe("app.manual");
            expect(executedCommand).toBe("app.manual");
        } finally {
            PubSub.default.remove("executeCommand", callback);
        }
    });

    test("blocks duplicate commands and guides model to dedicated tools", async () => {
        // 1. Undo
        const resUndoStr = (await runCommandTool!.handler({ command: "U" })) as string;
        const resUndo = JSON.parse(resUndoStr);
        expect(resUndo.isDuplicateTool).toBe(true);
        expect(resUndo.error).toContain("tool 'undo'");

        // 2. Redo
        const resRedoStr = (await runCommandTool!.handler({ command: "REDO" })) as string;
        const resRedo = JSON.parse(resRedoStr);
        expect(resRedo.isDuplicateTool).toBe(true);
        expect(resRedo.error).toContain("tool 'redo'");

        // 3. DeleteNode
        const resDelStr = (await runCommandTool!.handler({ command: "E" })) as string;
        const resDel = JSON.parse(resDelStr);
        expect(resDel.isDuplicateTool).toBe(true);
        expect(resDel.error).toContain("tool 'delete_node'");
    });

    test("blocks selection-requiring command when selection is empty", async () => {
        // Selection is empty by default
        const resultStr = (await runCommandTool!.handler({ command: "HIDE" })) as string;
        const result = JSON.parse(resultStr);

        expect(result.success).toBe(false);
        expect(result.commandKey).toBe("modify.hideSelected");
        expect(result.preconditionFailed).toBe(true);
        expect(result.error).toContain("yêu cầu phải có đối tượng đang được chọn");
    });

    test("successfully dispatches safe direct command and tracks completion", async () => {
        mockSelectedNodes = [{ id: "box-1" }];

        let executedCommand: string | null = null;
        const callback = (key: unknown) => {
            executedCommand = key as string;
        };
        PubSub.default.sub("executeCommand", callback);

        try {
            // 1. Test alias HIDE with selection
            const resHideStr = (await runCommandTool!.handler({ command: "HIDE" })) as string;
            const resHide = JSON.parse(resHideStr);
            expect(resHide.success).toBe(true);
            expect(resHide.dispatched).toBe(true);
            expect(resHide.completed).toBe(true);
            expect(resHide.commandKey).toBe("modify.hideSelected");
            expect(executedCommand).toBe("modify.hideSelected");

            // 2. Test alias SHOWALL without selection required
            executedCommand = null;
            const resShowStr = (await runCommandTool!.handler({ command: "SHOWALL" })) as string;
            const resShow = JSON.parse(resShowStr);
            expect(resShow.success).toBe(true);
            expect(resShow.dispatched).toBe(true);
            expect(resShow.completed).toBe(true);
            expect(resShow.commandKey).toBe("modify.showAll");
            expect(executedCommand).toBe("modify.showAll");

            // 3. Test alias G (create.folder)
            executedCommand = null;
            const resFolderStr = (await runCommandTool!.handler({ command: "G" })) as string;
            const resFolder = JSON.parse(resFolderStr);
            expect(resFolder.success).toBe(true);
            expect(resFolder.dispatched).toBe(true);
            expect(resFolder.completed).toBe(true);
            expect(resFolder.commandKey).toBe("create.folder");
            expect(executedCommand).toBe("create.folder");
        } finally {
            PubSub.default.remove("executeCommand", callback);
        }
    });
});
