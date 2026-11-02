# TASK-18: Khắc phục Triệt để Lỗi Không Chọn Được Chi Tiết Nhỏ Nằm Trên Mặt Tường (`Prism12` Đỏ trên `Prism3` Xám), Xử lý Sọc Caro Đỏ-Xám (Z-Fighting), Chống Nhảy Loạn Xạ Cây Thư Mục & Tối Ưu Chống Lag Khi Rê Chuột

> **Trạng thái:** `[ ] TODO`
> **Mức độ ưu tiên:** P0 (Critical UX & Performance Bug — Không chọn được tấm ốp/lam sóng trên mặt tường, sọc caro Z-fighting, cây đối tượng nhảy loạn xạ và giật lag khi rê chuột)
> **Phụ thuộc:** `TASK-16`, `TASK-17`

---

## 1. Hiện tượng Lỗi Thực tế (Từ Ảnh chụp màn hình của Người dùng)

1. **Muốn chọn hình chữ nhật màu đỏ (`Prism12` / `Prism12_copy` - vật liệu `lam 3 sóng khổ 21 phân`) nhưng nhấp mãi không chọn được:**
   - Trên màn hình 3D, các thanh lam màu đỏ nằm trên bề mặt bức tường màu xám (`Prism3`).
   - Khi người dùng click chuột vào thanh màu đỏ, hệ thống toàn bắt dính vào bức tường xám lớn `Prism3` phía sau chứ không chọn được thanh màu đỏ.
2. **Bề mặt thanh màu đỏ bị lốm đốm sọc caro đỏ-xám (Coplanar Z-Fighting):**
   - Do thanh màu đỏ (`Prism12`) được vẽ trên mặt phẳng của bức tường (`Prism3`) và đùn `length: -5` (đi vào trong lòng bức tường), mặt trước của thanh lam đỏ và mặt trước của bức tường xám có **cùng tọa độ chiều sâu $Z$ tuyệt đối**, gây ra hiện tượng tranh chấp chiều sâu WebGL (sọc caro đỏ-xám).
3. **Bảng Cây đối tượng bên trái nhảy lên nhảy xuống loạn xạ & Rê chuột rất lag:**
   - Mỗi lần nhấp chuột trên màn hình 3D (hoặc nhấp trong cây thư mục), danh sách có hơn 120 đối tượng (`Prism3` ở dòng 5 đầu danh sách, `Prism12_copy` ở dòng 95–120 cuối danh sách) bị hàm `scrollToNode` gọi `scrollIntoView({ behavior: "smooth" })` kéo trượt lên trượt xuống liên tục làm bảng cây nhảy loạn xạ.
   - Khi rê chuột trên màn hình 3D có hơn 100 khối `Prism`, hàm `NodeSelectionHandler.setHighlight` bắn Raycast và gọi `view.update()` ở mọi pixel di chuyển chuột dù đối tượng dưới chuột không hề thay đổi, gây giật lag nặng.

---

## 2. Phân tích Nguyên nhân Gốc rễ trong Source Code (Root Cause Analysis)

### 2.1. Vì sao nhấp vào Hình chữ nhật màu đỏ (`Prism12`) lại luôn dính vào Tường xám (`Prism3`)?
- Kiểm tra dữ liệu thực tế trong SQLite của dự án `thành-công trình kiến đức`:
  - `Prism3` là khối tường lớn (`LightGray #dedede`, `length: -370`, kích thước $515 \times 348 \times 370\text{ mm}$).
  - `Prism12` và 24 thanh `Prism12_copy` là các thanh lam màu đỏ (`lam 3 sóng khổ 21 phân #b60707`, `length: -5`, kích thước mỏng $5\text{ mm}$) được vẽ trực tiếp trên mặt trước của `Prism3`.
- Tại [`ThreeView.findIntersectedNodes`](../../packages/three/src/threeView.ts) (dòng 1231–1252) và [`ThreeView.findIntersectedShapes`](../../packages/three/src/threeView.ts) (dòng 1254–1266):
  - Khi người dùng click vào thanh lam đỏ `Prism12`, tia Raycast cắt qua mặt trước của `Prism3` và mặt trước của `Prism12` tại **cùng một khoảng cách $d$** ($\Delta d \approx 0\text{ mm}$).
  - Trong `Raycaster.intersectObjects(visuals, false)`, khi 2 mặt có cùng khoảng cách $d$, Three.js giữ nguyên thứ tự xuất hiện trong mảng `visuals`. Vì bức tường `Prism3` được tạo trước nên đứng trước `Prism12` trong `visualShapes` $\rightarrow$ `detecteds[0]` **luôn luôn là `Prism3` (bức tường xám)**!
  - Do đó, người dùng không tài nào click chọn được các chi tiết nhỏ (thanh lam, tấm ốp, cửa, ổ khóa) nằm đồng phẳng trên bề mặt một khối lớn!

### 2.2. Vì sao Thanh lam đỏ (`Prism12`) bị sọc caro đỏ-xám (Z-Fighting)?
- Tại [`ThreeGeometry.isPlanarOrSurfaceOverlay`](../../packages/three/src/threeGeometry.ts) (dòng 393–421):
  - Hiện tại `applyPolygonOffset` chỉ áp dụng cho các hình phẳng 2D (`face`, `wire`, `edge`, `compound`), còn các khối 3D `Solid` (`ExtrudeNode` / `BodyInstanceNode` như `Prism12` dày `5mm`) thì không có `polygonOffset`.
  - Khi thanh lam mỏng `5mm` nằm trùng mặt phẳng với bức tường dày `370mm`, GPU không phân biệt được mặt nào nằm trước nên vẽ đan xen từng ô pixel đỏ và xám.

### 2.3. Vì sao Cây đối tượng nhảy loạn xạ và Rê chuột bị lag?
1. **Tại [`Tree.handleSelectionChanged` & `Tree.scrollToNode`](../../packages/ui/src/project/tree/tree.ts) (dòng 124–152):**
   - Mỗi khi `selection.onNodeChanged` phát sự kiện, `scrollToNode` luôn gọi `this.nodeMap.get(node)?.scrollIntoView({ block: "nearest", behavior: "smooth" })`.
   - Khi click trực tiếp vào một dòng trên Cây đối tượng, nó cũng gọi `scrollIntoView({ behavior: "smooth" })` làm cây tự trượt dưới con trỏ chuột!
   - Khi click ngoài màn hình 3D lúc trúng cạnh của `Prism12` (dòng 100), lúc trúng mặt của `Prism3` (dòng 5), hiệu ứng `"smooth"` kéo thanh cuộn chạy lên chạy xuống liên tục gây cảm giác nhảy loạn xạ.
2. **Tại [`NodeSelectionHandler.setHighlight`](../../packages/core/src/eventHandlers/nodeSelectionEventHandler.ts) (dòng 82–94):**
   - Mỗi sự kiện `pointerMove` đều gọi `this.cleanHighlights()`, `highlighter.addState(...)` và `view.update()` ngay cả khi `detecteds` (đối tượng dưới trỏ chuột) **không hề thay đổi** so với frame trước đó, hoặc khi cả `this._highlights` cũ và `detecteds` mới đều rỗng `[]`!

---

## 3. Giải pháp Kỹ thuật Triệt để (4 Hạng mục Bắt buộc)

### 3.1. Ưu tiên Chọn Chi tiết Nhỏ / Tạo sau khi Đồng phẳng trên Khối Lớn (`packages/three/src/threeView.ts`)
- Trong `ThreeView.findIntersectedNodes(mx, my)` và `ThreeView.findIntersectedShapes(...)`:
  - Sau khi có danh sách `hits = raycaster.intersectObjects(...)`:
  - Viết hàm sắp xếp thông minh `sortCoplanarHits(hits: Intersection[])`:
    - Với hai hit `a` và `b`:
      1. Nếu chênh lệch khoảng cách lớn ($|a.\text{distance} - b.\text{distance}| > 6.0\text{ mm}$): giữ nguyên thứ tự khoảng cách gần camera hơn (`a.distance - b.distance`).
      2. Nếu hai hit có khoảng cách gần nhau hoặc đồng phẳng ($|a.\text{distance} - b.\text{distance}| \le 6.0\text{ mm}$, bao gồm cả trường hợp tấm ốp dày $5\text{ mm}$ nằm trong lòng tường):
         - **Ưu tiên 1:** Đối tượng 2D (`Line`, `Wire`, `Rect` chưa đùn khối) được ưu tiên trước khối `Solid` 3D.
         - **Ưu tiên 2 (Quy tắc Cha–Con / Tường–Lam sóng–Cửa–Ổ khóa):** So sánh kích thước đường chéo khung bao (`boundingBox diagonal` hoặc diện tích/thể tích khung bao) của `visualA` và `visualB`: **Đối tượng nào có kích thước khung bao NHỎ HƠN (chi tiết con: thanh lam, tấm ốp, cửa, ổ khóa) BẮT BUỘC được xếp TRƯỚC đối tượng có khung bao LỚN HƠN (khối cha: bức tường, sàn nhà)**!
         - **Ưu tiên 3:** Nếu kích thước khung bao tương đương nhau (chênh lệch $< 1\%$), ưu tiên đối tượng được tạo sau (nằm sau trong danh sách cây) lên trước.
  - **Kết quả:** Khi click vào thanh lam đỏ (`Prism12` hoặc `Prism12_copy`), tia Raycast luôn trả về thanh lam đỏ ở vị trí đầu tiên (`detecteds[0]`), giúp người dùng click 1 phát ăn ngay vào hình chữ nhật màu đỏ!

### 3.2. Xóa bỏ hoàn toàn Sọc Caro Đỏ-Xám (Z-Fighting) cho Tấm ốp / Khối đồng phẳng (`packages/three/src/threeGeometry.ts`)
- Trong `ThreeGeometry`:
  - Mở rộng cơ chế `polygonOffset` trong `updateEffectiveFaceMaterial()` / `applyPolygonOffset()`:
    - Không chỉ áp dụng cho hình 2D (`isPlanarOrSurfaceOverlay`), mà đối với cả các khối 3D `Solid`:
      - Tính độ dày nhỏ nhất $T = \min(\Delta X, \Delta Y, \Delta Z)$ và đường chéo $D$ từ `this.box()` (khung bao của geometry).
      - Nếu khối là tấm mỏng / thanh lam ốp tường ($T \le 50\text{ mm}$) hoặc có gán vật liệu màu riêng (khác vật liệu mặc định đầu tiên `LightGray`):
        - Tự động bật `polygonOffset = true` với hệ số phân tầng dựa theo độ mỏng / kích thước (ví dụ: khối mỏng / nhỏ có `polygonOffsetFactor = -1.0`, `polygonOffsetUnits = -4.0`; hình phẳng 2D có `polygonOffsetFactor = -2.0`, `polygonOffsetUnits = -8.0`).
  - **Kết quả:** Toàn bộ các thanh lam đỏ `Prism12` (`lam 3 sóng`) và tấm `nano vân đá` hiển thị màu đỏ/trắng sắc nét, phẳng mịn tuyệt đối trên mặt bức tường xám `Prism3`, biến mất 100% hiện tượng sọc caro!

### 3.3. Chống Nhảy Loạn Xạ Bảng Cây Đối Tượng (`packages/ui/src/project/tree/tree.ts`)
- Trong `Tree` (`packages/ui/src/project/tree/tree.ts`):
  - Thêm cờ `private _isClickingTree = false;` trong `onClick` / `onContextMenu` / `handleShiftClick`:
    - Khi người dùng click trực tiếp bên trong bảng Cây đối tượng (`onClick`), đặt `this._isClickingTree = true` trước khi gọi `setSelectedNodes` và đặt lại `false` ngay sau đó.
    - Trong `handleSelectionChanged`: nếu `this._isClickingTree === true` thì **TUYỆT ĐỐI KHÔNG gọi `this.scrollToNode(selected)`** (vì người dùng vừa tự tay bấm vào đúng dòng đó trên cây rồi!).
  - Trong `scrollToNode(selected: INode[])`:
    - Chỉ thực hiện khi `selected.length === 1` (khi quét chọn nhiều đối tượng thì giữ nguyên vị trí cuộn của cây để người dùng dễ bấm con mắt!).
    - Kiểm tra xem phần tử DOM `el = this.nodeMap.get(node)?.mainElement()` đã nằm trong vùng nhìn thấy của khung cuộn (`this.getBoundingClientRect()`) chưa:
      - Nếu `elRect.top >= treeRect.top && elRect.bottom <= treeRect.bottom` (đã nhìn thấy trên màn hình): **KHÔNG gọi `scrollIntoView`**!
      - Nếu nằm khuất ngoài khung nhìn: gọi `el.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior })` (cuộn tức thì, bỏ `"smooth"` để không gây trượt giật liên hoàn).

### 3.4. Tối ưu Chống Lag Tuyệt đối khi Rê Chuột & Chọn Đối tượng (`packages/core/src/eventHandlers/nodeSelectionEventHandler.ts` & `shapeSelectionEventHandler.ts`)
- Trong `NodeSelectionHandler`:
  - Trong `highlightDetecteds(view: IView, detecteds: IVisualObject[])`:
    - Kiểm tra nếu danh sách `detecteds` mới **giống hệt** danh sách `this._highlights` hiện tại (cùng độ dài và cùng các phần tử `this._highlights[i] === detecteds[i]`, bao gồm cả trường hợp cả hai đều rỗng `length === 0`):
      - **Return ngay lập tức!** Không gọi `cleanHighlights()`, không gọi `addState()`, và **không gọi `view.update()`**!
  - Thêm cơ chế bỏ qua raycast trùng tọa độ hoặc khi đang kéo chuột xoay/pan camera (`event.buttons !== 0 && !this.rect`).
- Trong `ShapeSelectionHandler`:
  - Tương tự, nếu `detecteds` mới và `this._highlights` cũ đều rỗng hoặc trùng cùng `owner` + `shape` + `indexes`, không gọi `cleanHighlights()` + `addState()` + `view.update()` lặp lại vô ích.

---

## 4. Danh sách File Cần Can thiệp

| STT | Package | File Path | Nội dung thực hiện |
| :---: | :--- | :--- | :--- |
| 1 | `@chili3d/three` | `packages/three/src/threeView.ts` | Thêm hàm `sortCoplanarHits` trong `findIntersectedNodes` và `findIntersectedShapes`: khi các đối tượng có khoảng cách raycast gần nhau ($|\Delta d| \le 6\text{ mm}$), ưu tiên đối tượng 2D trước, sau đó ưu tiên khối có kích thước khung bao (Bounding Box) nhỏ hơn (thanh lam đỏ, tấm ốp, cửa, ổ khóa) lên trước khối lớn (bức tường). |
| 2 | `@chili3d/three` | `packages/three/src/threeGeometry.ts` | Mở rộng `isPlanarOrSurfaceOverlay` / `applyPolygonOffset`: tự động áp dụng `polygonOffset` phân tầng cho các khối mỏng ($\le 50\text{ mm}$) hoặc khối có vật liệu màu riêng để triệt tiêu hoàn toàn sọc caro Z-fighting khi vẽ tấm ốp/lam sóng đồng phẳng với mặt tường. |
| 3 | `@chili3d/ui` | `packages/ui/src/project/tree/tree.ts` | Chặn `scrollToNode` khi click trực tiếp trên cây (`_isClickingTree`), khi chọn nhiều đối tượng, hoặc khi dòng đã nằm trong vùng nhìn thấy; đổi `behavior` sang `"instant"` để cây đối tượng đứng im, không nhảy loạn xạ. |
| 4 | `@chili3d/core` | `packages/core/src/eventHandlers/nodeSelectionEventHandler.ts`, `packages/core/src/eventHandlers/shapeSelectionEventHandler.ts` | Chỉ cập nhật highlight và gọi `view.update()` khi đối tượng dưới trỏ chuột thực sự thay đổi (skip no-op highlight updates), triệt tiêu hoàn toàn hiện tượng giật lag khi rê chuột. |
| 5 | Tests | `packages/three/test/threeView.test.ts`, `packages/ui/test/tree.test.ts` | Viết Unit Test kiểm tra chọn chi tiết nhỏ đồng phẳng trên mặt khối lớn (`sortCoplanarHits`) và kiểm tra `Tree` không tự cuộn nhảy khi click trên cây. |

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log - Do AI Thực thi ghi)

*(Chờ AI thực thi điền đầy đủ sau khi hoàn thành)*
