// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, EditableShapeNode, FolderNode, Matrix4, Result, ShapeTypes, XYZ } from "@chili3d/core";
import { describe, expect, test } from "@rstest/core";
import { buildBomTools, classifyForm } from "../src/tools/bomTools";

class MockBoxNode extends EditableShapeNode {
    private readonly _w: number;
    private readonly _d: number;
    private readonly _h: number;

    constructor(id: string, name: string, w: number, d: number, h: number, doc: any, materialId?: string) {
        super({
            id,
            name,
            document: doc,
            materialId,
            shape: Result.ok({
                id: `shape-${id}`,
                shapeType: ShapeTypes.solid,
            } as any),
        });
        this._w = w;
        this._d = d;
        this._h = h;
    }

    public override boundingBox() {
        return new BoundingBox(
            new XYZ({ x: 0, y: 0, z: 0 }),
            new XYZ({ x: this._w, y: this._d, z: this._h }),
        );
    }

    public override worldTransform() {
        return Matrix4.identity();
    }

    protected override onVisibleChanged(): void {
        // No-op for headless mock
    }

    protected override onParentVisibleChanged(): void {
        // No-op for headless mock
    }
}

describe("bomTools", () => {
    test("classifyForm correctly determines shape form from dimensions", () => {
        // Sheet: 1200 x 600 x 18 mm -> L=1200, W=600, T=18
        // T/L = 18/1200 = 0.015 <= 0.12, W/T = 600/18 = 33.3 >= 3
        const sheet = classifyForm(1200, 600, 18);
        expect(sheet.form).toBe("sheet");
        expect(sheet.evidence).toContain("Tấm");

        // Bar: 2000 x 50 x 50 mm -> L=2000, W=50, T=50
        // L/W = 2000/50 = 40 >= 3, W/T = 50/50 = 1 < 3
        const bar = classifyForm(2000, 50, 50);
        expect(bar.form).toBe("bar");
        expect(bar.evidence).toContain("Thanh");

        // Block: 100 x 80 x 60 mm -> L=100, W=80, T=60
        // L/W = 1.25 < 3, W/T = 1.33 < 3
        const block = classifyForm(100, 80, 60);
        expect(block.form).toBe("block");
        expect(block.evidence).toContain("Khối");

        // Flat 2D: T <= 0.05 mm, W > 0.05
        const flat = classifyForm(500, 300, 0);
        expect(flat.form).toBe("flat-2d");

        // Wire 1D: T <= 0.05 mm, W <= 0.05 mm
        const wire = classifyForm(500, 0, 0);
        expect(wire.form).toBe("wire-1d");
    });

    test("classify_material and bom_report respect visibility and calculate accurately", async () => {
        const tools = buildBomTools();
        const classifyTool = tools.find((t) => t.name === "classify_material");
        const bomTool = tools.find((t) => t.name === "bom_report");

        expect(classifyTool).toBeDefined();
        expect(bomTool).toBeDefined();

        const mockDoc: any = {
            history: { disabled: true },
            visual: { context: { setVisible: () => {} } },
            modelManager: {
                notifyNodeChanged: () => {},
                materials: [
                    { id: "mat-oak", name: "Gỗ sồi", color: 0xc89d68 },
                    { id: "mat-steel", name: "Thép hộp", color: 0x333333 },
                ],
            },
        };

        const root = new FolderNode({ document: mockDoc, id: "root", name: "Root" });
        const folder = new FolderNode({ document: mockDoc, id: "folder-1", name: "Vách ngăn" });

        // Node 1: Table top (sheet) 1200 x 600 x 20 mm
        const top = new MockBoxNode("top-1", "Mặt bàn gỗ sồi", 1200, 600, 20, mockDoc, "mat-oak");

        // Node 2 & 3: Table legs (bar) 50 x 50 x 750 mm
        const leg1 = new MockBoxNode("leg-1", "Chân bàn", 50, 50, 750, mockDoc, "mat-steel");
        const leg2 = new MockBoxNode("leg-2", "Chân bàn", 50, 50, 750, mockDoc, "mat-steel");

        root.add(top);
        root.add(folder);
        folder.add(leg1);
        folder.add(leg2);

        mockDoc.modelManager.rootNode = root;
        mockDoc.modelManager.findNodes = (predicate?: (n: any) => boolean) => {
            const all = [root, top, folder, leg1, leg2];
            return predicate ? all.filter(predicate) : all;
        };

        const originalApp = Object.getOwnPropertyDescriptor(globalThis, "app");
        try {
            Object.defineProperty(globalThis, "app", {
                value: {
                    activeView: {
                        document: mockDoc,
                    },
                },
                configurable: true,
                writable: true,
            });

            // 1. Initial run: all 3 visible
            const classifyResStr = (await classifyTool!.handler({})) as string;
            const classifyRes = JSON.parse(classifyResStr);
            expect(classifyRes.count).toBe(3);

            const bomResStr = (await bomTool!.handler({})) as string;
            const bomRes = JSON.parse(bomResStr);
            expect(bomRes.summary.totalPieces).toBe(3);

            // 2. Hide leg2: when nodeIds is omitted, leg2 is omitted
            leg2.visible = false;
            const hideClassifyStr = (await classifyTool!.handler({})) as string;
            const hideClassify = JSON.parse(hideClassifyStr);
            expect(hideClassify.count).toBe(2);
            expect(hideClassify.items.some((i: any) => i.nodeId === "leg-2")).toBe(false);

            const hideBomStr = (await bomTool!.handler({})) as string;
            const hideBom = JSON.parse(hideBomStr);
            expect(hideBom.summary.totalPieces).toBe(2);

            // 3. When explicitly passing nodeIds including hidden node: include and mark hidden: true
            const explicitClassifyStr = (await classifyTool!.handler({ nodeIds: ["leg-2"] })) as string;
            const explicitClassify = JSON.parse(explicitClassifyStr);
            expect(explicitClassify.count).toBe(1);
            expect(explicitClassify.items[0].nodeId === "leg-2").toBe(true);
            expect(explicitClassify.items[0].hidden).toBe(true);

            const explicitBomStr = (await bomTool!.handler({ nodeIds: ["leg-2"] })) as string;
            const explicitBom = JSON.parse(explicitBomStr);
            expect(explicitBom.summary.totalPieces).toBe(1);
            expect(explicitBom.summary.totalHiddenPieces).toBe(1);
            expect(explicitBom.items[0].hiddenCount).toBe(1);

            // 4. Hide folder: entire folder's children omitted when nodeIds is omitted
            leg2.visible = true;
            folder.visible = false;
            const folderHideBomStr = (await bomTool!.handler({})) as string;
            const folderHideBom = JSON.parse(folderHideBomStr);
            expect(folderHideBom.summary.totalPieces).toBe(1); // only top-1 visible
            expect(folderHideBom.items[0].materialName).toBe("Gỗ sồi");
        } finally {
            if (originalApp) {
                Object.defineProperty(globalThis, "app", originalApp);
            }
        }
    });

    test("bom_report calculations lock formulas with exact parity to computeBomReport", async () => {
        const tools = buildBomTools();
        const bomTool = tools.find((t) => t.name === "bom_report");

        const mockDoc: any = {
            history: { disabled: true },
            visual: { context: { setVisible: () => {} } },
            modelManager: {
                notifyNodeChanged: () => {},
                materials: [
                    { id: "mat-oak", name: "Gỗ sồi", color: 0xc89d68 },
                    { id: "mat-steel", name: "Thép hộp", color: 0x333333 },
                ],
            },
        };

        const root = new FolderNode({ document: mockDoc, id: "root", name: "Root" });
        // 2 identical table tops: 1200 x 600 x 20 mm
        const top1 = new MockBoxNode("top-1", "Mặt bàn", 1200, 600, 20, mockDoc, "mat-oak");
        const top2 = new MockBoxNode("top-2", "Mặt bàn", 1200, 600, 20, mockDoc, "mat-oak");

        // 4 steel legs: 750 x 50 x 50 mm
        const leg1 = new MockBoxNode("leg-1", "Chân", 50, 50, 750, mockDoc, "mat-steel");
        const leg2 = new MockBoxNode("leg-2", "Chân", 50, 50, 750, mockDoc, "mat-steel");
        const leg3 = new MockBoxNode("leg-3", "Chân", 50, 50, 750, mockDoc, "mat-steel");
        const leg4 = new MockBoxNode("leg-4", "Chân", 50, 50, 750, mockDoc, "mat-steel");

        root.add(top1);
        root.add(top2);
        root.add(leg1);
        root.add(leg2);
        root.add(leg3);
        root.add(leg4);

        mockDoc.modelManager.rootNode = root;
        mockDoc.modelManager.findNodes = (predicate?: (n: any) => boolean) => {
            const all = [root, top1, top2, leg1, leg2, leg3, leg4];
            return predicate ? all.filter(predicate) : all;
        };

        const originalApp = Object.getOwnPropertyDescriptor(globalThis, "app");
        try {
            Object.defineProperty(globalThis, "app", {
                value: {
                    activeView: {
                        document: mockDoc,
                    },
                },
                configurable: true,
                writable: true,
            });

            const resStr = (await bomTool!.handler({})) as string;
            const res = JSON.parse(resStr);

            // Group 1: Gỗ sồi (2 pieces)
            // L = 1200 mm, W = 600 mm, T = 20 mm
            // totalLengthM = round((1200 * 2) / 1000 * 100) / 100 = 2.40 m
            // totalAreaM2 = round((1200 * 600 * 2) / 1000000 * 100) / 100 = 1.44 m2
            const oakGroup = res.items.find((i: any) => i.materialName === "Gỗ sồi");
            expect(oakGroup).toBeDefined();
            expect(oakGroup.count).toBe(2);
            expect(oakGroup.dimensions).toBe("1200 × 600 × 20 mm");
            expect(oakGroup.totalLengthM).toBe(2.4);
            expect(oakGroup.totalAreaM2).toBe(1.44);
            expect(oakGroup.unit).toBe("piece");

            // Group 2: Thép hộp (4 pieces)
            // L = 750 mm, W = 50 mm, T = 50 mm
            // totalLengthM = round((750 * 4) / 1000 * 100) / 100 = 3.00 m
            // totalAreaM2 = round((750 * 50 * 4) / 1000000 * 100) / 100 = 0.15 m2
            const steelGroup = res.items.find((i: any) => i.materialName === "Thép hộp");
            expect(steelGroup).toBeDefined();
            expect(steelGroup.count).toBe(4);
            expect(steelGroup.dimensions).toBe("750 × 50 × 50 mm");
            expect(steelGroup.totalLengthM).toBe(3);
            expect(steelGroup.totalAreaM2).toBe(0.15);
            expect(steelGroup.unit).toBe("piece");

            // Total summary
            // totalPieces = 2 + 4 = 6
            // totalLengthM = 2.4 + 3.0 = 5.40 m
            // totalAreaM2 = 1.44 + 0.15 = 1.59 m2
            expect(res.summary.totalTypes).toBe(2);
            expect(res.summary.totalPieces).toBe(6);
            expect(res.summary.totalLengthM).toBe(5.4);
            expect(res.summary.totalAreaM2).toBe(1.59);
        } finally {
            if (originalApp) {
                Object.defineProperty(globalThis, "app", originalApp);
            }
        }
    });
});
