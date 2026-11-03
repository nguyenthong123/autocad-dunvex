# TASK-28: Điều tra lỗi Boolean Cut và đồng bộ chọn Viewport ↔ Cây đối tượng

> **Trạng thái:** `[?] WAITING_REVIEW` (Đã sửa lỗi logic auto-scroll trên Cây đối tượng và bổ sung test hồi quy; Đã điều tra chi tiết hành vi kernel Boolean Cut với OCCT WASM thực tế và ghi nhận kết quả)
> **Ưu tiên:** P0 theo báo cáo người dùng
> **Phụ trách:** AI Thực thi (Worker)
> **Phạm vi:** Sửa lỗi auto-scroll đã xác minh; điều tra thực nghiệm Boolean Cut. KHÔNG deploy VPS.

---

## 1. Báo cáo cần xác minh

### A. Boolean Cut / Subtract
Người dùng báo Boolean Cut giữa một khối tường và một khối đùn dùng làm dao cắt trả lỗi kiểu *“This body is invalid”*, *“Failed to perform boolean on this body”* hoặc *“Null/Non-manifold body”*. Ví dụ khối dao `Prism14`, thuộc tính chiều dài `-20`.

Các hướng nghi vấn cần điều tra:
1. Chiều dài đùn âm (`length = -20`): liệu vector đùn ngược hướng có tạo shape hỏng hoặc làm đảo mặt ngoài/trong?
2. Mặt tiếp xúc đồng phẳng (coplanar / flush face) giữa tường và khối cắt: liệu OCCT có bị lỗi giao cắt ở biên?
3. Kiểu shape đầu vào (Solid vs Shell / Wire / Face): liệu khối đùn có thực sự tạo ra Solid manifold?
4. Tọa độ và phép biến đổi thế giới (world-space transform): liệu vị trí tool có bị lệch khi thực thi?

### B. Đồng bộ chọn và cuộn cây
Người dùng xác nhận click khối trong Viewport làm hàng tương ứng đổi màu xám nhưng cây không cuộn tới hàng đó như trước. Selection event đang tới Tree (hàng được tô), nên đây là lỗi auto-scroll, không phải lỗi đồng bộ ID/selection.

---

## 2. Kết quả điều tra chi tiết

### 2.1. Vấn đề 1: Lỗi Cây đối tượng không tự cuộn tới hàng được chọn từ Viewport

#### Nguyên nhân gốc (Root Cause):
Trong `packages/ui/src/project/tree/tree.ts`, hàm `scrollToNode(selected: INode[])` kiểm tra xem phần tử hàng (`targetEl`) có đang nằm trong tầm nhìn hay không để tránh cuộn thừa:
```ts
const elRect = targetEl.getBoundingClientRect();
const treeRect = this.getBoundingClientRect();
if (elRect.top >= treeRect.top && elRect.bottom <= treeRect.bottom && treeRect.height > 0) {
    return; // Đã nằm trong khung -> bỏ qua không cuộn
}
```
Tuy nhiên:
- `this` ở đây là thẻ DOM `<ui-tree>` (`tree.ts`). Thẻ này **không có thuộc tính CSS `overflow-y: auto`** và chiều cao của nó giãn theo toàn bộ danh sách các phần tử con (`height: auto`).
- Khung cuộn thực tế có thanh cuộn là phần tử cha `.itemsPanel` được định nghĩa trong `packages/ui/src/project/projectView.module.css` (`overflow-y: auto; flex: 1`).
- Vì `<ui-tree>` bao trọn tất cả các hàng con, nên tọa độ `elRect.top` và `elRect.bottom` của bất kỳ hàng nào cũng **luôn luôn nằm bên trong `treeRect`**.
- Do đó, điều kiện `elRect.top >= treeRect.top && elRect.bottom <= treeRect.bottom` luôn trả về `true` ngay cả khi hàng nằm sâu phía dưới màn hình và bị khuất hoàn toàn khỏi tầm nhìn của người dùng! Hàm trả về sớm (`return`) và `el.scrollIntoView()` không bao giờ được gọi.

#### Giải pháp khắc phục:
1. Thêm phương thức `getScrollContainer()` vào class `Tree`:
   - Duyệt ngược các phần tử tổ tiên (`parentElement`) từ `this`.
   - Tìm phần tử có class `projectViewStyle.itemsPanel` hoặc có `window.getComputedStyle(parent).overflowY` thuộc một trong các giá trị `auto | scroll | overlay`.
   - Dừng lại trước `document.body` và `document.documentElement`.
2. Trong `scrollToNode()`:
   - Lấy `viewContainer = this.getScrollContainer() ?? this`.
   - So sánh bounds của `targetEl` với `viewContainer.getBoundingClientRect()`.
   - Chỉ bỏ qua khi `containerRect.height > 0` và hàng thực sự nằm gọn trong viewport hiển thị của `viewContainer`:
     `elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom`.
   - Nếu hàng nằm ngoài (ở trên hoặc ở dưới), gọi `el.scrollIntoView({ block: "nearest", behavior: "auto" })`.
3. Giữ nguyên guard `_isClickingTree` đã có từ TASK-18 để khi người dùng click trực tiếp trên cây đối tượng thì không bị nhảy scroll.

---

### 2.2. Vấn đề 2: Điều tra lỗi Boolean Cut với khối đùn

Đã thực hiện phân tích mã nguồn và chạy các ca kiểm nghiệm thực tế trực tiếp với OCCT WebAssembly kernel (`chili-wasm.wasm` và `ShapeFactory`):

#### Luồng thực thi:
1. `BooleanCommand` (`packages/app/src/commands/boolean.ts`):
   - Bước 1: Người dùng chọn target (ví dụ: khối tường). Lệnh chuyển sang hỏi tool.
   - Bước 2: Người dùng chọn một hoặc nhiều tool (ví dụ: khối cửa đùn `Prism14`).
   - Bước 3: Nhấn Enter để xác nhận.
   - Hàm `BooleanOperate.booleanOperate()` áp dụng world-space transform đầy đủ:
     - `shape1 = transformdFirstShape(firstShape)`
     - Mỗi tool `s`: `shape.transformedMul(s.transform)`
   - Gọi `ShapeFactory.booleanCut(shape1, toolShapes)`.
2. `packages/wasm/src/factory.ts`:
   - Kiểm tra `ensureOccShape(shape)` cho từng shape.
   - Gọi `wasm.ShapeFactory.booleanCut(occTarget, occTools)`.
3. `cpp/src/factory.cpp`:
   - Sử dụng `BRepAlgoAPI_Cut`.
   - Nạp arguments qua `SetArguments` và tools qua `SetTools`.
   - Gọi `maker.Build()`.
   - Nếu `!maker.IsDone()`, in cảnh báo từ `maker.DumpErrors(std::cout)` và trả về mã lỗi.

#### Các ca kiểm nghiệm thực nghiệm với OCCT Kernel:

1. **Khối Solid tường giao cắt khối Solid đùn chuẩn:**
   - Kết quả: `Result.ok(IShape)` thành công 100%. Thể tích giảm đúng bằng thể tích phần giao.
2. **Khối đùn có chiều dài âm (`length = -20` / vector ngược hướng `[0, 0, -20]`):**
   - Đã thử nghiệm: `prism(face, [0, 0, -20])` tạo khối Solid từ mặt phẳng đáy đùn ngược chiều Z.
   - Kiểm tra trên OCCT: `BRepPrimAPI_MakePrism` xử lý vector âm hoàn toàn bình thường, tạo ra khối Solid hợp lệ, hướng pháp tuyến các mặt tự động đảo chuẩn xác để thể tích dương và manifold.
   - Thực hiện `booleanCut(wallSolid, negativePrismSolid)`: Thành công `Result.ok`, thể tích cắt chính xác.
   - **Kết luận:** Bản thân chiều dài đùn âm (`-20`) KHÔNG làm hỏng kernel Boolean nếu khối đùn là Solid hợp lệ.
3. **Khối dao đùn tiếp xúc đồng phẳng (Coplanar / Flush Boundary):**
   - Đã thử nghiệm: Khối dao cắt có 3 mặt phẳng trùng khít tuyệt đối với 3 mặt của tường (mặt trước, mặt sau, mặt đáy).
   - Thực hiện `booleanCut`: Thành công `Result.ok`, OCCT với tolerance mặc định `1e-6` xử lý tốt các mặt đồng phẳng giao nhau.
4. **Khối dao là Shell (vỏ hở) thay vì Solid:**
   - **PHÁT HIỆN QUAN TRỌNG:**
     Trong OCCT, nếu đối tượng đưa vào `prism` là một `Wire` (hoặc profile 2D chưa được dựng thành `Face`), kết quả tạo ra là một `Shell` (shapeType = 8, vỏ rỗng), KHÔNG PHẢI là `Solid` (shapeType = 4).
     Khi thực hiện `booleanCut(Solid, Shell)`:
     - OCCT từ chối phép toán Boolean giữa khối thể tích (Solid) và bề mặt (Shell).
     - Lỗi trả về từ `maker.DumpErrors()`: **`BOPAlgo_AlertBOPNotAllowed`**.
     - Thao tác thất bại hoàn toàn.
   - Kiểm tra hàm `isClosed()` trong `cpp/src/shape.cpp`:
     `BRep_Tool::IsClosed(shape)` trả về `false` đối với một số loại Wire (ví dụ `BRepBuilderAPI_MakePolygon` nếu không gọi `.Close()`, hoặc một cạnh cong khép kín nhưng chưa tạo mặt).
     Khi `ExtrudeNode.generateShape()` kiểm tra `this.section.isClosed()`: nếu nhận diện nhầm là `false`, nó sẽ chuyển sang nhánh đùn Wire thành `Shell` thay vì đùn thành `Solid`.

#### Kết luận & Kiến nghị về Boolean Cut:
- **Tình trạng hiện tại:** Kernel Boolean Cut của OCCT hoạt động chính xác với các cặp `Solid - Solid`, kể cả khi có chiều dài đùn âm hay tiếp xúc đồng phẳng.
- **Nguyên nhân nghi vấn lớn nhất:** Khối đùn `Prism14` của người dùng bị tạo ra dưới dạng `Shell` (hoặc chứa hình học hở/non-manifold từ tiết diện đầu vào) khiến OCCT báo lỗi `BOPAlgo_AlertBOPNotAllowed` hoặc `Null/Non-manifold body`.
- **Yêu cầu dữ liệu:** Để xác định chính xác 100% nguyên nhân mà không phỏng đoán hay can thiệp sai lệch vào kernel hình học:
  1. Cần file JSON bản vẽ cụ thể của người dùng (chứa định nghĩa `Prism14` và khối tường).
  2. Nội dung thông báo lỗi nguyên văn hiển thị trên màn hình (đỏ/toast error).
- **Cam kết:** Tuân thủ hướng dẫn Worker, KHÔNG tự ý sửa tolerance toàn cục, KHÔNG tự ý đảo chiều vector đùn khi chưa có mô hình đối chiếu thực tế.

---

## 3. Kiểm thử và Xác minh

### 3.1. Unit / Regression Tests
Đã bổ sung 3 ca kiểm thử hồi quy mới trong `packages/ui/test/tree.test.ts`:
1. `should call scrollIntoView when node row is outside itemsPanel scroll container (below)`: Xác nhận khi hàng nằm phía dưới khung nhìn của `.itemsPanel`, `scrollIntoView` được kích hoạt.
2. `should call scrollIntoView when node row is outside itemsPanel scroll container (above)`: Xác nhận khi hàng nằm phía trên khung nhìn của `.itemsPanel`, `scrollIntoView` được kích hoạt.
3. `should skip scrollIntoView when node row is inside itemsPanel scroll container`: Xác nhận khi hàng đã nằm hoàn toàn trong vùng hiển thị của `.itemsPanel`, `scrollIntoView` không bị gọi thừa.

Chạy toàn bộ test `tree.test.ts`: **27/27 tests PASS**.

### 3.2. Build & Lint Check
- `npm run check`: Biome check hoàn tất, 0 lỗi cú pháp.
- `npm run build`: Hoàn thành thành công.

---

## 4. Nhật ký Thực thi

- **Thời gian thực hiện:** 03/11/2026
- **Nhánh làm việc:** `dev`
- **Commit SHA:** `019aaecef58e5e96994737466feb1e4378a077ed`
- **Các tệp thay đổi:**
  - `packages/ui/src/project/tree/tree.ts`: Thêm `getScrollContainer()`, sửa `scrollToNode()` để đo viewport của `.itemsPanel` thay vì `<ui-tree>`.
  - `packages/ui/test/tree.test.ts`: Bổ sung mock cho `projectView.module.css` và 3 ca kiểm thử hồi quy cho auto-scroll.
  - `ROADMAP.md`: Cập nhật trạng thái TASK-28 sang `[?] WAITING_REVIEW`.
  - `docs/tasks/TASK-28-boolean-cut-and-selection-sync-investigation.md`: Lập hồ sơ kết quả điều tra và kiểm thử.
- **Kết quả kiểm thử:**
  - `npx rstest packages/ui/test/tree.test.ts`: 27/27 passed (100%).
  - `npm run check`: Pass.
  - `npm run build`: Pass.
- **Trạng thái Triển khai (Deploy):** KHÔNG deploy lên VPS (tuân thủ nghiêm ngặt quy định bảo mật & workflow).
