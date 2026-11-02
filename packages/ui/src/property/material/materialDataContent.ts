// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    GeometryNode,
    type IDocument,
    type INode,
    Material,
    type MaterialPreset,
    NodeUtils,
    Observable,
} from "@chili3d/core";

export class MaterialDataContent extends Observable {
    readonly targetObjects: GeometryNode[];
    private _initialMaterial?: Material;
    private _autoCreatedMaterial?: Material;
    private readonly _initialObjectMaterialIds = new Map<GeometryNode, string | string[]>();

    get autoCreatedMaterial(): Material | undefined {
        return this._autoCreatedMaterial;
    }

    get initialMaterial(): Material | undefined {
        return this._initialMaterial;
    }

    get editingMaterial(): Material {
        return this.getPrivateValue("editingMaterial");
    }
    set editingMaterial(value: Material) {
        this.setProperty("editingMaterial", value);
    }

    constructor(
        readonly document: IDocument,
        readonly callback: (material: Material) => void,
        editingMaterial: Material,
        targetObjects?: GeometryNode[],
    ) {
        super();
        this.targetObjects = targetObjects ?? [];
        this._initialMaterial = editingMaterial;

        for (const obj of this.targetObjects) {
            this._initialObjectMaterialIds.set(
                obj,
                Array.isArray(obj.materialId) ? [...obj.materialId] : obj.materialId,
            );
        }

        if (
            editingMaterial &&
            this.callback &&
            this.targetObjects.length > 0 &&
            this.isMaterialSharedByOtherNodes(editingMaterial.id)
        ) {
            const cloned = editingMaterial.clone();
            cloned.name = this.generateNextMaterialName();
            this.document.modelManager.materials.push(cloned);
            this._autoCreatedMaterial = cloned;
            this.setPrivateValue("editingMaterial", cloned);
            this.callback(cloned);
        } else if (
            editingMaterial &&
            this.callback &&
            this.targetObjects.length > 0 &&
            this.hasMixedMaterials(editingMaterial.id)
        ) {
            this.setPrivateValue("editingMaterial", editingMaterial);
            this.callback(editingMaterial);
        } else {
            this.setPrivateValue("editingMaterial", editingMaterial);
        }
    }

    private hasMixedMaterials(materialId: string): boolean {
        return this.targetObjects.some((obj) => {
            if (typeof obj.materialId === "string") {
                return obj.materialId !== materialId;
            }
            return !obj.materialId.includes(materialId);
        });
    }

    private *allDocumentNodes(): Generator<INode> {
        if (this.document.modelManager.rootNode) {
            yield* NodeUtils.children(this.document.modelManager.rootNode);
        }
        for (const comp of this.document.modelManager.components) {
            for (const node of comp.nodes) {
                yield node;
            }
        }
    }

    isMaterialSharedByOtherNodes(materialId: string): boolean {
        if (!materialId || this.targetObjects.length === 0) return false;
        const targetSet = new Set(this.targetObjects);
        for (const node of this.allDocumentNodes()) {
            if (targetSet.has(node as GeometryNode)) continue;
            if (node instanceof GeometryNode) {
                const nodeMatId = node.materialId;
                if (typeof nodeMatId === "string" && nodeMatId === materialId) {
                    return true;
                }
                if (Array.isArray(nodeMatId) && nodeMatId.includes(materialId)) {
                    return true;
                }
            }
        }
        return false;
    }

    isMaterialUsedByAnyNode(materialId: string): boolean {
        for (const node of this.allDocumentNodes()) {
            if (node instanceof GeometryNode) {
                const nodeMatId = node.materialId;
                if (typeof nodeMatId === "string" && nodeMatId === materialId) {
                    return true;
                }
                if (Array.isArray(nodeMatId) && nodeMatId.includes(materialId)) {
                    return true;
                }
            }
        }
        return false;
    }

    generateNextMaterialName(): string {
        const existingNames = new Set(this.document.modelManager.materials.map((m) => m.name));
        let index = this.document.modelManager.materials.length + 1;
        while (existingNames.has(`Material ${index}`)) {
            index++;
        }
        return `Material ${index}`;
    }

    cancelEdit() {
        if (this._initialMaterial && this.callback) {
            this.callback(this._initialMaterial);
        }
        for (const [obj, initMatId] of this._initialObjectMaterialIds.entries()) {
            obj.materialId = Array.isArray(initMatId) ? [...initMatId] : initMatId;
        }
        if (this._autoCreatedMaterial && !this.isMaterialUsedByAnyNode(this._autoCreatedMaterial.id)) {
            this.document.modelManager.materials.remove(this._autoCreatedMaterial);
        }
        this._autoCreatedMaterial = undefined;
        this.document.visual?.update?.();
    }

    applyMaterial(material: Material) {
        this.callback(material);
        if (
            this._autoCreatedMaterial &&
            this._autoCreatedMaterial !== material &&
            !this.isMaterialUsedByAnyNode(this._autoCreatedMaterial.id)
        ) {
            this.document.modelManager.materials.remove(this._autoCreatedMaterial);
            this._autoCreatedMaterial = undefined;
        }
    }

    deleteMaterial() {
        if (this.document.modelManager.materials.length <= 1) return;
        const tempMaterial = this.editingMaterial;
        if (tempMaterial === this._autoCreatedMaterial) {
            this._autoCreatedMaterial = undefined;
        }
        this.editingMaterial = this.document.modelManager.materials.find((m) => m.id !== tempMaterial.id)!;
        this.applyMaterial(this.editingMaterial);
        this.document.modelManager.materials.remove(tempMaterial);
    }

    /** Adds a material — wearing `preset`'s surface, or a plain grey one when none is given. */
    addMaterial(preset?: MaterialPreset) {
        this.document.modelManager.materials.push(
            preset === undefined
                ? new Material({
                      document: this.document,
                      name: this.generateNextMaterialName(),
                      color: 0xdddddd,
                  })
                : Material.fromPreset(this.document, preset),
        );
    }

    copyMaterial() {
        const cloned = this.editingMaterial.clone();
        cloned.name = this.generateNextMaterialName();
        this.document.modelManager.materials.push(cloned);
    }
}
