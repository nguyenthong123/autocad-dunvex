// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    FolderNode,
    I18n,
    type IDocument,
    type INode,
    isNodeIcon,
    isNodeWarning,
    Transaction,
} from "@chili3d/core";
import { label, setSVGIcon, span, svg } from "@chili3d/element";
import style from "./treeItem.module.css";

export abstract class TreeItem extends HTMLElement {
    readonly name: HTMLLabelElement;
    readonly visibleIcon: SVGSVGElement;
    /**
     * SolidWorks-FeatureManager-style warning mark, shown while the node reports
     * warnings through the `INodeWarning` contract (e.g. a sketch whose external
     * references lost their source); its tooltip carries the count. Rows place it
     * after the eye icon.
     */
    readonly warningBadge: HTMLElement;

    private _node: INode;
    get node() {
        return this._node;
    }

    constructor(
        protected document: IDocument,
        node: INode,
    ) {
        super();
        this._node = node;
        this.draggable = true;
        this.name = label({
            className: style.name,
            textContent: new Binding(node, "name"),
        });
        this.visibleIcon = svg({
            className: style.icon,
            icon: this.getVisibleIcon(),
            onclick: this.onVisibleIconClick,
        });
        this.warningBadge = span({
            className: `${style.warning} ${style.hidden}`,
            textContent: "!",
        });
        this.setVisibleStyle(node.parentVisible);
        this.refreshVisibleIcon();
        this.refreshWarningBadge();
    }

    /**
     * Consumed boolean tools (children of a parametric body, not of a folder) never
     * render in the scene, so their eye icon would toggle a flag with no visual
     * effect — hide it. Called on construction and after every tree move.
     */
    refreshVisibleIcon() {
        const consumed = this.node.parent !== undefined && !(this.node.parent instanceof FolderNode);
        this.visibleIcon.classList.toggle(style.hidden, consumed);
    }

    connectedCallback(): void {
        this.node.onPropertyChanged(this.onPropertyChanged);
    }

    disconnectedCallback(): void {
        this.node.removePropertyChanged(this.onPropertyChanged);
    }

    private readonly onPropertyChanged = (property: string, model: INode) => {
        if (property === "visible") {
            setSVGIcon(this.visibleIcon, this.getVisibleIcon());
        } else if (property === "parentVisible") {
            this.setVisibleStyle(model.parentVisible);
        } else if (property === "warningCount") {
            this.refreshWarningBadge();
        }
    };

    /** Syncs the badge with the node's `INodeWarning` state; plain nodes keep it hidden. */
    private refreshWarningBadge() {
        const node = this.node;
        const warning = isNodeWarning(node) ? node : undefined;
        const count = warning?.warningCount ?? 0;
        this.warningBadge.classList.toggle(style.hidden, count === 0);
        if (warning !== undefined && count > 0) {
            I18n.set(this.warningBadge, "title", warning.warningTooltip, count);
        }
    }

    private setVisibleStyle(parentVisible?: boolean) {
        if (parentVisible === true) {
            this.visibleIcon.classList.remove(style["parent-hidden"]);
        } else {
            this.visibleIcon.classList.add(style["parent-hidden"]);
        }
    }

    addStyle(style: string) {
        this.mainElement().classList.add(style);
    }

    removeStyle(style: string) {
        this.mainElement().classList.remove(style);
    }

    /**
     * The type icon a node declares through the optional `INodeIcon` contract, or
     * undefined for a node that does not opt in — those rows keep the layout they had.
     * Subclasses place it before the name.
     */
    protected createTypeIcon(): SVGSVGElement | undefined {
        if (!isNodeIcon(this.node)) return undefined;
        return svg({ className: style.typeIcon, icon: this.node.icon });
    }

    abstract mainElement(): HTMLElement;

    private _isEditing = false;

    startInlineRename(): void {
        if (this._isEditing || !this.node) return;
        this._isEditing = true;

        const inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.value = this.node.name;
        inputEl.className = style.renameInput ?? "renameInput";

        const stop = (e: Event) => e.stopPropagation();
        inputEl.addEventListener("click", stop);
        inputEl.addEventListener("dblclick", stop);
        inputEl.addEventListener("pointerdown", stop);
        inputEl.addEventListener("mousedown", stop);

        const cleanup = () => {
            if (!this._isEditing) return;
            this._isEditing = false;
            inputEl.remove();
            this.name.style.display = "";
        };

        const commit = () => {
            if (!this._isEditing) return;
            const newName = inputEl.value.trim();
            if (newName && newName !== this.node.name) {
                if (this.node === this.document.modelManager.rootNode) {
                    this.document.name = newName;
                    this.node.name = newName;
                } else {
                    Transaction.execute(this.document, "Rename Node", () => {
                        this.node.name = newName;
                    });
                }
            }
            cleanup();
        };

        inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "Enter") {
                commit();
            } else if (e.key === "Escape") {
                cleanup();
            }
        });

        inputEl.addEventListener("blur", () => {
            commit();
        });

        this.name.style.display = "none";
        this.name.insertAdjacentElement("beforebegin", inputEl);
        inputEl.focus();
        inputEl.select();
    }

    dispose() {
        this.remove();
        this.node.removePropertyChanged(this.onPropertyChanged);
        this.visibleIcon.removeEventListener("click", this.onVisibleIconClick);
        this.document = null as any;
        this._node = null as any;
    }

    private getVisibleIcon() {
        return this.node.visible ? "icon-eye" : "icon-eye-slash";
    }

    private readonly onVisibleIconClick = (e: MouseEvent) => {
        e.stopPropagation();
        const selected = this.document.selection.getSelectedNodes();
        const targets = selected.length > 1 && selected.includes(this.node) ? selected : [this.node];
        const nextVisible = !this.node.visible;
        Transaction.execute(this.document, "change visible", () => {
            for (const target of targets) {
                target.visible = nextVisible;
            }
        });
        this.document.visual.update();
    };
}
