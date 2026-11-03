// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n } from "@chili3d/core";
import { button, div, input, span } from "@chili3d/element";
import type { DiscoveredModel } from "./llm/discovery";
import type { KnownVendor } from "./llm/providerRegistry";
import style from "./modelPicker.module.css";

export type ModelTab = "recommended" | "all" | "custom";

export interface ModelPickerOptions {
    initialModel?: string;
    onChange?: (modelId: string) => void;
    onModelSelected?: (modelId: string) => void;
}

export class ModelPicker {
    readonly element: HTMLElement;
    private readonly triggerEl: HTMLButtonElement;
    private readonly triggerTextEl: HTMLElement;
    private readonly chevronEl: HTMLElement;
    private readonly dropdownEl: HTMLElement;
    private readonly searchInputEl: HTMLInputElement;
    private readonly tabRecommendedEl: HTMLButtonElement;
    private readonly tabAllEl: HTMLButtonElement;
    private readonly tabCustomEl: HTMLButtonElement;
    private readonly listContainerEl: HTMLElement;
    private readonly customContainerEl: HTMLElement;
    private readonly customInputEl: HTMLInputElement;
    private readonly customApplyBtnEl: HTMLButtonElement;

    private _models: DiscoveredModel[] = [];
    private _selectedModel = "";
    private _vendor?: KnownVendor;
    private _activeTab: ModelTab = "recommended";
    private _searchQuery = "";
    private _isOpen = false;
    private _focusedIndex = -1;
    private _visibleModels: DiscoveredModel[] = [];
    private _onModelSelected?: (modelId: string) => void;
    private _outsideClickListener?: (e: MouseEvent) => void;

    constructor(options: ModelPickerOptions = {}) {
        this._selectedModel = (options.initialModel ?? "").trim();
        this._onModelSelected = options.onChange ?? options.onModelSelected;

        // Trigger Button
        this.triggerTextEl = span({ className: style.triggerText });
        this.chevronEl = span({ className: style.chevron, textContent: "▼" });
        this.triggerEl = button({
            className: style.trigger,
            type: "button",
            onclick: (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            },
            onkeydown: (e) => this.handleTriggerKeyDown(e),
        });
        this.triggerEl.append(this.triggerTextEl, this.chevronEl);

        // Search Bar
        this.searchInputEl = input({
            className: style.searchInput,
            type: "text",
            placeholder: I18n.translate("ai.modelSearchPlaceholder"),
            oninput: () => {
                this._searchQuery = this.searchInputEl.value.trim().toLowerCase();
                this._focusedIndex = -1;
                this.renderList();
            },
            onkeydown: (e) => this.handleSearchKeyDown(e),
        });
        const searchContainer = div({ className: style.searchContainer }, this.searchInputEl);

        // Tabs
        this.tabRecommendedEl = button({
            className: `${style.tab} ${style.tabActive}`,
            type: "button",
            textContent: I18n.translate("ai.modelTabRecommended", "0"),
            onclick: (e) => {
                e.stopPropagation();
                this.setTab("recommended");
            },
        });

        this.tabAllEl = button({
            className: style.tab,
            type: "button",
            textContent: I18n.translate("ai.modelTabAll", "0"),
            onclick: (e) => {
                e.stopPropagation();
                this.setTab("all");
            },
        });

        this.tabCustomEl = button({
            className: style.tab,
            type: "button",
            textContent: I18n.translate("ai.modelTabCustom"),
            onclick: (e) => {
                e.stopPropagation();
                this.setTab("custom");
            },
        });

        const tabsEl = div({ className: style.tabs }, this.tabRecommendedEl, this.tabAllEl, this.tabCustomEl);

        // Model List Container
        this.listContainerEl = div({ className: style.list });

        // Custom Model Section
        this.customInputEl = input({
            className: style.customInput,
            type: "text",
            placeholder: I18n.translate("ai.customModelPlaceholder"),
            onkeydown: (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.applyCustomModel();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    this.closeDropdown();
                }
            },
        });

        this.customApplyBtnEl = button({
            className: style.customApplyBtn,
            type: "button",
            textContent: I18n.translate("ai.save"),
            onclick: (e) => {
                e.stopPropagation();
                this.applyCustomModel();
            },
        });

        this.customContainerEl = div(
            { className: style.customContainer, style: "display: none;" },
            div({ className: style.customInputRow }, this.customInputEl, this.customApplyBtnEl),
        );

        // Popover Dropdown
        this.dropdownEl = div(
            { className: style.dropdown, style: "display: none;" },
            searchContainer,
            tabsEl,
            this.listContainerEl,
            this.customContainerEl,
        );

        // Root
        this.element = div({ className: style.container }, this.triggerEl, this.dropdownEl);

        this.updateTriggerText();
        this.bindGlobalEvents();
    }

    getValue(): string {
        return this._selectedModel;
    }

    getModels(): DiscoveredModel[] {
        return [...this._models];
    }

    setValue(modelId: string) {
        this._selectedModel = modelId.trim();
        this.updateTriggerText();
        this.renderList();
    }

    setModels(models: DiscoveredModel[], vendor?: KnownVendor) {
        this._models = [...models];
        this._vendor = vendor;
        this.updateTabCounts();
        this.renderList();
        this.updateTriggerText();
    }

    setOnModelSelected(callback: (modelId: string) => void) {
        this._onModelSelected = callback;
    }

    openDropdown() {
        if (this._isOpen) return;
        this._isOpen = true;
        this.dropdownEl.style.display = "flex";
        this.chevronEl.classList.add(style.chevronOpen);
        this._focusedIndex = -1;
        this.renderList();
        setTimeout(() => {
            if (this._activeTab === "custom") {
                this.customInputEl.focus();
            } else {
                this.searchInputEl.focus();
            }
        }, 30);
    }

    closeDropdown() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this.dropdownEl.style.display = "none";
        this.chevronEl.classList.remove(style.chevronOpen);
        this._focusedIndex = -1;
    }

    toggleDropdown() {
        if (this._isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    setTab(tab: ModelTab) {
        this._activeTab = tab;
        this.tabRecommendedEl.classList.toggle(style.tabActive, tab === "recommended");
        this.tabAllEl.classList.toggle(style.tabActive, tab === "all");
        this.tabCustomEl.classList.toggle(style.tabActive, tab === "custom");

        if (tab === "custom") {
            this.listContainerEl.style.display = "none";
            this.customContainerEl.style.display = "flex";
            this.customInputEl.value = this._selectedModel;
            setTimeout(() => this.customInputEl.focus(), 30);
        } else {
            this.listContainerEl.style.display = "flex";
            this.customContainerEl.style.display = "none";
            this.renderList();
            setTimeout(() => this.searchInputEl.focus(), 30);
        }
    }

    private selectModel(modelId: string) {
        const clean = modelId.trim();
        if (!clean) return;
        this._selectedModel = clean;
        this.updateTriggerText();
        this.closeDropdown();
        this._onModelSelected?.(clean);
    }

    private applyCustomModel() {
        const val = this.customInputEl.value.trim();
        if (val) {
            this.selectModel(val);
        }
    }

    private updateTabCounts() {
        const hasSupported = this._models.some((m) => m.toolCapability === "supported");
        const recCount = hasSupported
            ? this._models.filter((m) => m.toolCapability === "supported" || m.isDefault).length
            : this._models.filter((m) => m.isDefault || this._models.indexOf(m) < 5).length;
        const allCount = this._models.length;

        this.tabRecommendedEl.textContent = I18n.translate("ai.modelTabRecommended", String(recCount));
        this.tabAllEl.textContent = I18n.translate("ai.modelTabAll", String(allCount));
    }

    private getFilteredModels(): DiscoveredModel[] {
        let list = this._models;

        if (this._activeTab === "recommended") {
            const hasSupported = list.some((m) => m.toolCapability === "supported");
            if (hasSupported) {
                list = list.filter((m) => m.toolCapability === "supported" || m.isDefault);
            } else {
                list = list.filter((m) => m.isDefault || list.indexOf(m) < 5);
            }
        }

        if (this._searchQuery) {
            const q = this._searchQuery;
            list = list.filter((m) => {
                return (
                    m.id.toLowerCase().includes(q) ||
                    (m.name && m.name.toLowerCase().includes(q)) ||
                    (m.description && m.description.toLowerCase().includes(q))
                );
            });
        }

        return list;
    }

    private renderList() {
        this.listContainerEl.innerHTML = "";
        let visible = this.getFilteredModels();

        // If currently selected model is not in discovered models, prepend it with (Current) badge
        if (this._selectedModel && !visible.some((m) => m.id === this._selectedModel) && !this._searchQuery) {
            const preservedModel: DiscoveredModel = {
                id: this._selectedModel,
                name: this._selectedModel,
                isDefault: false,
                toolCapability: "unverified",
            };
            visible = [preservedModel, ...visible];
        }

        this._visibleModels = visible;

        if (visible.length === 0) {
            const emptyEl = div({
                className: style.emptyState,
                textContent: I18n.translate("ai.noMatchingModels"),
            });
            this.listContainerEl.append(emptyEl);
            return;
        }

        visible.forEach((m, idx) => {
            const isSelected = m.id === this._selectedModel;
            const isFocused = idx === this._focusedIndex;

            const row = div({
                className: `${style.item} ${isSelected ? style.itemSelected : ""} ${isFocused ? style.itemFocused : ""}`,
                role: "option",
                ariaSelected: isSelected ? "true" : "false",
                onclick: (e) => {
                    e.stopPropagation();
                    this.selectModel(m.id);
                },
            });

            // Header line
            const header = div({ className: style.itemHeader });
            const idEl = span({ className: style.itemId, textContent: m.id });
            const badgesEl = div({ className: style.badges });

            if (m.isDefault) {
                badgesEl.append(
                    span({
                        className: `${style.badge} ${style.badgeDefault}`,
                        textContent: I18n.translate("ai.modelBadgeDefault"),
                    }),
                );
            }

            // Capability badge
            if (m.toolCapability === "supported") {
                badgesEl.append(
                    span({
                        className: `${style.badge} ${style.badgeTools}`,
                        textContent: I18n.translate("ai.modelBadgeTools"),
                    }),
                );
            } else if (m.toolCapability === "unsupported") {
                badgesEl.append(
                    span({
                        className: `${style.badge} ${style.badgeUnsupported}`,
                        textContent: I18n.translate("ai.modelBadgeUnsupported"),
                    }),
                );
            } else {
                badgesEl.append(
                    span({
                        className: `${style.badge} ${style.badgeUnverified}`,
                        textContent: I18n.translate("ai.modelBadgeUnverified"),
                    }),
                );
            }

            if (m.hasVision) {
                badgesEl.append(
                    span({
                        className: `${style.badge} ${style.badgeMeta}`,
                        textContent: I18n.translate("ai.modelBadgeVision"),
                    }),
                );
            }

            if (m.contextLength) {
                const kSize = `${Math.round(m.contextLength / 1000)}K`;
                badgesEl.append(
                    span({
                        className: `${style.badge} ${style.badgeMeta}`,
                        textContent: kSize,
                    }),
                );
            }

            header.append(idEl, badgesEl);
            row.append(header);

            if (m.name && m.name !== m.id) {
                row.append(div({ className: style.itemName, textContent: m.name }));
            }

            this.listContainerEl.append(row);
        });
    }

    private updateTriggerText() {
        if (!this._selectedModel) {
            this.triggerTextEl.textContent = I18n.translate("ai.selectModel");
            return;
        }

        const found = this._models.find((m) => m.id === this._selectedModel);
        if (found?.name && found.name !== found.id) {
            this.triggerTextEl.textContent = `${found.name} (${found.id})`;
        } else {
            this.triggerTextEl.textContent = this._selectedModel;
        }
        this.triggerEl.title = this._selectedModel;
    }

    private handleTriggerKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            this.openDropdown();
        } else if (e.key === "Escape") {
            e.preventDefault();
            this.closeDropdown();
        }
    }

    private handleSearchKeyDown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            this.focusNextItem(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            this.focusNextItem(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (this._focusedIndex >= 0 && this._focusedIndex < this._visibleModels.length) {
                this.selectModel(this._visibleModels[this._focusedIndex].id);
            } else if (this._visibleModels.length === 1) {
                this.selectModel(this._visibleModels[0].id);
            } else if (this._searchQuery) {
                this.selectModel(this._searchQuery);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            this.closeDropdown();
        }
    }

    private focusNextItem(delta: number) {
        if (this._visibleModels.length === 0) return;
        let next = this._focusedIndex + delta;
        if (next < 0) next = this._visibleModels.length - 1;
        if (next >= this._visibleModels.length) next = 0;
        this._focusedIndex = next;
        this.renderList();

        // Scroll focused item into view inside dropdown list
        const items = this.listContainerEl.querySelectorAll(`.${style.item}`);
        if (items[this._focusedIndex]) {
            (items[this._focusedIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
        }
    }

    private bindGlobalEvents() {
        this._outsideClickListener = (e: MouseEvent) => {
            if (this._isOpen && !this.element.contains(e.target as Node)) {
                this.closeDropdown();
            }
        };
        document.addEventListener("click", this._outsideClickListener);
    }

    dispose() {
        if (this._outsideClickListener) {
            document.removeEventListener("click", this._outsideClickListener);
            this._outsideClickListener = undefined;
        }
    }
}
