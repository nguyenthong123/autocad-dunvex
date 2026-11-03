# TASK-28: Điều tra lỗi Boolean Cut và đồng bộ chọn Viewport ↔ Cây đối tượng

> **Trạng thái:** `[?] WAITING_REVIEW` (Đã sửa lỗi logic auto-scroll; Đã thêm pre-flight validation và chẩn đoán an toàn cho Boolean Cut; Đã điều tra luồng ExtrudeNode, closedProfileToFace và giới hạn của checkShape)
> **Ưu tiên:** P0 theo báo cáo người dùng
> **Phụ trách:** AI Thực thi (Worker)
> **Phạm vi:** Sửa lỗi auto-scroll; kiểm tra ExtrudeNode & Boolean; thêm pre-flight check báo lỗi tường minh; KHÔNG deploy VPS.

---

## 1. Báo cáo cần xác minh

### A. Boolean Cut / Subtract
Người dùng báo Boolean Cut giữa một khối tường và một khối đùn dùng làm dao cắt trả lỗi kiểu *“This body is invalid”*, *“Failed to perform boolean on this body”* hoặc *“Null/Non-manifold body”*. Ví dụ khối dao `Prism14`, thuộc tính chiều dài `-20`.

### B. Đồng bộ chọn và cuộn cây
Người dùng xác nhận click khối trong Viewport làm hàng tương ứng đổi màu xám nhưng cây không cuộn tới hàng đó như trước. Selection event đang tới Tree (hàng được tô), nên đây là lỗi auto-scroll, không phải lỗi đồng bộ ID/selection.

---

## 2. Kết quả điều tra chi tiết

### 2.1. Vấn đề 1: Lỗi Cây đối tượng không tự cuộn tới hàng được chọn từ Viewport (Đã hoàn thành ở commit `019aaece`)
- **Nguyên nhân gốc:** Hàm `scrollToNode()` trong `packages/ui/src/project/tree/tree.ts` kiểm tra bounds dựa trên `this.getBoundingClientRect()` (`<ui-tree>`). Thẻ `<ui-tree>` không có `overflow-y: auto` mà co giãn theo toàn bộ danh sách phần tử con; container cuộn thực sự là tổ tiên `.itemsPanel` (`packages/ui/src/project/projectView.module.css`, `overflow-y: auto`). Do đó, hàng bị khuất vẫn nằm trong bounds của `<ui-tree>`, khiến guard luôn trả về sớm và triệt tiêu lệnh cuộn.
- **Khắc phục:**
  - Thêm `getScrollContainer()` tìm phần tử tổ tiên có class `.itemsPanel` hoặc `overflowY: auto | scroll | overlay`.
  - Trong `scrollToNode()`: so sánh bounds của hàng với viewport của `getScrollContainer() ?? this`. Chỉ bỏ qua cuộn khi hàng thực sự nằm trọn trong vùng nhìn thấy (`containerRect.top` đến `containerRect.bottom`).
  - Giữ nguyên cờ `_isClickingTree` từ TASK-18 để click trực tiếp trên cây không gây nhảy cuộn.
- **Kiểm thử hồi quy:** Bổ sung 3 test trong `packages/ui/test/tree.test.ts`. Toàn bộ suite `tree.test.ts`: 27/27 tests PASS.

---

### 2.2. Vấn đề 2: Điều tra kỹ luồng `ExtrudeNode.generateShape()` và Boolean Cut

#### A. Luồng tạo hình của `ExtrudeNode` (`packages/app/src/bodys/extrude.ts`):
Khảo sát chi tiết logic tại dòng 86–107 của `ExtrudeNode.generateShape()`:
```ts
if (this.section.shapeType === ShapeTypes.face) {
    const sur = (this.section as IFace).surface();
    if (!sur.isPlanar()) {
        result = shapeFactory.makeThickSolidBySimple(this.section, this.length);
    } else {
        result = shapeFactory.prism(this.section, vec);
    }
} else if (
    (this.section.shapeType === ShapeTypes.wire || this.section.shapeType === ShapeTypes.edge) &&
    this.section.isClosed()
) {
    // Extruding a closed profile (wire or circle edge) as a face produces a solid instead of a shell.
    const face = closedProfileToFace(this.section);
    if (!face.isOk) {
        result = Result.err(face.error);
    } else {
        result = shapeFactory.prism(face.value, vec);
    }
} else {
    result = shapeFactory.prism(this.section, vec);
}
```
**Các trường hợp xảy ra:**
1. **Tiết diện là Face:** Đùn ra khối đặc `Solid` (shapeType = 4).
2. **Tiết diện là Wire/Edge khép kín (`isClosed() === true`):** Chuyển qua `closedProfileToFace()` tạo mặt `Face`, sau đó đùn tạo khối đặc `Solid`.
3. **Tiết diện là Wire/Edge hở hoặc Compound:**
   - Nếu người dùng vẽ polyline hở (ví dụ 3 cạnh khung cửa không khép kín thành hình chữ nhật khép kín): `this.section.isClosed()` trả về `false`.
   - Nếu tiết diện là một đường tròn đứng riêng trong 3D: trong OCCT `cpp/src/shape.cpp`, hàm `isClosed()` dùng `BRep_Tool::IsClosed(edge)`, hàm này chỉ kiểm tra đường biên khép kín trên bề mặt (seam edge), nên trả về `false` đối với circular edge độc lập.
   - Nhánh `else` được kích hoạt: gọi `shapeFactory.prism(this.section, vec)`.
   - Trong OCCT, đùn một `Wire` (hở) tạo ra một **`Shell` (vỏ hở 2D trong không gian 3D, shapeType = 8)**; đùn một `Edge` tạo ra một `Face` (mặt 2D, shapeType = 16).
   - **Kết quả:** Khối đùn (ví dụ `Prism14`) hiển thị trong viewport 3D như một hình thể tích (do Three.js vẽ mesh bình thường), nhưng bản chất topo của nó trong kernel là một `Shell` rỗng ruột không có đáy/nắp!

#### B. Bộ lọc và luồng tham số của Boolean (`packages/app/src/commands/boolean.ts`):
- `BooleanOperate.getSteps()` cấu hình `GetOrSelectShapeStep(ShapeTypes.shape, ...)` và `SelectShapeStep(ShapeTypes.shape, ...)`. Bộ lọc hiện chỉ kiểm tra `node instanceof ShapeNode && !isReferenceGeometryNode(node)`.
- Bất kỳ `ShapeNode` nào (dù mang `Solid`, `Shell`, `Face`, hay `Wire`) đều được phép chọn làm target hoặc tool.

#### C. Giới hạn của `checkShape()`:
- Hàm `checkShape()` gọi `BRepCheck_Analyzer.IsValid()`.
- **Phát hiện quan trọng:** Đối với một `Shell` tạo bởi đùn một đường cong hở, bản thân cấu trúc topo của `Shell` đó là hoàn toàn hợp lệ (các mặt và cạnh liên kết đúng chuẩn của một Shell). Do đó, **`checkShape()` TRẢ VỀ `true`**!
- `checkShape()` KHÔNG phát hiện được việc khối đó là `Shell` thay vì `Solid` vì đối với OCCT, Shell là một đối tượng hình học hợp lệ.
- Để phát hiện một hình thể không phải là thể tích đặc, bắt buộc phải kiểm tra thông qua `shape.shapeType` và hàm tìm sub-shapes:
  `shape.shapeType === ShapeTypes.solid` hoặc có chứa `findSubShapes(ShapeTypes.solid)`.

#### D. Tương tác giữa `Solid` và `Shell` trong Boolean Cut của OCCT:
- Khi cắt một bức tường `Solid` (3D manifold) bằng một khối dao `Prism14` là `Shell` (2D manifold):
  OCCT `BRepAlgoAPI_Cut` từ chối thao tác Boolean giữa các đối tượng lệch số chiều topo (dimension mismatch).
  OCCT ghi nhận mã cảnh báo/lỗi: **`BOPAlgo_AlertBOPNotAllowed`**.
  Kết quả là thao tác thất bại và người dùng nhận thông báo lỗi tối nghĩa hoặc chung chung (*“This body is invalid”*, *“Failed to perform boolean on this body”*).

---

## 3. Khắc phục & Chẩn đoán an toàn trong mã

Để giải quyết triệt để vấn đề báo lỗi tối nghĩa và thu thập chẩn đoán kỹ thuật an toàn (tuân thủ mục 3, 4, 5 của yêu cầu):

1. **Bổ sung hàm kiểm tra thể tích đặc `isSolidVolume(shape)`** trong `BooleanOperate`:
   - Xác nhận shape là `ShapeTypes.solid` hoặc là `compound` chứa ít nhất một `Solid`.
   - Phân biệt rõ `Shell`, `Face`, `Wire`, `Edge`.
2. **Thực hiện Pre-flight Check tường minh trước khi gọi kernel:**
   - **Kiểm tra tính hợp lệ topo (`checkShape`):** Nếu `shape.checkShape() === false`, trả về lỗi chỉ rõ tên node:
     `Target "${targetName}" has invalid geometry (checkShape failed).`
     `Tool "${toolName}" has invalid geometry (checkShape failed).`
   - **Kiểm tra loại thể tích (`isSolidVolume`):** Nếu target hoặc tool không phải khối đặc (ví dụ là `Shell`), trả về thông báo lỗi rõ ràng, dễ hiểu:
     `Target "${targetName}" is a Shell, not a solid body. Boolean cut requires solid bodies.`
     `Tool "${toolName}" is a Shell, not a solid body. Boolean cut requires solid bodies.`
   - Không âm thầm biến đổi hình học (không tự ý vá mặt hay đảo vector đùn mò).
3. **Ghi log chẩn đoán an toàn:**
   - Thu thập thông tin: tên node, shape type (`ShapeTypeUtils.stringValue`), `isClosed()`, `checkShape()`, danh sách tools.
   - Ghi ra `console.warn` trước khi gọi kernel và `console.error` nếu kernel thất bại.
   - **Tuyệt đối an toàn:** Không log API key, không log tọa độ điểm nhạy cảm hoặc nội dung tệp bản vẽ của người dùng.

---

## 4. Kiểm thử đã thực hiện

### 4.1. Unit Tests trong `packages/app/test/commands/boolean.test.ts`
Đã bổ sung 3 ca kiểm thử khẳng định hành vi và thông báo lỗi:
1. `should reject when target is not a solid volume (e.g. Shell)`: Xác nhận khi target là Shell, lệnh từ chối ngay từ pre-flight với thông báo `Target "WallShell" is a Shell, not a solid body`.
2. `should reject when tool is not a solid volume (e.g. Shell profile)`: Xác nhận khi tool là Shell (ví dụ trường hợp `Prism14`), lệnh từ chối ngay với thông báo `Tool "Prism14" is a Shell, not a solid body`.
3. `should reject when tool has invalid geometry (checkShape false)`: Xác nhận khi tool bị lỗi topo (`checkShape` trả về `false`), lệnh từ chối với thông báo `Tool "Prism14" has invalid geometry (checkShape failed)`.

Toàn bộ 26/26 tests trong `boolean.test.ts` **PASS 100%**.

### 4.2. Trạng thái đối với bản vẽ của người dùng (`Prism14`)
- **Tách bạch rõ ràng:**
  1. *Lỗi đã tái hiện và sửa:* Lỗi cuộn cây đối tượng; Lỗi không bắt và không giải thích việc dùng tool là `Shell` (2D open profile) để cắt `Solid` (3D wall).
  2. *Trường hợp đã kiểm thử tổng quát:* Kiểm tra Solid-Solid, đùn âm, mặt tiếp xúc đồng phẳng (OCCT xử lý tốt); Kiểm tra Shell cắt Solid (OCCT từ chối với `BOPAlgo_AlertBOPNotAllowed`); Pre-flight check bắt và báo lỗi đích danh tool/target.
  3. *Nguyên nhân của bản vẽ người dùng (`Prism14`):* Để khẳng định 100% nguyên nhân gây lỗi cho `Prism14` cụ thể của người dùng, **vẫn cần file JSON bản vẽ hoặc log chẩn đoán thực tế của shape đó** (với bản sửa hiện tại, khi người dùng thao tác lại, hệ thống sẽ chỉ rõ `Prism14` là Shell hay do nguyên nhân nào khác). Không khẳng định võ đoán khi chưa có file bản vẽ.

---

## 5. Nhật ký Thực thi

- **Thời gian:** 03/11/2026
- **Nhánh:** `dev`
- **Các file thay đổi:**
  - `packages/ui/src/project/tree/tree.ts` & `packages/ui/test/tree.test.ts` (Auto-scroll fix, 27/27 tests pass).
  - `packages/app/src/commands/boolean.ts`: Thêm `isSolidVolume()`, pre-flight validation cho target/tools, chẩn đoán an toàn, và báo lỗi tường minh.
  - `packages/app/test/commands/boolean.test.ts`: Bổ sung 3 test hồi quy cho Shell target/tool và checkShape invalid (26/26 tests pass).
  - `docs/tasks/TASK-28-boolean-cut-and-selection-sync-investigation.md`: Hồ sơ điều tra và nhật ký.
- **Kết quả kiểm thử toàn cục:** 10,024 tests pass trên toàn bộ monorepo (`npm run test`).
- **Deploy:** KHÔNG deploy VPS.
