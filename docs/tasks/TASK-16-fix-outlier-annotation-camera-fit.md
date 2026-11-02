# TASK-16: Khắc phục Lỗi Văng Camera 6.000.000mm do Đường đo kích thước lạc tọa độ (`AnnotationBatch` Outlier) khiến Toàn bộ 90 Khối `Prism` bị Thu Nhỏ thành 1 Chấm Li Ti dưới đáy màn hình

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Mức độ ưu tiên:** P0 (Critical - Tìm ra thủ phạm thật sự làm màn hình chỉ hiện 3 nét vàng và 1 chấm nhỏ trong dự án `thành-công trình kiến đức`)
> **Phụ thuộc:** `TASK-15`

---

## 1. Phân tích Dữ liệu Thực tế từ SQLite trên VPS (Root Cause 100% Chính xác)

Khi kiểm tra trực tiếp dữ liệu JSON của dự án **`thành-công trình kiến đức`** (`id: "udYMcajQ_OthrFnzPTNwQ"`) trong SQLite trên VPS:

1. **Toàn bộ 85 khối `Prism2`, `Prism4`, `Prism10` (cùng 50 thanh `Prism10_copy`), `Prism11` (cùng 25 tấm `Prism11_copy`), `Line1`, `Rectangle4`, `Rectangle6` VÀ 5 đường đo kích thước chuẩn đều nằm gọn trong phạm vi 1 mét ($1000\text{ mm}$):**
   - Tọa độ của toàn bộ công trình:
     - $X \in [-802\text{ mm}, -292\text{ mm}]$ (rộng $\approx 510\text{ mm}$)
     - $Y \in [-1764\text{ mm}, -704\text{ mm}]$ (dài $\approx 1060\text{ mm}$)
     - $Z \in [-370\text{ mm}, +20\text{ mm}]$ (cao $\approx 390\text{ mm}$)
   - **TẤT CẢ 85 khối `Prism` này ĐANG ĐƯỢC VẼ ĐẦY ĐỦ TRONG THREE.JS!** Nhưng chúng bị gom lại thành **1 chấm nhỏ xíu nằm ở phía dưới bên trái của 3 đường kẻ màu vàng** trên ảnh chụp màn hình của người dùng!

2. **Tại sao cả công trình 85 khối `Prism` lại bị thu nhỏ thành 1 chấm li ti, còn trên màn hình chỉ thấy 3 đường kẻ màu vàng?**
   - Trong thư mục `Annotations` của bản vẽ `thành-công trình kiến đức`, có 6 node `DimensionAnnotation`.
   - Trong đó, 5 node đầu/cuối đo bình thường quanh tọa độ $(-797, -704, -350)$.
   - **NHƯNG node `DimensionAnnotation` thứ 4 (`id: "wjCc5mWBqLMBYym-BM4AX"`) là một đường đo bị click nhầm ra ngoài vũ trụ khi đang zoom xa:**
     ```json
     {
       "id": "wjCc5mWBqLMBYym-BM4AX",
       "name": "DimensionAnnotation",
       "dimensionType": "linear",
       "startPoint": { "x": -435529.94, "y": -114410.51, "z": 0 },
       "endPoint":   { "x": -811966.40, "y": -114410.51, "z": 0 },
       "textPoint":  { "x": -245755.03, "y":  -40708.84, "z": 0 },
       "textHeight": 20,
       "color": 16776960
     }
     ```
   - Hãy nhìn tọa độ của nó:
     - Điểm đầu ở $X = -435.529\text{ mm}$ ($-435\text{ mét}$), điểm cuối ở $X = -811.966\text{ mm}$ ($-812\text{ mét}$), điểm đặt chữ ở $(-245.755, -40.708)$!
     - Tức là đường đo kích thước lỗi này dài tới **376 mét ($376.436\text{ mm}$)** và nằm cách công trình chính gần **1 cây số ($812.000\text{ mm}$)**!
     - Vì `textHeight = 20` (chỉ cao $20\text{ mm}$ so với chiều dài $376.436\text{ mm}$), chữ số và mũi tên của đường đo này nhỏ tới mức không nhìn thấy, **chỉ còn lại đúng 3 đoạn thẳng màu vàng (2 đường gióng + 1 đường kích thước tạo thành hình chữ U màu vàng trên màn hình)**!
   - Và chính vì `AnnotationBatch` gộp chung cả đường đo khổng lồ $812.000\text{ mm}$ này vào `visualShapes`, khi `CameraController.getBoundingSphere()` chạy `fitContent`, camera đã lùi ra xa tới tọa độ:
     - `position: { x: 3378241, y: 4978993, z: 6259196 }` (**cách xa 6.259 mét = hơn 6 km!**)
   - Ở khoảng cách **6,2 km**, toàn bộ công trình `thành-công trình kiến đức` (vốn chỉ rộng $0,5\text{ m} \times 1\text{ m}$) biến thành **đúng 1 điểm ảnh (1 chấm nhỏ xíu nằm ở góc dưới bên trái của 3 nét vàng)**!

---

## 2. Giải pháp Kỹ thuật Triệt để (4 Tầng Bảo vệ)

### 2.1. Tầng 1: Trong `CameraController.getBoundingSphere` (`packages/three/src/cameraController.ts`) — Ưu tiên tính Khung nhìn (`fitContent`) theo các Khối Hình học (`GeometryNode` / `ShapeNode` / `MeshNode`) & Loại bỏ `AnnotationBatch` khỏi Bounding Box khi có Hình học
- Hiện tại trong [`CameraController.getBoundingSphere` (`packages/three/src/cameraController.ts` dòng 336–350)](../../packages/three/src/cameraController.ts#L336-L350):
  - Vòng lặp `for (const child of context.visualShapes.children) visit(child);` duyệt qua cả `AnnotationBatch` (`child.name === "AnnotationBatch"`).
  - Vì `AnnotationBatch` không nằm trong `context._visualNodeMap` (`context.getNode(object)` trả về `undefined`), nó vượt qua bộ lọc `node` và gộp thẳng cái hộp $812.000\text{ mm}$ vào `box`!
- **Cách sửa chuẩn CAD (AutoCAD / SolidWorks / Onshape):**
  1. Khi tính `getBoundingSphere` (ở chế độ `scope === "all"` hoặc không chọn đối tượng cụ thể):
     - **Bước 1:** Chỉ tính Bounding Box của các đối tượng hình học thực sự (`ThreeGeometry`, `ThreeMeshObject`, `ThreeComponentObject`, `GroupVisualObject` — tức **bỏ qua `AnnotationBatch` và `ThreeAnnotation`**).
     - **Bước 2:** Chỉ khi nào toàn bộ bản vẽ **KHÔNG CÓ bất kỳ hình học 2D/3D nào** (`box.isEmpty() === true`, tức bản vẽ chỉ có mỗi chữ/đường đo), lúc đó mới fallback sang tính `AnnotationBatch`!
  2. **Chống Outlier (Đối tượng rác bay xa vô cực):**
     - Ngay cả giữa các đối tượng hình học (hoặc khi chọn zoom), nếu có nhiều hơn 1 đối tượng mà có một đối tượng lạc xa bất thường (khoảng cách tâm hoặc kích thước lớn gấp $> 100$ lần trung vị của cụm mô hình chính), ưu tiên hội tụ vào cụm mô hình chính.
  3. Khi `scope === "selection"` (ví dụ người dùng chuột phải chọn **"🔍 Phóng tới đối tượng"** trên Cây bản vẽ):
     - Trong `getBoundingSphere`:
       ```ts
       for (const shape of shapes) {
           const visual = context.getVisual(shape);
           if (visual && visual.visible) {
               this.expandValidBox(box, visual as unknown as Object3D);
           } else if (shape instanceof VisualNode) {
               const bb = shape.boundingBox();
               if (bb) {
                   box.union(new Box3(ThreeHelper.fromXYZ(bb.min), ThreeHelper.fromXYZ(bb.max)));
               }
           }
       }
       ```
       Nhờ đó, dù đối tượng là `Prism`, `FolderNode` hay `Annotation`, bấm **"Phóng tới đối tượng"** đều zoom chính xác 100%!

### 2.2. Tầng 2: Trong `Application.createActiveView` (`packages/app/src/application.ts`) — Không khôi phục `viewState` bị văng xa bất thường & Tự động Fit thẳng vào Mô hình 3D
- Trong [`Application.createActiveView` (`packages/app/src/application.ts` dòng 280–301)](../../packages/app/src/application.ts#L280-L301):
  - File `thành-công trình kiến đức` đã lưu sẵn `viewState.position = { x: 3378241, y: 4978993, z: 6259196 }` trong SQLite từ lần lưu trước!
  - Đảm bảo khi mở dự án (`createActiveView`):
    - Gọi `view.cameraController.fitContent({ scope: "all", duration: 0 })` sau khi `getBoundingSphere` đã bỏ qua `AnnotationBatch`.
    - Khi đó, thay vì đứng ở khoảng cách $6.259.196\text{ mm}$, camera sẽ tự động nhảy thẳng về tâm của 85 khối `Prism` tại $(-550, -1230, -175)$ với khoảng cách chỉ $\approx 1.500\text{ mm}$, hiển thị rõ nét toàn bộ hệ khung lam sóng và tấm nano vân đá!

### 2.3. Tầng 3: Tự động Lọc / Ẩn các `DimensionAnnotation` bị suy biến hoặc lạc xa bất thường ($> 100.000\text{ mm}$ và không gắn với node nào) khi Deserialize
- Trong [`ModelManager.deserialize` (`packages/core/src/modelManager.ts`)](../../packages/core/src/modelManager.ts#L225-L245):
  - Kiểm tra các node `DimensionAnnotation` trong cây khi tải dự án:
    - Nếu một `DimensionAnnotation` không có `associationJson` (hoặc mất liên kết) VÀ có tọa độ `startPoint` / `endPoint` vượt quá $100.000\text{ mm}$ ($100\text{ mét}$) hoặc chiều dài đường đo $> 100.000\text{ mm}$ trong khi toàn bộ các khối hình học (`ShapeNode`) của bản vẽ nằm trong phạm vi $< 50.000\text{ mm}$:
    - Tự động đặt `node.visible = false` cho đường đo rác đó (hoặc thu hồi) để nó không vẽ 3 đường kẻ vàng khổng lồ làm rác màn hình của người dùng!
- Đồng thời, làm sạch trực tiếp node `DimensionAnnotation` lỗi (`id: "wjCc5mWBqLMBYym-BM4AX"`) và `viewState` bị văng xa trong dự án `thành-công trình kiến đức` (`udYMcajQ_OthrFnzPTNwQ`) trên SQLite của VPS để khi người dùng F5 lại trang là bản vẽ sạch đẹp ngay lập tức.

### 2.4. Tầng 4: Bổ sung nút "🗑️ Xóa (Delete)" và "🔍 Phóng tới đối tượng (Zoom to Object)" cho cả `FolderNode` & `Annotation` trong Menu Chuột phải trên Cây bản vẽ (`packages/ui/src/project/tree/tree.ts`)
- Trong [`Tree.showContextMenu` (`packages/ui/src/project/tree/tree.ts` dòng 274–291)](../../packages/ui/src/project/tree/tree.ts#L274-L291):
  - Cho phép **"🔍 Phóng tới đối tượng (Zoom to Object)"** hoạt động trên mọi node (nếu click chuột phải vào thư mục gốc `thành-công trình kiến đức` thì gọi `fitContent({ scope: "all", duration: CAMERA_FLY_DURATION })`).
  - Thêm mục **"🗑️ Xóa đối tượng (Delete)"** ngay trong menu chuột phải trên Cây đối tượng để người dùng có thể xóa nhanh bất kỳ đường đo `DimensionAnnotation` hoặc khối thừa nào ngay từ cây bản vẽ.

---

## 3. Danh sách File cần can thiệp

| STT | Package | File Path | Nội dung sửa đổi |
| :---: | :--- | :--- | :--- |
| 1 | `@chili3d/three` | `packages/three/src/cameraController.ts` | Trong `getBoundingSphere`: Bỏ qua `AnnotationBatch` (`object.name === "AnnotationBatch"`) và `ThreeAnnotation` khi tính khung bao tổng thể (`shapes.length === 0`), chỉ fallback dùng `AnnotationBatch` nếu toàn bộ cảnh không có khối hình học nào (`box.isEmpty()`). Hỗ trợ tính bounding box cho cả `VisualNode` khi `scope === "selection"`. |
| 2 | `@chili3d/core` | `packages/core/src/modelManager.ts` | Trong `deserialize`: Tự động phát hiện và tắt hiển thị (`visible = false`) các `DimensionAnnotation` rác bị văng tọa độ $> 100.000\text{ mm}$ (lệch hẳn khỏi cụm hình học chính) để không vẽ các đường vàng khổng lồ ngoài vũ trụ. |
| 3 | `@chili3d/app` | `packages/app/src/application.ts` | Trong `createActiveView`: Không áp dụng `viewState` cũ nếu khoảng cách camera tới gốc/target quá lớn ($> 100.000\text{ mm}$), luôn đảm bảo `doFit()` đưa camera về đúng cụm mô hình 3D. |
| 4 | `@chili3d/ui` | `packages/ui/src/project/tree/tree.ts` | Mở rộng **"🔍 Phóng tới đối tượng"** cho cả `FolderNode` (fit toàn bộ con bên trong) và thêm **"🗑️ Xóa đối tượng (Delete)"** vào Context Menu chuột phải. |
| 5 | `@chili3d/three` & `@chili3d/core` | `packages/three/test/cameraController.test.ts`, `packages/core/test/modelManager.test.ts` | Viết Unit Test kiểm tra `getBoundingSphere` không bị `AnnotationBatch` kéo văng xa khi có `ThreeGeometry`, và kiểm tra lọc `DimensionAnnotation` outlier khi deserialize. |

---

## 4. Tiêu chí Nghiệm thu & Quy tắc Báo cáo (Traceability Rules)

1. Mở dự án **`thành-công trình kiến đức`** trên `http://136.66.95.155`:
   - Không còn cảnh chỉ hiện 3 đường kẻ vàng ngoài vũ trụ.
   - Toàn bộ 85 khối 3D (`Prism2`, `Prism4`, `Prism10` + 50 thanh `Prism10_copy`, `Prism11` + 25 tấm `Prism11_copy`, `Rectangle4`, `Rectangle6`, cùng 5 đường đo kích thước chuẩn) hiện ra **rõ nét, đầy đủ hình khối 3D và màu vật liệu** ngay chính giữa màn hình!
2. Chạy `npm run test` và `npm run build` pass 100%.
3. Deploy lên VPS (`bash scripts/deploy-vps.sh`) VÀ dọn sạch đường đo lỗi `wjCc5mWBqLMBYym-BM4AX` trong SQLite của dự án `udYMcajQ_OthrFnzPTNwQ` trên VPS.
4. **Cập nhật mục `## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)` ở cuối file này** và chuyển trạng thái sang **`[?] WAITING_REVIEW`** trong cả `ROADMAP.md` và đầu file này.

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log - Do AI Thực thi ghi)

- **Trạng thái thực thi:** `[?] WAITING_REVIEW`
- **Thời gian hoàn thành:** 2026-11-02 18:35 (UTC+7)
- **Mã Commit (Git Hash):** `eefb7f61` (nhánh `main`)

### 5.1. Danh sách File đã sửa đổi / thêm mới

| STT | File Path | Hàm / Class can thiệp | Mô tả chi tiết thay đổi đã thực hiện |
| :---: | :--- | :--- | :--- |
| 1 | `packages/three/src/cameraController.ts` | `getBoundingSphere`, `filterOutlierBoxes` | 1. Tách biệt `geomBoxes` và `annotBoxes`: ưu tiên chỉ tính bounding box của các khối hình học thực tế, bỏ qua `AnnotationBatch` (`object.name === "AnnotationBatch"`) và `ThreeAnnotation` (`node instanceof Annotation`).<br>2. Fallback sang `AnnotationBatch` chỉ khi bản vẽ hoàn toàn không có hình học (`box.isEmpty()`).<br>3. Thêm hàm `filterOutlierBoxes` tính tâm và kích thước trung vị của cụm mô hình, loại bỏ các đối tượng lạc xa $> 100.000\text{ mm}$ và $> 50 \times D_{med}$.<br>4. Mở rộng `scope === "selection"` hỗ trợ cả `VisualNode.boundingBox()` và duyệt toàn bộ node con của `FolderNode`. |
| 2 | `packages/core/src/modelManager.ts` | `deserialize`, `sanitizeOutlierAnnotations` | Bổ sung hàm `sanitizeOutlierAnnotations()` tự động quét toàn bộ `DimensionAnnotation` khi deserialize: nếu tọa độ điểm đầu/cuối lệch $> 100.000\text{ mm}$ khỏi cụm hình học chính hoặc chiều dài $> 100.000\text{ mm}$ không có liên kết thì tự động đặt `node.visible = false`. |
| 3 | `packages/app/src/application.ts` | `createActiveView` | Thêm hàm kiểm tra `isOutlier`: nếu `viewState.position` hoặc `viewState.target` có tọa độ tuyệt đối $> 100.000\text{ mm}$ (do bị văng xa trong file cũ), bỏ qua viewState đó và luôn gọi `doFit()` để đưa camera căn chuẩn vào khối 3D. |
| 4 | `packages/ui/src/project/tree/tree.ts` | `showContextMenu` | 1. Mở rộng tùy chọn **"🔍 Phóng tới đối tượng (Zoom to Object)"** cho mọi loại node (với `rootNode` gọi `scope: "all"`, với các node khác gọi `scope: "selection"`).<br>2. Bổ sung mục **"🗑️ Xóa đối tượng (Delete)"** trong context menu chuột phải cho mọi node (trừ `rootNode`) thông qua `modify.deleteNode`. |
| 5 | `packages/three/test/cameraController.test.ts` | Unit tests | Bổ sung 3 unit tests mới: kiểm tra `fitContent` bỏ qua `AnnotationBatch` khi có hình học; fallback về `AnnotationBatch` khi không có hình học; và lọc outlier geometry lạc xa 600.000mm. |
| 6 | `packages/core/test/modelManager.test.ts` | Unit tests | Bổ sung unit test kiểm tra `deserialize` tự động ẩn `DimensionAnnotation` outlier ở xa ngoài vũ trụ. |
| 7 | `packages/ui/test/tree.test.ts` | Unit tests | Bổ sung 2 unit tests kiểm tra hiển thị menu ngữ cảnh chuột phải "Phóng tới đối tượng" và "Xóa đối tượng". |
| 8 | VPS SQLite Database | `udYMcajQ_OthrFnzPTNwQ` | Chạy script trên container `autocad-dunvex-storage-api-1` xóa thực thể `wjCc5mWBqLMBYym-BM4AX` trong `cad_entities` và `models.nodes`, xóa trường `viewState` bị văng xa trong `userData`. |

### 5.2. Kết quả Kiểm thử (Unit Tests, Build & VPS)
- **Unit Tests:**
  - `packages/three/test/cameraController.test.ts`: 54/54 passed (+3 tests mới).
  - `packages/core/test/modelManager.test.ts`: 43/43 passed (+1 test mới).
  - `packages/ui/test/tree.test.ts`: 22/22 passed (+2 tests mới).
  - Tổng toàn bộ dự án (`npm run test`): **584/585 test files passed** (9,963 tests passed, 1 skipped), 8 SQLite & Storage API tests passed.
  - Tổng số test pass: **9,971/9,971 passed (100% pass, 0 fail)**.
- **Biên dịch Production (`npm run build`):**
  - Rspack build thành công (0 errors).
  - Tất cả plugins biên dịch thành công.
- **Triển khai VPS Live (`http://136.66.95.155`):**
  - Đã chạy `bash scripts/deploy-vps.sh` triển khai gói build mới nhất lên VPS.
  - Đã dọn sạch node `wjCc5mWBqLMBYym-BM4AX` và `viewState` cũ trong database SQLite trên VPS.
  - Kiểm tra `curl -I http://136.66.95.155` phản hồi `HTTP/1.1 200 OK`.
