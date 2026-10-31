// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    CurveUtils,
    EditableShapeNode,
    FolderNode,
    type ICircle,
    type IDocument,
    type IEdge,
    type INode,
    type IShape,
    type IShapeFactory,
    Result,
    ShapeTypes,
    XYZ,
} from "@chili3d/core";

interface DxfEntity {
    type: string;
    layer: string;
    data: Map<number, string[]>;
}

export class DxfConverter {
    private static getFactory(document: IDocument): IShapeFactory {
        return (
            (document.application as { shapeProvider?: { shapeFactory?: IShapeFactory } })?.shapeProvider
                ?.shapeFactory ?? (globalThis as unknown as { shapeFactory: IShapeFactory }).shapeFactory
        );
    }

    /**
     * Phân tích nội dung file ASCII .dxf và tạo cây FolderNode theo từng Layer.
     */
    static importFromDxf(document: IDocument, dxfText: string): Result<INode> {
        try {
            const entities = DxfConverter.parseEntities(dxfText);
            const rootFolder = new FolderNode({ document, name: "DXF_Import" });
            const layerMap = new Map<string, FolderNode>();
            const factory = DxfConverter.getFactory(document);

            const getLayerFolder = (layerName: string): FolderNode => {
                const key = layerName || "0";
                let folder = layerMap.get(key);
                if (!folder) {
                    folder = new FolderNode({ document, name: `Layer_${key}` });
                    rootFolder.add(folder);
                    layerMap.set(key, folder);
                }
                return folder;
            };

            for (const ent of entities) {
                const layerFolder = getLayerFolder(ent.layer);
                if (ent.type === "LINE") {
                    const start = DxfConverter.readPoint(ent.data, 10, 20, 30);
                    const end = DxfConverter.readPoint(ent.data, 11, 21, 31);
                    const edgeRes = factory.line(start, end);
                    if (edgeRes.isOk) {
                        layerFolder.add(
                            new EditableShapeNode({
                                document,
                                name: "Line",
                                shape: edgeRes.value,
                            }),
                        );
                    }
                } else if (ent.type === "CIRCLE") {
                    const center = DxfConverter.readPoint(ent.data, 10, 20, 30);
                    const radius = Number.parseFloat(ent.data.get(40)?.[0] ?? "0");
                    if (radius > 0) {
                        const circleRes = factory.circle(XYZ.unitZ, center, radius);
                        if (circleRes.isOk) {
                            layerFolder.add(
                                new EditableShapeNode({
                                    document,
                                    name: "Circle",
                                    shape: circleRes.value,
                                }),
                            );
                        }
                    }
                } else if (ent.type === "ARC") {
                    const center = DxfConverter.readPoint(ent.data, 10, 20, 30);
                    const radius = Number.parseFloat(ent.data.get(40)?.[0] ?? "0");
                    const startAngleDeg = Number.parseFloat(ent.data.get(50)?.[0] ?? "0");
                    let endAngleDeg = Number.parseFloat(ent.data.get(51)?.[0] ?? "0");
                    if (endAngleDeg < startAngleDeg) endAngleDeg += 360;

                    const sRad = (startAngleDeg * Math.PI) / 180;
                    const startPt = new XYZ(
                        center.x + radius * Math.cos(sRad),
                        center.y + radius * Math.sin(sRad),
                        center.z,
                    );
                    const sweepAngle = endAngleDeg - startAngleDeg;
                    const arcRes = factory.arc(XYZ.unitZ, center, startPt, sweepAngle);
                    if (arcRes.isOk) {
                        layerFolder.add(
                            new EditableShapeNode({
                                document,
                                name: "Arc",
                                shape: arcRes.value,
                            }),
                        );
                    }
                } else if (ent.type === "LWPOLYLINE") {
                    const xs = (ent.data.get(10) ?? []).map(Number.parseFloat);
                    const ys = (ent.data.get(20) ?? []).map(Number.parseFloat);
                    const flag = Number.parseInt(ent.data.get(70)?.[0] ?? "0", 10);
                    const isClosed = (flag & 1) === 1;
                    const points: XYZ[] = [];
                    const count = Math.min(xs.length, ys.length);
                    for (let i = 0; i < count; i++) {
                        points.push(new XYZ(xs[i], ys[i], 0));
                    }
                    if (isClosed && points.length > 2) {
                        points.push(points[0]);
                    }
                    if (points.length >= 2) {
                        const polyRes = factory.polygon(points);
                        if (polyRes.isOk) {
                            layerFolder.add(
                                new EditableShapeNode({
                                    document,
                                    name: "LwPolyline",
                                    shape: polyRes.value,
                                }),
                            );
                        }
                    }
                } else if (ent.type === "POINT") {
                    const pt = DxfConverter.readPoint(ent.data, 10, 20, 30);
                    const ptRes = factory.point(pt);
                    if (ptRes.isOk) {
                        layerFolder.add(
                            new EditableShapeNode({
                                document,
                                name: "Point",
                                shape: ptRes.value,
                            }),
                        );
                    }
                }
            }

            return Result.ok(rootFolder);
        } catch (err) {
            return Result.err(`DXF Import Error: ${String(err)}`);
        }
    }

    /**
     * Xuất mảng IShape ra chuỗi định dạng ASCII .dxf chuẩn AutoCAD.
     */
    static exportToDxf(shapes: IShape[]): Result<string> {
        try {
            const lines: string[] = [
                "0",
                "SECTION",
                "2",
                "HEADER",
                "9",
                "$INSUNITS",
                "70",
                "4", // 4 = Millimeters
                "0",
                "ENDSEC",
                "0",
                "SECTION",
                "2",
                "ENTITIES",
            ];

            for (const shape of shapes) {
                const edges = shape.findSubShapes(ShapeTypes.edge) as IEdge[];
                for (const edge of edges) {
                    let trimmed: IEdge["curve"] | undefined;
                    try {
                        trimmed = edge.curve;
                    } catch {
                        continue;
                    }
                    if (!trimmed) continue;

                    const basis = CurveUtils.isTrimmed(trimmed) ? trimmed.basisCurve : trimmed;

                    if (CurveUtils.isLine(basis)) {
                        const p1 = edge.startPoint();
                        const p2 = edge.endPoint();
                        lines.push(
                            "0",
                            "LINE",
                            "8",
                            "0",
                            "10",
                            p1.x.toFixed(6),
                            "20",
                            p1.y.toFixed(6),
                            "30",
                            p1.z.toFixed(6),
                            "11",
                            p2.x.toFixed(6),
                            "21",
                            p2.y.toFixed(6),
                            "31",
                            p2.z.toFixed(6),
                        );
                    } else if (CurveUtils.isCircle(basis)) {
                        const circle = basis as ICircle;
                        const center = circle.center;
                        const radius = circle.radius;
                        const first = edge.firstParameter();
                        const last = edge.lastParameter();
                        const isFullCircle = edge.isClosed() || Math.abs(last - first - 2 * Math.PI) < 1e-4;

                        if (isFullCircle) {
                            lines.push(
                                "0",
                                "CIRCLE",
                                "8",
                                "0",
                                "10",
                                center.x.toFixed(6),
                                "20",
                                center.y.toFixed(6),
                                "30",
                                center.z.toFixed(6),
                                "40",
                                radius.toFixed(6),
                            );
                        } else {
                            const startDeg = ((((first * 180) / Math.PI) % 360) + 360) % 360;
                            const endDeg = ((((last * 180) / Math.PI) % 360) + 360) % 360;
                            lines.push(
                                "0",
                                "ARC",
                                "8",
                                "0",
                                "10",
                                center.x.toFixed(6),
                                "20",
                                center.y.toFixed(6),
                                "30",
                                center.z.toFixed(6),
                                "40",
                                radius.toFixed(6),
                                "50",
                                startDeg.toFixed(6),
                                "51",
                                endDeg.toFixed(6),
                            );
                        }
                    } else {
                        // Sample other curves (Ellipse, Bezier, BSpline) into LWPOLYLINE
                        const first = edge.firstParameter();
                        const last = edge.lastParameter();
                        const segments = 32;
                        lines.push("0", "LWPOLYLINE", "8", "0", "90", String(segments + 1), "70", "0");
                        for (let i = 0; i <= segments; i++) {
                            const t = first + ((last - first) * i) / segments;
                            const pt = edge.pointAt(t);
                            lines.push("10", pt.x.toFixed(6), "20", pt.y.toFixed(6));
                        }
                    }
                    trimmed.dispose?.();
                }
            }

            lines.push("0", "ENDSEC", "0", "EOF");
            return Result.ok(lines.join("\n"));
        } catch (err) {
            return Result.err(`DXF Export Error: ${String(err)}`);
        }
    }

    private static readPoint(data: Map<number, string[]>, gx: number, gy: number, gz: number): XYZ {
        const x = Number.parseFloat(data.get(gx)?.[0] ?? "0");
        const y = Number.parseFloat(data.get(gy)?.[0] ?? "0");
        const z = Number.parseFloat(data.get(gz)?.[0] ?? "0");
        return new XYZ(x, y, z);
    }

    private static parseEntities(dxfText: string): DxfEntity[] {
        const rawLines = dxfText
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const entities: DxfEntity[] = [];
        let inEntities = false;
        let current: DxfEntity | undefined;

        for (let i = 0; i + 1 < rawLines.length; i += 2) {
            const code = Number.parseInt(rawLines[i], 10);
            const value = rawLines[i + 1];

            if (code === 0 && value === "SECTION") {
                if (rawLines[i + 2] === "2" && rawLines[i + 3] === "ENTITIES") {
                    inEntities = true;
                    i += 2;
                }
                continue;
            }
            if (code === 0 && value === "ENDSEC") {
                if (current) entities.push(current);
                current = undefined;
                inEntities = false;
                continue;
            }
            if (!inEntities) continue;

            if (code === 0) {
                if (current) entities.push(current);
                current = { type: value, layer: "0", data: new Map() };
            } else if (current) {
                if (code === 8) current.layer = value;
                const list = current.data.get(code) ?? [];
                list.push(value);
                current.data.set(code, list);
            }
        }
        return entities;
    }
}
