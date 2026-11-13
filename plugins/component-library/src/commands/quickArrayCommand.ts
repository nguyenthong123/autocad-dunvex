// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    cloneForCopyNode,
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
        const plane = (sourceNode as any).plane;
        if (!plane || !plane.xvec) {
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

        // Array direction: along plane.xvec (transverse to length, in wall plane)
        const dir = (plane.xvec as XYZ).normalize() ?? XYZ.unitX;
        const offsetVec = dir.multiply(step);

        Transaction.execute(document, `Nhân mảng ${count} ${sourceNode.name}`, () => {
            const newNodes: VisualNode[] = [sourceNode];

            for (let i = 1; i < count; i++) {
                const trans = offsetVec.multiply(i);
                const matrix = Matrix4.fromTranslation(trans.x, trans.y, trans.z);
                const copyNode = cloneForCopyNode(sourceNode, matrix);
                newNodes.push(copyNode);
            }

            // Put copies into model manager
            const copiesOnly = newNodes.slice(1);
            const folderName = `Mảng ${sourceNode.name} (${count})`;
            const folder = new FolderNode({ document, name: folderName });

            const targetParent =
                sourceNode.parent instanceof FolderNode
                    ? sourceNode.parent
                    : (document.modelManager.currentNode ?? document.modelManager.rootNode);

            if (typeof (targetParent as any).add === "function") {
                (targetParent as any).add(folder);
            } else if (typeof (targetParent as any).addNode === "function") {
                (targetParent as any).addNode(folder);
            } else {
                document.modelManager.addNode(folder);
            }

            folder.add(sourceNode, ...copiesOnly);
        });

        PubSub.default.pub(
            "showToast",
            `Đã tạo mảng ${count} thanh với bước lắp ${step} mm (1 mẫu gốc + ${count - 1} bản sao).` as any,
        );
    }
}
