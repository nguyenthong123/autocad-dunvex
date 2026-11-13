// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    cloneForCopyNode,
    command,
    FolderNode,
    type IApplication,
    type ICommand,
    Matrix4,
    PubSub,
    Transaction,
    type VisualNode,
    XYZ,
} from "@chili3d/core";

export interface QuickArrayOptions {
    count?: number;
    step?: number;
}

@command({
    key: "componentLibrary.quickArray" as any,
    icon: {
        type: "path",
        value: "icons/library.svg",
    },
    helpText: "Nhân mảng chi tiết theo bước lắp" as any,
})
export class QuickArrayCommand implements ICommand {
    constructor(private readonly options?: QuickArrayOptions) {}

    async execute(application: IApplication): Promise<void> {
        const view = application.activeView;
        if (!view) {
            PubSub.default.pub("showToast", "Không có khung nhìn 3D nào đang hoạt động." as any);
            return;
        }

        const document = view.document;
        const selected = document.selection.getSelectedVisualNodes();
        if (selected.length === 0) {
            PubSub.default.pub(
                "showToast",
                "Vui lòng chọn thanh lam hoặc chi tiết trước khi nhân mảng." as any,
            );
            return;
        }

        const sourceNode = selected[0];
        let dir: XYZ | undefined;

        const u = sourceNode.userData as any;
        if (typeof u?.get === "function" && u.get("widthDirX") !== undefined) {
            dir = new XYZ(u.get("widthDirX"), u.get("widthDirY"), u.get("widthDirZ")).normalize();
        } else if ((sourceNode as any).plane?.xvec) {
            dir = ((sourceNode as any).plane.xvec as XYZ).normalize();
        }

        if (!dir) {
            PubSub.default.pub(
                "showToast",
                "Đối tượng đã chọn không có mặt phẳng tọa độ hợp lệ để xác định bước nhân." as any,
            );
            return;
        }

        // Determine step: explicit option -> userData catalogStep -> default based on dx
        let step = this.options?.step;
        if (!step || step <= 0) {
            const userDataStep = (sourceNode.userData as any)?.get?.("catalogStep");
            if (typeof userDataStep === "number" && userDataStep > 0) {
                step = userDataStep;
            } else {
                const dx = (sourceNode as any).dx;
                step = typeof dx === "number" && dx > 0 ? dx * 1.2 : 60;
            }
        }

        // Total count includes original + (count - 1) copies
        const count = this.options?.count && this.options.count >= 2 ? Math.floor(this.options.count) : 5;

        const offsetVec = dir.multiply(step);

        Transaction.execute(document, `Nhân mảng ${count} ${sourceNode.name}`, () => {
            const copies: VisualNode[] = [];
            for (let i = 1; i < count; i++) {
                const trans = offsetVec.multiply(i);
                const matrix = Matrix4.fromTranslation(trans.x, trans.y, trans.z);
                const copyNode = cloneForCopyNode(sourceNode, matrix);
                copies.push(copyNode);
            }
            document.modelManager.addNode(...copies);
        });

        PubSub.default.pub(
            "showToast",
            `Đã tạo mảng ${count} thanh với bước lắp ${step} mm (1 mẫu gốc + ${count - 1} bản sao).` as any,
        );
    }
}
