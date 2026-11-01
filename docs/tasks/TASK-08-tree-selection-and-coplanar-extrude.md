# TASK-08: Đồng bộ chọn đối tượng trên Cây bản vẽ (Project Tree), Chống Z-Fighting mặt đồng phẳng (`Prism1` vs `Face1`) & Hoàn thiện xác nhận lệnh Đùn khối (`Extrude` / `Shell`)

- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** `HIGH (Core 3D Wall & Material Cladding Workflow)`
- **Phụ thuộc:** `TASK-04`, `TASK-07`

---

## 1. Bối cảnh & Chẩn đoán kỹ thuật (Root Cause Analysis)

Trong quy trình dựng tường 3D (`Prism1`) và vẽ tiếp các mảng vật liệu / ô cửa 2D (`Face1`, `Rect1`, `Circle1`...) nằm trực tiếp trên bề mặt bức tường để **Đùn khối (`Extrude` - phím `P`)** hoặc **Làm rỗng (`Shell`)**, hệ thống hiện đang gặp **3 lỗi kiến trúc nghiêm trọng**:

### Lỗi 1: Click chọn `Face1` trên Cây bản vẽ (`ProjectView` / `Tree`) hoặc chọn trước (Pre-selection) không được lệnh `Extrude` / `Shell` nhận diện
1. **Xóa mất Pre-selection khi mở lệnh:**
   - Trong [`packages/app/src/commands/create/extrude.ts`](../../packages/app/src/commands/create/extrude.ts) (dòng 35), `ExtrudeCommand` dùng `SelectShapeStep` thay vì `GetOrSelectShapeStep`.
   - Khi `SelectStep.execute()` ([`packages/core/src/step/selectStep.ts`](../../packages/core/src/step/selectStep.ts) dòng 78-81) khởi chạy, hàm này gọi ngay `document.selection.clearSelection()`, xóa sạch đối tượng `Face1` mà người dùng đã chọn trước đó.
2. **Sự kiện click trên Cây đối tượng (`Project Tree`) không phát tín hiệu sang bộ chọn hình học (`Picker.pickShape`):**
   - Khi người dùng click vào `Face1` trên cây thư mục bên trái (`ProjectView`), `Tree` chỉ gọi `document.selection.setSelectedNodes([node], toggle)` ([`packages/app/src/selectionManager.ts`](../../packages/app/src/selectionManager.ts) dòng 106), làm đổi trạng thái chọn của Node (`onNodeChanged`) nhưng **không** cập nhật `selectedShapeSet` (`getSelectedShapes()`) và **không** báo cho `Picker.pickShape` ([`packages/app/src/picker.ts`](../../packages/app/src/picker.ts) dòng 28-58).
   - Kết quả: Dù `Face1` đã sáng lên trên Cây đối tượng, lệnh `Extrude` / `Shell` vẫn báo *"Vui lòng chọn hình dạng"* / *"0 đã chọn"* và không thể thực thi.
3. **Thiếu tọa độ `point` khi chọn từ Cây đối tượng hoặc Pre-selection:**
   - Tại [`packages/app/src/commands/create/extrude.ts`](../../packages/app/src/commands/create/extrude.ts) (dòng 74), `ExtrudeCommand.getAxis()` đọc `const point = this.stepDatas[0].shapes[0].point!`. Khi chọn qua raycast chuột trên Viewport thì `point` có giá trị, nhưng khi chọn qua Cây đối tượng (`Tree`) hoặc Pre-selection thì `point` có thể bị `undefined` nếu không tính tâm `BoundingBox.center(shape.boundingBox())`.

### Lỗi 2: Coplanar Face & Z-Fighting giữa khối đặc 3D (`Prism1`) và mặt phẳng 2D (`Face1`)
1. **Hiện tượng nhấp nháy Z-Fighting trên WebGL:**
   - Khi vẽ một hình chữ nhật có mặt (`Face1` / `RectNode` với `isFace = true`) nằm trùng khít trên mặt tường của khối 3D `Prism1`, cả hai lưới tam giác (`Mesh`) có cùng giá trị độ sâu ($Z$-buffer) trong [`ThreeGeometry.initFaces`](../../packages/three/src/threeGeometry.ts) (dòng 284-291), gây ra hiện tượng nhấp nháy (Z-fighting) và che khuất `Face1`.
2. **Raycast ưu tiên nhầm mặt của khối đặc `Prism1` thay vì `Face1`:**
   - Trong [`ThreeView.detectShapes`](../../packages/three/src/threeView.ts) (dòng 1027-1060), khi tia raycast bắn trúng cả mặt tường `Prism1` (`ShapeTypes.solid`) và mặt phẳng 2D `Face1` (`ShapeTypes.face` / `wire` / `edge`) tại cùng một vị trí đồng phẳng, hàm hiện tại mới chỉ ưu tiên `edge` trước `face`, nhưng **chưa ưu tiên mặt phẳng 2D độc lập (`Face1`) trước mặt của khối đặc 3D (`Prism1`)**.
   - Tương tự, trong [`prioritizeSketchFaces`](../../packages/parametric/src/commands/profileFaceSort.ts) và [`SelectSketchProfilesStep`](../../packages/parametric/src/commands/extrudeCommand.ts) (dòng 120-198), bộ lọc mới chỉ ưu tiên `SketchNode` mà bỏ qua các `ShapeNode` 2D độc lập (`Face1`, `Rect1`, `Circle1`).

### Lỗi 3: Nút Xác nhận (Checkmark $\checkmark$) và phím `Enter` trên thanh ngữ cảnh lệnh (`CommandContext`)
- Trong [`Picker.pickControl`](../../packages/app/src/picker.ts) (dòng 121-124), bước chọn đơn (`multi: false`) mặc định trả về `"none"` nên ẩn mất thanh nút xác nhận ($\checkmark$) / hủy ($\times$) trên [`CommandContext`](../../packages/ui/src/ribbon/commandContext.ts) (dòng 118-166).
- Cần đảm bảo khi lệnh đang chờ chọn mặt/biên dạng (như `Extrude`, `Shell`, `Offset`...), thanh điều khiển luôn hiển thị số lượng đã chọn + nút Checkmark ($\checkmark$), đồng thời khi người dùng chọn `Face1` (trên Viewport hoặc trên Cây đối tượng) hay nhấn `Enter` / click nút $\checkmark$, bước chọn sẽ hoàn tất mượt mà để chuyển sang bước kéo chiều dày khối.

---

## 2. Danh sách các File mục tiêu cần can thiệp (Target Files)

| STT | Đường dẫn File | Hành động | Mô tả phạm vi thay đổi |
| :-: | :--- | :---: | :--- |
| 1 | `packages/core/src/step/selectStep.ts` | **Modify** | Hỗ trợ chuyển đổi các `ShapeNode` đã được chọn trước (Pre-selection trong `document.selection.getSelectedNodes()`) sang `VisualShapeData` (kèm `point` tâm BoundingBox) trước khi gọi `clearSelection()` trong `SelectShapeStep` / `GetOrSelectShapeStep`. |
| 2 | `packages/app/src/picker.ts` | **Modify** | Trong `Picker.pickShape`, lắng nghe sự kiện `document.selection.onNodeChanged` (khi người dùng click vào `Face1`, `Rect1`... trên `ProjectView` / `Tree` lúc lệnh đang mở), tự động trích xuất hình học khớp với `shapeType` / `shapeFilter` / `nodeFilter`, gán vào `document.selection.setSelectedShapes(...)`, và tự động hoàn tất (`controller.success()`) nếu là chọn đơn (`!multi && finishOnClick`) hoặc cập nhật bộ đếm cho nút $\checkmark$. |
| 3 | `packages/app/src/commands/create/extrude.ts` | **Modify** | Chuyển bước 1 của `ExtrudeCommand` sang dùng `GetOrSelectShapeStep` để nhận diện ngay `Face1` / `Rect1` đã chọn trước khi bấm phím `P`; bổ sung fallback an toàn tính `point` từ `BoundingBox.center(shape.boundingBox())` trong `getAxis(shape)`. |
| 4 | `packages/three/src/threeGeometry.ts` | **Modify** | Trong `initFaces()`, nếu `geometryNode` là đối tượng mặt/hình 2D độc lập (không phải khối đặc `ShapeTypes.solid` / `compoundSolid`), áp dụng `polygonOffset = true`, `polygonOffsetFactor = -1.0`, `polygonOffsetUnits = -4.0` trên bản sao material để triệt tiêu hoàn toàn Z-Fighting khi vẽ `Face1` đè lên mặt tường `Prism1`. |
| 5 | `packages/three/src/threeView.ts` | **Modify** | Trong `detectShapes()`, khi có nhiều kết quả mặt (`ShapeTypes.face`) đồng phẳng (khoảng cách điểm giao nhau chênh lệch $< 10^{-3}$), ưu tiên xếp các mặt thuộc đối tượng 2D độc lập (`ShapeNode` có `shapeType` là `face`/`wire`/`shell` hoặc `SketchNode`) lên trước mặt của khối đặc 3D (`ShapeTypes.solid`). |
| 6 | `packages/parametric/src/commands/profileFaceSort.ts` | **Modify** | Mở rộng `prioritizeSketchFaces` để ưu tiên cả `SketchNode` lẫn các `ShapeNode` 2D phẳng độc lập (như `Face1`, `Rect1`) đứng trước mặt của khối đặc 3D khi raycast đồng phẳng. |

---

## 3. Hướng dẫn triển khai chi tiết từng bước (Step-by-Step Implementation Guide)

### Bước 3.1: Hỗ trợ trích xuất `VisualShapeData` từ `ShapeNode` (Pre-selection & Tree Click)

1. Tạo một hàm tiện ích dùng chung (trong [`packages/core/src/step/selectStep.ts`](../../packages/core/src/step/selectStep.ts) và export qua `@chili3d/core`) có tên `extractVisualShapesFromNodes`:
   ```ts
   export function extractVisualShapesFromNodes(
       document: IDocument,
       nodes: readonly INode[],
       shapeType: ShapeType,
       shapeFilter?: IShapeFilter,
       nodeFilter?: INodeFilter,
   ): VisualShapeData[] {
       const result: VisualShapeData[] = [];
       for (const node of nodes) {
           if (nodeFilter && !nodeFilter.allow(node)) continue;
           if (!(node instanceof ShapeNode) || !node.shape.isOk) continue;
           const owner = document.visual.context.getVisual(node);
           if (!owner) continue;
           const rootShape = node.shape.value;
           const worldTransform = owner.worldTransform();

           // Trường hợp 1: Bản thân Shape của Node khớp trực tiếp với shapeType cần chọn (ví dụ Face1 là ShapeTypes.face, Rect1 là ShapeTypes.wire/face)
           if (ShapeTypeUtils.has(shapeType, rootShape.shapeType)) {
               if (!shapeFilter || shapeFilter.allow(rootShape, worldTransform)) {
                   const box = rootShape.boundingBox();
                   const localCenter = BoundingBox.isValid(box)
                       ? BoundingBox.center(box)
                       : { x: 0, y: 0, z: 0 };
                   result.push({
                       owner,
                       shape: rootShape,
                       transform: worldTransform,
                       point: worldTransform.ofPoint(localCenter),
                       indexes: [0],
                   });
                   continue;
               }
           }

           // Trường hợp 2: Nếu lệnh yêu cầu chọn Face (như Extrude/Shell) và Node là một mặt đơn hoặc có sub-shapes là Face
           if (ShapeTypeUtils.hasFace(shapeType) && rootShape.shapeType !== ShapeTypes.solid) {
               const faces = rootShape.findSubShapes(ShapeTypes.face);
               faces.forEach((face, idx) => {
                   if (!shapeFilter || shapeFilter.allow(face, worldTransform)) {
                       const box = face.boundingBox();
                       const localCenter = BoundingBox.isValid(box)
                           ? BoundingBox.center(box)
                           : { x: 0, y: 0, z: 0 };
                       result.push({
                           owner,
                           shape: face,
                           transform: worldTransform,
                           point: worldTransform.ofPoint(localCenter),
                           indexes: [idx],
                       });
                   }
               });
           }
       }
       return result;
   }
   ```
2. Trong `GetOrSelectShapeStep.getSelectedShapes(document)` ([`packages/core/src/step/selectStep.ts`](../../packages/core/src/step/selectStep.ts) dòng 98-115):
   - Ngoài việc lọc từ `document.selection.getSelectedShapes()`, nếu kết quả rỗng thì gọi tiếp `extractVisualShapesFromNodes(document, document.selection.getSelectedNodes(), this.shapeType, this.options?.shapeFilter, this.options?.nodeFilter)`.
   - Nếu tìm thấy hình hợp lệ từ Node đã chọn trước (ví dụ người dùng click `Face1` trên Cây đối tượng rồi mới ấn phím `P`), tự động gọi `document.selection.setSelectedShapes(fromNodes, VisualStates.faceSelected, false)` và trả về mảng này để lệnh `Extrude` đi thẳng tới bước kéo chiều dày!

### Bước 3.2: Đồng bộ sự kiện click trên Cây đối tượng (`Project Tree`) khi lệnh đang mở (`Picker.pickShape`)

Mở file [`packages/app/src/picker.ts`](../../packages/app/src/picker.ts):
1. Trong phương thức `pickShape(...)`:
   - Đăng ký lắng nghe sự kiện `this.document.selection.onNodeChanged` trong suốt thời gian `pickAsync` đang chạy (và gỡ đăng ký trong khối `finally`):
   ```ts
   const onNodeSelectionChanged = (nodes: INode[]) => {
       if (!nodes || nodes.length === 0) return;
       const matchedShapes = extractVisualShapesFromNodes(
           this.document,
           nodes,
           shapeType,
           options?.shapeFilter,
           options?.nodeFilter,
       );
       if (matchedShapes.length === 0) return;
       const picked = multi ? matchedShapes : [matchedShapes[0]];
       this.document.selection.setSelectedShapes(picked, handler.selectedState, multi);
       this.document.visual.update();
       if (
           picked.length > 0 &&
           ((handler.canFinish?.(this.document.selection.getSelectedShapes()) ?? false) ||
               (!multi && handler.finishOnClick))
       ) {
           controller.success();
       }
   };
   this.document.selection.onNodeChanged.sub(onNodeSelectionChanged);
   ```
   - Đảm bảo trong `finally` luôn gọi `this.document.selection.onNodeChanged.remove(onNodeSelectionChanged)`.
2. Trong hàm `pickControl(multi, options)` ([`packages/app/src/picker.ts`](../../packages/app/src/picker.ts) dòng 121-124):
   - Khi đang ở trong `pickShape`, luôn hiển thị thanh điều khiển `"selection"` (hoặc `"confirm"` khi `options?.showConfirmControl === false` không được chỉ định rõ) để người dùng luôn nhìn thấy bộ đếm số mặt đã chọn và nút Checkmark ($\checkmark$) / Cancel ($\times$) trên thanh `CommandContext`.

### Bước 3.3: Cập nhật `ExtrudeCommand` (`packages/app/src/commands/create/extrude.ts`)

Mở file [`packages/app/src/commands/create/extrude.ts`](../../packages/app/src/commands/create/extrude.ts):
1. Đổi `SelectShapeStep` ở dòng 35 thành `GetOrSelectShapeStep`:
   ```ts
   protected override getSteps(): IStep[] {
       return [
           new GetOrSelectShapeStep(
               (ShapeTypes.face | ShapeTypes.edge | ShapeTypes.wire) as ShapeType,
               "prompt.select.shape",
           ),
           new LengthAtAxisStep("prompt.pickNextPoint", this.getLengthStepData, true),
       ];
   }
   ```
2. Trong `getAxis(shape: IShape)` (dòng 73-77), bổ sung fallback an toàn nếu `this.stepDatas[0].shapes[0].point` bị `undefined` (ví dụ khi chọn qua hình chữ nhật quét chọn hoặc qua Cây đối tượng):
   ```ts
   private getAxis(shape: IShape) {
       const firstShape = this.stepDatas[0].shapes[0];
       const point =
           firstShape.point ??
           firstShape.transform.ofPoint(BoundingBox.center(firstShape.shape.boundingBox()));
       const normal = GeometryUtils.normal(shape as any);
       return { point, normal };
   }
   ```

### Bước 3.4: Xử lý Coplanar Face & Chống Z-Fighting giữa `Prism1` và `Face1`

1. **Thiết lập `polygonOffset` cho mặt phẳng 2D độc lập trong [`packages/three/src/threeGeometry.ts`](../../packages/three/src/threeGeometry.ts):**
   - Trong phương thức `initFaces(data: FaceMeshData)` (khoảng dòng 284-291):
   - Kiểm tra xem `this.geometryNode` có phải là một đối tượng 2D/mặt phẳng độc lập (không phải khối đặc 3D `ShapeTypes.solid` / `ShapeTypes.compoundSolid` / `ShapeTypes.shell`) hay không:
     ```ts
     private isPlanarOrSurfaceOverlay(): boolean {
         if (!(this.geometryNode instanceof ShapeNode) || !this.geometryNode.shape.isOk) {
             return false;
         }
         const st = this.geometryNode.shape.value.shapeType;
         return (
             st === ShapeTypes.face ||
             st === ShapeTypes.wire ||
             st === ShapeTypes.edge ||
             st === ShapeTypes.compound
         );
     }
     ```
   - Khi `this.isPlanarOrSurfaceOverlay()` là `true`, clone material của mặt (hoặc áp dụng thuộc tính lên material riêng của mesh mặt đó) với:
     ```ts
     material.polygonOffset = true;
     material.polygonOffsetFactor = -1.0;
     material.polygonOffsetUnits = -4.0;
     ```
     Nhờ đó, mọi đối tượng `Face1`, `Rect1`, `Circle1` vẽ đè lên bề mặt tường `Prism1` sẽ luôn hiển thị sắc nét phía trên mặt tường mà không bao giờ bị nhấp nháy Z-Fighting.

2. **Ưu tiên Raycast cho `Face1` (đối tượng 2D độc lập) trước `Prism1` (khối đặc 3D) khi đồng phẳng trong [`packages/three/src/threeView.ts`](../../packages/three/src/threeView.ts):**
   - Trong phương thức `detectShapes(...)` (khoảng dòng 1041-1060):
   - Khi `subs.length > 1`, nếu phần tử đầu tiên `subs[0]` là một `face` thuộc về một khối đặc 3D (`owner.node instanceof ShapeNode && owner.node.shape.isOk && ShapeTypeUtils.hasSolid(owner.node.shape.value.shapeType)`), kiểm tra xem trong danh sách `subs` có phần tử `subs[j]` nào thuộc về đối tượng 2D/mặt độc lập (`!ShapeTypeUtils.hasSolid(...)`) nằm đồng phẳng tại cùng vị trí click (khoảng cách giữa `subs[0].point` và `subs[j].point` nhỏ hơn `1e-2` hoặc nằm trên mặt phẳng của `subs[0]` với sai số `< Precision.OnSurface`) hay không.
   - Nếu có, đưa `subs[j]` (tức là `Face1`) lên đầu mảng `subs[0]` trước cả khi xét ưu tiên `edge`!
   - Đồng thời cập nhật [`packages/parametric/src/commands/profileFaceSort.ts`](../../packages/parametric/src/commands/profileFaceSort.ts) để ưu tiên cả `SketchNode` lẫn các `ShapeNode` không phải khối đặc (`!(x.owner.node instanceof ShapeNode && x.owner.node.shape.isOk && ShapeTypeUtils.hasSolid(x.owner.node.shape.value.shapeType))`).

---

## 4. Danh sách kiểm thử nghiệm thu (Verification Checklist)

- [x] **1. Kiểm thử Unit Tests tự động:**
  - [x] Viết bổ sung unit test cho `extractVisualShapesFromNodes`, `Picker.pickShape` khi phát sự kiện `document.selection.onNodeChanged` (click trên Project Tree), và ưu tiên đồng phẳng trong `ThreeView.detectShapes`.
  - [x] Chạy `npm run test` đảm bảo 100% test suite pass.
  - [x] Chạy `npm run check` đảm bảo không có lỗi Biome lint/format.
- [x] **2. Kiểm thử tình huống thực tế (End-to-End Workflow):**
  - [x] **Tình huống 1 (Chọn `Face1` trước rồi bấm `P` - Pre-selection):** Click vào `Face1` trên Cây bản vẽ (`Cây đối tượng`) hoặc trên Viewport -> Bấm phím `P` (`Đùn khối`) -> Hệ thống nhận diện ngay `Face1` và hiển thị mũi tên kéo độ dày lớp vật liệu mà không hỏi lại *"Vui lòng chọn hình dạng"*.
  - [x] **Tình huống 2 (Bấm `P` trước rồi click `Face1` trên Cây bản vẽ):** Bấm phím `P` (`Đùn khối`) -> Click vào `Face1` trong danh sách `Cây đối tượng` bên trái -> Lệnh `Extrude` lập tức nhận `Face1` và chuyển sang bước nhập độ dày (hoặc cho phép bấm nút $\checkmark$ / phím `Enter`).
  - [x] **Tình huống 3 (Chống Z-Fighting & Click trực tiếp trên mặt tường `Prism1`):** Vẽ một hình chữ nhật `Face1` nằm trên mặt đứng của bức tường `Prism1` -> Quan sát thấy `Face1` hiển thị rõ nét không bị nhấp nháy trùng mặt với `Prism1`; khi rê chuột vào vùng `Face1` lúc đang chạy lệnh `Extrude`, `Face1` được bắt sáng (highlight) ưu tiên trước mặt tường `Prism1`.
- [x] **3. Build & Deploy lên VPS:**
  - [x] Chạy `FORCE_BUILD=1 bash scripts/deploy-vps.sh` để cập nhật bản build mới nhất lên VPS `http://136.66.95.155`.
  - [x] Commit code theo chuẩn Conventional Commits và cập nhật trạng thái `TASK-08` trong `ROADMAP.md` sang `[x] DONE`.
