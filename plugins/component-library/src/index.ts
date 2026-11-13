// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, Plugin, RibbonGroupKeys, RibbonTabKeys } from "@chili3d/core";
import { OpenLibraryCommand } from "./commands/openLibraryCommand";

const ComponentLibraryPlugin: Plugin = {
    commands: [OpenLibraryCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.plugin" as RibbonTabKeys,
            groups: [
                {
                    groupName: "ribbon.group.plugin" as RibbonGroupKeys,
                    items: ["componentLibrary.open" as CommandKeys],
                },
            ],
        },
    ],
    i18nResources: [
        {
            language: "vi-VN",
            display: "Tiếng Việt",
            translation: {
                "command.componentLibrary.open": "Thư viện chi tiết",
                "componentLibrary.title": "Thư viện chi tiết Dunvex",
                "componentLibrary.description": "Mở bảng thư viện chi tiết mẫu lam và tấm ốp vách",
            },
        } as any,
        {
            language: "en",
            display: "English",
            translation: {
                "command.componentLibrary.open": "Component Library",
                "componentLibrary.title": "Dunvex Component Library",
                "componentLibrary.description": "Open component library panel for slats and wall panels",
            },
        } as any,
    ],
};

export default ComponentLibraryPlugin;
