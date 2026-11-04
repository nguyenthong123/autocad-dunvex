// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, type IApplication, type ICommand, PubSub } from "@chili3d/core";

export const MANUAL_ICON = {
    type: "svg" as const,
    value: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M8 7h8"></path><path d="M8 11h6"></path></svg>`,
};

@command({
    key: "app.manual",
    icon: MANUAL_ICON,
    isApplicationCommand: true,
})
export class ManualCommand implements ICommand {
    async execute(_app: IApplication): Promise<void> {
        PubSub.default.pub("showManual");
    }
}
