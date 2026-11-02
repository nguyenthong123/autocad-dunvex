// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    type CommandKeys,
    CommandStore,
    Config,
    I18n,
    type IApplication,
    type ICommand,
    type IConverter,
    type IView,
    Localize,
    Logger,
    PubSub,
    Result,
    type Ribbon,
    type RibbonGroup,
    type RibbonTab,
    type RibbonTabKeys,
} from "@chili3d/core";
import { a, button, collection, createIcon, div, label, span, svg } from "@chili3d/element";
import { getAuthUser, logout, showAuthDialog } from "../auth/authDialog";
import style from "./ribbon.module.css";
import { RibbonPushButton } from "./ribbonButton";
import { RibbonGroupElement } from "./ribbonGroup";

export const QuickButton = (command: ICommand) => {
    const data = CommandStore.getComandData(command);
    if (!data) {
        Logger.warn("commandData is undefined");
        return span({ textContent: "null" });
    }

    const icon = createIcon(data.icon);
    icon.classList.add(style.icon);
    return span(
        {
            title: new Localize(`command.${data.key}`),
            onclick: () => PubSub.default.pub("executeCommand", data.key),
        },
        icon,
    );
};

class ViewActiveConverter implements IConverter<IView> {
    constructor(
        readonly target: IView,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: IView): Result<string> {
        return Result.ok(this.target === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class ActivedRibbonTabConverter implements IConverter<RibbonTab> {
    constructor(
        readonly tab: RibbonTab,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: RibbonTab): Result<string> {
        return Result.ok(this.tab === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class DisplayConverter<T> implements IConverter<T> {
    constructor(readonly predicate: (value: T) => boolean) {}

    convert(value: T): Result<string> {
        return Result.ok(this.predicate(value) ? "" : "none");
    }
}

export class RibbonUI extends HTMLElement {
    constructor(
        readonly app: IApplication,
        readonly dataContent: Ribbon,
    ) {
        super();
        this.className = style.root;
        this.append(this.header(), this.ribbonTabs());
    }

    private header() {
        return div({ className: style.titleBar }, this.leftPanel(), this.centerPanel(), this.rightPanel());
    }

    private leftPanel() {
        return div(
            { className: style.left },
            div(
                { className: style.appIcon, onclick: () => PubSub.default.pub("displayHome", true) },
                svg({ className: style.icon, icon: "icon-chili" }),
                span({ id: "appName", textContent: `Chili3D - v${__APP_VERSION__}` }),
            ),
            div(
                { className: style.ribbonTitlePanel },
                svg({
                    className: style.home,
                    icon: "icon-home",
                    onclick: () => PubSub.default.pub("displayHome", true),
                }),
                collection({
                    className: style.quickCommands,
                    sources: this.dataContent.quickCommands,
                    template: (command: CommandKeys) => QuickButton(command as any),
                }),
                span({ className: style.split }),
                this.createRibbonHeader(),
            ),
        );
    }

    private createRibbonHeader() {
        return collection({
            sources: this.dataContent.tabs,
            template: (tab: RibbonTab) => {
                const converter = new ActivedRibbonTabConverter(tab, style.tabHeader, style.activedTab);
                return label({
                    className: new Binding(this.dataContent, "activeTab", converter),
                    textContent: new Localize(tab.tabName),
                    style: {
                        display: new Binding(
                            tab,
                            "visible",
                            new DisplayConverter((visible: boolean) => visible),
                        ),
                    },
                    onclick: () => {
                        this.dataContent.activeTab = tab;
                    },
                });
            },
        });
    }

    private centerPanel() {
        return div(
            { className: style.center },
            collection({
                className: style.views,
                sources: this.app.views,
                template: (view) => this.createViewItem(view),
            }),
            svg({
                className: style.new,
                icon: "icon-plus",
                title: I18n.translate("command.doc.new"),
                onclick: () => PubSub.default.pub("executeCommand", "doc.new"),
            }),
        );
    }

    private createViewItem(view: IView) {
        const textSpan = span({ textContent: new Binding(view.document, "name") });
        const nameEl = div({ className: style.name }, textSpan);
        let isEditing = false;

        nameEl.ondblclick = (e: MouseEvent) => {
            e.stopPropagation();
            if (isEditing) return;
            isEditing = true;

            const inputEl = document.createElement("input");
            inputEl.type = "text";
            inputEl.value = view.document.name;
            inputEl.className = style.tabInput ?? "tabInput";

            const stop = (ev: Event) => ev.stopPropagation();
            inputEl.addEventListener("click", stop);
            inputEl.addEventListener("dblclick", stop);
            inputEl.addEventListener("mousedown", stop);
            inputEl.addEventListener("pointerdown", stop);

            const cleanup = () => {
                if (!isEditing) return;
                isEditing = false;
                inputEl.remove();
                textSpan.style.display = "";
            };

            const commitRename = () => {
                if (!isEditing) return;
                const newName = inputEl.value.trim();
                if (newName && newName !== view.document.name) {
                    view.document.name = newName;
                }
                cleanup();
            };

            inputEl.addEventListener("keydown", (ke: KeyboardEvent) => {
                ke.stopPropagation();
                if (ke.key === "Enter") {
                    commitRename();
                } else if (ke.key === "Escape") {
                    cleanup();
                }
            });

            inputEl.addEventListener("blur", () => {
                commitRename();
            });

            textSpan.style.display = "none";
            nameEl.appendChild(inputEl);
            inputEl.focus();
            inputEl.select();
        };

        return div(
            {
                className: new Binding(
                    this.app,
                    "activeView",
                    new ViewActiveConverter(view, style.tab, style.active),
                ),
                onclick: () => {
                    this.app.activeView = view;
                },
            },
            nameEl,
            svg({
                className: style.close,
                icon: "icon-times",
                onclick: (e) => {
                    e.stopPropagation();
                    view.close();
                },
            }),
        );
    }

    private accountPill() {
        const pill = div({ className: style.accountPill ?? "accountPill" });
        const update = () => {
            pill.innerHTML = "";
            const user = getAuthUser();
            if (user) {
                const nameLabel = span({
                    className: style.accountName ?? "accountName",
                    textContent: `👤 ${user.storeName || user.username}`,
                    title: `Tài khoản: ${user.username} (${user.storeName})`,
                });
                const logoutBtn = button({
                    className: style.logoutButton ?? "logoutButton",
                    textContent: "Đăng xuất",
                    onclick: (e) => {
                        e.stopPropagation();
                        logout();
                    },
                });
                pill.append(nameLabel, logoutBtn);
            } else {
                const loginBtn = button({
                    className: style.loginButton ?? "loginButton",
                    textContent: "Đăng nhập / Đăng ký",
                    onclick: (e) => {
                        e.stopPropagation();
                        showAuthDialog();
                    },
                });
                pill.append(loginBtn);
            }
        };

        update();
        PubSub.default.sub("authChanged", update);
        return pill;
    }

    private rightPanel() {
        return div(
            { className: style.right },
            this.accountPill(),
            a(
                { href: "https://github.com/xiangechen/chili3d", target: "_blank" },
                svg({ title: "Github", className: style.icon, icon: "icon-github" }),
            ),
        );
    }

    private ribbonTabs() {
        return collection({
            className: style.tabContentPanel,
            sources: this.dataContent.tabs,
            template: (tab: RibbonTab) => this.ribbonTab(tab),
        });
    }

    private ribbonTab(tab: RibbonTab) {
        return collection({
            className: style.groupPanel,
            dataset: { tab: tab.tabName },
            sources: tab.groups,
            style: {
                display: new Binding(
                    this.dataContent,
                    "activeTab",
                    new DisplayConverter((tb: RibbonTab) => tab === tb),
                ),
            },
            template: (group: RibbonGroup) => new RibbonGroupElement(group),
        });
    }

    connectedCallback(): void {
        Config.instance.onPropertyChanged(this.handleConfigChanged);
    }

    disconnectedCallback(): void {
        Config.instance.removePropertyChanged(this.handleConfigChanged);
    }

    private readonly handleConfigChanged = (prop: keyof Config) => {
        if (prop === "navigation3D") {
            this.querySelectorAll(customElements.getName(RibbonPushButton)!).forEach((x) => {
                (x as RibbonPushButton).updateShortcut();
            });
        }
    };
}

customElements.define("chili-ribbon", RibbonUI);
