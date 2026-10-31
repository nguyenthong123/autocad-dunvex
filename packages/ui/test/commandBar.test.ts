// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type CommandKeys, PubSub } from "@chili3d/core";
import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";

rs.mock("../src/statusbar/commandBar.module.css", () => ({
    container: "cb-container",
    prefix: "cb-prefix",
    input: "cb-input",
    popup: "cb-popup",
    item: "cb-item",
    active: "cb-active",
    alias: "cb-alias",
    desc: "cb-desc",
}));

import { CommandBar } from "../src/statusbar/commandBar";
import { mustQuery } from "./_helpers/domHelpers";

describe("CommandBar", () => {
    let executedCommands: CommandKeys[] = [];

    const onExecuteCommand = (cmd: CommandKeys) => {
        executedCommands.push(cmd);
    };

    beforeEach(() => {
        executedCommands = [];
        PubSub.default.sub("executeCommand", onExecuteCommand);
    });

    afterEach(() => {
        PubSub.default.remove("executeCommand", onExecuteCommand);
        document.body.replaceChildren();
    });

    function createBar() {
        const bar = new CommandBar();
        document.body.append(bar);
        const inputEl = mustQuery<HTMLInputElement>(bar, ".cb-input");
        const popupEl = mustQuery<HTMLDivElement>(bar, ".cb-popup");
        return { bar, inputEl, popupEl };
    }

    test("should render prefix and input with placeholder", () => {
        const { bar, inputEl } = createBar();
        expect(bar.textContent).toContain("COMMAND:");
        expect(inputEl.placeholder).toContain("AutoCAD");
    });

    test("should show suggestions when user types a query", () => {
        const { inputEl, popupEl } = createBar();
        inputEl.value = "L";
        inputEl.dispatchEvent(new Event("input"));

        expect(popupEl.style.display).toBe("flex");
        const items = popupEl.querySelectorAll(".cb-item");
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].textContent).toContain("L");
    });

    test("should execute command on Enter", () => {
        const { inputEl } = createBar();
        inputEl.value = "L";
        inputEl.dispatchEvent(new Event("input"));

        inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(executedCommands).toContain("create.line");
        expect(inputEl.value).toBe("");
    });

    test("should execute command on Space", () => {
        const { inputEl } = createBar();
        inputEl.value = "REC";
        inputEl.dispatchEvent(new Event("input"));

        inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
        expect(executedCommands).toContain("create.rect");
    });

    test("should execute special.last on Enter when input is empty", () => {
        const { inputEl } = createBar();
        inputEl.value = "";
        inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        expect(executedCommands).toContain("special.last");
    });

    test("should clear and hide popup on Escape", () => {
        const { inputEl, popupEl } = createBar();
        inputEl.value = "TR";
        inputEl.dispatchEvent(new Event("input"));
        expect(popupEl.style.display).toBe("flex");

        inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(inputEl.value).toBe("");
        expect(popupEl.style.display).toBe("none");
    });

    test("should support arrow navigation in suggestions popup", () => {
        const { inputEl, popupEl } = createBar();
        inputEl.value = "D";
        inputEl.dispatchEvent(new Event("input"));

        const items = popupEl.querySelectorAll(".cb-item");
        expect(items.length).toBeGreaterThan(1);
        expect(items[0].classList.contains("cb-active")).toBe(true);

        inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
        const updatedItems = popupEl.querySelectorAll(".cb-item");
        expect(updatedItems[1].classList.contains("cb-active")).toBe(true);
    });
});
