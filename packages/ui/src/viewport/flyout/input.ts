// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, type I18nKeys, type IDisposable, Localize, type Result } from "@chili3d/core";
import { input, label } from "@chili3d/element";
import style from "./input.module.css";

export class Input extends HTMLElement implements IDisposable {
    private readonly _cancelledCallbacks: (() => void)[] = [];
    private readonly _completedCallbacks: (() => void)[] = [];
    private readonly textbox: HTMLInputElement;
    private tip?: HTMLLabelElement;
    /** What this box last put in itself, so `setText` can tell its own writing from the user's. */
    private written: string;

    constructor(
        text: string,
        readonly handler: (text: string) => Result<string, I18nKeys>,
    ) {
        super();
        this.className = style.panel;
        this.written = text;
        this.textbox = input({
            value: text,
            onkeydown: this.handleKeyDown,
        });
        this.append(this.textbox);
    }

    /**
     * Refreshes the text of a box that is standing in as a readout — a drag keeping the value
     * under the pointer while the hand moves it.
     *
     * Once the box holds anything other than what this last wrote, the user is typing in it and
     * it stops being a readout: the number being typed is the one that was asked for, and the
     * next step of the drag must not overwrite it. Comparing against what was written rather
     * than against focus is what makes that work while the drag still has the box focused.
     */
    setText(text: string): void {
        if (this.textbox.value !== this.written) return;
        this.textbox.value = text;
        this.written = text;
        // and taken as a whole again: the drag rewrites this on every step, and a rewrite
        // leaves the caret at the end of it, so without this the number being typed next
        // would land after the one the hand is on rather than in its place
        this.selectAll();
    }

    onCancelled(callback: () => void) {
        this._cancelledCallbacks.push(callback);
    }

    onCompleted(callback: () => void) {
        this._completedCallbacks.push(callback);
    }

    get text(): string {
        return this.textbox.value;
    }

    override focus() {
        this.textbox.focus();
        const len = this.textbox.value.length;
        this.textbox.setSelectionRange?.(len, len);
    }

    /** Takes the whole text, so the next thing typed replaces it rather than landing inside it. */
    selectAll() {
        this.textbox.select();
    }

    dispose() {
        this._cancelledCallbacks.length = 0;
        this._completedCallbacks.length = 0;
    }

    private showTip(tip: I18nKeys) {
        if (this.tip === undefined) {
            this.tip = label({
                textContent: new Localize(tip),
                className: style.error,
            });
            this.append(this.tip);
        } else {
            I18n.set(this.tip, "textContent", tip);
        }
    }

    private removeTip() {
        if (this.tip === undefined) return;
        this.removeChild(this.tip);
        this.tip = undefined;
    }

    private readonly handleKeyDown = (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.processEnterKey();
        } else if (e.key === "Tab") {
            e.preventDefault();
            this.handleTabKey();
        } else if (e.key === "Escape") {
            e.preventDefault();
            this._cancelledCallbacks.forEach((callback) => callback());
        } else {
            this.removeTip();
        }
    };

    private handleTabKey() {
        this.removeTip();
        const val = this.textbox.value;
        const commaIdx = val.indexOf(",");
        if (commaIdx === -1) {
            this.textbox.value = `${val},`;
            const len = this.textbox.value.length;
            this.textbox.setSelectionRange?.(len, len);
        } else {
            const caret = this.textbox.selectionStart ?? val.length;
            if (caret <= commaIdx) {
                this.textbox.setSelectionRange?.(commaIdx + 1, val.length);
            } else {
                this.textbox.setSelectionRange?.(0, commaIdx);
            }
        }
    }

    private processEnterKey() {
        this.textbox.readOnly = true;
        const error = this.handler(this.textbox.value);
        if (error.isOk) {
            this._completedCallbacks.forEach((callback) => callback());
        } else {
            this.textbox.readOnly = false;
            this.showTip(error.error);
        }
    }
}

customElements.define("chili-input", Input);
