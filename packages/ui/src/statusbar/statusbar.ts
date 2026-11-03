// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type BridgeStatus, Config, I18n, type I18nKeys, Navigation3D, PubSub } from "@chili3d/core";
import { div, label } from "@chili3d/element";
import { showConflictDialog } from "../dialog/conflictDialog";
import { CommandBar } from "./commandBar";
import { ErrorStatus } from "./errorStatus";
import { SnapConfig } from "./snapConfig";
import style from "./statusbar.module.css";

// Bridge diagnostics and the brand stay English across locales rather than shipping a
// half-translated label; the tooltip produced by the bridge client follows the same policy.
const BridgeLabels: Record<BridgeStatus, string> = {
    connected: "● AI bridge",
    retrying: "○ AI bridge",
    blocked: "○ AI bridge (blocked)",
    replaced: "○ AI bridge (taken over)",
    closed: "○ AI bridge (closed)",
};

export class Statusbar extends HTMLElement {
    private _isDefaultTip = true;
    private bridge?: HTMLElement;
    private syncLabel?: HTMLElement;
    private readonly right = div({ className: style.right }, new SnapConfig(), new ErrorStatus());

    readonly commandBar = new CommandBar();

    readonly tip = label({
        textContent: "",
        className: style.tip,
    });

    constructor(className: string) {
        super();
        this.className = `${style.panel} ${className}`;

        this.setDefaultTip();
        this.render();

        PubSub.default.sub("statusBarTip", this.statusBarTip);
        PubSub.default.sub("clearStatusBarTip", this.setDefaultTip);
        PubSub.default.sub("bridgeStatusChanged", this.bridgeStatusChanged);
        PubSub.default.sub("syncStatusChanged", this.syncStatusChanged);
        Config.instance.onPropertyChanged(this.handleConfigChanged);
    }

    private readonly handleConfigChanged = (prop: keyof Config) => {
        if (prop === "navigation3D" && this._isDefaultTip) {
            this.setDefaultTip();
        }
    };

    private render() {
        this.append(div({ className: style.left }, this.commandBar, this.tip), this.right);
    }

    private readonly bridgeStatusChanged = (status: BridgeStatus | undefined, title?: string) => {
        if (!status) {
            this.bridge?.remove();
            this.bridge = undefined;
            return;
        }
        if (!this.bridge) {
            this.bridge = label({ className: style.bridge });
            this.right.append(this.bridge);
        }
        this.bridge.textContent = BridgeLabels[status];
        this.bridge.title = title ?? "";
        this.bridge.dataset["status"] = status;
    };

    private readonly syncStatusChanged = (
        status: "saved" | "saving" | "pending" | "error" | "conflict",
        count?: number,
    ) => {
        if (!this.syncLabel) {
            this.syncLabel = label({ className: style.sync });
            this.syncLabel.onclick = () => {
                if (this.syncLabel?.dataset["syncStatus"] === "conflict") {
                    showConflictDialog();
                }
            };
            this.right.prepend(this.syncLabel);
        }
        if (status === "saved") {
            I18n.set(this.syncLabel, "textContent", "sync.saved");
        } else if (status === "saving") {
            I18n.set(this.syncLabel, "textContent", "sync.saving");
        } else if (status === "pending") {
            I18n.set(this.syncLabel, "textContent", "sync.pending{0}", count ?? 1);
        } else if (status === "error") {
            I18n.set(this.syncLabel, "textContent", "sync.error");
        } else if (status === "conflict") {
            I18n.set(this.syncLabel, "textContent", "sync.conflict");
            showConflictDialog();
        }
        this.syncLabel.dataset["syncStatus"] = status;
    };

    private readonly statusBarTip = (tip: I18nKeys, ...args: any[]) => {
        this._isDefaultTip = false;
        I18n.set(this.tip, "textContent", tip, ...args);
    };

    private readonly setDefaultTip = () => {
        this._isDefaultTip = true;
        const { pan, rotate } = Navigation3D.navigationKeyMap();
        I18n.set(this.tip, "textContent", "prompt.default{0}{1}", pan, rotate);
    };
}

customElements.define("chili-statusbar", Statusbar);
