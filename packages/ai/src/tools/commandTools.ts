// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AutoCADCommandAliases, type CommandKeys, PubSub, pendingWork } from "@chili3d/core";
import type { Tool } from "../llm/types";
import { findCommandGuide } from "../skills/commandGuide";
import { requireDocument } from "./documentContext";

export const SAFE_DIRECT_COMMANDS = new Set<string>([
    "create.folder",
    "modify.hideSelected",
    "modify.showAll",
    "modify.isolateSelected",
    "modify.autoOrganizeTree",
    "workingPlane.toggleDynamic",
]);

export function resolveCommandKey(rawCommand: string): string {
    const trimmed = rawCommand.trim();
    const upper = trimmed.toUpperCase();
    if (upper in AutoCADCommandAliases) {
        return AutoCADCommandAliases[upper];
    }
    return trimmed;
}

interface CommandToolArgs {
    command?: string;
    commandKey?: string;
}

export function buildCommandTools(): Tool[] {
    return [
        {
            name: "run_command",
            description:
                "Execute safe non-interactive application commands directly ('modify.hideSelected', 'modify.showAll', 'modify.isolateSelected', 'create.folder', 'modify.autoOrganizeTree', 'workingPlane.toggleDynamic') with precondition checks and async completion verification. For dialog commands ('measure.bom', 'app.manual'), opens the UI dialog with uiDialogOpened:true and suggests bom_report. Rejects interactive mouse-picking commands and duplicate commands ('undo', 'redo', 'delete_node').",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description:
                            "The command key or AutoCAD shortcut alias (e.g. 'HIDE', 'SHOWALL', 'ISOLATE', 'G', 'BOM', 'modify.autoOrganizeTree', 'create.folder').",
                    },
                    commandKey: {
                        type: "string",
                        description: "Optional alias for 'command' parameter.",
                    },
                },
                required: ["command"],
            },
            handler: async (args) => {
                const doc = requireDocument();
                if (typeof doc === "string") return doc;

                const cmdArgs = args as unknown as CommandToolArgs;
                const rawCommand = String(cmdArgs.command ?? cmdArgs.commandKey ?? "");
                if (!rawCommand.trim()) {
                    return JSON.stringify({
                        success: false,
                        executed: false,
                        error: "command argument must not be empty",
                    });
                }

                const trimmed = rawCommand.trim();
                const upper = trimmed.toUpperCase();
                const isAlias = upper in AutoCADCommandAliases;
                const resolvedKey = resolveCommandKey(rawCommand);
                const aliasMatched = isAlias ? upper.toLowerCase() : undefined;

                // 1. Intercept UI Dialog commands (measure.bom / app.manual)
                if (resolvedKey === "measure.bom" || resolvedKey === "app.manual") {
                    try {
                        PubSub.default.pub("executeCommand", resolvedKey as CommandKeys);
                        await pendingWork.whenIdle();
                    } catch {
                        // ignore synchronous dispatch errors
                    }

                    if (resolvedKey === "measure.bom") {
                        return JSON.stringify({
                            success: true,
                            executed: true,
                            dispatched: true,
                            completed: true,
                            uiDialogOpened: true,
                            commandKey: "measure.bom",
                            aliasMatched,
                            message:
                                "Lệnh 'measure.bom' đã mở hộp thoại Thống kê vật tư (BOM) trên màn hình người dùng. Nếu AI cần lấy dữ liệu số lượng/quy cách chi tiết để xử lý hoặc trả lời người dùng, hãy dùng tool 'bom_report'.",
                        });
                    }

                    return JSON.stringify({
                        success: true,
                        executed: true,
                        dispatched: true,
                        completed: true,
                        uiDialogOpened: true,
                        commandKey: "app.manual",
                        aliasMatched,
                        message:
                            "Lệnh 'app.manual' đã mở giao diện Sổ tay hướng dẫn sử dụng trên màn hình người dùng.",
                    });
                }

                // 2. Intercept duplicate commands with dedicated AI tools
                if (resolvedKey === "edit.undo") {
                    return JSON.stringify({
                        success: false,
                        executed: false,
                        commandKey: "edit.undo",
                        aliasMatched,
                        isDuplicateTool: true,
                        error: "Lệnh 'edit.undo' trùng với công cụ có sẵn. Hãy sử dụng tool 'undo' để hoàn tác thay đổi một cách an toàn.",
                    });
                }
                if (resolvedKey === "edit.redo") {
                    return JSON.stringify({
                        success: false,
                        executed: false,
                        commandKey: "edit.redo",
                        aliasMatched,
                        isDuplicateTool: true,
                        error: "Lệnh 'edit.redo' trùng với công cụ có sẵn. Hãy sử dụng tool 'redo' để thực hiện lại thay đổi một cách an toàn.",
                    });
                }
                if (resolvedKey === "modify.deleteNode") {
                    return JSON.stringify({
                        success: false,
                        executed: false,
                        commandKey: "modify.deleteNode",
                        aliasMatched,
                        isDuplicateTool: true,
                        error: "Lệnh 'modify.deleteNode' trùng với công cụ có sẵn. Hãy sử dụng tool 'delete_node' để xóa đối tượng với kiểm soát id an toàn.",
                    });
                }
                if (resolvedKey === "doc.save") {
                    return JSON.stringify({
                        success: false,
                        executed: false,
                        commandKey: "doc.save",
                        aliasMatched,
                        error: "Lệnh lưu tài liệu 'doc.save' là thao tác hệ thống tệp tin do người dùng chủ động điều khiển trên giao diện.",
                    });
                }

                // 3. Block interactive commands requiring mouse clicks
                if (!SAFE_DIRECT_COMMANDS.has(resolvedKey)) {
                    const guide = findCommandGuide(resolvedKey);
                    if (!guide && !isAlias) {
                        return JSON.stringify({
                            success: false,
                            executed: false,
                            error: `Không tìm thấy lệnh hoặc bí danh '${rawCommand}'.`,
                        });
                    }
                    return JSON.stringify({
                        success: false,
                        executed: false,
                        interactiveCommandBlocked: true,
                        commandKey: resolvedKey,
                        aliasMatched,
                        message: `Lệnh '${resolvedKey}' là lệnh tương tác trực tiếp yêu cầu thao tác chuột trên màn hình vẽ (viewport). AI không thể click chuột thay người dùng. Nếu bạn muốn AI tạo hình, hãy yêu cầu AI tạo bằng mã lệnh (run_program / run_parametric). Nếu bạn muốn tự thao tác, hãy xem hướng dẫn từng bước bên dưới.`,
                        guide: guide
                            ? {
                                  commandKey: guide.commandKey,
                                  purpose: guide.purpose,
                                  requiredPreconditions: guide.requiredPreconditions,
                                  geometryConstraints: guide.geometryConstraints,
                                  userStepByStepGuide: guide.userStepByStepGuide,
                              }
                            : undefined,
                    });
                }

                // 4. Precondition check for selection-dependent safe commands
                if (resolvedKey === "modify.hideSelected" || resolvedKey === "modify.isolateSelected") {
                    const selected =
                        typeof doc.selection?.getSelectedNodes === "function"
                            ? doc.selection.getSelectedNodes()
                            : ((Reflect.get(doc.selection, "nodes") as unknown[] | undefined) ?? []);

                    if (!selected || selected.length === 0) {
                        const guide = findCommandGuide(resolvedKey);
                        return JSON.stringify({
                            success: false,
                            executed: false,
                            commandKey: resolvedKey,
                            preconditionFailed: true,
                            error: `Lệnh '${resolvedKey}' yêu cầu phải có đối tượng đang được chọn (selected) trước khi thực thi. Hãy chọn đối tượng trên bản vẽ trước hoặc dùng select_nodes.`,
                            guide: guide
                                ? {
                                      commandKey: guide.commandKey,
                                      purpose: guide.purpose,
                                      requiredPreconditions: guide.requiredPreconditions,
                                      geometryConstraints: guide.geometryConstraints,
                                      userStepByStepGuide: guide.userStepByStepGuide,
                                  }
                                : undefined,
                        });
                    }
                }

                // 5. Execute safe command, track errors, and await pendingWork completion
                let caughtError: string | undefined;
                const onError = (msg: string) => {
                    caughtError = msg;
                };
                const onAppError = (msg: unknown) => {
                    caughtError = typeof msg === "string" ? msg : String(msg);
                };

                PubSub.default.sub("displayError", onError);
                PubSub.default.sub("applicationError", onAppError);

                try {
                    PubSub.default.pub("executeCommand", resolvedKey as CommandKeys);
                    await pendingWork.whenIdle();
                } catch (err) {
                    caughtError = err instanceof Error ? err.message : String(err);
                } finally {
                    PubSub.default.remove("displayError", onError);
                    PubSub.default.remove("applicationError", onAppError);
                }

                if (caughtError) {
                    return JSON.stringify({
                        success: false,
                        executed: true,
                        dispatched: true,
                        completed: false,
                        commandKey: resolvedKey,
                        error: `Thực thi lệnh '${resolvedKey}' thất bại: ${caughtError}`,
                    });
                }

                return JSON.stringify({
                    success: true,
                    executed: true,
                    dispatched: true,
                    completed: true,
                    commandKey: resolvedKey,
                    message: `Lệnh '${resolvedKey}' đã được thực thi hoàn tất.`,
                });
            },
        },
    ];
}
