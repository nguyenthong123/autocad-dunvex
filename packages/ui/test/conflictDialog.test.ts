// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { en, ptBr, ru, vi, zhCn } from "@chili3d/i18n";
import { describe, expect, test } from "@rstest/core";
import { showConflictDialog } from "../src/dialog/conflictDialog";

// Mock CSS module
rs.mock("../src/dialog.module.css", () => ({
    root: "dialog-root",
    title: "dialog-title",
    content: "dialog-content",
    buttons: "dialog-buttons",
}));

describe("ConflictDialog & i18n", () => {
    test("should have all 6 conflict keys translated in all 5 languages", () => {
        const requiredKeys = [
            "dialog.conflict.title",
            "dialog.conflict.message",
            "dialog.conflict.overwrite",
            "dialog.conflict.pull",
            "dialog.conflict.saveCopy",
            "dialog.conflict.copySuffix",
        ] as const;

        const locales = [
            { name: "vi", dict: vi.translation },
            { name: "en", dict: en.translation },
            { name: "zh-cn", dict: zhCn.translation },
            { name: "ru", dict: ru.translation },
            { name: "pt-br", dict: ptBr.translation },
        ];

        for (const loc of locales) {
            for (const key of requiredKeys) {
                const val = (loc.dict as Record<string, string>)[key];
                if (!val) {
                    throw new Error(`Missing key ${key} in locale ${loc.name}`);
                }
                expect(val).toBeDefined();
                expect(typeof val).toBe("string");
                expect(val.length).toBeGreaterThan(0);
            }
        }
    });

    test("should emit showDialog with 3 action buttons: overwrite, pull, and saveCopy", async () => {
        let publishedTitle: string | null = null;
        let publishedButtons: any[] = [];

        const handler = (title: string, _content: HTMLElement, buttons: any) => {
            publishedTitle = title;
            publishedButtons = buttons;
        };

        PubSub.default.sub("showDialog" as any, handler);

        let overwriteCalled = false;
        let pullCalled = false;
        let saveCopyCalled = false;

        showConflictDialog({
            onOverwrite: () => {
                overwriteCalled = true;
            },
            onPull: () => {
                pullCalled = true;
            },
            onSaveCopy: () => {
                saveCopyCalled = true;
            },
        });

        expect(publishedTitle).toBe("dialog.conflict.title");
        expect(publishedButtons.length).toBe(3);
        expect(publishedButtons[0].content).toBe("dialog.conflict.overwrite");
        expect(publishedButtons[1].content).toBe("dialog.conflict.pull");
        expect(publishedButtons[2].content).toBe("dialog.conflict.saveCopy");

        // Verify button clicks
        await publishedButtons[0].onclick();
        expect(overwriteCalled).toBe(true);

        await publishedButtons[1].onclick();
        expect(pullCalled).toBe(true);

        await publishedButtons[2].onclick();
        expect(saveCopyCalled).toBe(true);

        PubSub.default.remove("showDialog" as any, handler);
    });
});
