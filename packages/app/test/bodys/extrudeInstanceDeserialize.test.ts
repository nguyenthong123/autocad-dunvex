// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BodyInstanceNode, type IShape, Matrix4, Result, Serializer, serializable } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { ExtrudeNode } from "../../src/bodys/extrude";

@serializable()
class MockSection {
    shapeType = "face";
    surface() {
        return { isPlanar: () => true };
    }
}

describe("ExtrudeNode & BodyInstanceNode deserialization", () => {
    test("ExtrudeNode preserves id, name, and materialId during serialization and deserialization", () => {
        const app = createMockApplication();
        const doc = new TestDocument({ application: app });
        doc.name = "Test Doc";

        const fakeShape = new MockSection() as unknown as IShape;

        const originalId = "extrude-custom-guid-123";
        const node = new ExtrudeNode({
            document: doc,
            section: fakeShape,
            length: 50,
            id: originalId,
            name: "PrismCustom",
            materialId: "mat-456",
        });

        expect(node.id).toBe(originalId);
        expect(node.name).toBe("PrismCustom");
        expect(node.materialId).toBe("mat-456");

        const serialized = Serializer.serializeObject(node);
        expect(serialized["id"]).toBe(originalId);
        expect(serialized["name"]).toBe("PrismCustom");
        expect(serialized["materialId"]).toBe("mat-456");

        const deserialized = Serializer.deserializeObject(doc, serialized) as ExtrudeNode;
        expect(deserialized.id).toBe(originalId);
        expect(deserialized.name).toBe("PrismCustom");
        expect(deserialized.materialId).toBe("mat-456");
        expect(deserialized.length).toBe(50);
    });

    test("BodyInstanceNode reconnects to source node after deserialization", async () => {
        const app = createMockApplication();
        const doc = new TestDocument({ application: app });
        doc.name = "Instance Doc";

        const fakeShape = new MockSection() as unknown as IShape;

        const sourceId = "source-prism-id";
        const sourceNode = new ExtrudeNode({
            document: doc,
            section: fakeShape,
            length: 100,
            id: sourceId,
            name: "Prism1",
        });

        // Mock generateShape so source has a valid shape
        sourceNode.generateShape = () => Result.ok(fakeShape);

        doc.modelManager.addNode(sourceNode);

        const instance = BodyInstanceNode.fromSource(sourceNode, Matrix4.fromTranslation(10, 20, 30));
        expect(instance.sourceId).toBe(sourceId);
        expect(instance.source).toBe(sourceNode);

        doc.modelManager.addNode(instance);

        // Serialize full document models
        const modelsData = doc.modelManager.serialize();

        // New document loading the serialized models
        const doc2 = new TestDocument({ application: app });
        doc2.name = "Loaded Doc";
        await doc2.modelManager.deserialize(modelsData);

        const loadedSource = doc2.modelManager.findNodeDeep((x) => x.id === sourceId);
        expect(loadedSource).toBeDefined();
        expect(loadedSource?.id).toBe(sourceId);

        const loadedInstance = doc2.modelManager.findNodeDeep(
            (x) => (x as any).isInstance === true,
        ) as BodyInstanceNode;
        expect(loadedInstance).toBeDefined();
        expect(loadedInstance.sourceId).toBe(sourceId);
        expect(loadedInstance.source).toBe(loadedSource);
        expect(loadedInstance.warningCount).toBe(0);
    });
});
