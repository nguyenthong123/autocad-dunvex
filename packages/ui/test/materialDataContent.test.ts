// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { GeometryNode, type IShapeMeshData, Material } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { beforeEach, describe, expect, rs, test } from "@rstest/core";
import { MaterialDataContent } from "../src/property/material/materialDataContent";

class TestGeomNode extends GeometryNode {
    override display(): any {
        return "common.shape";
    }

    protected createMesh(): IShapeMeshData {
        return {
            faces: undefined,
            edges: undefined,
            vertexs: undefined,
        };
    }
}

describe("MaterialDataContent", () => {
    let document: TestDocument;
    let mat1: Material;

    beforeEach(() => {
        document = new TestDocument();
        mat1 = new Material({ document, name: "Material 1", color: 0x111111 });
        document.modelManager.materials.push(mat1);
    });

    test("should not isolate material if targetObjects is empty", () => {
        const callback = rs.fn();
        const content = new MaterialDataContent(document, callback, mat1, []);

        expect(content.autoCreatedMaterial).toBeUndefined();
        expect(content.editingMaterial).toBe(mat1);
        expect(callback).not.toHaveBeenCalled();
    });

    test("should not isolate material if only targetObjects are using the material", () => {
        const callback = rs.fn();
        const node1 = new TestGeomNode({ document, materialId: mat1.id });
        document.modelManager.rootNode.add(node1);

        const content = new MaterialDataContent(document, callback, mat1, [node1]);

        expect(content.autoCreatedMaterial).toBeUndefined();
        expect(content.editingMaterial).toBe(mat1);
        expect(callback).not.toHaveBeenCalled();
    });

    test("should auto-isolate material when another node in document shares the material", () => {
        const node1 = new TestGeomNode({ document, materialId: mat1.id });
        const node2 = new TestGeomNode({ document, materialId: mat1.id });
        document.modelManager.rootNode.add(node1);
        document.modelManager.rootNode.add(node2);

        const callback = rs.fn((m: Material) => {
            node1.materialId = m.id;
        });

        const content = new MaterialDataContent(document, callback, mat1, [node1]);

        expect(content.autoCreatedMaterial).toBeDefined();
        expect(content.autoCreatedMaterial!.name).toBe("Material 2");
        expect(content.editingMaterial).toBe(content.autoCreatedMaterial);
        expect(document.modelManager.materials).toContain(content.autoCreatedMaterial);
        expect(callback).toHaveBeenCalledWith(content.autoCreatedMaterial);
        expect(node1.materialId).toBe(content.autoCreatedMaterial!.id);
        expect(node2.materialId).toBe(mat1.id);
    });

    test("cancelEdit should revert to initial material and remove auto-created material", () => {
        const node1 = new TestGeomNode({ document, materialId: mat1.id });
        const node2 = new TestGeomNode({ document, materialId: mat1.id });
        document.modelManager.rootNode.add(node1);
        document.modelManager.rootNode.add(node2);

        const callback = rs.fn((m: Material) => {
            node1.materialId = m.id;
        });

        const content = new MaterialDataContent(document, callback, mat1, [node1]);
        const autoMat = content.autoCreatedMaterial!;

        content.cancelEdit();

        expect(callback).toHaveBeenCalledWith(mat1);
        expect(node1.materialId).toBe(mat1.id);
        expect(document.modelManager.materials).not.toContain(autoMat);
    });

    test("applyMaterial with another material should clean up auto-created material", () => {
        const node1 = new TestGeomNode({ document, materialId: mat1.id });
        const node2 = new TestGeomNode({ document, materialId: mat1.id });
        document.modelManager.rootNode.add(node1);
        document.modelManager.rootNode.add(node2);

        const callback = rs.fn((m: Material) => {
            node1.materialId = m.id;
        });

        const content = new MaterialDataContent(document, callback, mat1, [node1]);
        const autoMat = content.autoCreatedMaterial!;

        const mat3 = new Material({ document, name: "Material 3", color: 0x333333 });
        document.modelManager.materials.push(mat3);

        content.applyMaterial(mat3);

        expect(callback).toHaveBeenCalledWith(mat3);
        expect(document.modelManager.materials).not.toContain(autoMat);
    });

    test("generateNextMaterialName should find next available sequential name", () => {
        const content = new MaterialDataContent(document, () => {}, mat1, []);
        expect(content.generateNextMaterialName()).toBe("Material 2");

        const mat2 = new Material({ document, name: "Material 2", color: 0x222222 });
        document.modelManager.materials.push(mat2);
        expect(content.generateNextMaterialName()).toBe("Material 3");
    });

    test("should sync all targetObjects to editingMaterial when targetObjects have mixed materials", () => {
        const mat2 = new Material({ document, name: "Material 2", color: 0x222222 });
        document.modelManager.materials.push(mat2);

        const node1 = new TestGeomNode({ document, materialId: mat2.id });
        const node2 = new TestGeomNode({ document, materialId: mat1.id });
        document.modelManager.rootNode.add(node1);
        document.modelManager.rootNode.add(node2);

        const callback = rs.fn((m: Material) => {
            node1.materialId = m.id;
            node2.materialId = m.id;
        });

        const content = new MaterialDataContent(document, callback, mat2, [node1, node2]);

        // mat2 is used only by node1 (within targetObjects), but node2 has mat1 (mixed).
        // It should call callback(mat2) to align both nodes to mat2.
        expect(callback).toHaveBeenCalledWith(mat2);
        expect(node1.materialId).toBe(mat2.id);
        expect(node2.materialId).toBe(mat2.id);

        // When cancelling, each node must be restored to its individual initial materialId!
        content.cancelEdit();
        expect(node1.materialId).toBe(mat2.id);
        expect(node2.materialId).toBe(mat1.id);
    });
});
