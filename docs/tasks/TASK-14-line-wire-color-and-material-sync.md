# TASK-14: Hỗ trợ Đổi màu Đường kẻ (`Line`, `Wire`, `Arc`, `Circle` khung dây) & Đổi màu Hàng loạt khi Quét chọn Nhiều Vật thể (Multi-Selection Material Sync)

> **Trạng thái:** `[x] DONE`
> **Mức độ ưu tiên:** Cao (High - Trải nghiệm vẽ 2D AutoCAD, Quản lý màu sắc đường nét & Đổi màu hàng loạt)
> **Phụ thuộc:** `TASK-11`, `TASK-13`

---

## 1. Bối cảnh & Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

### Vấn đề A: Chọn Đường kẻ (`Line`, `Wire`, `Arc`, `Circle` khung dây) và đổi màu trong bảng Vật liệu (`Material`) nhưng đường kẻ KHÔNG đổi màu
1. **Cơ chế hiển thị đường thẳng (`L` / `Line`) hiện tại:**
   - Khi đang kéo chuột vẽ hoặc khi đang click chọn / rê chuột qua (`VisualStates.edgeSelected` / `VisualStates.edgeHighlight`), đường thẳng sáng màu **Xanh lá (`#33ff33`)**.
   - Sau khi vẽ xong và bỏ chọn (`Esc`), đường thẳng được dựng bằng `LineSegments2` với `LineMaterial` lấy màu cứng từ `VisualConfig.default.defaultEdgeColor` (**Trắng sáng `#eeeeee`** ở Dark Theme, **Xám đậm `#333333`** ở Light Theme).
2. **Nguyên nhân lỗi trong [`packages/three/src/threeGeometry.ts`](../../packages/three/src/threeGeometry.ts) và [`packages/three/src/threeVisualContext.ts`](../../packages/three/src/threeVisualContext.ts):**
   - Trong [`ThreeGeometry.changeFaceMaterial`](../../packages/three/src/threeGeometry.ts#L99-L109), dòng `if (!this._faces) return;` làm hàm thoát ngay lập tức đối với các đối tượng chỉ có cạnh (`LineNode`, `WireNode`, `ArcNode`, `CircleNode` không mặt, `RectNode` không mặt — vốn chỉ có `this._edgeParts` và `this._faces === undefined`).
   - Hàm [`ThreeGeometry.edgeMaterialFor`](../../packages/three/src/threeGeometry.ts#L309-L323) luôn gán cứng `edgeMaterialOfWidth(data.lineWidth)` mà bỏ qua hoàn toàn màu của `Material` (`materialId`) gắn trên `GeometryNode`.
   - Trong [`ThreeVisualContext.onMaterialPropertyChanged`](../../packages/three/src/threeVisualContext.ts#L196-L207), vòng lặp chỉ cập nhật các `ThreeGeometry` có `visual.ownsFaceMaterial`, nên khi người dùng kéo Color Picker đổi màu, các đối tượng đường kẻ không được cập nhật.

---

### Vấn đề B: Khi quét chọn nhiều vật thể cùng lúc, không thể đổi màu đồng loạt cho tất cả các vật thể được chọn
Có **2 nguyên nhân kỹ thuật trực tiếp** trong `@chili3d/ui` khiến việc quét chọn nhiều vật thể không đổi màu cùng lúc được:

1. **Nguyên nhân B1 — Bảng Thuộc tính (`PropertyView`) tự động ẩn mục Vật liệu (`Material`) khi quét chọn nhiều vật thể khác loại ([`packages/ui/src/property/propertyView.ts`](../../packages/ui/src/property/propertyView.ts#L82-L119)):**
   - Trong `PropertyView.addGeometry(nodes, document)` (dòng 82–87) và `addParameters(geometries, document)` (dòng 105–119):
     ```ts
     private addGeometry(nodes: INode[], document: IDocument) {
         const geometries = nodes.filter((x) => x instanceof VisualNode || x instanceof GroupNode);
         if (geometries.length === 0 || !this.isAllElementsOfTypeFirstElement(geometries)) return;
         this.addTransform(document, geometries);
         this.addParameters(geometries, document);
     }
     ```
   - Hàm `isAllElementsOfTypeFirstElement` kiểm tra `Object.getPrototypeOf(arr[i]).constructor !== firstElementType`.
   - Khi người dùng quét chuột chọn nhiều vật thể khác loại nhau trên bản vẽ (ví dụ: chọn cùng lúc 1 đường thẳng `LineNode`, 1 hình chữ nhật `RectNode`, 1 khối hộp `BoxNode`, 1 bức tường `Prism`/`EditableShapeNode`...), vì constructor của chúng khác nhau, `isAllElementsOfTypeFirstElement` trả về `false`!
   - Hậu quả: `addGeometry()` thoát ra ngay lập tức (`return;`), làm **biến mất hoàn toàn mục Vật liệu (`Material`) và `Ma trận (Transform)` trên bảng Thuộc tính bên phải**, khiến người dùng không có nút Vật liệu để bấm đổi màu khi quét chọn nhiều đối tượng khác loại!
   - Trong khi thực tế, tất cả các đối tượng hình học 2D/3D đều kế thừa từ lớp cơ sở [`GeometryNode`](../../packages/core/src/model/geometryNode.ts#L42-L50) và đều có chung thuộc tính `@property("common.material", { type: "materialId" })` trên `GeometryNode.prototype`!

2. **Nguyên nhân B2 — `MaterialDataContent` không đồng bộ `materialId` cho các đối tượng thứ 2, 3... trong vùng chọn khi đối tượng đầu tiên đã có Material riêng ([`packages/ui/src/property/material/materialDataContent.ts`](../../packages/ui/src/property/material/materialDataContent.ts#L44-L59)):**
   - Khi người dùng chọn nhiều đối tượng (ví dụ: `Obj1`, `Obj2`, `Obj3`), `MaterialProperty` lấy `editingMaterial` từ đối tượng đầu tiên `objects[0].materialId` (của `Obj1`).
   - Giả sử `Obj1` trước đó đã được đổi màu riêng (đang mang `Material 2` — không dùng chung với bất kỳ đối tượng nào *ngoài* nhóm đang chọn), còn `Obj2` và `Obj3` đang mang `Material 1`.
   - Trong constructor của `MaterialDataContent`:
     ```ts
     if (
         editingMaterial &&
         this.callback &&
         this.targetObjects.length > 0 &&
         this.isMaterialSharedByOtherNodes(editingMaterial.id)
     ) {
         ...
         this.callback(cloned);
     } else {
         this.setPrivateValue("editingMaterial", editingMaterial);
     }
     ```
   - Vì `Material 2` chỉ được dùng bởi `Obj1` (nằm trong `targetObjects`), hàm `isMaterialSharedByOtherNodes("Material 2")` trả về **`false`**!
   - Do đó code rơi vào nhánh `else` và **KHÔNG gọi `this.callback(...)`**! Kết quả là khi người dùng chọn màu mới trên bảng màu, chỉ có `Obj1` (đang mang `Material 2`) đổi màu, còn **`Obj2` và `Obj3` vẫn giữ `materialId = Material 1` cũ nên hoàn toàn không đổi màu theo**!
   - Ngoài ra, trong [`MaterialProperty.setMaterial`](../../packages/ui/src/property/materialProperty.ts#L68-L81), nếu `this.materials.length > 1` nhưng trong danh sách `this.objects` có đối tượng mà `x.materialId` là `string` (không phải mảng `string[]`), việc gọi `x.materialId.toSpliced(...)` sẽ gây lỗi runtime TypeError (`x.materialId.toSpliced is not a function`).

---

## 2. Danh sách File cần can thiệp

| Package | File Path | Vai trò thay đổi |
| :--- | :--- | :--- |
| `@chili3d/three` | `packages/three/src/threeGeometry.ts` | Áp dụng màu của `Material` (`_faceMaterial`) lên `LineMaterial` của `_edgeParts` đối với các đối tượng khung dây không có mặt (`!this._faces` như `Line`, `Wire`, `Arc`, `Circle` không mặt). |
| `@chili3d/three` | `packages/three/src/threeVisualContext.ts` | Cập nhật `changeFaceMaterial` cho mọi `ThreeGeometry` (kể cả node không có mặt `!this._faces`) khi thuộc tính màu của `Material` thay đổi trong `onMaterialPropertyChanged`. |
| `@chili3d/ui` | `packages/ui/src/property/propertyView.ts` | Cho phép hiển thị `Transform` và thuộc tính chung của `GeometryNode` (`common.material` - Vật liệu) ngay cả khi quét chọn nhiều đối tượng thuộc các class hình học khác nhau (`LineNode` + `RectNode` + `BoxNode` + `EditableShapeNode`...). |
| `@chili3d/ui` | `packages/ui/src/property/material/materialDataContent.ts` | Khi chọn nhiều đối tượng (`targetObjects.length > 1`) có `materialId` khác nhau (`hasMixedMaterials`), đảm bảo gán đồng bộ `editingMaterial` (hoặc bản clone nếu đang chia sẻ với node ngoài vùng chọn) cho **toàn bộ `targetObjects`** ngay khi mở trình sửa màu; lưu `Map<GeometryNode, string \| string[]>` để khôi phục chính xác từng đối tượng khi bấm `Cancel`. |
| `@chili3d/ui` | `packages/ui/src/property/materialProperty.ts` | Bảo vệ an toàn kiểu dữ liệu `Array.isArray(x.materialId)` trong `setMaterial()` khi cập nhật `materialId` cho nhiều đối tượng cùng lúc. |

---

## 3. Giải pháp Kỹ thuật Chi tiết

### Bước 3.1: Đồng bộ màu sắc `Material` cho các đối tượng Đường kẻ / Khung dây (`!this._faces`) trong [`packages/three/src/threeGeometry.ts`](../../packages/three/src/threeGeometry.ts)

1. **Thêm phương thức `getCustomEdgeColor()` trong `ThreeGeometry`:**
   - Đối với các đối tượng không có mặt phẳng (`this._faces === undefined`, như `LineNode`, `WireNode`, `ArcNode`, `CircleNode` không mặt, `RectNode` không mặt):
     - Kiểm tra màu `color` của `this._faceMaterial`:
     - Nếu `materialId` vẫn đang là vật liệu mặc định đầu tiên (`materials.get(0)?.id`) VÀ màu vẫn là màu mặc định chưa chỉnh sửa (`Config.instance.visual.defaultFaceColor` tức `0xd3d3d3`), trả về `undefined` để đường kẻ mới vẽ hiển thị màu cạnh tương phản cao theo theme (`#eeeeee` ở Dark Mode / `#333333` ở Light Mode).
     - Ngay khi người dùng đổi màu hoặc gán vật liệu mới cho đường kẻ (khiến `materialId` khác vật liệu mặc định đầu tiên hoặc `matColor.getHex() !== Config.instance.visual.defaultFaceColor`), trả về `matColor`:
       ```ts
       private getCustomEdgeColor(): Color | undefined {
           if (this._faces !== undefined) return undefined;
           const mat = Array.isArray(this._faceMaterial) ? this._faceMaterial[0] : this._faceMaterial;
           const matColor = (mat as MeshPhysicalMaterial | undefined)?.color;
           if (!matColor?.isColor) return undefined;
           const materials = this.context.visual.document.modelManager.materials;
           const matId = Array.isArray(this.geometryNode.materialId)
               ? this.geometryNode.materialId[0]
               : this.geometryNode.materialId;
           const isUntouchedDefault =
               matId === materials.get(0)?.id &&
               matColor.getHex() === Config.instance.visual.defaultFaceColor;
           return isUntouchedDefault ? undefined : matColor;
       }
       ```
2. **Cập nhật `edgeMaterialFor(data: EdgeMeshData)` và thêm `updateEdgeMaterials()` trong `ThreeGeometry`:**
   - Trong `edgeMaterialFor(data: EdgeMeshData)`:
     - Gọi `const customColor = this.getCustomEdgeColor();`
     - Nếu `data.color === undefined && data.lineType !== LineType.Dashed && customColor === undefined`: dùng chung `edgeMaterialOfWidth(data.lineWidth)` (`ownsMaterial: false`).
     - Ngược lại: clone `edgeMaterialOfWidth(data.lineWidth)` (`ownsMaterial: true`), nếu `data.color !== undefined` thì `material.color.set(data.color)`, còn nếu `customColor !== undefined` thì `material.color.copy(customColor)`.
   - Thêm phương thức `updateEdgeMaterials()`:
     ```ts
     updateEdgeMaterials() {
         if (this._faces !== undefined || this._edgeParts.length === 0) return;
         const customColor = this.getCustomEdgeColor();
         for (const part of this._edgeParts) {
             if (customColor !== undefined) {
                 if (!part.ownsMaterial) {
                     part.material = part.material.clone();
                     part.ownsMaterial = true;
                 }
                 part.material.color.copy(customColor);
                 part.defaultMaterial = part.material;
             } else if (part.ownsMaterial && part.lineType !== LineType.Dashed) {
                 part.material.dispose();
                 part.material = edgeMaterialOfWidth(part.material.linewidth);
                 part.defaultMaterial = part.material;
                 part.ownsMaterial = false;
             }
             if (!VisualState.hasState(this._edgeState, VisualStates.edgeHighlight | VisualStates.edgeSelected)) {
                 part.mesh.material = part.material;
             }
         }
     }
     ```
   - Trong `changeFaceMaterial(material: Material | Material[])`:
     - Khi `!this._faces`, gọi `this.updateEdgeMaterials();` trước khi `return;`!

### Bước 3.2: Đồng bộ Realtime khi người dùng chọn màu trên Color Picker trong [`packages/three/src/threeVisualContext.ts`](../../packages/three/src/threeVisualContext.ts)

Trong [`ThreeVisualContext.onMaterialPropertyChanged`](../../packages/three/src/threeVisualContext.ts#L196-L207):
- Bỏ điều kiện giới hạn `&& visual.ownsFaceMaterial` để mọi `ThreeGeometry` (bao gồm cả đối tượng có mặt lẫn đối tượng chỉ có đường kẻ `!this._faces`) đang dùng `source?.id` đều được gọi `visual.changeFaceMaterial(this.getMaterial(matId))`:
  ```ts
  for (const visual of this._NodeVisualMap.values()) {
      if (visual instanceof ThreeGeometry) {
          const matId = visual.geometryNode.materialId;
          const matches =
              typeof matId === "string"
                  ? matId === source?.id
                  : Array.isArray(matId) && matId.includes(source?.id);
          if (matches) {
              visual.changeFaceMaterial(this.getMaterial(matId));
          }
      }
  }
  ```

### Bước 3.3: Hỗ trợ hiển thị và đổi Vật liệu (`Material`) khi quét chọn nhiều vật thể cùng lúc (kể cả khác loại)

#### A. Cập nhật [`packages/ui/src/property/propertyView.ts`](../../packages/ui/src/property/propertyView.ts)
1. Trong `addGeometry(nodes: INode[], document: IDocument)`:
   - Bỏ điều kiện `!this.isAllElementsOfTypeFirstElement(geometries)` ở đầu hàm để khi người dùng quét chọn nhiều đối tượng khác loại (ví dụ: `Line1` + `Rect1` + `Box1` + `Prism1`), bảng Thuộc tính vẫn hiển thị `Transform` và phần thuộc tính chung (`Material`):
     ```ts
     private addGeometry(nodes: INode[], document: IDocument) {
         const geometries = nodes.filter((x) => x instanceof VisualNode || x instanceof GroupNode);
         if (geometries.length === 0) return;
         this.addTransform(document, geometries);
         this.addParameters(geometries, document);
     }
     ```
2. Trong `addParameters(geometries: (VisualNode | GroupNode)[], document: IDocument)`:
   - Nếu tất cả `entities` cùng 1 class (`this.isAllElementsOfTypeFirstElement(entities) === true`): giữ nguyên logic hiện tại (hiển thị đầy đủ cả `materialId` lẫn các tham số hình học của class đó).
   - Nếu `entities` gồm nhiều loại đối tượng khác nhau (`!this.isAllElementsOfTypeFirstElement(entities)`):
     - Lọc các đối tượng kế thừa từ `GeometryNode`: `const geometryNodes = entities.filter((x) => x instanceof GeometryNode);`
     - Nếu `geometryNodes.length > 0`, tạo một `Expander("common.material")` (hoặc `Expander(geometryNodes[0].display())`) và render các thuộc tính chung định nghĩa trên `GeometryNode.prototype` (chính là `materialId` - Vật liệu):
       ```ts
       const geometryNodes = entities.filter((x) => x instanceof GeometryNode);
       if (geometryNodes.length === 0) return;
       const sharedProps = PropertyUtils.getProperties(GeometryNode.prototype, Node.prototype);
       if (sharedProps.length === 0) return;
       const parameters = new Expander("common.material");
       parameters.contenxtPanel.append(
           ...sharedProps.map((x) => propertyControl(document, geometryNodes, x)),
       );
       this.panel.append(parameters);
       ```
     *(Nhờ thêm `GeometryNode` vào import từ `@chili3d/core`, bất kỳ khi nào người dùng quét chọn nhiều đối tượng 2D/3D bất kỳ, mục **Vật liệu (Material)** luôn xuất hiện trên bảng Thuộc tính bên phải để đổi màu hàng loạt!).*

#### B. Cập nhật [`packages/ui/src/property/material/materialDataContent.ts`](../../packages/ui/src/property/material/materialDataContent.ts)
1. Lưu lại `materialId` ban đầu của **từng đối tượng** trong `this.targetObjects`:
   ```ts
   private readonly _initialObjectMaterialIds = new Map<GeometryNode, string | string[]>();
   ```
   Trong constructor:
   ```ts
   for (const obj of this.targetObjects) {
       this._initialObjectMaterialIds.set(
           obj,
           Array.isArray(obj.materialId) ? [...obj.materialId] : obj.materialId,
       );
   }
   ```
2. Viết hàm kiểm tra xem các đối tượng trong `targetObjects` có đang mang `materialId` khác với `editingMaterial.id` hay không:
   ```ts
   private hasMixedMaterials(materialId: string): boolean {
       return this.targetObjects.some((obj) => {
           if (typeof obj.materialId === "string") {
               return obj.materialId !== materialId;
           }
           return !obj.materialId.includes(materialId);
       });
   }
   ```
3. Trong constructor của `MaterialDataContent`:
   - Nếu `this.isMaterialSharedByOtherNodes(editingMaterial.id)` là `true`:
     - Clone `editingMaterial` thành `cloned`, thêm vào `this.document.modelManager.materials`, đặt `this._autoCreatedMaterial = cloned`, `this.setPrivateValue("editingMaterial", cloned)`, và gọi `this.callback(cloned)` để gán `cloned.id` cho **toàn bộ `this.targetObjects`**.
   - Ngược lại, nếu `this.isMaterialSharedByOtherNodes(editingMaterial.id)` là `false` **NHƯNG `this.hasMixedMaterials(editingMaterial.id)` là `true`** (tức là người dùng quét chọn nhiều vật thể đang có màu khác nhau, mà vật thể đầu tiên đã có Material riêng):
     - Đặt `this.setPrivateValue("editingMaterial", editingMaterial)` VÀ **gọi ngay `this.callback(editingMaterial)`** để đồng bộ tất cả các vật thể trong `targetObjects` về cùng `editingMaterial`! Nhờ đó, khi người dùng kéo thanh chọn màu (Color Picker), **tất cả các vật thể được quét chọn đều đổi màu đồng loạt theo thời gian thực**!
4. Trong `cancelEdit()`:
   - Khôi phục chính xác `materialId` ban đầu cho từng đối tượng trong `this._initialObjectMaterialIds`:
     ```ts
     cancelEdit() {
         if (this._initialMaterial && this.callback) {
             this.callback(this._initialMaterial);
         }
         for (const [obj, initMatId] of this._initialObjectMaterialIds.entries()) {
             obj.materialId = Array.isArray(initMatId) ? [...initMatId] : initMatId;
         }
         if (this._autoCreatedMaterial && !this.isMaterialUsedByAnyNode(this._autoCreatedMaterial.id)) {
             this.document.modelManager.materials.remove(this._autoCreatedMaterial);
         }
         this._autoCreatedMaterial = undefined;
         this.document.visual.update();
     }
     ```

#### C. Cập nhật [`packages/ui/src/property/materialProperty.ts`](../../packages/ui/src/property/materialProperty.ts)
Trong `setMaterial(e: MouseEvent, material: Material, index: number)`:
- Kiểm tra an toàn `Array.isArray(x.materialId)` trước khi gọi `.toSpliced`:
  ```ts
  private setMaterial(e: MouseEvent, material: Material, index: number) {
      Transaction.execute(this.document, "change material", () => {
          this.materials.replace(index, material);
          this.objects.forEach((x) => {
              if (this.property.name in x) {
                  x.materialId =
                      this.materials.length > 1 && Array.isArray(x.materialId)
                          ? x.materialId.toSpliced(index, 1, material.id)
                          : material.id;
              }
          });
      });
      this.document.visual.update();
  }
  ```

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria) & Kiểm thử

1. **Đổi màu đường kẻ đơn lẻ (`L` / `Line`, `Arc`, `Circle`, `Wire`):**
   - Nhấn `L` vẽ đường thẳng `Line1`, chọn `Line1`, mở mục **Vật liệu (Material)** ở bảng Thuộc tính bên phải và đổi sang màu Đỏ / Vàng:
     - Đường thẳng `Line1` lập tức đổi sang màu Đỏ / Vàng (khi bỏ chọn `Esc` hiển thị đúng màu Đỏ / Vàng vừa chọn).
2. **Quét chọn nhiều vật thể cùng loại và khác loại để đổi màu đồng loạt:**
   - Vẽ nhiều đối tượng khác nhau (ví dụ: 2 đường thẳng `Line1`, `Line2`, 1 hình chữ nhật `Rectangle1`, 1 khối hộp `Box1`, 1 tường `Prism1`).
   - Quét chuột chọn (Box-select hoặc giữ `Shift` click chọn) nhiều đối tượng cùng lúc (kể cả khi trước đó có đối tượng đã đổi màu riêng và có đối tượng chưa đổi màu):
     - Bảng Thuộc tính bên phải **luôn hiển thị mục Vật liệu (`Material`)**.
     - Khi bấm vào ô Vật liệu và chọn màu mới trên bảng màu, **TẤT CẢ các đối tượng đang được chọn (cả khối 3D, mặt phẳng 2D và đường kẻ `Line`) đều đổi sang màu mới cùng lúc theo thời gian thực**!
     - Các đối tượng KHÔNG nằm trong vùng chọn vẫn giữ nguyên màu cũ của chúng, tuyệt đối không bị ảnh hưởng.
     - Nếu bấm `Cancel` (Hủy) trên hộp thoại Vật liệu, từng đối tượng trong vùng chọn khôi phục đúng màu ban đầu của riêng nó trước khi mở hộp thoại.
3. **Unit Tests & Triển khai Production:**
   - Viết unit test trong `packages/three/test/` cho `ThreeGeometry` (đổi màu `Material` trên node chỉ có cạnh `!this._faces`).
   - Viết unit test trong `packages/ui/test/` kiểm tra:
     - `PropertyView` hiển thị `MaterialProperty` khi chọn nhiều `GeometryNode` khác class (`LineNode` + `BoxNode`).
     - `MaterialDataContent` đồng bộ `materialId` cho toàn bộ `targetObjects` khi chọn nhiều đối tượng có `materialId` khác nhau (`hasMixedMaterials`), và khôi phục đúng `materialId` từng đối tượng khi gọi `cancelEdit()`.
   - Chạy `npm run test` và `npm run build` pass 100%.
   - Cập nhật trạng thái `TASK-14` thành `[x] DONE` trong `ROADMAP.md` và `docs/tasks/TASK-14-line-wire-color-and-material-sync.md`, commit, push lên `dev` & `main` và chạy `./scripts/deploy-vps.sh` để cập nhật lên VPS `http://136.66.95.155`.
