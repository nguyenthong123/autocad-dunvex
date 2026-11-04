// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { ManualCommand } from "../../../src/commands/application/manualCommand";

describe("ManualCommand", () => {
    test("should have command metadata", () => {
        const data = (ManualCommand as any).prototype.data;
        expect(data).not.toBeNull();
        expect(data.key).toBe("app.manual");
        expect(data.icon).toBeDefined();
    });

    test("should have isApplicationCommand flag", () => {
        const data = (ManualCommand as any).prototype.data;
        expect(data.isApplicationCommand).toBe(true);
    });

    test("should emit showManual event on execute", async () => {
        let manualShown = false;
        const originalPub = PubSub.default.pub;
        PubSub.default.pub = ((channel: string, ..._args: any[]) => {
            if (channel === "showManual") {
                manualShown = true;
            }
        }) as any;

        const app = createMockApplication();
        const cmd = new ManualCommand();

        try {
            await cmd.execute(app);
            expect(manualShown).toBe(true);
        } finally {
            PubSub.default.pub = originalPub;
        }
    });
});
