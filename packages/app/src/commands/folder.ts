// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    command,
    FolderNode,
    I18n,
    type IApplication,
    type ICommand,
    type IDocument,
    type INode,
    NodeUtils,
    PubSub,
    Transaction,
} from "@chili3d/core";

export function getChildren(parent: INode): INode[] {
    if (typeof (parent as any).children === "function") {
        return (parent as any).children();
    }
    if (Array.isArray((parent as any).children)) {
        return (parent as any).children;
    }
    const res: INode[] = [];
    let cur = (parent as any).firstChild;
    while (cur) {
        res.push(cur);
        cur = cur.nextSibling;
    }
    return res;
}

export function traverseNodes(node: INode, fn: (n: INode) => void): void {
    fn(node);
    for (const child of getChildren(node)) {
        traverseNodes(child, fn);
    }
}

@command({
    key: "create.folder",
    icon: "icon-folder-plus",
})
export class NewFolder implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (document === undefined) return;

        const selectedNodes =
            typeof document.selection?.getSelectedNodes === "function"
                ? document.selection.getSelectedNodes()
                : [];
        const topLevelNodes = NodeUtils.findTopLevelNodes(new Set(selectedNodes)).filter(
            (n) => n !== document.modelManager.rootNode,
        );

        if (topLevelNodes.length === 1 && topLevelNodes[0] instanceof FolderNode) {
            // Case A: Exactly 1 FolderNode selected -> create subfolder inside it
            const parentFolder = topLevelNodes[0] as FolderNode;
            const name = NodeUtils.generateName(document, I18n.translate("command.create.folder"));
            const folder = new FolderNode({ document, name });
            Transaction.execute(document, "Create Subfolder", () => {
                if (typeof (parentFolder as any).add === "function") {
                    (parentFolder as any).add(folder);
                } else if (typeof (parentFolder as any).addNode === "function") {
                    (parentFolder as any).addNode(folder);
                }
            });
            document.selection?.setSelectedNodes?.([folder], false);
            document.modelManager.currentNode = folder;
            PubSub.default.pub("startRenameNode", folder);
            return;
        }

        if (topLevelNodes.length >= 1) {
            // Case B: 1 or more nodes selected -> create folder and group them
            const first = topLevelNodes[0];
            const targetParent =
                first.parent instanceof FolderNode
                    ? first.parent
                    : (document.modelManager.currentNode ?? document.modelManager.rootNode);
            const baseName = first.name ? `Nhóm ${first.name}` : I18n.translate("command.create.folder");
            const name = NodeUtils.generateName(document, baseName);
            const folder = new FolderNode({ document, name });

            Transaction.execute(document, "Group Into Folder", () => {
                if (targetParent && typeof (targetParent as any).add === "function") {
                    (targetParent as any).add(folder);
                } else {
                    document.modelManager.addNode(folder);
                }
                for (const node of topLevelNodes) {
                    if (
                        node.parent &&
                        "move" in node.parent &&
                        typeof (node.parent as any).move === "function"
                    ) {
                        (node.parent as any).move(node, folder, undefined);
                    }
                }
            });

            document.selection?.setSelectedNodes?.([folder], false);
            document.modelManager.currentNode = folder;
            PubSub.default.pub("startRenameNode", folder);
            return;
        }

        // Case C: No selection -> create folder in currentNode or rootNode
        const name = NodeUtils.generateName(document, I18n.translate("command.create.folder"));
        const folder = new FolderNode({ document, name });
        Transaction.execute(document, "Create Folder", () => {
            document.modelManager.addNode(folder);
        });
        document.selection?.setSelectedNodes?.([folder], false);
        document.modelManager.currentNode = folder;
        PubSub.default.pub("startRenameNode", folder);
    }
}

@command({
    key: "modify.hideSelected",
    icon: "icon-eye-slash",
})
export class HideSelectedCommand implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (!document) return;
        const selected =
            typeof document.selection?.getSelectedNodes === "function"
                ? document.selection.getSelectedNodes()
                : [];
        if (selected.length === 0) return;

        Transaction.execute(document, "Hide Selected", () => {
            for (const node of selected) {
                node.visible = false;
            }
        });
        document.visual?.update?.();
    }
}

@command({
    key: "modify.showAll",
    icon: "icon-eye",
})
export class ShowAllCommand implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (!document) return;

        Transaction.execute(document, "Show All", () => {
            traverseNodes(document.modelManager.rootNode, (node) => {
                if (node !== document.modelManager.rootNode) {
                    node.visible = true;
                }
            });
        });
        document.visual?.update?.();
    }
}

@command({
    key: "modify.isolateSelected",
    icon: "icon-target",
})
export class IsolateSelectedCommand implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (!document) return;
        const selected =
            typeof document.selection?.getSelectedNodes === "function"
                ? document.selection.getSelectedNodes()
                : [];
        if (selected.length === 0) return;

        const keepSet = new Set<INode>();
        for (const sel of selected) {
            traverseNodes(sel, (desc) => keepSet.add(desc));
            let p: INode | undefined = sel.parent;
            while (p) {
                keepSet.add(p);
                p = p.parent;
            }
        }

        Transaction.execute(document, "Isolate Selected", () => {
            traverseNodes(document.modelManager.rootNode, (node) => {
                if (node !== document.modelManager.rootNode) {
                    node.visible = keepSet.has(node);
                }
            });
        });
        document.visual?.update?.();
    }
}

@command({
    key: "modify.autoOrganizeTree",
    icon: "icon-folder",
})
export class AutoOrganizeTreeCommand implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document;
        if (!document) return;
        autoOrganizeTree(document);
    }
}

export function autoOrganizeTree(document: IDocument): number {
    let organizedCount = 0;
    Transaction.execute(document, "Auto Organize Tree", () => {
        const foldersToProcess: (FolderNode | INode)[] = [];
        traverseNodes(document.modelManager.rootNode, (node) => {
            if (node instanceof FolderNode || node === document.modelManager.rootNode) {
                foldersToProcess.push(node);
            }
        });

        for (const parent of foldersToProcess) {
            const children = getChildren(parent);
            const copyGroups = new Map<string, INode[]>();

            for (const child of children) {
                if (child instanceof FolderNode && child.name.startsWith("Mảng ")) continue;
                const match = child.name.match(/^(.*?)(?:_copy\d*|\s*-\s*copy\d*|\s*\(\d+\))$/i);
                const baseName = match ? match[1].trim() : child.name.trim();
                const list = copyGroups.get(baseName) ?? [];
                list.push(child);
                copyGroups.set(baseName, list);
            }

            for (const [baseName, group] of copyGroups) {
                const hasCopy = group.some((n) => /_copy/i.test(n.name));
                if (group.length >= 2 || (group.length >= 1 && hasCopy)) {
                    if (parent instanceof FolderNode && parent.name.startsWith(`Mảng ${baseName}`)) {
                        continue;
                    }
                    const folderName = `Mảng ${baseName} (${group.length})`;
                    const folder = new FolderNode({ document, name: folderName });
                    if (typeof (parent as any).addNode === "function") {
                        (parent as any).addNode(folder);
                    } else if (typeof (parent as any).add === "function") {
                        (parent as any).add(folder);
                    } else {
                        document.modelManager.addNode(folder);
                    }
                    for (const node of group) {
                        if (parent && "move" in parent && typeof (parent as any).move === "function") {
                            (parent as any).move(node, folder, undefined);
                        }
                    }
                    organizedCount += group.length;
                }
            }
        }
    });

    if (organizedCount > 0) {
        document.visual.update();
    }
    return organizedCount;
}
