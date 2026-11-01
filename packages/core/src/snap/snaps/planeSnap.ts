// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Config } from "../../config";
import type { Plane, XYZ } from "../../math";
import { ViewUtils } from "../../visual";
import type { ISnap, MouseAndDetected, SnapResult } from "../snap";

export abstract class PlaneSnapBase implements ISnap {
    removeDynamicObject(): void {}
    clear(): void {}
    abstract snap(data: MouseAndDetected): SnapResult | undefined;

    constructor(
        readonly refPoint?: () => XYZ,
        readonly allowOrtho: boolean = true,
    ) {}

    protected snapAtPlane(plane: Plane, data: MouseAndDetected): SnapResult | undefined {
        plane = ViewUtils.ensurePlane(data.view, plane);
        const ray = data.view.rayAt(data.mx, data.my);
        let point = plane.intersectRay(ray);
        if (!point) return undefined;

        if (this.allowOrtho && Config.instance.orthoMode && this.refPoint) {
            const ref = this.refPoint();
            const delta = point.sub(ref);
            const dx = delta.dot(plane.xvec);
            const dy = delta.dot(plane.yvec);
            point =
                Math.abs(dx) >= Math.abs(dy)
                    ? ref.add(plane.xvec.multiply(dx))
                    : ref.add(plane.yvec.multiply(dy));
        }

        const distance = this.refPoint ? this.refPoint().distanceTo(point) : undefined;

        return {
            view: data.view,
            point,
            distance,
            shapes: [],
            type: "onSurface",
        };
    }
}

export class WorkplaneSnap extends PlaneSnapBase {
    constructor(refPoint?: () => XYZ, allowOrtho: boolean = true) {
        super(refPoint, allowOrtho);
    }

    snap(data: MouseAndDetected): SnapResult | undefined {
        return this.snapAtPlane(data.view.workplane, data);
    }
}

export class PlaneSnap extends PlaneSnapBase {
    constructor(
        readonly plane: (point: XYZ) => Plane,
        refPoint?: () => XYZ,
        allowOrtho: boolean = true,
    ) {
        super(refPoint, allowOrtho);
    }

    snap(data: MouseAndDetected): SnapResult | undefined {
        const point = data.view.screenToWorld(data.mx, data.my);
        const plane = this.plane(point);
        const result = this.snapAtPlane(plane, data);
        if (result) {
            result.plane = plane;
        }
        return result;
    }
}
