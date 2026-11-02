// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    BoundingBox,
    command,
    type GeometryNode,
    GeometryUtils,
    GetOrSelectShapeStep,
    type IFace,
    type INode,
    type IShape,
    type IStep,
    isReferenceGeometryNode,
    type LengthAtAxisSnapData,
    LengthAtAxisStep,
    NodeUtils,
    Precision,
    property,
    ShapeNode,
    type ShapeType,
    ShapeTypes,
    ShapeTypeUtils,
    VisualStates,
} from "@chili3d/core";
import { closedProfileToFace, ExtrudeNode } from "../../bodys";
import { CreateFromSelectionCommand } from "../createCommand";

@command({
    key: "create.extrude",
    icon: "icon-prism",
})
export class ExtrudeCommand extends CreateFromSelectionCommand {
    @property("option.command.allowSolidFace")
    get allowSolidFace(): boolean {
        return this.getPrivateValue("allowSolidFace", false);
    }
    set allowSolidFace(value: boolean) {
        this.setProperty("allowSolidFace", value);
    }

    private static is2DProfileNode(node: INode): boolean {
        if (!(node instanceof ShapeNode) || !node.shape.isOk) return false;
        return !ShapeTypeUtils.hasSolid(node.shape.value.shapeType);
    }

    private has2DProfilesInScene(): boolean {
        const root = this.document.modelManager.rootNode;
        if (!root) return false;
        for (const node of NodeUtils.children(root)) {
            if (node.visible && node.parentVisible && ExtrudeCommand.is2DProfileNode(node)) {
                return true;
            }
        }
        const added = (root as any).added;
        if (Array.isArray(added)) {
            for (const node of added) {
                if (node.visible && node.parentVisible && ExtrudeCommand.is2DProfileNode(node)) {
                    return true;
                }
            }
        }
        return false;
    }

    protected override geometryNode(): GeometryNode {
        const shape = this.transformdFirstShape(this.stepDatas[0], false);
        const { point, normal } = this.getAxis(shape);
        const dist = this.stepDatas[1].point!.sub(point).dot(normal);
        return new ExtrudeNode({ document: this.document, section: shape, length: dist });
    }

    protected override getSteps(): IStep[] {
        return [
            new GetOrSelectShapeStep(
                (ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire) as ShapeType,
                "prompt.select.shape",
                {
                    nodeFilter: {
                        allow: (node) => {
                            if (isReferenceGeometryNode(node)) return false;
                            if (this.allowSolidFace) return true;
                            if (this.has2DProfilesInScene()) {
                                return ExtrudeCommand.is2DProfileNode(node);
                            }
                            return true;
                        },
                    },
                    shapeFilter: {
                        allow: (shape) => {
                            return (
                                shape.shapeType === ShapeTypes.face ||
                                shape.shapeType === ShapeTypes.wire ||
                                shape.shapeType === ShapeTypes.edge
                            );
                        },
                    },
                    selectedState: VisualStates.faceSelected,
                    highlightState: VisualStates.faceHighlight,
                },
            ),
            new LengthAtAxisStep("prompt.pickNextPoint", this.getLengthStepData, true),
        ];
    }

    private readonly getLengthStepData = (): LengthAtAxisSnapData => {
        const shape = this.transformdFirstShape(this.stepDatas[0]);
        const { point, normal } = this.getAxis(shape);
        return {
            point,
            direction: normal,
            preview: (p) => {
                if (!p) return [];
                const dist = p.sub(point).dot(normal);
                if (Math.abs(dist) < Precision.Float) return [];
                const vec = normal.multiply(dist);
                if (shape.shapeType === ShapeTypes.face) {
                    const sur = (shape as IFace).surface();
                    if (!sur.isPlanar()) {
                        return [this.meshCreatedShape("makeThickSolidBySimple", shape, dist)];
                    }
                } else if (
                    (shape.shapeType === ShapeTypes.wire || shape.shapeType === ShapeTypes.edge) &&
                    shape.isClosed()
                ) {
                    const face = closedProfileToFace(shape);
                    if (face.isOk) {
                        return [this.meshCreatedShape("prism", face.value, vec)];
                    }
                }
                return [this.meshCreatedShape("prism", shape, vec)];
            },
        };
    };

    private getAxis(shape: IShape) {
        const firstShape = this.stepDatas[0].shapes[0];
        const point =
            firstShape.point ??
            firstShape.transform.ofPoint(BoundingBox.center(firstShape.shape.boundingBox()));
        const normal = GeometryUtils.normal(shape as any);
        return { point, normal };
    }
}
