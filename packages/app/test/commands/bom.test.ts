// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Annotation, BoundingBox, FolderNode, Material, PubSub, XYZ } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { BomCommand, computeBomReport, showBomDialog } from "../../src/commands/measure/bom";

class MockShapeNode extends FolderNode {
    private _box: BoundingBox;
    public materialId?: string;

    constructor(document: any, name: string, min: XYZ, max: XYZ, materialId?: string) {
        super({ document, name });
        this._box = new BoundingBox(min, max);
        this.materialId = materialId;
    }

    boundingBox(): BoundingBox {
        return this._box;
    }
}

class MockAnnotation extends Annotation {
    override clone(): any {
        return this;
    }
}

describe("BomCommand and computeBomReport", () => {
    test("should have command metadata", () => {
        const data = (BomCommand as any).prototype.data;
        expect(data).not.toBeNull();
        expect(data.key).toBe("measure.bom");
    });

    test("should compute BOM report sorting dimensions L >= W >= T and grouping items", () => {
        const doc = new TestDocument();
        const mat = new Material({ document: doc, name: "Gỗ sồi", color: 0x8b5a2b });
        doc.modelManager.materials.push(mat);

        // 3 items with dimensions dx=1000, dy=50, dz=20 -> L=1000, W=50, T=20
        const n1 = new MockShapeNode(doc, "Thanh1", new XYZ(0, 0, 0), new XYZ(1000, 50, 20), mat.id);
        const n2 = new MockShapeNode(doc, "Thanh1_copy", new XYZ(0, 0, 0), new XYZ(1000, 50, 20), mat.id);
        const n3 = new MockShapeNode(doc, "Thanh1_copy2", new XYZ(0, 0, 0), new XYZ(1000, 50, 20), mat.id);

        // 1 item with different dimensions dx=2000, dy=100, dz=100
        const n4 = new MockShapeNode(doc, "Thanh2", new XYZ(0, 0, 0), new XYZ(2000, 100, 100), mat.id);

        // 1 annotation that should be skipped
        const ann = new MockAnnotation({ document: doc, name: "Dim1" } as any);

        const items = computeBomReport(doc, [n1, n2, n3, n4, ann]);

        expect(items.length).toBe(2);

        // First item group (n1, n2, n3)
        const group1 = items.find((it) => it.dimensions === "1000 × 50 × 20 mm");
        expect(group1).not.toBeUndefined();
        expect(group1!.count).toBe(3);
        expect(group1!.materialName).toBe("Gỗ sồi");
        expect(group1!.lengthMm).toBe(1000);
        expect(group1!.widthMm).toBe(50);
        expect(group1!.thicknessMm).toBe(20);
        expect(group1!.totalLengthM).toBe(3); // 1000 * 3 / 1000 = 3m
        expect(group1!.totalAreaM2).toBe(0.15); // 1000 * 50 * 3 / 1000000 = 0.15m2

        // Second item group (n4)
        const group2 = items.find((it) => it.dimensions === "2000 × 100 × 100 mm");
        expect(group2).not.toBeUndefined();
        expect(group2!.count).toBe(1);
        expect(group2!.totalLengthM).toBe(2);
    });

    test("should recursively expand FolderNodes to extract shapes", () => {
        const doc = new TestDocument();
        const folder = new FolderNode({ document: doc, name: "Tường" });
        const subFolder = new FolderNode({ document: doc, name: "Lam sóng" });
        const n1 = new MockShapeNode(doc, "Lam1", new XYZ(0, 0, 0), new XYZ(3000, 200, 15));
        subFolder.add(n1);
        folder.add(subFolder);

        const items = computeBomReport(doc, [folder]);
        expect(items.length).toBe(1);
        expect(items[0].dimensions).toBe("3000 × 200 × 15 mm");
        expect(items[0].count).toBe(1);
    });

    test("showBomDialog should render dialog UI and handle buttons", () => {
        const doc = new TestDocument();
        const n1 = new MockShapeNode(doc, "Item1", new XYZ(0, 0, 0), new XYZ(500, 200, 10));

        let dialogShown = false;
        const sub = () => {
            dialogShown = true;
        };
        PubSub.default.sub("showDialog", sub);

        try {
            const container = showBomDialog(doc, [n1], [n1]);
            expect(container).not.toBeNull();
            expect(dialogShown).toBe(true);
            expect(container.querySelector("table")).not.toBeNull();
            expect(container.querySelector("input[type='number']")).not.toBeNull();
        } finally {
            PubSub.default.remove("showDialog", sub);
        }
    });

    test("BomCommand.execute should invoke showBomDialog", async () => {
        const doc = new TestDocument();
        const n1 = new MockShapeNode(doc, "Item1", new XYZ(0, 0, 0), new XYZ(500, 200, 10));
        doc.modelManager.rootNode.add(n1);

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        let openedTitle: string | undefined;
        const onDialog = (...args: any[]) => {
            openedTitle = args[0];
        };
        PubSub.default.sub("showDialog", onDialog);

        try {
            const cmd = new BomCommand();
            await cmd.execute(app);
            expect(openedTitle).toBe("command.measure.bom");
        } finally {
            PubSub.default.remove("showDialog", onDialog);
        }
    });
});
