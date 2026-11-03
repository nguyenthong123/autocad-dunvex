// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type DialogButton, getCurrentApplication, I18n, PubSub } from "@chili3d/core";
import { div, label } from "@chili3d/element";
import style from "../dialog.module.css";

export interface ConflictDialogOptions {
    onOverwrite?: () => Promise<void> | void;
    onPull?: () => Promise<void> | void;
    onSaveCopy?: () => Promise<void> | void;
}

let isConflictDialogOpen = false;

export function showConflictDialog(options: ConflictDialogOptions = {}) {
    if (isConflictDialogOpen) return;
    isConflictDialogOpen = true;

    let app: any = null;
    try {
        app = getCurrentApplication();
    } catch {
        // In unit tests or background contexts application may not yet be initialized
    }
    const storage = app?.storage as any;
    const outbox = storage?.outbox;

    const content = div(
        { className: style.content },
        label({ textContent: I18n.translate("dialog.conflict.message") }),
    );

    const cleanup = () => {
        isConflictDialogOpen = false;
    };

    const buttons: DialogButton[] = [
        {
            content: "dialog.conflict.overwrite",
            onclick: async () => {
                cleanup();
                if (options.onOverwrite) {
                    await options.onOverwrite();
                } else if (outbox) {
                    const items = outbox.getPendingItems();
                    const conflictItem = items.find((i: any) => i.conflict);
                    if (conflictItem) {
                        await outbox.resolveConflictOverwrite(conflictItem.id);
                    }
                }
            },
        },
        {
            content: "dialog.conflict.pull",
            onclick: async () => {
                cleanup();
                if (options.onPull) {
                    await options.onPull();
                } else if (storage && outbox) {
                    const items = outbox.getPendingItems();
                    const conflictItem = items.find((i: any) => i.conflict);
                    if (conflictItem) {
                        await outbox.resolveConflictDiscard(conflictItem.id);
                        if (app && typeof app.openDocument === "function") {
                            await app.openDocument(conflictItem.recordId);
                        }
                    }
                }
            },
        },
        {
            content: "dialog.conflict.saveCopy",
            onclick: async () => {
                cleanup();
                if (options.onSaveCopy) {
                    await options.onSaveCopy();
                } else if (storage && outbox) {
                    const items = outbox.getPendingItems();
                    const conflictItem = items.find((i: any) => i.conflict);
                    if (conflictItem) {
                        await storage.resolveConflictSaveCopy(conflictItem.id);
                        if (app && typeof app.openDocument === "function") {
                            await app.openDocument(conflictItem.recordId);
                        }
                    }
                }
            },
        },
    ];

    PubSub.default.pub("showDialog", "dialog.conflict.title", content, buttons);
}
