// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IApplication, type IFace, ShapeTypes, type XYZ } from "@chili3d/core";
import { button, div, input, label, span } from "@chili3d/element";
import { CATALOG_ITEMS } from "../catalog/items";
import type { CatalogItem, ComponentOrientation } from "../catalog/types";
import { InsertComponentCommand } from "../commands/insertComponentCommand";
import { QuickArrayCommand } from "../commands/quickArrayCommand";
import style from "./libraryPanel.module.css";

export class LibraryPanel {
    private orientation: ComponentOrientation = "vertical";
    private flip = false;
    private customLength = 3000;
    private arrayCount = 5;
    private searchQuery = "";

    private container: HTMLElement;
    private cardListElem: HTMLElement;
    private vertBtn: HTMLButtonElement;
    private horizBtn: HTMLButtonElement;
    private flipBtn: HTMLButtonElement;
    private lengthInput: HTMLInputElement;
    private arrayCountInput: HTMLInputElement;

    constructor(private readonly app: IApplication) {
        this.container = div({ className: style.panelContainer });
        this.cardListElem = div({ className: style.cardList });

        // Search bar
        const searchInputElem = input({
            className: style.searchInput,
            placeholder: "Tìm mẫu lam, tấm ốp (LH-5050, 3 sóng...)",
            type: "text",
        });
        searchInputElem.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
            this.renderCards();
        });
        const searchBarElem = div({ className: style.searchBar }, searchInputElem);

        // Controls bar: Orientation buttons
        this.vertBtn = button({
            className: `${style.toggleBtn} ${style.toggleBtnActive}`,
            textContent: "Ốp đứng",
            onclick: () => this.setOrientation("vertical"),
        }) as HTMLButtonElement;

        this.horizBtn = button({
            className: style.toggleBtn,
            textContent: "Ốp ngang",
            onclick: () => this.setOrientation("horizontal"),
        }) as HTMLButtonElement;

        this.flipBtn = button({
            className: style.toggleBtn,
            textContent: "Đảo đầu: Tắt",
            onclick: () => this.toggleFlip(),
        }) as HTMLButtonElement;

        this.lengthInput = input({
            className: style.numInput,
            type: "number",
            value: "3000",
            min: "100",
            max: "12000",
            step: "50",
        }) as HTMLInputElement;
        this.lengthInput.addEventListener("change", () => {
            const val = parseFloat(this.lengthInput.value);
            if (!isNaN(val) && val > 0) {
                this.customLength = val;
            }
        });

        this.arrayCountInput = input({
            className: style.numInput,
            type: "number",
            value: "5",
            min: "2",
            max: "200",
            step: "1",
        }) as HTMLInputElement;
        this.arrayCountInput.addEventListener("change", () => {
            const val = parseInt(this.arrayCountInput.value, 10);
            if (!isNaN(val) && val >= 2) {
                this.arrayCount = val;
            }
        });

        const controlsElem = div(
            { className: style.controlsBar },
            div({ className: style.controlGroup }, this.vertBtn, this.horizBtn, this.flipBtn),
            div({ className: style.controlGroup }, label({ textContent: "Dài (mm):" }), this.lengthInput),
            div({ className: style.controlGroup }, label({ textContent: "SL mảng:" }), this.arrayCountInput),
        );

        this.container.append(searchBarElem, controlsElem, this.cardListElem);
        this.renderCards();
        this.setupViewportDrop();
    }

    public getElement(): HTMLElement {
        return this.container;
    }

    private setOrientation(orient: ComponentOrientation): void {
        this.orientation = orient;
        if (orient === "vertical") {
            this.vertBtn.className = `${style.toggleBtn} ${style.toggleBtnActive}`;
            this.horizBtn.className = style.toggleBtn;
        } else {
            this.horizBtn.className = `${style.toggleBtn} ${style.toggleBtnActive}`;
            this.vertBtn.className = style.toggleBtn;
        }
    }

    private toggleFlip(): void {
        this.flip = !this.flip;
        this.flipBtn.textContent = this.flip ? "Đảo đầu: Bật" : "Đảo đầu: Tắt";
        if (this.flip) {
            this.flipBtn.className = `${style.toggleBtn} ${style.toggleBtnActive}`;
        } else {
            this.flipBtn.className = style.toggleBtn;
        }
    }

    private renderCards(): void {
        this.cardListElem.innerHTML = "";
        const filtered = CATALOG_ITEMS.filter((item) => {
            if (!this.searchQuery) return true;
            return (
                item.code.toLowerCase().includes(this.searchQuery) ||
                item.name.toLowerCase().includes(this.searchQuery) ||
                item.material.toLowerCase().includes(this.searchQuery)
            );
        });

        for (const item of filtered) {
            const card = this.createCard(item);
            this.cardListElem.append(card);
        }
    }

    private createCard(item: CatalogItem): HTMLElement {
        // Preview SVG element
        const previewElem = div({ className: style.cardPreview });
        previewElem.innerHTML = item.svgPreview;

        // Card header with badge
        const badgeElements: HTMLElement[] = [];
        if (item.badgeText) {
            badgeElements.push(
                span({
                    className: item.isRealProfile ? style.realProfileBadge : style.boxModelBadge,
                    textContent: item.badgeText,
                }),
            );
        }
        badgeElements.push(span({ className: style.cardBadge, textContent: item.code }));

        const header = div(
            { className: style.cardHeader },
            span({ className: style.cardTitle, textContent: item.name }),
            div({ className: style.cardBadges }, ...badgeElements),
        );

        // Specs table
        const specs = div(
            { className: style.cardSpecs },
            div(
                { className: style.specRow },
                span({ className: style.specLabel, textContent: "Tiết diện:" }),
                span({ className: style.specValue, textContent: `${item.width}×${item.thickness} mm` }),
            ),
            div(
                { className: style.specRow },
                span({ className: style.specLabel, textContent: "Bước lắp:" }),
                span({ className: style.specValue, textContent: `${item.step} mm` }),
            ),
            div(
                { className: style.specRow },
                span({ className: style.specLabel, textContent: "Liên kết:" }),
                span({ className: style.specValue, textContent: item.jointNote }),
            ),
            div(
                { className: style.specRow },
                span({ className: style.specLabel, textContent: "Vật liệu:" }),
                span({ className: style.specValue, textContent: item.material }),
            ),
        );

        // Action buttons
        const insertBtn = button({
            className: `${style.actionBtn} ${style.insertBtn}`,
            textContent: "Chèn vào vách",
            onclick: () => this.handleInsert(item),
        });

        const arrayBtn = button({
            className: `${style.actionBtn} ${style.arrayBtn}`,
            textContent: `Nhân mảng (Bước ${item.step})`,
            onclick: () => this.handleArray(item),
        });

        const actions = div({ className: style.cardActions }, insertBtn, arrayBtn);

        const cardElem = div({ className: style.card }, header, previewElem, specs, actions);

        // Drag & drop setup
        cardElem.draggable = true;
        cardElem.addEventListener("dragstart", (e) => {
            const dragData = {
                type: "dunvex-component",
                code: item.code,
                orientation: this.orientation,
                flip: this.flip,
                customLength: this.customLength,
            };
            const jsonStr = JSON.stringify(dragData);
            e.dataTransfer?.setData("application/json", jsonStr);
            e.dataTransfer?.setData("text/plain", jsonStr);
            e.dataTransfer?.setData("dunvex-component", jsonStr);
        });

        return cardElem;
    }

    private setupViewportDrop(): void {
        const handleDragOver = (e: DragEvent) => {
            if (
                e.dataTransfer?.types.includes("application/json") ||
                e.dataTransfer?.types.includes("dunvex-component")
            ) {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = "copy";
                }
            }
        };

        const handleDrop = async (e: DragEvent) => {
            const raw =
                e.dataTransfer?.getData("application/json") || e.dataTransfer?.getData("dunvex-component");
            if (!raw) return;
            let data: any;
            try {
                data = JSON.parse(raw);
            } catch {
                return;
            }
            if (data?.type !== "dunvex-component") return;

            e.preventDefault();
            e.stopPropagation();

            const view = this.app.activeView;
            if (!view) return;

            const rect = (e.target as HTMLElement).getBoundingClientRect?.() ?? { left: 0, top: 0 };
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            let targetPoint: XYZ | undefined;
            let targetNormal: XYZ | undefined;

            try {
                const hits = view.detectShapes(ShapeTypes.face, offsetX, offsetY);
                if (hits && hits.length > 0) {
                    const shapeData = hits[0];
                    const face = shapeData.shape.transformedMul(shapeData.transform) as IFace;
                    if (face.surface().isPlanar()) {
                        const [facePoint, faceNormal] = face.normal(0, 0);
                        targetNormal = faceNormal.normalize();
                        targetPoint = shapeData.point ?? facePoint;
                    }
                    face.dispose();
                }
            } catch {}

            const cmd = new InsertComponentCommand({
                catalogCode: data.code,
                orientation: data.orientation ?? this.orientation,
                flip: data.flip ?? this.flip,
                customLength: data.customLength ?? this.customLength,
                targetPoint,
                targetNormal,
            });
            await cmd.execute(this.app);
        };

        if (typeof window !== "undefined") {
            window.addEventListener("dragover", handleDragOver);
            window.addEventListener("drop", handleDrop, true);
        }
    }

    private async handleInsert(item: CatalogItem): Promise<void> {
        const cmd = new InsertComponentCommand({
            catalogCode: item.code,
            orientation: this.orientation,
            flip: this.flip,
            customLength: this.customLength,
        });
        await cmd.execute(this.app);
    }

    private async handleArray(item: CatalogItem): Promise<void> {
        const cmd = new QuickArrayCommand({
            count: this.arrayCount,
            step: item.step,
        });
        await cmd.execute(this.app);
    }
}
