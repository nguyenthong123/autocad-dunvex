// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, I18n } from "@chili3d/core";
import { createMockApplication, createMockDocument, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import {
    AutoOrganizeTreeCommand,
    autoOrganizeTree,
    HideSelectedCommand,
    IsolateSelectedCommand,
    NewFolder,
    ShowAllCommand,
} from "../../src/commands/folder";

describe("NewFolder", () => {
    test("should have command metadata", () => {
        const data = (NewFolder as any).prototype.data;
        expect(data).not.toBeNull();
        expect(data.key).toBe("create.folder");
        expect(data.icon).toBe("icon-folder-plus");
    });

    test("should create a FolderNode and add it to document", async () => {
        const doc = createMockDocument();
        const addedNodes: unknown[] = [];

        doc.modelManager.addNode = (node: unknown) => {
            addedNodes.push(node);
        };

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        const cmd = new NewFolder();
        await cmd.execute(app);

        expect(addedNodes.length).toBe(1);
        expect(addedNodes[0] instanceof FolderNode).toBe(true);
        expect((addedNodes[0] as FolderNode).name).toBe(`${I18n.translate("command.create.folder")}1`);
    });

    test("folder names should increment within a document", async () => {
        const doc = new TestDocument();
        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        await new NewFolder().execute(app);
        await new NewFolder().execute(app);

        expect(doc.modelManager.findNodes().map((node) => node.name)).toEqual([
            `${I18n.translate("command.create.folder")}1`,
            `${I18n.translate("command.create.folder")}2`,
        ]);
    });

    test("should use activeView document", async () => {
        const doc = createMockDocument();
        let addedNode: unknown;

        doc.modelManager.addNode = (node: unknown) => {
            addedNode = node;
        };

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        const cmd = new NewFolder();
        await cmd.execute(app);

        expect(addedNode).toBeInstanceOf(FolderNode);
    });

    test("should do nothing without an active view", async () => {
        const app = createMockApplication();
        app.activeView = undefined;

        // No document to attach a folder to; building one anyway used to hand a document-less
        // FolderNode to the model manager.
        await expect(new NewFolder().execute(app)).resolves.toBeUndefined();
    });

    test("should group selected nodes into a new folder", async () => {
        const doc = new TestDocument();
        const f1 = new FolderNode({ document: doc, name: "Prism1" });
        const f2 = new FolderNode({ document: doc, name: "Prism2" });
        doc.modelManager.rootNode.add(f1, f2);

        doc.selection = {
            getSelectedNodes: () => [f1, f2],
            setSelectedNodes: () => {},
        } as any;

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        await new NewFolder().execute(app);

        const groupFolder = (doc.modelManager.rootNode as FolderNode)
            .children()
            .find((c) => c.name.startsWith("Nhóm Prism1"));
        expect(groupFolder).not.toBeUndefined();
        const names = (groupFolder as FolderNode).children().map((c) => c.name);
        expect(names).toContain("Prism1");
        expect(names).toContain("Prism2");
    });
});

describe("Visibility and Tree Organization Commands", () => {
    test("HideSelectedCommand should hide all selected nodes", async () => {
        const doc = new TestDocument();
        const f1 = new FolderNode({ document: doc, name: "Item1" });
        const f2 = new FolderNode({ document: doc, name: "Item2" });
        doc.modelManager.rootNode.add(f1, f2);

        doc.selection = {
            getSelectedNodes: () => [f1, f2],
        } as any;

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        await new HideSelectedCommand().execute(app);

        expect(f1.visible).toBe(false);
        expect(f2.visible).toBe(false);
    });

    test("ShowAllCommand should make all nodes visible", async () => {
        const doc = new TestDocument();
        const f1 = new FolderNode({ document: doc, name: "Item1" });
        f1.visible = false;
        doc.modelManager.rootNode.add(f1);

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        await new ShowAllCommand().execute(app);

        expect(f1.visible).toBe(true);
    });

    test("IsolateSelectedCommand should keep only selected nodes visible", async () => {
        const doc = new TestDocument();
        const f1 = new FolderNode({ document: doc, name: "Item1" });
        const f2 = new FolderNode({ document: doc, name: "Item2" });
        doc.modelManager.rootNode.add(f1, f2);

        doc.selection = {
            getSelectedNodes: () => [f1],
        } as any;

        const app = createMockApplication();
        app.activeView = { document: doc } as any;

        await new IsolateSelectedCommand().execute(app);

        expect(f1.visible).toBe(true);
        expect(f2.visible).toBe(false);
    });

    test("autoOrganizeTree should group *_copy nodes into a folder", () => {
        const doc = new TestDocument();
        const n1 = new FolderNode({ document: doc, name: "Prism10" });
        const n2 = new FolderNode({ document: doc, name: "Prism10_copy" });
        const n3 = new FolderNode({ document: doc, name: "Prism10_copy2" });
        const other = new FolderNode({ document: doc, name: "SingleItem" });
        doc.modelManager.rootNode.add(n1, n2, n3, other);

        const count = autoOrganizeTree(doc);
        expect(count).toBe(3);

        const folder = (doc.modelManager.rootNode as FolderNode)
            .children()
            .find((c) => c.name === "Mảng Prism10 (3)");
        expect(folder).not.toBeUndefined();
        const names = (folder as FolderNode).children().map((c) => c.name);
        expect(names).toContain("Prism10");
        expect(names).toContain("Prism10_copy");
        expect(names).toContain("Prism10_copy2");
        expect(
            (doc.modelManager.rootNode as FolderNode).children().some((c) => c.name === "SingleItem"),
        ).toBe(true);
    });
});
