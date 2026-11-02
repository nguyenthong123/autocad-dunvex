// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    FacebaseNode,
    type I18nKeys,
    type IDocument,
    type IShape,
    type ParameterShapeNodeOptions,
    property,
    type Result,
    serializable,
    serialize,
    type XYZ,
} from "@chili3d/core";

export interface PolygonOptions extends ParameterShapeNodeOptions {
    points: XYZ[];
}

@serializable()
export class PolygonNode extends FacebaseNode {
    override display(): I18nKeys {
        return "body.polygon";
    }

    @serialize()
    @property("polygon.points")
    get points() {
        return this.getPrivateValue("points");
    }
    set points(value: XYZ[]) {
        this.setPropertyEmitShapeChanged("points", value);
    }

    constructor(options: PolygonOptions) {
        super(options);
        this.setPrivateValue("points", options.points);
    }

    generateShape(): Result<IShape, string> {
        const wire = shapeFactory.polygon(this.points);
        if (!wire.isOk || !this.isFace || !wire.value.isClosed()) return wire;
        return wire.value.toFace();
    }
}
