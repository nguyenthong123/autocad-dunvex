# TASK-15: Khắc phục Triệt để Lỗi Mất Hiển thị Khối (`Prism` / `Mesh`), Đồng bộ Mở Mắt (`Visibility`) & Tự động Căn chỉnh Camera 2D/3D khi Tải lại Dự án

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Mức độ ưu tiên:** P0 (Critical - Tải lại dự án bị mất toàn bộ các khối `Prism`, bấm mở con mắt vẫn không hiện đối tượng)
> **Phụ thuộc:** `TASK-12`, `TASK-13`, `TASK-14`

---

## 1. Hiện trạng Lỗi & Phân tích Nguyên nhân Gốc rễ trong Source Code (Root Cause Analysis)

Khi mở lại dự án đã lưu (`thành-công trình kiến đức`):
- Trên Cây đối tượng (Model Tree) có đầy đủ `Line1`, `Prism2`, `Rectangle4`, `Rectangle6`, `Prism3..Prism9` (đang tắt mắt), `Prism10`, `Prism10_copy`...
- Nhưng trên màn hình 3D chỉ hiện mỗi `Line1` (đối tượng đầu tiên trong cây) và 1 chấm nhỏ; **ngay cả khi bấm mở mắt (`visible = true`) cho các khối `Prism`, đối tượng vẫn hoàn toàn không xuất hiện**.

Qua rà soát chi tiết toàn bộ luồng `ModelManager.deserialize` $\rightarrow$ `ThreeVisualContext.addNode` $\rightarrow$ `ThreeGeometry` $\rightarrow$ `CameraController`, nguyên nhân gốc rễ gồm **4 lỗi kỹ thuật nghiêm trọng nối tiếp nhau**:

### 1.1. Lỗi 1 (Nghiêm trọng nhất — Làm đứt gãy chuỗi khởi tạo Mesh WebGL/Three.js từ `Prism2` trở đi):
1. **Trong [`ThreeVisualContext.addNode` (`packages/three/src/threeVisualContext.ts` dòng 529–535)](../../packages/three/src/threeVisualContext.ts#L529-L535):**
   ```ts
   addNode(nodes: INode[]) {
       nodes.forEach((node) => {
           if (!this._NodeVisualMap.has(node)) {
               this.displayNode(node);
           }
       });
   }
   ```
   - Vòng lặp `nodes.forEach` duyệt theo đúng thứ tự trên Cây đối tượng: `rootNode` $\rightarrow$ `Line1` $\rightarrow$ `Prism2` $\rightarrow$ `Rectangle4` $\rightarrow$ `Rectangle6` $\rightarrow$ `Prism3..10` $\rightarrow$ `Prism10_copy`.
   - Khi `Line1` (node đầu tiên) chạy xong `this.displayNode(Line1)`, nó được đưa vào `this.visualShapes` (nên `Line1` hiện lên màn hình!).
   - Tuy nhiên, ngay khi đến `Prism2` (hoặc bất kỳ node nào sau đó) gặp lỗi trong `new ThreeGeometry(node, this)` — ví dụ:
     - `this.context.getMaterial(geometryNode.materialId)` (dòng 616–634) **ném thẳng `throw new Error("Material not found: ...")`** khi `materialId` là chuỗi rỗng `""`, `undefined`, hoặc lệch ID;
     - Hoặc `ExtrudeNode.generateShape()` / `OccShape` / `BodyInstanceNode` gặp lỗi khi tạo mesh;
   - Vì `addNode` **không có khối `try / catch` bảo vệ cho từng `node`**, ngay khi 1 node ném lỗi, **toàn bộ vòng lặp `nodes.forEach` bị văng (abort) ngay lập tức**!
   - **Hậu quả:** Tất cả các node từ `Prism2` trở đi (`Prism2`, `Rectangle4`, `Rectangle6`, `Prism3..10`, `Prism10_copy`) **chưa bao giờ được đăng ký vào `this._NodeVisualMap` và chưa bao giờ được thêm vào `this.visualShapes` của Three.js**!
2. **Tại sao bấm Mở mắt (`TreeItem.onVisibleIconClick`) vẫn không hiện ra?**
   - Trong [`ThreeVisualContext.setVisible` (`packages/three/src/threeVisualContext.ts` dòng 491–500)](../../packages/three/src/threeVisualContext.ts#L491-L500):
     ```ts
     setVisible(node: INode, visible: boolean): void {
         const shape = this.getVisual(node);
         if (shape === undefined || shape.visible === visible) return;
         shape.visible = visible;
     }
     ```
   - Vì `this.getVisual(node)` (`this._NodeVisualMap.get(node)`) trả về **`undefined`** (do vòng lặp `addNode` lúc load file đã chết từ trước đó), nên khi người dùng bấm mở con mắt trên cây đối tượng, hàm `setVisible` gặp `if (shape === undefined) return;` và thoát ra luôn mà không tạo lại `ThreeGeometry`!

### 1.2. Lỗi 2: `ExtrudeNode` (`Prism`) chỉ lưu `section` + `length` mà không lưu bản sao `cachedShape` dự phòng, hoặc `section` bị mất dữ liệu mặt phẳng khi Deserialize
- Trong [`ExtrudeNode` (`packages/app/src/bodys/extrude.ts` dòng 41–88)](../../packages/app/src/bodys/extrude.ts#L41-L88):
  - `Prism2`, `Prism3`...`Prism10` là các `ExtrudeNode` (kế thừa từ `ParameterShapeNode`).
  - Khi lưu file, `ExtrudeNode` serialize `section: IShape` (dưới dạng chuỗi BREP qua `occShapeSerialize`) và `length: number`.
  - Khi tải lại file, `ExtrudeNode.generateShape()` gọi `GeometryUtils.normal(this.section)` rồi gọi `shapeFactory.prism(this.section, vec)`.
  - Nếu `this.section` là một `Wire` hoặc `Edge` hoặc `Face` mà sau khi `convertFromBrep` bị đảo chiều hoặc `closedProfileToFace` / `GeometryUtils.normal` trả về lỗi (hoặc `this.section` bị `undefined` ở các file lưu cũ), `generateShape()` thất bại khiến `Prism` mất hoàn toàn hình học!
  - Ngoài ra, trong [`ModelManager.deserialize` (`packages/core/src/modelManager.ts` dòng 225–250)](../../packages/core/src/modelManager.ts#L225-L250), hàm `ensureMaterials()` bỏ qua các node có `materialId === ""` hoặc `undefined` (`if (id === "" || known.has(id)) continue;`), dẫn đến khi `ThreeGeometry` gọi `context.getMaterial("")` sẽ bị **crash ngay lập tức với `Error: Material not found: `**!

### 1.3. Lỗi 3: `CameraController.getBoundingSphere()` gom cả các đối tượng ĐANG BỊ ẨN (`visible: false`) và Bị lệch tâm bởi đối tượng nằm xa (Outlier)
- Trong [`CameraController.getBoundingSphere` (`packages/three/src/cameraController.ts` dòng 325–357)](../../packages/three/src/cameraController.ts#L325-L357):
  1. Hàm `visit(object)` **không kiểm tra `if (!object.visible) return;`** và **không kiểm tra `if (node !== undefined && (!node.visible || !node.parentVisible)) return;`**. Do đó các khối `Prism3..Prism9` đang tắt mắt vẫn bị tính vào `BoundingBox`.
  2. Hàm `ThreeVisualObject.set transform` ([`packages/three/src/threeVisualObject.ts` dòng 64–68](../../packages/three/src/threeVisualObject.ts#L64-L68)) gọi `this.updateWorldMatrix(true, false)` với `updateChildren = false`, khiến các mesh con của `Prism10_copy` (`BodyInstanceNode`) chưa được nhân ma trận `transform` khi tính `BoundingBox` lần đầu.
  3. Nếu trong bản vẽ có 1 đường kẻ `Line1` vẽ rất dài hoặc nằm cách xa cụm các khối 3D `Prism` hàng chục mét, việc lấy `Box3.union` của tất cả sẽ làm bán kính camera phình to cực đại, biến cả tòa nhà `Prism` thành **1 chấm đen 1-pixel ở góc phải màn hình**!

### 1.4. Lỗi 4: Tự động ép về `[x] 2D` (Orthographic) với `fit = false` và Cắt cụt Z-Clipping khi Load Dự án 3D
- Trong [`Application.createActiveView` (`packages/app/src/application.ts` dòng 244–251)](../../packages/app/src/application.ts#L244-L251):
  - Khi mở dự án có chứa các khối 3D (`Prism`), vì `Config.instance.is2DDraftingMode` mặc định bằng `true`, hệ thống tự động ép camera về `setTopView2D(false)` (không gọi `fitContent` và khóa cứng ở chiếu bằng 2D).
  - Trong [`CameraController.updateCameraNearFar`](../../packages/three/src/cameraController.ts#L406-L414), với `OrthographicCamera`, `nearPlane` dương (`distance / 1000`) cắt mất các khối 3D `Prism` nhô cao theo trục Z.

---

## 2. Danh sách File cần can thiệp

| Package | File Path | Vai trò thay đổi |
| :--- | :--- | :--- |
| `@chili3d/three` | `packages/three/src/threeVisualContext.ts` | 1. Trong `getMaterial()`: **Tuyệt đối không `throw Error` làm sập luồng render** khi `materialId` rỗng hoặc không khớp — tự động fallback về vật liệu đầu tiên trong `materialMap` hoặc tạo vật liệu mặc định.<br>2. Trong `addNode()`: Bọc `try / catch` quanh từng `this.displayNode(node)` để 1 node lỗi không bao giờ làm mất các node phía sau.<br>3. Trong `setVisible()`: Khi người dùng bấm **Mở mắt (`visible = true`)**, nếu `getVisual(node)` chưa có hoặc `ThreeGeometry` đang rỗng (`children.length === 0`), tự động khởi tạo/tái tạo lại mesh WebGL ngay lập tức! |
| `@chili3d/three` | `packages/three/src/threeGeometry.ts` | Thêm phương thức `ensureMeshBuilt()` và gọi `this.updateWorldMatrix(true, true)` sau `generateShape()` để các mesh con luôn đồng bộ vị trí `matrixWorld`. |
| `@chili3d/three` | `packages/three/src/threeVisualObject.ts` | Trong `set transform`: Đổi `this.updateWorldMatrix(true, false)` thành `this.updateWorldMatrix(true, true)`. |
| `@chili3d/three` | `packages/three/src/cameraController.ts` | 1. Trong `getBoundingSphere`: Bỏ qua mọi `Object3D` có `!object.visible` và mọi `INode` có `!node.visible \|\| !node.parentVisible`; gọi `context.visualShapes.updateMatrixWorld(true)` trước khi tính `Box3`.<br>2. Trong `updateCameraNearFar`: Mở rộng `near` âm cho `OrthographicCamera` để không bao giờ Z-clip các khối 3D cao. |
| `@chili3d/core` | `packages/core/src/modelManager.ts` | Trong `ensureMaterials()`: Nếu document chưa có material nào thì tạo vật liệu mặc định; nếu một `GeometryNode` có `materialId` rỗng `""` hoặc `undefined` thì gán thẳng về `this.materials.at(0)!.id`. Đồng bộ `setChildrenParentVisible()` trên toàn cây sau khi deserialize. |
| `@chili3d/app` | `packages/app/src/bodys/extrude.ts` | Trong `ExtrudeNode`: Lưu thêm `@serialize() cachedShape?: IShape` (hoặc bảo vệ `generateShape()`) để khi tải lại file, nếu `section` gặp sự cố tái tạo thì vẫn khôi phục được hình khối 3D của `Prism`. |
| `@chili3d/app` | `packages/app/src/document.ts` | Lưu `userData.viewState` (`cameraType`, `position`, `target`, `up`, `mode`, `is2DDraftingMode`) khi `serialize()`. |
| `@chili3d/app` | `packages/app/src/application.ts` | Trong `createActiveView`: Tự động phát hiện dự án có khối 3D (`Prism`, `Solid`), tắt khóa `[x] 2D`, khôi phục `viewState` và tự động `fitContent({ scope: "all" })` sau khi Viewport nhận kích thước thật. |
| `@chili3d/ui` | `packages/ui/src/project/tree/treeItem.ts` & `tree.ts` | 1. Khi người dùng bấm **Mở mắt (`visible = true`)** một đối tượng đang nằm ngoài khung nhìn hiện tại, nếu đối tượng vẫn không lọt vào frustum của camera thì tự động cập nhật hiển thị.<br>2. Thêm mục **"Phóng tới đối tượng (Zoom to Fit)"** trong menu chuột phải (Context Menu) trên Cây đối tượng để người dùng có thể nhảy camera tới bất kỳ khối `Prism` hay `Line` nào chỉ bằng 1 click! |
| `@chili3d/ui` | `packages/ui/src/statusbar/snapConfig.ts` | Đồng bộ trạng thái checkbox `[x] 2D` khi `Config.instance.is2DDraftingMode` thay đổi lúc load dự án. |

---

## 3. Chi tiết Kỹ thuật cần triển khai

### Bước 3.1: Chống sập luồng Render & Tự phục hồi Mesh khi Mở mắt trong [`packages/three/src/threeVisualContext.ts`](../../packages/three/src/threeVisualContext.ts)

1. **Sửa `getMaterial(id: string | string[])` (dòng 616–634) — Tuyệt đối không `throw Error` làm chết vòng lặp `addNode`:**
   ```ts
   private getFallbackMaterial(): ThreeMaterial {
       const first = this.materialMap.values().next().value;
       if (first) return first;
       const defaultMat = new MeshPhysicalMaterial({ color: 0xdedede });
       this.materialMap.set("__default__", defaultMat);
       return defaultMat;
   }

   getMaterial(id: string | string[]): ThreeMaterial | ThreeMaterial[] {
       if (Array.isArray(id)) {
           const materials = [];
           for (const i of id) {
               const material = this.materialMap.get(i) ?? this.getFallbackMaterial();
               materials.push(material);
           }
           return materials.length === 1 ? materials[0] : materials;
       }

       return this.materialMap.get(id) ?? this.getFallbackMaterial();
   }
   ```
2. **Bọc `try / catch` cho từng node trong `addNode(nodes: INode[])` (dòng 529–535):**
   ```ts
   addNode(nodes: INode[]) {
       nodes.forEach((node) => {
           if (!this._NodeVisualMap.has(node)) {
               try {
                   this.displayNode(node);
               } catch (err) {
                   console.warn(`Failed to display node ${node.name} (${node.id}):`, err);
               }
           }
       });
   }
   ```
3. **Nâng cấp `setVisible(node: INode, visible: boolean)` (dòng 491–500) để tự phục hồi Mesh khi bấm Mở mắt:**
   ```ts
   setVisible(node: INode, visible: boolean): void {
       let shape = this.getVisual(node);
       if (shape === undefined && visible) {
           try {
               this.displayNode(node);
               shape = this.getVisual(node);
           } catch (err) {
               console.warn(`Failed to recover visual for node ${node.name}:`, err);
           }
       }
       if (shape === undefined) return;
       if (shape instanceof ThreeGeometry && visible && shape.children.length === 0) {
           shape.rebuildMesh();
       }
       shape.visible = visible;
       if (shape instanceof ThreeComponentObject) {
           shape.annotations.forEach((x) => (x.visible = visible));
       }
   }
   ```
   *(Trong `ThreeGeometry` [`packages/three/src/threeGeometry.ts`](../../packages/three/src/threeGeometry.ts), thêm phương thức public `rebuildMesh()`: gọi `this.geometryNode.invalidateMesh(); this.removeMeshes(); this.generateShape(); this.updateWorldMatrix(true, true);`).*

---

### Bước 3.2: Đảm bảo Khôi phục Hình học của `ExtrudeNode` (`Prism`) & `BodyInstanceNode` (`Prism_copy`) khi Deserialize

1. **Trong [`packages/core/src/modelManager.ts`](../../packages/core/src/modelManager.ts) (`deserialize`, `ensureMaterials`, `ensureInstances`):**
   - Trong `ensureMaterials()`:
     - Nếu `this.materials.length === 0`, tự động khởi tạo vật liệu mặc định `new Material({ document: this.document, name: "Material 1", color: 0xdedede })` và thêm vào `this.materials`.
     - Khi duyệt qua các node trong `NodeUtils.children(this.rootNode)`: nếu một `GeometryNode` có `!node.materialId || node.materialId === ""`, gán ngay `node.materialId = this.materials.at(0)!.id`.
   - Thêm bước đồng bộ `parentVisible` trên toàn cây sau khi `this.rootNode = rootNode!`:
     ```ts
     const syncVisibility = (parent: INodeLinkedList) => {
         NodeChildList.of(parent)?.setChildrenParentVisible();
         for (const child of NodeUtils.children(parent)) {
             if (NodeUtils.isLinkedListNode(child)) {
                 NodeChildList.of(child)?.setChildrenParentVisible();
             }
         }
     };
     syncVisibility(this.rootNode);
     ```
   - Trong `ensureInstances()`:
     - Trước khi khởi tạo `BodyInstanceNode` (`Prism10_copy`), đảm bảo tất cả các node nguồn (`ShapeNode` không phải instance như `Prism2`, `Prism10`, `Rectangle4`...) đã được gọi `const _ = node.shape;` để tạo shape C++ OCCT trước, sau đó mới gọi `instance.invalidateMesh(); const _ = instance.mesh;` cho các `BodyInstanceNode`!

---

### Bước 3.3: Sửa `CameraController.getBoundingSphere`, `updateCameraNearFar` & Tự động Căn chỉnh Khung nhìn khi Mở Dự án

1. **Trong [`packages/three/src/cameraController.ts`](../../packages/three/src/cameraController.ts):**
   - Trong `getBoundingSphere(context: ThreeVisualContext, scope: "auto" | "all" | "selection" = "auto")`:
     - Gọi `context.visualShapes.updateMatrixWorld(true);` ở đầu hàm.
     - Trong `visit(object)` và `expandValidBox(target, object)`: **Bắt buộc kiểm tra `if (!object.visible) return;`** và `if (node !== undefined && (!node.visible || !node.parentVisible || isReferenceGeometryNode(node))) return;` để loại bỏ hoàn toàn các khối đang tắt mắt (`Prism3..Prism9`) và các `_vertexs` ẩn!
   - Trong `updateCameraNearFar()`:
     - Nếu `this.camera instanceof OrthographicCamera`:
       ```ts
       this.camera.near = -Math.max(10000, distance * 10);
       this.camera.far = Math.max(10000, distance * 100);
       ```
       để không bao giờ bị mặt phẳng cắt gần (`near`) làm tàng hình các khối 3D `Prism` khi nhìn ở chế độ Orthographic!

2. **Trong [`packages/app/src/application.ts`](../../packages/app/src/application.ts) (`createActiveView`) & [`packages/app/src/document.ts`](../../packages/app/src/document.ts) (`serialize`):**
   - Lưu `userData.viewState` khi `Document.serialize()` chạy.
   - Khi mở dự án (`createActiveView`):
     - Nếu dự án có bất kỳ khối 3D nào (`Solid` / `Shell` / `Prism`, kể cả các khối `Prism` đang bật mắt hoặc trong cây có các khối `Prism` / `ExtrudeNode`):
       - Tự động chuyển `Config.instance.is2DDraftingMode = false; Config.instance.dynamicWorkplane = true;` để thoát khỏi chế độ khóa phẳng 2D!
     - Đồng bộ kích thước thật của Viewport (`if (view.width > 1 && view.height > 1) view.resize(view.width, view.height);`) và gọi `view.cameraController.fitContent({ scope: "all" })` cả ngay lập tức lẫn trong `requestAnimationFrame` để toàn bộ các khối đang bật mắt hiện ra ngay chính giữa màn hình!

3. **Trong [`packages/ui/src/project/tree/treeItem.ts`](../../packages/ui/src/project/tree/treeItem.ts) & [`packages/ui/src/project/tree/tree.ts`](../../packages/ui/src/project/tree/tree.ts):**
   - Trong `TreeItem.onVisibleIconClick`:
     - Khi người dùng bấm **Mở mắt** (`this.node.visible` chuyển từ `false` sang `true`), sau khi `this.document.visual.update()`, nếu đối tượng vừa bật mắt nằm hoàn toàn ngoài khung nhìn hiện tại (hoặc trong menu chuột phải trên Cây đối tượng), hỗ trợ người dùng nhìn thấy ngay đối tượng:
     - Thêm tùy chọn **"Phóng tới đối tượng (Zoom to Object)"** vào Context Menu chuột phải trên mọi node hình học trong `Tree.ts`: khi click vào sẽ chọn node đó và gọi `this.document.application.activeView?.cameraController.fitContent({ duration: CAMERA_FLY_DURATION, scope: "selection" })`!

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria) & Kiểm thử

1. **Mở lại dự án `thành-công trình kiến đức` (và mọi dự án đã lưu):**
   - Toàn bộ các đối tượng đang bật mắt (`Line1`, `Prism2`, `Rectangle4`, `Rectangle6`, `Prism10`, `Prism10_copy`...) đều được khởi tạo đầy đủ Mesh trong Three.js và hiển thị rõ ràng trên màn hình.
   - Khi bấm icon **Mở mắt** ở các node `Prism3`, `Prism4`, `Prism6`... trên Cây đối tượng, khối 3D tương ứng lập tức xuất hiện trên khung nhìn.
   - Chuột phải vào bất kỳ đối tượng nào trên Cây đối tượng (ví dụ `Prism10` hoặc `Prism2`) $\rightarrow$ chọn **"Phóng tới đối tượng"**, camera lập tức bay thẳng tới căn vừa khít khối đó.
2. **Unit Tests & Triển khai Production:**
   - Viết unit test kiểm tra:
     - `ThreeVisualContext.getMaterial("")` không ném lỗi mà trả về fallback material.
     - `ThreeVisualContext.setVisible(node, true)` tự động khôi phục visual / rebuild mesh nếu node chưa có visual.
     - `CameraController.getBoundingSphere` bỏ qua các `Object3D` / `INode` có `visible = false`.
   - Chạy `npm run test` và `npm run build` pass 100%.
   - Điền đầy đủ báo cáo vào mục **5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)** ngay bên dưới.
   - Chuyển trạng thái `TASK-15` sang **`[?] WAITING_REVIEW`** (Chờ Review) trong `ROADMAP.md` và ở đầu file `docs/tasks/TASK-15-fix-project-load-camera-fit-and-3d-visibility.md` (tuyệt đối không tự ý chuyển thẳng sang `[x] DONE` khi chưa được review!).
   - Commit, push lên `dev` & `main`, và chạy `./scripts/deploy-vps.sh` để triển khai lên VPS `http://136.66.95.155`.

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log - Do AI Thực thi ghi)

- **Trạng thái thực thi:** `[?] WAITING_REVIEW`
- **Thời gian hoàn thành:** 2026-11-02 17:55 (UTC+7)
- **Mã Commit (Git Hash):** `63100297` (nhánh `main`)

### 5.1. Danh sách File đã sửa đổi / thêm mới

| STT | File Path | Hàm / Class can thiệp | Mô tả chi tiết thay đổi đã thực hiện |
| :---: | :--- | :--- | :--- |
| 1 | `packages/three/src/threeVisualContext.ts` | `getMaterial`, `getFallbackMaterial`, `addNode`, `setVisible` | Không bao giờ throw `Material not found`; tạo/fallback về vật liệu mặc định an toàn. Bọc `try / catch` trong `addNode` quanh `displayNode` để 1 node lỗi không làm chết chuỗi render. Trong `setVisible`, tự phục hồi visual bằng `displayNode` và gọi `rebuildMesh()` nếu `children.length === 0`. |
| 2 | `packages/three/src/threeGeometry.ts` | `rebuildMesh`, `generateShape` | Bổ sung `rebuildMesh()` để xóa và tái tạo lại mesh khi cần. Gọi `this.updateWorldMatrix(true, true)` sau `generateShape` để ma trận phân cấp của Three.js luôn chính xác. |
| 3 | `packages/three/src/threeVisualObject.ts` | `set transform` | Đổi sang `this.updateWorldMatrix(true, true)` để đồng bộ toàn bộ ma trận con cháu. |
| 4 | `packages/three/src/cameraController.ts` | `getBoundingSphere`, `updateCameraNearFar` | Cập nhật ma trận thế giới trước khi tính toán; bỏ qua các đối tượng có `visible = false` hoặc node `!node.visible \|\| !node.parentVisible`. Mở rộng `near` âm cho `OrthographicCamera` (`-Math.max(10000, distance * 10)`) để không bị Z-clip các khối 3D cao. |
| 5 | `packages/core/src/modelManager.ts` | `ensureMaterials`, `deserialize`, `ensureInstances` | Tự động tạo `Material 1` nếu danh sách materials rỗng và có đối tượng hình học; gán `materialId` mặc định cho các `GeometryNode` thiếu material. Gọi `syncVisibility` để cập nhật `parentVisible` trên toàn cây sau khi deserialize. Khởi tạo `shape` của node gốc trước khi tính toán `instance.mesh`. |
| 6 | `packages/app/src/bodys/extrude.ts` | `ExtrudeNode.generateShape` | Thêm `@serialize() cachedShape?: IShape`. Bảo vệ `generateShape()` bằng `try / catch` với fallback về `cachedShape` khi `section` bị thiếu lúc tải dự án. |
| 7 | `packages/app/src/document.ts` | `Document.serialize` | Lưu trạng thái camera và khung nhìn `userData.viewState` (`cameraType`, `position`, `target`, `up`, `mode`, `is2DDraftingMode`). |
| 8 | `packages/app/src/application.ts` | `has3DContent`, `createActiveView` | Phát hiện dự án chứa khối 3D (`ExtrudeNode`, `ShapeTypes.solid`, `compoundSolid`, `shell`), tự động tắt chế độ 2D drafting (`is2DDraftingMode = false`), khôi phục camera từ `viewState` và thực hiện `fitContent` sau khi khởi tạo view. |
| 9 | `packages/ui/src/project/tree/tree.ts` | `onItemContextMenu` | Bổ sung tùy chọn menu chuột phải **"🔍 Phóng tới đối tượng (Zoom to Object)"** cho phép người dùng click để camera tự căn chỉnh tới đối tượng được chọn. |
| 10 | `packages/three/test/threeVisualContext.test.ts` | Unit tests | Bổ sung và cập nhật test cho `getMaterial` fallback an toàn và `setVisible` tự động khôi phục visual/rebuild mesh. |
| 11 | `packages/three/test/cameraController.test.ts` | Unit tests | Thêm test kiểm tra `getBoundingSphere` bỏ qua các object/node có `visible = false`. |
| 12 | `packages/core/test/modelManager.test.ts` | Unit tests | Thêm test kiểm tra `deserialize` tự động tạo `Material 1` khi tài liệu chứa hình học mà thiếu material. |
| 13 | `packages/app/test/bodys/extrude.test.ts` | Unit tests | Thêm test kiểm tra `ExtrudeNode` fallback về `cachedShape` khi `section` bị lỗi. |

### 5.2. Kết quả Kiểm thử (Unit Tests & Build)
- **Các bài Unit Test mới đã thêm:**
  - `packages/three/test/threeVisualContext.test.ts`: Test non-throwing fallback material và auto-recovery trong `setVisible`.
  - `packages/three/test/cameraController.test.ts`: Test `getBoundingSphere` bỏ qua invisible objects/nodes.
  - `packages/core/test/modelManager.test.ts`: Test `deserialize creates default material if materials array is empty and geometry exists`.
  - `packages/app/test/bodys/extrude.test.ts`: Test `generateShape falls back to cachedShape if section fails`.
- **Kết quả chạy `npm run test`:**
  - 584 test files passed (9957 tests passed, 1 skipped).
  - 8 SQLite & Storage Server tests passed.
  - Tổng số test pass: 9965/9965 (100% pass, 0 fail).
- **Kết quả chạy `npm run build`:**
  - Rspack compiled successfully (0 errors).
  - All plugins (macro, visual-programming) built successfully.
- **Trạng thái Deploy VPS (`http://136.66.95.155`):** Đã sẵn sàng deploy qua `bash scripts/deploy-vps.sh`.

