// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AutoCADCommandAliases, type CommandKeys, I18n, type I18nKeys, PubSub } from "@chili3d/core";
import { div, input, span } from "@chili3d/element";
import style from "./commandBar.module.css";

interface SuggestionItem {
    alias: string;
    commandKey: CommandKeys;
    description: string;
}

export class CommandBar extends HTMLElement {
    private readonly _input: HTMLInputElement;
    private readonly _popup: HTMLDivElement;
    private _suggestions: SuggestionItem[] = [];
    private _selectedIndex = 0;

    constructor() {
        super();
        this.className = style.container;
        this._input = input({
            type: "text",
            className: style.input,
            placeholder: "Nhập lệnh AutoCAD (VD: L, REC, C, TR, DLI)...",
            oninput: () => this.handleInput(),
            onkeydown: (e: KeyboardEvent) => this.handleKeyDown(e),
            onblur: () => setTimeout(() => this.hidePopup(), 150),
        });
        this._popup = div({ className: style.popup });
        this.append(span({ className: style.prefix, textContent: "COMMAND:" }), this._input, this._popup);
    }

    focusInput(initialChar?: string) {
        this._input.focus();
        if (initialChar) {
            this._input.value = initialChar.toUpperCase();
            this.handleInput();
        }
    }

    private handleInput() {
        const query = this._input.value.trim().toUpperCase();
        if (!query) {
            this.hidePopup();
            return;
        }

        this._suggestions = Object.entries(AutoCADCommandAliases)
            .filter(([alias]) => alias.startsWith(query))
            .slice(0, 8)
            .map(([alias, commandKey]) => ({
                alias,
                commandKey,
                description: I18n.translate(`command.${commandKey}` as I18nKeys),
            }));

        this._selectedIndex = 0;
        this.renderPopup();
    }

    private renderPopup() {
        this._popup.innerHTML = "";
        if (this._suggestions.length === 0) {
            this._popup.style.display = "none";
            return;
        }
        this._popup.style.display = "flex";
        this._suggestions.forEach((item, index) => {
            const row = div(
                {
                    className: `${style.item} ${index === this._selectedIndex ? style.active : ""}`,
                    onmousedown: (e: MouseEvent) => {
                        e.preventDefault();
                        this.executeAlias(item.commandKey);
                    },
                },
                span({ className: style.alias, textContent: item.alias }),
                span({ className: style.desc, textContent: item.description }),
            );
            this._popup.append(row);
        });
    }

    private handleKeyDown(e: KeyboardEvent) {
        e.stopPropagation();

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (this._suggestions.length > 0) {
                this._selectedIndex = (this._selectedIndex + 1) % this._suggestions.length;
                this.renderPopup();
            }
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (this._suggestions.length > 0) {
                this._selectedIndex =
                    (this._selectedIndex - 1 + this._suggestions.length) % this._suggestions.length;
                this.renderPopup();
            }
            return;
        }

        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const raw = this._input.value.trim().toUpperCase();
            if (!raw) {
                this.executeAlias("special.last" as CommandKeys);
                return;
            }
            const target = this._suggestions[this._selectedIndex]?.commandKey ?? AutoCADCommandAliases[raw];
            if (target) {
                this.executeAlias(target);
            }
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            this.clearAndBlur();
        }
    }

    private executeAlias(commandKey: CommandKeys) {
        this.clearAndBlur();
        PubSub.default.pub("executeCommand", commandKey);
    }

    private hidePopup() {
        this._popup.style.display = "none";
        this._suggestions = [];
    }

    private clearAndBlur() {
        this._input.value = "";
        this.hidePopup();
        this._input.blur();
    }
}

customElements.define("chili-command-bar", CommandBar);
