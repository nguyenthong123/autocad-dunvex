// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AsyncController, XYZ } from "../src";
import { Plane } from "../src/math";
import {
    type LengthAtAxisSnapData,
    SnapLengthAtAxisHandler,
    type SnapLengthAtPlaneData,
    SnapLengthAtPlaneHandler,
} from "../src/snap/handlers/lengthSnapEventHandler";
import { createHandlerMockView, TestDocument } from "../test-utils";

// ============================================================================
// SnapLengthAtAxisHandler
// ============================================================================

describe("SnapLengthAtAxisHandler", () => {
    let document: TestDocument;
    let controller: AsyncController;

    beforeEach(() => {
        document = new TestDocument();
        controller = new AsyncController();
    });

    afterEach(() => {
        controller.dispose();
    });

    test("should be created with length data", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };

        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        expect(handler).not.toBeNull();
        expect(handler.isEnabled).toBe(true);
    });

    test("should cancel on Escape key", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const view = createHandlerMockView();

        let gotCancelled = false;
        controller.onCancelled(() => {
            gotCancelled = true;
        });

        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        handler.keyDown(view, { key: "Escape" } as KeyboardEvent);

        expect(gotCancelled).toBe(true);
    });

    test("should enter inputing state on numeric keyDown", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const view = createHandlerMockView();

        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        handler.keyDown(view, { key: "1" } as KeyboardEvent);

        expect(handler.state).toBe("inputing");
    });

    test("should handle mouse wheel without error", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const view = createHandlerMockView();

        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        expect(() => {
            handler.mouseWheel(view, { deltaY: 120 } as WheelEvent);
        }).not.toThrow();
    });

    test("should handle dispose", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };

        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        handler.dispose();
        expect(handler.state).toBe("completed");
    });
});

// ============================================================================
// SnapLengthAtPlaneHandler
// ============================================================================

describe("SnapLengthAtPlaneHandler", () => {
    let document: TestDocument;
    let controller: AsyncController;

    beforeEach(() => {
        document = new TestDocument();
        controller = new AsyncController();
    });

    afterEach(() => {
        controller.dispose();
    });

    test("should be created with length data", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };

        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        expect(handler).not.toBeNull();
        expect(handler.isEnabled).toBe(true);
    });

    test("should cancel on Escape key", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };
        const view = createHandlerMockView();

        let gotCancelled = false;
        controller.onCancelled(() => {
            gotCancelled = true;
        });

        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        handler.keyDown(view, { key: "Escape" } as KeyboardEvent);

        expect(gotCancelled).toBe(true);
    });

    test("should handle mouse wheel without error", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };
        const view = createHandlerMockView();

        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        expect(() => {
            handler.mouseWheel(view, { deltaY: 120 } as WheelEvent);
        }).not.toThrow();
    });

    test("should handle dispose", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };

        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        handler.dispose();
        expect(handler.state).toBe("completed");
    });
});

// ============================================================================
// SnapLengthAtAxisHandler — getPointFromInput
// ============================================================================

describe("SnapLengthAtAxisHandler — getPointFromInput", () => {
    let document: TestDocument;
    let controller: AsyncController;

    beforeEach(() => {
        document = new TestDocument();
        controller = new AsyncController();
    });

    afterEach(() => {
        controller.dispose();
    });

    test("should calculate point along positive direction for positive input", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        const view = createHandlerMockView();
        const result = handler["getPointFromInput"](view, "10");
        expect(result.point!.x).toBe(10);
        expect(result.point!.y).toBe(0);
        expect(result.point!.z).toBe(0);
        expect(result.distance).toBe(10);
    });

    test("should follow snapped direction for positive input", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        // Set snapped point on negative X side
        (handler as unknown as { _snaped: { point: XYZ } })._snaped = {
            point: new XYZ({ x: -1, y: 0, z: 0 }),
        };
        const view = createHandlerMockView();
        const result = handler["getPointFromInput"](view, "10");
        expect(result.point!.x).toBe(-10);
        // displayed distance stays absolute
        expect(result.distance).toBe(10);
    });

    test("should reverse snapped direction for negative input", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        // Set snapped point on negative X side
        (handler as unknown as { _snaped: { point: XYZ } })._snaped = {
            point: new XYZ({ x: -1, y: 0, z: 0 }),
        };
        const view = createHandlerMockView();
        const result = handler["getPointFromInput"](view, "-10");
        expect(result.point!.x).toBe(10);
        expect(result.distance).toBe(10);
    });

    test("should go along negative direction for negative input without snapped point", () => {
        const lengthData: LengthAtAxisSnapData = {
            point: XYZ.zero,
            direction: XYZ.unitX,
        };
        const handler = new SnapLengthAtAxisHandler(document, controller, lengthData);
        const view = createHandlerMockView();
        const result = handler["getPointFromInput"](view, "-10");
        expect(result.point!.x).toBe(-10);
        expect(result.distance).toBe(10);
    });
});

// ============================================================================
// SnapLengthAtAxisHandler — inputError
// ============================================================================

describe("SnapLengthAtAxisHandler — inputError", () => {
    let document: TestDocument;
    let controller: AsyncController;

    beforeEach(() => {
        document = new TestDocument();
        controller = new AsyncController();
    });

    afterEach(() => {
        controller.dispose();
    });

    test("should return error for non-numeric input", () => {
        const handler = new SnapLengthAtAxisHandler(document, controller, {
            point: XYZ.zero,
            direction: XYZ.unitX,
        });
        expect(handler["inputError"]("abc")).toBe("error.input.invalidNumber");
        expect(handler["inputError"]("")).toBe("error.input.invalidNumber");
        expect(handler["inputError"]("0")).toBe("error.input.invalidNumber");
    });

    test("should return no error for valid numeric input", () => {
        const handler = new SnapLengthAtAxisHandler(document, controller, {
            point: XYZ.zero,
            direction: XYZ.unitX,
        });
        expect(handler["inputError"]("10")).toBeUndefined();
        expect(handler["inputError"]("-5.5")).toBeUndefined();
    });
});

// ============================================================================
// SnapLengthAtPlaneHandler — getPointFromInput + inputError
// ============================================================================

describe("SnapLengthAtPlaneHandler — getPointFromInput", () => {
    let document: TestDocument;
    let controller: AsyncController;

    beforeEach(() => {
        document = new TestDocument();
        controller = new AsyncController();
    });

    afterEach(() => {
        controller.dispose();
    });

    test("should calculate point from single distance", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };
        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        (handler as unknown as { _snaped: { point: XYZ } })._snaped = {
            point: new XYZ({ x: 10, y: 0, z: 0 }),
        };
        const view = createHandlerMockView({ workplane: Plane.XY });
        const result = handler["getPointFromInput"](view, "5");
        expect(result.point).not.toBeNull();
        expect(result.plane).not.toBeNull();
    });

    test("should calculate point from two coordinates", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };
        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        const view = createHandlerMockView({ workplane: Plane.XY });
        const result = handler["getPointFromInput"](view, "10,20");
        expect(result.point).not.toBeNull();
        expect(result.point!.x).toBe(10);
        expect(result.point!.y).toBe(20);
    });

    test("should follow snapped quadrant signs for coordinates input", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };
        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        // snapped in the (-x, +y) quadrant
        (handler as unknown as { _snaped: { point: XYZ } })._snaped = {
            point: new XYZ({ x: -1, y: 1, z: 0 }),
        };
        const view = createHandlerMockView({ workplane: Plane.XY });
        const result = handler["getPointFromInput"](view, "10,20");
        expect(result.point!.x).toBe(-10);
        expect(result.point!.y).toBe(20);
    });

    test("should reverse snapped quadrant sign for negative coordinate", () => {
        const lengthData: SnapLengthAtPlaneData = {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        };
        const handler = new SnapLengthAtPlaneHandler(document, controller, lengthData);
        // snapped in the (-x, +y) quadrant
        (handler as unknown as { _snaped: { point: XYZ } })._snaped = {
            point: new XYZ({ x: -1, y: 1, z: 0 }),
        };
        const view = createHandlerMockView({ workplane: Plane.XY });
        const result = handler["getPointFromInput"](view, "-10,20");
        expect(result.point!.x).toBe(10);
        expect(result.point!.y).toBe(20);
    });
});

describe("SnapLengthAtPlaneHandler — inputError", () => {
    let document: TestDocument;
    let controller: AsyncController;

    beforeEach(() => {
        document = new TestDocument();
        controller = new AsyncController();
    });

    afterEach(() => {
        controller.dispose();
    });

    test("should return error for non-numeric input", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        });
        expect(handler["inputError"]("abc")).toBe("error.input.invalidNumber");
    });

    test("should return error for three numbers (unsupported)", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        });
        expect(handler["inputError"]("1,2,3")).toBe("error.input.invalidNumber");
    });

    test("should return no error for single number", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        });
        expect(handler["inputError"]("10")).toBeUndefined();
    });

    test("should return no error for two numbers", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        });
        expect(handler["inputError"]("10,20")).toBeUndefined();
    });

    test("should return no error for single number with trailing comma (e.g. 1500,)", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        });
        expect(handler["inputError"]("1500,")).toBeUndefined();
    });

    test("should return error if any input number is zero", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
        });
        expect(handler["inputError"]("0")).toBe("error.input.invalidNumber");
        expect(handler["inputError"]("10,0")).toBe("error.input.invalidNumber");
        expect(handler["inputError"]("0,20")).toBe("error.input.invalidNumber");
    });

    test("should calculate square (dx = d, dy = d) when disableOrtho is true and single number input", () => {
        const handler = new SnapLengthAtPlaneHandler(document, controller, {
            point: () => XYZ.zero,
            plane: () => Plane.XY,
            disableOrtho: true,
        });
        const view = createHandlerMockView({ workplane: Plane.XY });
        // Without snaped point, defaults to positive quadrant
        const res1 = handler["getPointFromInput"](view, "1500");
        expect(res1.point!.x).toBe(1500);
        expect(res1.point!.y).toBe(1500);

        // When mouse is in negative X, positive Y quadrant
        handler["_snaped"] = {
            view,
            shapes: [],
            type: "onSurface",
            point: new XYZ({ x: -10, y: 50, z: 0 }),
        };
        const res2 = handler["getPointFromInput"](view, "1500,");
        expect(res2.point!.x).toBe(-1500);
        expect(res2.point!.y).toBe(1500);
    });
});
