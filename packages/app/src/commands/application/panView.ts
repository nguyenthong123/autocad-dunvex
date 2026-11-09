// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    CancelableCommand,
    command,
    type IEventHandler,
    type IView,
    PubSub,
} from "@chili3d/core";

export class PanEventHandler implements IEventHandler {
    isEnabled = true;
    private _isDragging = false;
    private _lastPos?: { x: number; y: number };

    constructor(
        private readonly view: IView,
        private readonly controller: AsyncController,
    ) {
        PubSub.default.pub("viewCursor", "grab");
        PubSub.default.pub("statusBarTip", "prompt.pan" as any);
    }

    dispose(): void {
        PubSub.default.pub("viewCursor", "default");
        PubSub.default.pub("clearStatusBarTip");
    }

    pointerDown(view: IView, event: PointerEvent): void {
        if (event.button === 0) {
            this._isDragging = true;
            this._lastPos = { x: event.offsetX, y: event.offsetY };
            PubSub.default.pub("viewCursor", "grabbing");
        } else if (event.button === 2) {
            this.controller.cancel();
        }
    }

    pointerMove(view: IView, event: PointerEvent): void {
        if (!this._isDragging || !this._lastPos) return;
        const dx = event.offsetX - this._lastPos.x;
        const dy = event.offsetY - this._lastPos.y;
        if (dx === 0 && dy === 0) return;
        this._lastPos = { x: event.offsetX, y: event.offsetY };
        view.cameraController.pan(dx, dy);
        view.update();
    }

    pointerUp(_view: IView, event: PointerEvent): void {
        if (event.button === 0) {
            this._isDragging = false;
            this._lastPos = undefined;
            PubSub.default.pub("viewCursor", "grab");
        }
    }

    pointerOut(_view: IView, _event: PointerEvent): void {
        this._isDragging = false;
        this._lastPos = undefined;
        PubSub.default.pub("viewCursor", "grab");
    }

    mouseWheel(view: IView, _event: WheelEvent): void {
        view.update();
    }

    keyDown(_view: IView, event: KeyboardEvent): void {
        if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.controller.cancel();
        }
    }
}

@command({
    key: "view.pan",
    icon: "icon-move",
})
export class PanView extends CancelableCommand {
    protected override async executeAsync(): Promise<void> {
        const view = this.application.activeView;
        if (!view) return;

        const visual = view.document.visual;
        const previousHandler = visual.eventHandler;
        this.controller = new AsyncController();
        const panHandler = new PanEventHandler(view, this.controller);
        visual.eventHandler = panHandler;

        await new Promise<void>((resolve) => {
            this.controller!.onCancelled(() => resolve());
            this.controller!.onCompleted(() => resolve());
        });

        if (visual.eventHandler === panHandler) {
            visual.eventHandler = previousHandler;
        }
        panHandler.dispose();
    }
}
