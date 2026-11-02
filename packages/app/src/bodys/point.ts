// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    type ParameterShapeNodeOptions,
    property,
    type Result,
    serializable,
    serialize,
    type XYZ,
} from "@chili3d/core";

export interface PointOptions extends ParameterShapeNodeOptions {
    position: XYZ;
}

@serializable()
export class PointNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.point";
    }

    @serialize()
    @property("point.position")
    get position() {
        return this.getPrivateValue("position");
    }
    set position(pnt: XYZ) {
        this.setPropertyEmitShapeChanged("position", pnt);
    }

    constructor(options: PointOptions) {
        super(options);
        this.setPrivateValue("position", options.position);
    }

    generateShape(): Result<IShape, string> {
        return shapeFactory.point(this.position);
    }
}
