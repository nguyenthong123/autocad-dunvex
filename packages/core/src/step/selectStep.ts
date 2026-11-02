// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "../document";
import type { AsyncController } from "../foundation";
import type { I18nKeys } from "../i18n";
import { BoundingBox } from "../math";
import { type INode, ShapeNode } from "../model";
import { type INodeFilter, type IShapeFilter, isReferenceGeometryNode } from "../selectionFilter";
import { type ShapeType, ShapeTypes, ShapeTypeUtils } from "../shape";
import type { SnapResult } from "../snap";
import { type INodeVisual, type VisualShapeData, type VisualState, VisualStates } from "../visual";
import type { IStep } from "./step";

export interface SelectShapeOptions {
    multiple?: boolean;
    nodeFilter?: INodeFilter;
    /**
     * Reference geometry (a datum plane) is not a modeling shape and is excluded by
     * default. A caller-provided `nodeFilter` is COMPOSED with that exclusion, never a
     * replacement; only this switch lets reference geometry through — a tool that
     * genuinely targets one (Align to Plane, Delete) opts in here.
     */
    allowReferenceGeometry?: boolean;
    shapeFilter?: IShapeFilter;
    selectedState?: VisualState;
    highlightState?: VisualState;
    keepSelection?: boolean;
    /** In multiple mode, finish the selection automatically once this returns true. */
    canFinish?: (selected: VisualShapeData[]) => boolean;
    /**
     * Show the bare confirm/cancel bar while this step picks, so the step can be ended from
     * the viewport rather than a button on the command panel — for a loop that keeps calling
     * this step and needs a "done" action beside the picking (see
     * `PickShapeOptions.showConfirmControl`).
     */
    showConfirmControl?: boolean;
    beforeSelection?: () => void;
    afterSelection?: () => void;
}

export interface SelectNodeOptions {
    multiple?: boolean;
    filter?: INodeFilter;
    /** See `SelectShapeOptions.allowReferenceGeometry`. */
    allowReferenceGeometry?: boolean;
    keepSelection?: boolean;
}

/**
 * The picker's node gate. A caller's own filter is COMPOSED with the reference-geometry
 * exclusion, never substituted for it: a filter like `node instanceof ShapeNode` would
 * otherwise silently re-admit datum planes (and a command like Repair would replace the
 * plane, dangling every reference). Only `allowReferenceGeometry: true` opts out.
 */
function effectiveShapeNodeFilter(options: SelectShapeOptions | undefined): INodeFilter | undefined {
    const caller = options?.nodeFilter;
    if (options?.allowReferenceGeometry === true) return caller;
    return {
        allow: (node) => !isReferenceGeometryNode(node) && (caller?.allow(node) ?? true),
    };
}

function effectiveNodeFilter(options: SelectNodeOptions | undefined): INodeFilter | undefined {
    const caller = options?.filter;
    if (options?.allowReferenceGeometry === true) return caller;
    return {
        allow: (node) => !isReferenceGeometryNode(node) && (caller?.allow(node) ?? true),
    };
}

export function extractVisualShapesFromNodes(
    document: IDocument,
    nodes: readonly INode[],
    shapeType: ShapeType,
    shapeFilter?: IShapeFilter,
    nodeFilter?: INodeFilter,
): VisualShapeData[] {
    const result: VisualShapeData[] = [];
    for (const node of nodes) {
        if (nodeFilter && !nodeFilter.allow(node)) continue;
        if (!(node instanceof ShapeNode) || !node.shape.isOk) continue;
        const owner = document.visual.context.getVisual(node) as INodeVisual | undefined;
        if (!owner) continue;
        const rootShape = node.shape.value;
        const worldTransform = owner.worldTransform();

        // Case 1: The node's root shape directly matches shapeType
        if (ShapeTypeUtils.contains(shapeType, rootShape.shapeType)) {
            if (!shapeFilter || shapeFilter.allow(rootShape, worldTransform)) {
                const box = rootShape.boundingBox();
                const localCenter = BoundingBox.isValid(box) ? BoundingBox.center(box) : { x: 0, y: 0, z: 0 };
                result.push({
                    owner,
                    shape: rootShape,
                    transform: worldTransform,
                    point: worldTransform.ofPoint(localCenter),
                    indexes: [0],
                });
                continue;
            }
        }

        // Case 2: Non-solid node (2D profile, SketchNode, Compound of faces/wires/edges)
        if (!ShapeTypeUtils.hasSolid(rootShape.shapeType)) {
            const pushSubShapes = (subType: ShapeType) => {
                const subs = rootShape.findSubShapes(subType);
                let added = false;
                subs.forEach((sub, idx) => {
                    if (!shapeFilter || shapeFilter.allow(sub, worldTransform)) {
                        const box = sub.boundingBox();
                        const localCenter = BoundingBox.isValid(box)
                            ? BoundingBox.center(box)
                            : { x: 0, y: 0, z: 0 };
                        result.push({
                            owner,
                            shape: sub,
                            transform: worldTransform,
                            point: worldTransform.ofPoint(localCenter),
                            indexes: [idx],
                        });
                        added = true;
                    }
                });
                return added;
            };

            if (ShapeTypeUtils.hasFace(shapeType) && pushSubShapes(ShapeTypes.face)) {
                continue;
            }
            if (ShapeTypeUtils.hasWire(shapeType) && pushSubShapes(ShapeTypes.wire)) {
                continue;
            }
            if (ShapeTypeUtils.hasEdge(shapeType) && pushSubShapes(ShapeTypes.edge)) {
            }
        }
    }
    return result;
}

export abstract class SelectStep implements IStep {
    constructor(
        readonly snapeType: ShapeType,
        readonly prompt: I18nKeys,
        readonly options?: SelectShapeOptions,
    ) {}

    async execute(document: IDocument, controller: AsyncController): Promise<SnapResult | undefined> {
        if (!this.options?.keepSelection) {
            document.selection.clearSelection();
        }

        this.options?.beforeSelection?.();
        return Promise.try(this.select.bind(this), document, controller).finally(() => {
            this.options?.afterSelection?.();
        });
    }

    abstract select(document: IDocument, controller: AsyncController): Promise<SnapResult | undefined>;
}

export class SelectShapeStep extends SelectStep {
    override async select(document: IDocument, controller: AsyncController): Promise<SnapResult | undefined> {
        const shapes = await document.picker.pickShape(this.prompt, controller, {
            shapeType: this.snapeType,
            shapeFilter: this.options?.shapeFilter,
            nodeFilter: effectiveShapeNodeFilter(this.options),
            multi: this.options?.multiple,
            selectedState: this.options?.selectedState,
            highlightState: this.options?.highlightState,
            canFinish: this.options?.canFinish,
            showConfirmControl: this.options?.showConfirmControl,
        });
        if (shapes.length === 0) return undefined;
        return {
            view: document.application.activeView!,
            shapes,
            nodes: shapes.map((x) => x.owner.node),
            type: "shape",
        };
    }
}

export class GetOrSelectShapeStep extends SelectShapeStep {
    override execute(document: IDocument, controller: AsyncController): Promise<SnapResult | undefined> {
        const nodeFilter = effectiveShapeNodeFilter(this.options);
        let shapes = document.selection.getSelectedShapes().filter((x) => {
            let isValid = ShapeTypeUtils.contains(this.snapeType, x.shape.shapeType);
            if (this.options?.shapeFilter?.allow) {
                isValid &&= this.options.shapeFilter.allow(x.shape, x.transform);
            }
            if (nodeFilter?.allow) {
                isValid &&= nodeFilter.allow(x.owner.node);
            }

            return isValid;
        });

        if (shapes.length === 0) {
            const selectedNodes = document.selection.getSelectedNodes();
            if (selectedNodes.length > 0) {
                const fromNodes = extractVisualShapesFromNodes(
                    document,
                    selectedNodes,
                    this.snapeType,
                    this.options?.shapeFilter,
                    nodeFilter,
                );
                if (fromNodes.length > 0) {
                    document.selection.setSelectedShapes(
                        fromNodes,
                        this.options?.selectedState ?? VisualStates.faceSelected,
                        false,
                    );
                    shapes = fromNodes;
                }
            }
        }

        if (shapes.length > 0) {
            controller.success();
            return Promise.resolve({
                view: document.application.activeView!,
                shapes,
                nodes: shapes.map((x) => x.owner.node),
                type: "shape",
            });
        }

        return super.execute(document, controller);
    }
}

export class SelectNodeStep implements IStep {
    constructor(
        readonly prompt: I18nKeys,
        readonly options?: SelectNodeOptions,
    ) {}

    async execute(document: IDocument, controller: AsyncController): Promise<SnapResult | undefined> {
        if (!this.options?.keepSelection) {
            document.selection.clearSelection();
        }

        return Promise.try(async () => {
            const nodes = await document.picker.pickNode(this.prompt, controller, {
                nodeFilter: effectiveNodeFilter(this.options),
                multi: this.options?.multiple,
            });
            if (nodes.length === 0) return undefined;
            return {
                view: document.application.activeView!,
                shapes: [],
                nodes,
                type: "node",
            } satisfies SnapResult;
        });
    }
}

export class GetOrSelectNodeStep extends SelectNodeStep {
    override execute(document: IDocument, controller: AsyncController): Promise<SnapResult | undefined> {
        const filter = effectiveNodeFilter(this.options);
        const selected = document.selection.getSelectedNodes().filter((x) => {
            if (filter?.allow) {
                return filter.allow(x);
            }

            return true;
        });

        if (selected.length > 0) {
            controller.success();
            return Promise.resolve({
                view: document.application.activeView!,
                shapes: [],
                nodes: selected as ShapeNode[],
                type: "node",
            });
        }

        return super.execute(document, controller);
    }
}
