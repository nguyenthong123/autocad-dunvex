# TASK-11: Tách biệt Vật liệu theo từng Đối tượng & Đồng bộ Hiển thị Đa vật liệu (Per-Object Material Isolation & Multi-Material Management)

- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** P0 (Critical UX & Visual Bug — Đổi màu 1 khối làm đổi màu toàn bộ bản vẽ)
- **Phụ thuộc:** `TASK-08`, `TASK-10`

---

## 1. Hiện trạng lỗi & Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

### 1.1. Lỗi đổi màu 1 đối tượng (`Box1`) làm đổi màu toàn bộ các đối tượng khác (`Prism1`, `Face1`, sàn, tường...)
1. **Dùng chung tham chiếu `materialId` mặc định (`Material 1`):**
   - Trong constructor của [`GeometryNode`](../../packages/core/src/model/geometryNode.ts):
     ```ts
     this.setPrivateValue(
         "materialId",
         options.materialId ?? options.document.modelManager.materials.at(0)?.id ?? "",
     );
     ```
     Mọi khối hình học mới tạo (`Box1`, `Prism1`, `Face1`, `Rect1`...) đều được gán cùng một `materialId` trỏ tới `document.modelManager.materials[0]` (`"Material 1"`).
2. **Chỉnh sửa trực tiếp (In-place mutation) trên instance `Material 1` dùng chung:**
   - Khi người dùng chọn một đối tượng đơn lẻ (ví dụ: `Box1`) và nhấn vào ô Vật liệu trên bảng Thuộc tính ([`MaterialProperty.materialControl`](../../packages/ui/src/property/materialProperty.ts)), sự kiện `PubSub.default.pub("editMaterial", document, material, callback)` được phát ra.
   - [`Editor._handleMaterialEdit`](../../packages/ui/src/editor.ts) khởi tạo [`MaterialDataContent`](../../packages/ui/src/property/material/materialDataContent.ts) và mở popup [`MaterialEditor`](../../packages/ui/src/property/material/materialEditor.ts) với `editingMaterial = material` (chính là `Material 1` đang dùng chung).
   - Trong [`MaterialEditor.initEditingControl`](../../packages/ui/src/property/material/materialEditor.ts), các control chỉnh màu (`ColorProperty`), tên, độ bóng, texture... đều bind trực tiếp vào `[material]` (`Material 1`).
   - Ngay khi người dùng chọn màu mới trên bảng màu, `Material 1.color` bị ghi đè trực tiếp. Vì tất cả các khối khác trong bản vẽ đều đang tham chiếu tới `Material 1.id`, [`ThreeVisualContext.onMaterialPropertyChanged`](../../packages/three/src/threeVisualContext.ts) cập nhật vật liệu Three.js trong `materialMap` và làm **toàn bộ các khối trong bản vẽ bị đổi màu theo**.

### 1.2. Lỗi phụ liên quan đến các mặt phẳng 2D (`Face1`, `Rect1`, `Circle1`) có `polygonOffset` (từ `TASK-08`)
- Trong [`ThreeGeometry`](../../packages/three/src/threeGeometry.ts):
  1. Hàm `initFaces()` tạo bản clone vật liệu có `polygonOffset` (`this._ownsFaceMaterial = true`) và gán vào `this._faces.material`, nhưng lại giữ `this._faceMaterial` là vật liệu gốc chưa có `polygonOffset`.
  2. Khi người dùng rê chuột qua mặt phẳng (`Face1`) rồi di chuột ra ngoài, [`ThreeGeometry.removeTemperaryMaterial()`](../../packages/three/src/threeGeometry.ts) gán lại `this._faces.material = this._faceMaterial`, làm **mất bản clone có `polygonOffset`** và khiến mặt 2D bị nhấp nháy (Z-fighting) trở lại hoặc mất đồng bộ vật liệu.
  3. Khi [`ThreeGeometry.changeFaceMaterial(material)`](../../packages/three/src/threeGeometry.ts) được gọi (khi gán material mới cho đối tượng), hàm này gán thẳng `material` vào `this._faces.material` mà không áp dụng `applyPolygonOffset` cho mặt phẳng 2D, đồng thời không giải phóng (`dispose`) bản clone cũ.
  4. Khi thuộc tính của một `Material` thay đổi qua [`ThreeVisualContext.onMaterialPropertyChanged`](../../packages/three/src/threeVisualContext.ts), các đối tượng `ThreeGeometry` đang sở hữu vật liệu clone (`_ownsFaceMaterial = true`) không được đồng bộ lại màu sắc/thuộc tính mới từ `materialMap`, và viewport cũng chưa gọi `this.visual.update()` ngay lập tức.

---

## 2. Danh sách File cần can thiệp

| Package | File Path | Vai trò thay đổi |
| :--- | :--- | :--- |
| `@chili3d/ui` | `packages/ui/src/property/materialProperty.ts` | Truyền danh sách đối tượng đang chọn (`this.objects`) vào sự kiện `PubSub.default.pub("editMaterial", ...)` để `MaterialDataContent` biết những node nào đang được chỉnh sửa vật liệu. |
| `@chili3d/ui` | `packages/ui/src/editor.ts` | Cập nhật `_handleMaterialEdit` và `PubSub` handler để nhận thêm tham số `targetObjects?: GeometryNode[]` và truyền vào `new MaterialDataContent(...)`. |
| `@chili3d/ui` | `packages/ui/src/property/material/materialDataContent.ts` | Tự động kiểm tra xem `editingMaterial` có đang được dùng chung bởi bất kỳ `GeometryNode` nào khác ngoài `targetObjects` hay không (`isMaterialSharedByOtherNodes`). Nếu đang dùng chung, tự động tách (clone) ra một `Material` mới độc lập (`Material 2`, `Material 3`...) và gán ngay cho `targetObjects`. Hỗ trợ hoàn tác (`cancelEdit`) nếu người dùng bấm Hủy, hoặc gán lại vật liệu có sẵn nếu người dùng chủ động chọn một vật liệu khác trong danh sách. |
| `@chili3d/ui` | `packages/ui/src/property/material/materialEditor.ts` | Kết nối nút `Cancel` với `this.dataContent.cancelEdit()`, hỗ trợ chọn vật liệu có sẵn từ danh sách multi-material và hiển thị tên vật liệu rõ ràng dưới mỗi ô màu trong danh sách. |
| `@chili3d/three` | `packages/three/src/threeGeometry.ts` | Lưu trữ `_effectiveFaceMaterial` (đã áp dụng `applyPolygonOffset` nếu là mặt 2D overlay), đảm bảo `changeFaceMaterial()` và `removeTemperaryMaterial()` luôn giữ đúng `_effectiveFaceMaterial` và đồng bộ khi vật liệu gốc thay đổi. |
| `@chili3d/three` | `packages/three/src/threeVisualContext.ts` | Trong `onMaterialPropertyChanged`, đồng bộ lại các `ThreeGeometry` đang dùng `source.id` (đặc biệt là các mặt 2D có `_ownsFaceMaterial`) và gọi `this.visual.update()` để viewport render màu mới tức thì. |

---

## 3. Chi tiết Kỹ thuật cần triển khai

### Bước 3.1: Tự động tách (Clone) Material khi chỉnh sửa đối tượng đang dùng chung Material (`@chili3d/ui`)

#### A. Cập nhật [`packages/ui/src/property/materialProperty.ts`](../../packages/ui/src/property/materialProperty.ts)
Trong hàm `materialControl(material: Material | undefined, index?: number)`:
- Truyền thêm `this.objects` làm tham số thứ 4 khi phát sự kiện `editMaterial`:
  ```ts
  onclick: (e) => {
      PubSub.default.pub(
          "editMaterial",
          document,
          material,
          (newMaterial) => {
              this.setMaterial(e, newMaterial, index);
          },
          this.objects,
      );
  },
  ```

#### B. Cập nhật [`packages/ui/src/editor.ts`](../../packages/ui/src/editor.ts) (và kiểu sự kiện trong `pubsub.ts` nếu có)
- Mở rộng chữ ký hàm `_handleMaterialEdit`:
  ```ts
  private readonly _handleMaterialEdit = (
      document: IDocument,
      material: Material | undefined,
      callback?: (material: Material) => void,
      targetObjects?: GeometryNode[],
  ) => {
      const content = new MaterialDataContent(document, material, callback, targetObjects);
      new MaterialEditor(content).showModal();
  };
  ```
  *(Kiểm tra `packages/core/src/foundation/pubsub.ts` xem `editMaterial` có khai báo kiểu chặt không; nếu có thì thêm `targetObjects?: any[]` vào chữ ký event `editMaterial`).*

#### C. Cập nhật [`packages/ui/src/property/material/materialDataContent.ts`](../../packages/ui/src/property/material/materialDataContent.ts)
Thiết kế cơ chế **Auto-Isolate Material on Edit**:
1. Thêm các thuộc tính quản lý trạng thái phiên chỉnh sửa trong `MaterialDataContent`:
   - `readonly targetObjects: GeometryNode[]`
   - `private _initialMaterial?: Material`
   - `private _autoCreatedMaterial?: Material`
2. Viết phương thức kiểm tra xem một `materialId` có đang được tham chiếu bởi bất kỳ `GeometryNode` nào khác trong `document` nằm ngoài `targetObjects` hay không:
   ```ts
   isMaterialSharedByOtherNodes(materialId: string): boolean {
       if (!materialId || this.targetObjects.length === 0) return false;
       const targetSet = new Set(this.targetObjects);
       const allNodes = this.document.modelManager.getNodes();
       for (const node of allNodes) {
           if (targetSet.has(node as GeometryNode)) continue;
           if (node instanceof GeometryNode) {
               const nodeMatId = node.materialId;
               if (typeof nodeMatId === "string" && nodeMatId === materialId) {
                   return true;
               }
               if (Array.isArray(nodeMatId) && nodeMatId.includes(materialId)) {
                   return true;
               }
           }
       }
       return false;
   }
   ```
3. Viết hàm tạo tên vật liệu tuần tự sạch sẽ (`generateNextMaterialName()`):
   - Thay vì tạo tên `"Material 1 clone clone"`, hãy tìm số thứ tự tiếp theo chưa được dùng trong `this.document.modelManager.materials`:
   ```ts
   private generateNextMaterialName(): string {
       const existingNames = new Set(this.document.modelManager.materials.map((m) => m.name));
       let index = this.document.modelManager.materials.length + 1;
       while (existingNames.has(`Material ${index}`)) {
           index++;
       }
       return `Material ${index}`;
   }
   ```
4. Trong `constructor(readonly document: IDocument, editingMaterial?: Material, readonly callback?: (material: Material) => void, targetObjects?: GeometryNode[])`:
   - Lưu `this.targetObjects = targetObjects ?? []` và `this._initialMaterial = editingMaterial`.
   - Nếu `editingMaterial` tồn tại, có `callback`, `this.targetObjects.length > 0`, và `this.isMaterialSharedByOtherNodes(editingMaterial.id)` trả về `true`:
     - Tự động tách riêng một `Material` mới bằng `editingMaterial.clone()` nhưng đặt lại tên sạch sẽ qua `cloned.name = this.generateNextMaterialName()`.
     - Thêm `cloned` vào `this.document.modelManager.materials.push(cloned)`.
     - Lưu `this._autoCreatedMaterial = cloned`.
     - Gán `this.setPrivateValue("editingMaterial", cloned)`.
     - Gọi ngay `this.callback(cloned)` để đối tượng đang chọn (`Box1`) được cập nhật `materialId` sang `cloned.id` ngay lập tức! Nhờ đó, khi người dùng kéo bảng màu trong popup, chỉ có `Box1` đổi màu theo thời gian thực, còn mọi khối khác (`Prism1`, `Face1`...) vẫn giữ nguyên `Material 1`.
5. Hỗ trợ chọn vật liệu có sẵn hoặc hủy bỏ (`cancelEdit`):
   - Khi người dùng bấm nút **Cancel (Hủy)** trên `MaterialEditor`:
     - Gọi `this.cancelEdit()`:
       - Nếu `this._autoCreatedMaterial` đã được tạo tự động trong phiên này và người dùng hủy bỏ:
         - Khôi phục vật liệu ban đầu cho đối tượng: `if (this._initialMaterial && this.callback) this.callback(this._initialMaterial)`.
         - Xóa `this._autoCreatedMaterial` khỏi `this.document.modelManager.materials` (nếu không có node nào khác đang dùng nó).
   - Trong `addMaterial()` và `copyMaterial()`:
     - Sử dụng `this.generateNextMaterialName()` cho vật liệu mới để danh sách multi-material luôn gọn gàng (`Material 1`, `Material 2`, `Material 3`...).

#### D. Cập nhật [`packages/ui/src/property/material/materialEditor.ts`](../../packages/ui/src/property/material/materialEditor.ts)
1. Trong nút Cancel (`cancelButton`):
   ```ts
   onclick: () => {
       this.dataContent.cancelEdit();
       this.close();
   },
   ```
2. Cải thiện hiển thị danh sách Multi-Material (`itemTemplate` trong `MaterialEditor`):
   - Hiển thị rõ tên vật liệu (`item.name`) bên dưới hoặc bên trong thẻ swatch (với `text-overflow: ellipsis`, font nhỏ gọn) để người dùng dễ dàng phân biệt `Material 1`, `Material 2`, `Material 3`... khi quản lý nhiều vật liệu.

---

### Bước 3.2: Đồng bộ `polygonOffset` và cập nhật màu tức thì trong [`ThreeGeometry`](../../packages/three/src/threeGeometry.ts) & [`ThreeVisualContext`](../../packages/three/src/threeVisualContext.ts)

#### A. Sửa [`packages/three/src/threeGeometry.ts`](../../packages/three/src/threeGeometry.ts)
1. Thêm trường `private _effectiveFaceMaterial?: Material | Material[]` bên cạnh `this._faceMaterial`.
2. Viết hàm helper `private updateEffectiveFaceMaterial()` trong `ThreeGeometry`:
   - Nếu `this._ownsFaceMaterial` đang là `true` và `this._effectiveFaceMaterial` khác `this._faceMaterial`, giải phóng (`dispose`) các material clone cũ trong `this._effectiveFaceMaterial`.
   - Nếu `this.isPlanarOrSurfaceOverlay()` là `true`:
     - `this._effectiveFaceMaterial = this.applyPolygonOffset(this._faceMaterial);`
     - `this._ownsFaceMaterial = true;`
   - Ngược lại:
     - `this._effectiveFaceMaterial = this._faceMaterial;`
     - `this._ownsFaceMaterial = false;`
3. Trong `initFaces()`:
   - Gọi `this.updateEffectiveFaceMaterial()` và tạo `this._faces = new Mesh(buff, this._effectiveFaceMaterial!)`.
4. Trong `changeFaceMaterial(material: Material | Material[])`:
   - Cập nhật `this._faceMaterial = material;`
   - Gọi `this.updateEffectiveFaceMaterial();`
   - Nếu `!this._faces` thì return.
   - Nếu `this.locked` thì `this._faces.userData["oldMaterial"] = this._effectiveFaceMaterial;` ngược lại `this._faces.material = this._effectiveFaceMaterial!;`
5. Trong `removeTemperaryMaterial()`:
   - Thay vì gán `this._faces.material = this._faceMaterial`, phải gán:
     ```ts
     if (this._faces && this._faces.material !== lockFaceMaterial) {
         this._faces.material = this._effectiveFaceMaterial ?? this._faceMaterial;
     }
     ```
   - Điều này ngăn chặn lỗi mất `polygonOffset` hoặc mất màu sắc riêng sau khi người dùng di chuột (hover) qua một mặt phẳng 2D (`Face1`, `Rect1`).
6. Thêm getter `get ownsFaceMaterial(): boolean { return this._ownsFaceMaterial; }` và phương thức `syncFaceMaterial()` trên `ThreeGeometry` để `ThreeVisualContext` có thể yêu cầu tái tạo bản clone `_effectiveFaceMaterial` khi thuộc tính màu/texture của vật liệu gốc thay đổi.

#### B. Sửa [`packages/three/src/threeVisualContext.ts`](../../packages/three/src/threeVisualContext.ts)
Trong hàm `private readonly onMaterialPropertyChanged = (source: IMaterial, property: keyof IMaterial) => { ... }`:
1. Sau khi cập nhật `material` trong `this.materialMap`:
   - Duyệt qua `this._NodeVisualMap`: nếu `visual instanceof ThreeGeometry` và `visual.ownsFaceMaterial` là `true`, kiểm tra xem `visual.geometryNode.materialId` có khớp (hoặc chứa) `source.id` không; nếu có thì gọi `visual.changeFaceMaterial(this.getMaterial(visual.geometryNode.materialId))` để bản clone có `polygonOffset` của mặt 2D cũng nhận màu mới ngay lập tức!
2. Gọi `this.visual.update()` ở cuối `onMaterialPropertyChanged` để viewport render lại ngay lập tức khi người dùng đổi màu trong `MaterialEditor`.

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria) & Kiểm thử

1. **Tách biệt vật liệu tự động (Per-Object Material Isolation):**
   - Tạo 2 khối hình học (ví dụ: `Box1` và `Prism1` hoặc `Face1` và `Box1`). Ban đầu cả hai cùng có màu mặc định (`Material 1`).
   - Chọn riêng `Box1`, mở bảng Vật liệu và đổi màu sang Đỏ (`#FF0000`) rồi nhấn OK:
     - **Chỉ có `Box1` chuyển sang màu Đỏ** (với `Material 2` được tự động tách riêng).
     - `Prism1` và các đối tượng khác trong bản vẽ **giữ nguyên màu ban đầu** (`Material 1`).
   - Nếu mở bảng Vật liệu trên đối tượng đang dùng chung material, đổi thử màu rồi nhấn **Cancel (Hủy)**:
     - Đối tượng quay về `Material 1` ban đầu và material tạm không bị rác trong danh sách.
2. **Tái sử dụng và quản lý Multi-Material:**
   - Trong popup `MaterialEditor`, danh sách vật liệu hiển thị rõ từng vật liệu (`Material 1`, `Material 2`...).
   - Khi chọn một đối tượng thứ 3 (`Cylinder1`), người dùng có thể chủ động click chọn `Material 2` có sẵn trong danh sách để gán cùng vật liệu màu Đỏ cho `Cylinder1`, hoặc tạo thêm vật liệu mới.
3. **Đồng bộ trên cả khối 3D và mặt phẳng 2D (`Face1`, `Rect1`):**
   - Đổi màu cho một mặt phẳng 2D (`Face1`) hoạt động tức thì, không làm đổi màu các mặt khác, và khi rê chuột (hover) vào/ra `Face1`, màu sắc cũng như `polygonOffset` không bị mất.
4. **Unit Tests & Build:**
   - Viết bổ sung unit test kiểm tra `MaterialDataContent` tự động tách `Material` mới khi `editingMaterial` đang được chia sẻ bởi nhiều `GeometryNode`, và hoàn tác đúng khi gọi `cancelEdit()`.
   - Chạy `npm run test` và `npm run build` pass 100%.
   - Deploy bản build mới lên VPS (`http://136.66.95.155`) và push code lên GitHub (`dev` & `main`).
