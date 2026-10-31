// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    FolderNode,
    type ICircle,
    type IEdge,
    type ILine,
    type IShape,
    type ITrimmedCurve,
    Result,
    ShapeTypes,
    XYZ,
} from "@chili3d/core";
import { createMockDocument, MockShape } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import { DxfConverter } from "../src/dxfConverter";

describe("DxfConverter", () => {
    describe("importFromDxf", () => {
        let doc: ReturnType<typeof createMockDocument>;
        let factoryStub: {
            line: any;
            circle: any;
            arc: any;
            polygon: any;
            point: any;
        };

        beforeEach(() => {
            doc = createMockDocument();
            factoryStub = {
                line: rs.fn((_start: XYZ, _end: XYZ) => Result.ok(new MockShape({ id: "line-shape" }))),
                circle: rs.fn((_normal: XYZ, _center: XYZ, _radius: number) =>
                    Result.ok(new MockShape({ id: "circle-shape" })),
                ),
                arc: rs.fn((_normal: XYZ, _center: XYZ, _start: XYZ, _angle: number) =>
                    Result.ok(new MockShape({ id: "arc-shape" })),
                ),
                polygon: rs.fn((_pts: XYZ[]) => Result.ok(new MockShape({ id: "poly-shape" }))),
                point: rs.fn((_pt: XYZ) => Result.ok(new MockShape({ id: "point-shape" }))),
            };
            rs.stubGlobal("shapeFactory", factoryStub);
        });

        afterEach(() => {
            rs.unstubAllGlobals();
        });

        test("should parse LINE, CIRCLE, ARC, LWPOLYLINE, POINT and group into Layer folders", () => {
            const dxfContent = `
0
SECTION
2
ENTITIES
0
LINE
8
Wall
10
0.0
20
0.0
30
0.0
11
100.0
21
50.0
31
0.0
0
CIRCLE
8
Columns
10
10.0
20
20.0
30
0.0
40
15.0
0
ARC
8
Doors
10
0.0
20
0.0
30
0.0
40
25.0
50
0.0
51
90.0
0
LWPOLYLINE
8
0
70
1
10
0.0
20
0.0
10
10.0
20
0.0
10
10.0
20
10.0
0
POINT
8
0
10
5.0
20
5.0
30
0.0
0
ENDSEC
0
EOF
`;
            const result = DxfConverter.importFromDxf(doc, dxfContent);

            expect(result.isOk).toBe(true);
            const rootNode = result.value as FolderNode;
            expect(rootNode).toBeInstanceOf(FolderNode);
            expect(rootNode.name).toBe("DXF_Import");

            const children = rootNode.children();
            const folderNames = children.map((c) => c.name);
            expect(folderNames).toContain("Layer_Wall");
            expect(folderNames).toContain("Layer_Columns");
            expect(folderNames).toContain("Layer_Doors");
            expect(folderNames).toContain("Layer_0");

            // Verify LINE creation
            expect(factoryStub.line).toHaveBeenCalledTimes(1);
            expect(factoryStub.line).toHaveBeenCalledWith(new XYZ(0, 0, 0), new XYZ(100, 50, 0));

            // Verify CIRCLE creation
            expect(factoryStub.circle).toHaveBeenCalledTimes(1);
            expect(factoryStub.circle).toHaveBeenCalledWith(XYZ.unitZ, new XYZ(10, 20, 0), 15);

            // Verify ARC creation (0° to 90°, r=25 => startPt=(25, 0, 0), sweep=90)
            expect(factoryStub.arc).toHaveBeenCalledTimes(1);
            expect(factoryStub.arc).toHaveBeenCalledWith(XYZ.unitZ, new XYZ(0, 0, 0), new XYZ(25, 0, 0), 90);

            // Verify LWPOLYLINE creation (closed flag 1 adds the first point at end)
            expect(factoryStub.polygon).toHaveBeenCalledTimes(1);
            const polyPoints = factoryStub.polygon.mock.calls[0][0] as XYZ[];
            expect(polyPoints.length).toBe(4);
            expect(polyPoints[0]).toEqual(new XYZ(0, 0, 0));
            expect(polyPoints[3]).toEqual(new XYZ(0, 0, 0));

            // Verify POINT creation
            expect(factoryStub.point).toHaveBeenCalledTimes(1);
            expect(factoryStub.point).toHaveBeenCalledWith(new XYZ(5, 5, 0));
        });

        test("should handle wrap-around arc angle correctly", () => {
            const dxfContent = `
0
SECTION
2
ENTITIES
0
ARC
8
0
10
0.0
20
0.0
30
0.0
40
10.0
50
300.0
51
30.0
0
ENDSEC
0
EOF
`;
            const result = DxfConverter.importFromDxf(doc, dxfContent);
            expect(result.isOk).toBe(true);
            expect(factoryStub.arc).toHaveBeenCalledTimes(1);
            // 300° to 30° => sweep is (30 + 360) - 300 = 90°
            const [normal, center, _startPt, sweepAngle] = factoryStub.arc.mock.calls[0];
            expect(normal).toEqual(XYZ.unitZ);
            expect(center).toEqual(new XYZ(0, 0, 0));
            expect(sweepAngle).toBeCloseTo(90, 5);
        });

        test("should return Result.err if an exception occurs", () => {
            factoryStub.line = rs.fn(() => {
                throw new Error("Factory failure");
            });

            const dxfContent = `
0
SECTION
2
ENTITIES
0
LINE
10
0
20
0
11
1
21
1
0
ENDSEC
`;
            const result = DxfConverter.importFromDxf(doc, dxfContent);
            expect(result.isOk).toBe(false);
            expect(result.error).toContain("DXF Import Error");
        });
    });

    describe("exportToDxf", () => {
        function createFakeEdge(curve: ITrimmedCurve, isClosed = false): IEdge {
            const edge = {
                shapeType: ShapeTypes.edge,
                curve,
                isClosed: () => isClosed,
                startPoint: () => new XYZ(0, 0, 0),
                endPoint: () => new XYZ(10, 0, 0),
                firstParameter: () => 0,
                lastParameter: () => 1,
                pointAt: (t: number) => new XYZ(t * 10, t * 5, 0),
            } as unknown as IEdge;
            return edge;
        }

        function createFakeShape(edges: IEdge[]): IShape {
            return {
                shapeType: ShapeTypes.wire,
                findSubShapes: (type: any) => (type === ShapeTypes.edge ? edges : []),
            } as unknown as IShape;
        }

        test("should export header with $INSUNITS = 4 (millimeters)", () => {
            const result = DxfConverter.exportToDxf([]);
            expect(result.isOk).toBe(true);
            const dxf = result.value;
            expect(dxf).toContain("SECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC");
            expect(dxf).toContain("SECTION\n2\nENTITIES");
            expect(dxf).toContain("ENDSEC\n0\nEOF");
        });

        test("should export LINE entity for linear edge", () => {
            const lineCurve = {
                basisCurve: { direction: new XYZ(1, 0, 0) } as ILine,
                dispose: rs.fn(),
            } as unknown as ITrimmedCurve;

            const edge = createFakeEdge(lineCurve);
            const shape = createFakeShape([edge]);

            const result = DxfConverter.exportToDxf([shape]);
            expect(result.isOk).toBe(true);
            const dxf = result.value;

            expect(dxf).toContain("LINE");
            expect(dxf).toContain("10\n0.000000\n20\n0.000000\n30\n0.000000");
            expect(dxf).toContain("11\n10.000000\n21\n0.000000\n31\n0.000000");
            expect(lineCurve.dispose).toHaveBeenCalled();
        });

        test("should export CIRCLE entity for closed circular edge", () => {
            const circleCurve = {
                basisCurve: {
                    center: new XYZ(15, 25, 0),
                    radius: 7.5,
                    axis: XYZ.unitZ,
                } as ICircle,
                dispose: rs.fn(),
            } as unknown as ITrimmedCurve;

            const edge = createFakeEdge(circleCurve, true);
            const shape = createFakeShape([edge]);

            const result = DxfConverter.exportToDxf([shape]);
            expect(result.isOk).toBe(true);
            const dxf = result.value;

            expect(dxf).toContain("CIRCLE");
            expect(dxf).toContain("10\n15.000000\n20\n25.000000\n30\n0.000000");
            expect(dxf).toContain("40\n7.500000");
        });

        test("should export ARC entity for open circular edge", () => {
            const arcCurve = {
                basisCurve: {
                    center: new XYZ(0, 0, 0),
                    radius: 10,
                    axis: XYZ.unitZ,
                } as ICircle,
                dispose: rs.fn(),
            } as unknown as ITrimmedCurve;

            const edge = {
                ...createFakeEdge(arcCurve, false),
                firstParameter: () => 0,
                lastParameter: () => Math.PI / 2, // 90°
            } as unknown as IEdge;

            const shape = createFakeShape([edge]);

            const result = DxfConverter.exportToDxf([shape]);
            expect(result.isOk).toBe(true);
            const dxf = result.value;

            expect(dxf).toContain("ARC");
            expect(dxf).toContain("10\n0.000000\n20\n0.000000\n30\n0.000000");
            expect(dxf).toContain("40\n10.000000");
            expect(dxf).toContain("50\n0.000000");
            expect(dxf).toContain("51\n90.000000");
        });

        test("should export LWPOLYLINE for non-line non-circle edges", () => {
            const splineCurve = {
                basisCurve: {} as any, // Not a line, not a circle
                dispose: rs.fn(),
            } as unknown as ITrimmedCurve;

            const edge = createFakeEdge(splineCurve);
            const shape = createFakeShape([edge]);

            const result = DxfConverter.exportToDxf([shape]);
            expect(result.isOk).toBe(true);
            const dxf = result.value;

            expect(dxf).toContain("LWPOLYLINE");
            expect(dxf).toContain("90\n33"); // 32 segments + 1
        });
    });
});
