// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, type I18nKeys, type IApplication, type ICommand, PubSub } from "@chili3d/core";
import { LibraryPanel } from "../ui/libraryPanel";

@command({
    key: "componentLibrary.open" as any,
    icon: {
        type: "path",
        value: "icons/library.svg",
    },
    helpText: "componentLibrary.description" as any,
})
export class OpenLibraryCommand implements ICommand {
    private static currentPanel: LibraryPanel | null = null;

    async execute(application: IApplication): Promise<void> {
        if (!OpenLibraryCommand.currentPanel) {
            OpenLibraryCommand.currentPanel = new LibraryPanel(application);
        }

        PubSub.default.pub("showFloatPanel", {
            title: "componentLibrary.title" as I18nKeys,
            content: OpenLibraryCommand.currentPanel.getElement(),
            width: 360,
            height: 620,
        });
    }
}
