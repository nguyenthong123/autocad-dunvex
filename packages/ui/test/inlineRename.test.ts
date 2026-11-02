// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { INodeLinkedList } from "@chili3d/core";
import { FolderNode, VisualNode } from "@chili3d/core";
import { createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { TreeGroup } from "../src/project/tree/treeItemGroup";
import { TreeModel } from "../src/project/tree/treeModel";

class MockVisualNode extends VisualNode {
    display() {
        return "body.box" as any;
    }
    boundingBox() {
        return undefined;
    }
}

function createGroup(doc: TestDocument, node: any) {
    const override = TreeGroup.prototype.appendChild;
    TreeGroup.prototype.appendChild = HTMLElement.prototype.appendChild;
    try {
        const group = new TreeGroup(doc, node as unknown as INodeLinkedList);
        return group;
    } finally {
        TreeGroup.prototype.appendChild = override;
    }
}

describe("Inline Rename on Tree & Tab", () => {
    test("TreeItem.startInlineRename edits node name on Enter", () => {
        const app = createMockApplication();
        const doc = new TestDocument({ application: app });
        doc.name = "Dự án 1";

        const folder = new FolderNode({ document: doc, name: "Thư mục 1" });
        doc.modelManager.addNode(folder);

        const treeGroup = createGroup(doc, folder);
        expect(treeGroup.name.textContent).toBe("Thư mục 1");

        treeGroup.startInlineRename();

        // An input should have been inserted
        const input = treeGroup.header.querySelector("input") ?? treeGroup.querySelector("input");
        expect(input).not.toBeNull();
        expect(input?.value).toBe("Thư mục 1");

        // Type new name and trigger Enter
        input!.value = "Thư mục mới";
        input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        // Input removed, name updated
        expect(treeGroup.querySelector("input")).toBeNull();
        expect(folder.name).toBe("Thư mục mới");
        expect(treeGroup.name.textContent).toBe("Thư mục mới");
    });

    test("TreeItem.startInlineRename on rootNode updates both rootNode.name and document.name", () => {
        const app = createMockApplication();
        const doc = new TestDocument({ application: app });
        doc.name = "Dự án cũ";
        doc.modelManager.rootNode.name = "Dự án cũ";

        const rootGroup = createGroup(doc, doc.modelManager.rootNode);
        expect(doc.name).toBe("Dự án cũ");

        rootGroup.startInlineRename();

        const input = rootGroup.header.querySelector("input") ?? rootGroup.querySelector("input");
        expect(input).not.toBeNull();
        input!.value = "Dự án mới 2026";
        input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        expect(doc.name).toBe("Dự án mới 2026");
        expect(doc.modelManager.rootNode.name).toBe("Dự án mới 2026");
    });

    test("TreeItem.startInlineRename cancels on Escape", () => {
        const app = createMockApplication();
        const doc = new TestDocument({ application: app });
        doc.name = "Dự án 1";

        const model = new MockVisualNode(doc, "Khối 1", "id-box-1");
        doc.modelManager.addNode(model);

        const treeModel = new TreeModel(doc, model);
        expect(treeModel.name.textContent).toBe("Khối 1");

        treeModel.startInlineRename();

        const input = treeModel.querySelector("input");
        expect(input).not.toBeNull();
        input!.value = "Tên bị hủy";
        input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(treeModel.querySelector("input")).toBeNull();
        expect(model.name).toBe("Khối 1");
        expect(treeModel.name.textContent).toBe("Khối 1");
    });
});
