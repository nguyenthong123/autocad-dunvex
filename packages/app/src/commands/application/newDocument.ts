// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, type IApplication, type ICommand } from "@chili3d/core";

let count = 1;

@command({
    key: "doc.new",
    icon: "icon-new",
    isApplicationCommand: true,
})
export class NewDocument implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const baseName = "Dự án";
        const existingNames = new Set(Array.from(app.documents).map((d) => d.name));
        let index = count++;
        while (existingNames.has(`${baseName} ${index}`)) {
            index++;
        }
        await app.newDocument(`${baseName} ${index}`);
    }
}
