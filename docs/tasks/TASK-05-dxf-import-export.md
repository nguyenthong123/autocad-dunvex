# TASK-05: Tích hợp tính năng Đọc / Xuất bản vẽ định dạng `.DXF` (AutoCAD)

- **ID:** `TASK-05`
- **Tiêu đề:** Tích hợp tính năng Đọc / Xuất bản vẽ định dạng `.DXF` (AutoCAD)
- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** Cao (P1)
- **Độ khó:** Khó (Hard)

---

## 1. Mục tiêu (Objective)

Hiện tại, lớp `DefaultDataExchange` tại `packages/builder/src/defaultDataExchange.ts` chỉ hỗ trợ các định dạng 3D gồm `.step`, `.stp`, `.iges`, `.igs`, `.brep`, `.stl`, `.ply`, `.obj` mà **chưa hỗ trợ định dạng `.dxf` (Drawing Exchange Format)** — định dạng chuẩn công nghiệp của AutoCAD.

Mục tiêu của Task này là tích hợp bộ đọc (Import) và xuất (Export) tệp `.dxf` trực tiếp trên trình duyệt thông qua kiến trúc `IDataExchange` và `IShapeFactory` của Chili3D:
1. **Import `.dxf`:** Đọc tệp `.dxf` (hỗ trợ các thực thể `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE`, `ARC`, `ELLIPSE`, `SPLINE`, `POINT`), phân nhóm theo `LAYER` của AutoCAD thành các `FolderNode`, và khởi tạo các node hình học tương ứng (`EditableShapeNode`) thông qua `shapeFactory` toàn cục (hoặc `document.application.shapeProvider.shapeFactory`).
2. **Export `.dxf`:** Quét các `VisualNode` / `ShapeNode` được chọn, trích xuất các cạnh (`shape.findSubShapes(ShapeTypes.edge) as IEdge[]`) và đường cong hình học (`edge.curve`: `ILine`, `ICircle`, `IEllipse`, `IBezierCurve`, `IBSplineCurve`) để sinh nội dung tệp chuẩn AutoCAD `.dxf` (AC1015 / AutoCAD 2000).

---

## 2. Các file trong mã nguồn cần tác động (Target Files)

| Đường dẫn file thực tế | Loại tác động | Vai trò của file trong hệ thống |
| :--- | :---: | :--- |
| `packages/builder/src/dxfConverter.ts` | Tạo mới | Module đọc chuỗi văn bản `.dxf` thành cây `FolderNode` (theo Layer) và xuất danh sách `IShape` / `VisualNode` ra chuỗi `.dxf`. |
| `packages/builder/src/defaultDataExchange.ts` | Chỉnh sửa | Thêm `".dxf"` vào `importFormats()` (dòng 18-20), `exportFormats()` (dòng 22-24), bổ sung nhánh xử lý `DxfConverter.importFromDxf()` và `DxfConverter.exportToDxf()`. |
| `packages/builder/test/defaultDataExchange.test.ts` | Chỉnh sửa | Cập nhật test danh sách định dạng (`.dxf`) và bổ sung unit test cho luồng Import / Export `.dxf`. |
| `packages/builder/test/dxfConverter.test.ts` | Tạo mới | Bộ kiểm thử đơn vị (Unit Tests) chuyên sâu cho `DxfConverter.importFromDxf` và `DxfConverter.exportToDxf`. |
| `packages/app/src/commands/importExport.ts` | Tham chiếu | Lệnh `Import` (`file.import`) và `Export` (`file.export`) tự động lấy danh sách đuôi tệp từ `application.dataExchange.importFormats()` và `exportFormats()`. |
| `packages/core/src/shape/curve.ts` | Tham chiếu | Định nghĩa các giao diện đường cong `ICurve`, `ILine`, `ICircle`, `IEllipse`, `CurveType`, `CurveUtils` phục vụ việc trích xuất tọa độ khi xuất DXF. |

---

## 3. Hướng dẫn từng bước thực hiện (Step-by-Step Implementation Guide)

### Bước 3.1: Xây dựng bộ chuyển đổi `packages/builder/src/dxfConverter.ts`

Để không làm phình dung lượng gói `.wasm` và tránh phải biên dịch lại C++ OCCT trên VPS 1GB RAM, ta xử lý định dạng văn bản ASCII `.dxf` trực tiếp ở tầng TypeScript và gọi các hàm tạo hình học của `shapeFactory` toàn cục (như `defaultDataExchange.ts` đang dùng tại dòng 139: `shapeFactory.line`, `circle`, `arc`, `polygon`).

> **Lưu ý quan trọng về API thực tế của `@chili3d/core`:**
> - Truy cập `shapeFactory` toàn cục (được khai báo trong `packages/global.d.ts`) hoặc `document.application?.shapeProvider?.shapeFactory ?? shapeFactory`.
> - `shapeFactory.polygon(points: XYZLike[])` nhận **1 mảng `points`** (không phải rest parameters `...points`).
> - Trên `IShape`: lấy danh sách cạnh bằng `shape.findSubShapes(ShapeTypes.edge) as IEdge[]`.
> - Trên `IEdge`: `edge.curve` là một **getter property** trả về `ITrimmedCurve` (không phải hàm trả về `Result`). Để lấy đường cong cơ sở bên dưới `ITrimmedCurve`, dùng `const basis = CurveUtils.isTrimmed(trimmed) ? trimmed.basisCurve : trimmed;`.
> - `CurveType` là kiểu chuỗi `"line" | "circle" | "ellipse" | ...` (hoặc dùng `CurveUtils.isLine(basis)`, `CurveUtils.isCircle(basis)`).
> - Lấy tọa độ điểm đầu/cuối hoặc điểm theo tham số trực tiếp từ `IEdge`: `edge.startPoint()`, `edge.endPoint()`, `edge.firstParameter()`, `edge.lastParameter()`, `edge.pointAt(t)`, `edge.isClosed()`.

Tạo file `packages/builder/src/dxfConverter.ts`:

```ts
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
        return document.application?.shapeProvider?.shapeFactory ?? shapeFactory;
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
                if (!layerMap.has(key)) {
                    const folder = new FolderNode({ document, name: `Layer_${key}` });
                    rootFolder.add(folder);
                    layerMap.set(key, folder);
                }
                return layerMap.get(key)!;
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
                        const isFullCircle =
                            edge.isClosed() || Math.abs(last - first - 2 * Math.PI) < 1e-4;

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
                            const startDeg = (((first * 180) / Math.PI) % 360 + 360) % 360;
                            const endDeg = (((last * 180) / Math.PI) % 360 + 360) % 360;
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
                        // Nội suy đường cong bất kỳ (Ellipse, Bezier, BSpline) thành LWPOLYLINE
                        const first = edge.firstParameter();
                        const last = edge.lastParameter();
                        const segments = 32;
                        lines.push(
                            "0",
                            "LWPOLYLINE",
                            "8",
                            "0",
                            "90",
                            String(segments + 1),
                            "70",
                            "0",
                        );
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
        const rawLines = dxfText.replace(/\r\n/g, "\n").split("\n");
        const entities: DxfEntity[] = [];
        let inEntities = false;
        let current: DxfEntity | undefined;

        for (let i = 0; i + 1 < rawLines.length; i += 2) {
            const code = Number.parseInt(rawLines[i].trim(), 10);
            const value = rawLines[i + 1].trim();

            if (code === 0 && value === "SECTION") {
                if (rawLines[i + 2]?.trim() === "2" && rawLines[i + 3]?.trim() === "ENTITIES") {
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
```

### Bước 3.2: Tích hợp `DxfConverter` vào `packages/builder/src/defaultDataExchange.ts`

Mở `packages/builder/src/defaultDataExchange.ts` và cập nhật:

```ts
// File: packages/builder/src/defaultDataExchange.ts
import { DxfConverter } from "./dxfConverter";

export class DefaultDataExchange implements IDataExchange {
    importFormats(): string[] {
        return [".dxf", ".step", ".stp", ".iges", ".igs", ".brep", ".stl"];
    }

    exportFormats(): string[] {
        return [".dxf", ".step", ".iges", ".brep", ".stl", ".stl binary", ".ply", ".ply binary", ".obj"];
    }

    private async handleSingleFileImport(document: IDocument, file: File) {
        let importResult: Result<INode> | undefined;

        const fileName = file.name.toLocaleLowerCase();
        if (this.extensionIs(fileName, ".dxf")) {
            importResult = DxfConverter.importFromDxf(document, await file.text());
        } else if (this.extensionIs(fileName, ".brep")) {
            importResult = await this.importBrep(document, file);
        }
        // ... giữ nguyên các nhánh .stl, .step, .iges ...
        this.handleImportResult(document, fileName, importResult);
    }

    async export(type: string, nodes: VisualNode[]): Promise<BlobPart[] | undefined> {
        if (nodes.length === 0) return undefined;

        const document = nodes[0].document;
        let shapeResult: Result<BlobPart> | undefined;
        if (type === ".dxf") {
            const shapes = this.getExportShapes(nodes);
            if (!shapes.length) return undefined;
            shapeResult = DxfConverter.exportToDxf(shapes);
        } else if (type === ".ply") {
            // ... giữ nguyên các nhánh hiện có ...
        }
        // ...
    }
}
```

---

## 4. Tiêu chí nghiệm thu & Kiểm thử (Verification Checklist)

- [x] Mở hộp thoại **Import (`file.import`)** trên thanh Ribbon: hộp chọn tệp của hệ điều hành cho phép chọn tệp có đuôi `.dxf`.
- [x] Kéo thả (Drag & Drop) hoặc Import một tệp `.dxf` chứa các đối tượng `LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE` vào cửa sổ ứng dụng:
  - Cây thư mục `ProjectView` xuất hiện thư mục `DXF_Import` kèm các thư mục con phân theo `Layer_*`.
  - Các đối tượng hiển thị đúng tỉ lệ kích thước trên Viewport và có thể dùng bắt điểm (`OSNAP`) để bắt vào các đầu mút/tâm đường tròn vừa import.
- [x] Chọn các đối tượng trên màn hình, kích hoạt lệnh **Export (`file.export`)**, chọn định dạng `.dxf` từ `Combobox` trong bảng thuộc tính rồi nhấn xác nhận:
  - Tệp `<ten_doi_tuong>.dxf` được tải về máy.
  - Mở lại chính tệp `.dxf` vừa xuất bằng AutoCAD (hoặc Import ngược lại vào Chili3D) để đối chiếu độ chính xác tọa độ.
