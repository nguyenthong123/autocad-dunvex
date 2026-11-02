// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    FacebaseNode,
    type I18nKeys,
    type IDocument,
    type IShape,
    MathUtils,
    type ParameterShapeNodeOptions,
    type Plane,
    property,
    Result,
    serializable,
    serialize,
    type XYZ,
} from "@chili3d/core";

export interface RectOptions extends ParameterShapeNodeOptions {
    plane: Plane;
    dx: number;
    dy: number;
}

@serializable()
export class RectNode extends FacebaseNode {
    override display(): I18nKeys {
        return "body.rect";
    }

    @serialize()
    @property("rect.dx")
    get dx() {
        return this.getPrivateValue("dx");
    }
    set dx(dx: number) {
        this.setPropertyEmitShapeChanged("dx", dx);
    }

    @serialize()
    @property("rect.dy")
    get dy() {
        return this.getPrivateValue("dy");
    }
    set dy(dy: number) {
        this.setPropertyEmitShapeChanged("dy", dy);
    }

    @serialize()
    get plane(): Plane {
        return this.getPrivateValue("plane");
    }
    set plane(value: Plane) {
        this.setPropertyEmitShapeChanged("plane", value);
    }

    constructor(options: RectOptions) {
        super(options);
        this.setPrivateValue("plane", options.plane);
        this.setPrivateValue("dx", options.dx);
        this.setPrivateValue("dy", options.dy);
    }

    generateShape(): Result<IShape, string> {
        if (MathUtils.anyEqualZero(this.dx, this.dy)) {
            return Result.err("Rectangle dx and dy cannot be zero");
        }
        const points = RectNode.points(this.plane, this.dx, this.dy);
        const wire = shapeFactory.polygon(points);
        if (!wire.isOk || !this.isFace) return wire;
        return wire.value.toFace();
    }

    static points(plane: Plane, dx: number, dy: number): XYZ[] {
        const start = plane.origin;
        return [
            start,
            start.add(plane.xvec.multiply(dx)),
            start.add(plane.xvec.multiply(dx)).add(plane.yvec.multiply(dy)),
            start.add(plane.yvec.multiply(dy)),
            start,
        ];
    }
}
