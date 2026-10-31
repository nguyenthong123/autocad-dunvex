// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AsyncController, CommandStore, type IView, PubSub } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { describe, expect, rs, test } from "@rstest/core";
import { PanEventHandler, PanView } from "../../../src/commands/application/panView";

function createMockView(): IView {
    const doc = createMockDocument();
    return {
        id: "view-1",
        name: "Mock View",
        document: doc,
        dom: document.createElement("div"),
        cameraController: {
            pan: rs.fn((_dx: number, _dy: number) => {}),
        } as any,
        update: rs.fn(() => {}),
        dispose: rs.fn(() => {}),
        render: rs.fn(() => {}),
        resize: rs.fn(() => {}),
        project: rs.fn(() => ({ x: 0, y: 0, z: 0 }) as any),
        unproject: rs.fn(() => ({ x: 0, y: 0, z: 0 }) as any),
    } as unknown as IView;
}

describe("PanView & PanEventHandler", () => {
    test("should have command metadata registered", () => {
        const data = CommandStore.getComandData(PanView);
        expect(data).not.toBeNull();
        expect(data?.key).toBe("view.pan");
        expect(data?.icon).toBe("icon-move");
    });

    test("PanEventHandler manages cursor, status bar tip, and dragging", () => {
        const view = createMockView();
        const controller = new AsyncController();
        const cursorEvents: string[] = [];
        const tipEvents: string[] = [];

        const onCursor = (type: any) => cursorEvents.push(type);
        const onTip = (tip: any) => tipEvents.push(tip);
        const onClearTip = () => tipEvents.push("clear");

        PubSub.default.sub("viewCursor", onCursor);
        PubSub.default.sub("statusBarTip", onTip);
        PubSub.default.sub("clearStatusBarTip", onClearTip);

        try {
            const handler = new PanEventHandler(view, controller);
            expect(cursorEvents).toContain("grab");
            expect(tipEvents).toContain("prompt.pan");

            // Left click down starts dragging and sets grabbing cursor
            handler.pointerDown(view, {
                button: 0,
                offsetX: 100,
                offsetY: 100,
            } as PointerEvent);
            expect(cursorEvents.at(-1)).toBe("grabbing");

            // Pointer move pans camera
            handler.pointerMove(view, {
                offsetX: 120,
                offsetY: 130,
            } as PointerEvent);
            expect(view.cameraController.pan).toHaveBeenCalledWith(20, 30);
            expect(view.update).toHaveBeenCalled();

            // Pointer up releases drag and restores grab cursor
            handler.pointerUp(view, { button: 0 } as PointerEvent);
            expect(cursorEvents.at(-1)).toBe("grab");

            // Pointer move after release does not pan
            (view.cameraController.pan as any).mockClear();
            handler.pointerMove(view, {
                offsetX: 140,
                offsetY: 150,
            } as PointerEvent);
            expect(view.cameraController.pan).not.toHaveBeenCalled();

            // Dispose cleans up cursor and tip
            handler.dispose();
            expect(cursorEvents.at(-1)).toBe("default");
            expect(tipEvents.at(-1)).toBe("clear");
        } finally {
            PubSub.default.remove("viewCursor", onCursor);
            PubSub.default.remove("statusBarTip", onTip);
            PubSub.default.remove("clearStatusBarTip", onClearTip);
            controller.dispose();
        }
    });

    test("PanEventHandler cancels on right click or key presses", () => {
        const view = createMockView();
        const controller = new AsyncController();
        const cancelSpy = rs.spyOn(controller, "cancel");
        const handler = new PanEventHandler(view, controller);

        // Right click
        handler.pointerDown(view, { button: 2 } as PointerEvent);
        expect(cancelSpy).toHaveBeenCalledTimes(1);

        // Escape key
        const escEvent = {
            key: "Escape",
            preventDefault: rs.fn(),
            stopImmediatePropagation: rs.fn(),
        } as unknown as KeyboardEvent;
        handler.keyDown(view, escEvent);
        expect(cancelSpy).toHaveBeenCalledTimes(2);
        expect(escEvent.preventDefault).toHaveBeenCalled();

        // Enter key
        const enterEvent = {
            key: "Enter",
            preventDefault: rs.fn(),
            stopImmediatePropagation: rs.fn(),
        } as unknown as KeyboardEvent;
        handler.keyDown(view, enterEvent);
        expect(cancelSpy).toHaveBeenCalledTimes(3);

        // Space key
        const spaceEvent = {
            key: " ",
            preventDefault: rs.fn(),
            stopImmediatePropagation: rs.fn(),
        } as unknown as KeyboardEvent;
        handler.keyDown(view, spaceEvent);
        expect(cancelSpy).toHaveBeenCalledTimes(4);

        handler.dispose();
        controller.dispose();
    });

    test("PanView command swaps and restores visual.eventHandler", async () => {
        const app = createMockApplication();
        const view = createMockView();
        (app as any).activeView = view;

        const originalHandler = view.document.visual.eventHandler;
        const cmd = new PanView();

        const execPromise = cmd.execute(app);

        // The handler should now be replaced
        expect(view.document.visual.eventHandler).not.toBe(originalHandler);

        // Cancel command to finish execution
        await cmd.cancel();
        await execPromise;

        // Handler restored
        expect(view.document.visual.eventHandler).toBe(originalHandler);
    });
});
