// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    type IApplication,
    type ICommand,
    type IFace,
    PubSub,
    SelectShapeStep,
    Serializer,
    ShapeTypes,
    Transaction,
    type VisualNode,
    type XYZ,
} from "@chili3d/core";
import { CATALOG_ITEMS, findCatalogItem } from "../catalog/items";
import type { CatalogItem, ComponentOrientation } from "../catalog/types";
import { calculateWallPlacement } from "../geometry/placementHelper";

export interface InsertComponentOptions {
    catalogCode: string;
    orientation?: ComponentOrientation;
    flip?: boolean;
    customLength?: number;
    targetPoint?: XYZ;
    targetNormal?: XYZ;
}

export class InsertComponentCommand implements ICommand {
    constructor(private readonly options?: InsertComponentOptions) {}

    async execute(application: IApplication): Promise<void> {
        const view = application.activeView;
        if (!view) {
            PubSub.default.pub("showToast", "Không có khung nhìn 3D nào đang hoạt động." as any);
            return;
        }

        const document = view.document;
        const catalogCode = this.options?.catalogCode ?? "LH-5050";
        const item: CatalogItem = findCatalogItem(catalogCode) ?? CATALOG_ITEMS[0];
        const orientation = this.options?.orientation ?? "vertical";
        const flip = this.options?.flip ?? false;
        const length =
            this.options?.customLength && this.options.customLength > 0
                ? this.options.customLength
                : item.defaultLength;

        let hitPoint: XYZ | undefined = this.options?.targetPoint;
        let normal: XYZ | undefined = this.options?.targetNormal;

        // If direct targets are not supplied, prompt user to pick a face
        if (!hitPoint || !normal) {
            document.selection.clearSelection();
            const controller = new AsyncController();
            const pickPrompt = "Chọn mặt vách phẳng để chèn chi tiết" as any;
            const selectStep = new SelectShapeStep(ShapeTypes.face, pickPrompt, {
                allowReferenceGeometry: false,
            });

            const stepResult = await selectStep.execute(document, controller);
            controller.dispose();

            if (!stepResult || stepResult.shapes.length === 0) {
                return;
            }

            const shapeData = stepResult.shapes[0];
            const face = shapeData.shape.transformedMul(shapeData.transform) as IFace;

            // Check surface planarity
            if (!face.surface().isPlanar()) {
                face.dispose();
                PubSub.default.pub(
                    "showToast",
                    "Mặt được chọn là mặt cong. Vui lòng chọn mặt phẳng vách hợp lệ." as any,
                );
                return;
            }

            const [facePoint, faceNormal] = face.normal(0, 0);
            normal = faceNormal.normalize();
            hitPoint = shapeData.point ?? facePoint;
            face.dispose();
        }

        if (!hitPoint || !normal) {
            PubSub.default.pub("showToast", "Không xác định được vị trí mặt vách." as any);
            return;
        }

        const placementRes = calculateWallPlacement(normal, hitPoint, orientation, flip);
        if (!placementRes.isOk) {
            PubSub.default.pub("showToast", placementRes.error as any);
            return;
        }

        const placement = placementRes.value;

        // Create standard BoxNode using Serializer (guarantees serialization compatibility)
        const node = Serializer.deserializeObject(document, {
            __cla$$__: "BoxNode",
            document,
            plane: placement.plane,
            dx: item.width,
            dy: length,
            dz: item.thickness,
            name: `${item.name}`,
        }) as VisualNode;

        if (node.userData && typeof (node.userData as any).with === "function") {
            node.userData = (node.userData as any)
                .with("catalogCode", item.code)
                .with("catalogName", item.name)
                .with("catalogStep", item.step)
                .with("orientation", orientation)
                .with("material", item.material);
        }

        Transaction.execute(document, `Chèn ${item.code}`, () => {
            document.modelManager.addNode(node);
        });

        // Select the newly inserted node so its properties show in property panel
        document.selection.clearSelection();
        document.selection.setSelectedNodes([node], false);

        const orientStr = orientation === "vertical" ? "Ốp đứng" : "Ốp ngang";
        PubSub.default.pub(
            "showToast",
            `Đã chèn ${item.name} (${orientStr}). Dài: ${length} mm, Bước lắp: ${item.step} mm.` as any,
        );
    }
}
