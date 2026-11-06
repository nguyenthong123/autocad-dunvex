// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createToolHost } from "../src/tools/host";

describe("tool host", () => {
    test("does not offer the in-app ask_user to an external client", () => {
        const names = createToolHost()
            .list()
            .map((tool) => tool.name);
        expect(names).not.toContain("ask_user");
        expect(names).not.toContain("propose_task_plan");
        expect(names).toContain("run_program");
    });

    test("explains that ask_user is unavailable rather than reporting it as unknown", async () => {
        const reply = await createToolHost().call("ask_user", { question: "keep or discard?" });
        expect(reply.ok).toBe(false);
        expect(reply.content).toContain("not available over the bridge");
    });

    test("explains that propose_task_plan is unavailable on the bridge", async () => {
        const reply = await createToolHost().call("propose_task_plan", {
            allowedModifiedNodeIds: ["n1"],
        });
        expect(reply.ok).toBe(false);
        expect(reply.content).toContain("not available over the bridge");
    });
});
