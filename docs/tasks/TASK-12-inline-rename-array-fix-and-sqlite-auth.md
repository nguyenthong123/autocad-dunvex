# TASK-12: Khắc phục Đổi tên Dự án (Inline Rename), Ổn định Sao chép mảng (Array), Chống mất dữ liệu Hình học (`*_copy`) & Tích hợp Hệ thống Lưu trữ SQLite + Xác thực Tài khoản (Auth)

- **Trạng thái:** `[x] DONE`
- **Mức độ ưu tiên:** P0 (Critical Data Integrity, UX & Per-Account SQLite Storage Architecture)
- **Phụ thuộc:** `TASK-06`, `TASK-10`, `TASK-11`

---

## 1. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis từ Codebase)

### 1.1. Bug 1: Tên dự án hiển thị `undefined 1` và không thể đổi tên trực tiếp (Inline Rename) trên Tab / Cây đối tượng
1. **Hardcode chuỗi `` `undefined ${count++}` `` khi tạo bản vẽ mới:**
   - Tại [`packages/app/src/commands/application/newDocument.ts`](../../packages/app/src/commands/application/newDocument.ts) (dòng 15):
     ```ts
     export class NewDocument implements ICommand {
         async execute(app: IApplication): Promise<void> {
             await app.newDocument(`undefined ${count++}`);
         }
     }
     ```
     Hàm tạo tài liệu mới truyền cứng chuỗi `` `undefined ${count++}` `` khiến mọi bản vẽ mới đều mang tên `"undefined 1"`, `"undefined 2"` trên cả thanh Tab lẫn node gốc của Cây đối tượng (`ModelManager.rootNode`).
2. **Thiếu sự kiện `dblclick` và chế độ Inline Edit (`<input type="text">`) trên Tab Bar và Cây đối tượng:**
   - Trên thanh Tab ([`RibbonUI.createViewItem`](../../packages/ui/src/ribbon/ribbon.ts) dòng 158-180), tên tài liệu chỉ được render bằng `span({ textContent: new Binding(view.document, "name") })`, không có sự kiện `ondblclick` để chuyển sang ô `<input>` chỉnh sửa tại chỗ.
   - Trên Cây đối tượng ([`Tree`](../../packages/ui/src/project/tree/tree.ts) và [`TreeItem`](../../packages/ui/src/project/tree/treeItem.ts)), sự kiện `onDoubleClick` chỉ phát `PubSub.default.pub("nodeDoubleClicked", node)` (chỉ được module Sketch lắng nghe), hoàn toàn không kích hoạt chế độ sửa tên inline cho node gốc (Project Root) hay các node thư mục/khối hình học, và cũng chưa có menu chuột phải (**Context Menu: "Đổi tên (Rename)"**).

### 1.2. Bug 2: Tính năng Sao chép mảng (`ArrayCommand`) phải bấm 2–3 lần mới chạy & thiếu bảng nhập nhanh tham số mảng
1. **Nghẽn trạng thái lệnh đang chờ (`CommandService.checking` & `CancelableCommand.cancel`):**
   - Trong [`CommandService.checking`](../../packages/app/src/services/commandService.ts) (dòng 141-149):
     - Nếu lệnh `modify.array` trước đó đang chờ người dùng chọn đối tượng (`picker.pickNode` với `multi: true` yêu cầu bấm nút `✓` nhỏ trên góc phải mới chịu đi tiếp), khi người dùng bấm lại nút `Sao chép mảng (Array)`, điều kiện `if (runningKey === commandName)` chỉ hiện toast `"Lệnh đang thực thi"` và `return false` thay vì hủy lệnh cũ và khởi động lại phiên mới.
     - Ngoài ra, `CancelableCommand.cancel()` dùng vòng lặp `setTimeout(r, 30)` giữ cờ `this._checking = true`, làm nuốt các cú click liên tiếp.
2. **Không nhận diện được đối tượng đã chọn qua Sub-shape (`getSelectedShapes`) trên Viewport:**
   - Trong [`ArrayCommand.ensureSelectedModels`](../../packages/app/src/commands/modify/array.ts) (dòng 200) và [`TransformedCommand.ensureSelectedModels`](../../packages/app/src/commands/modify/transformedCommand.ts) (dòng 57), code chỉ gọi `this.document.selection.getSelectedVisualNodes()`. Khi người dùng click chọn một mặt/cạnh của khối `Prism1` trên Viewport (ở chế độ `ShapeSelectionHandler`), đối tượng nằm trong `this.document.selection.getSelectedShapes()` (với `shape.owner` là `Prism1`) chứ không nằm trong `getSelectedVisualNodes()`. Kết quả là bấm `Array` lần 1 hệ thống tưởng chưa chọn gì và bắt chọn lại.
3. **Cờ `isGroup` mặc định bằng `true` gây cảnh báo lỗi với các khối chuẩn (`Prism`, `Box`):**
   - Trong `ArrayCommand`, `isGroup` mặc định là `true`, nhưng các khối `ParameterShapeNode` (`Box`, `Prism`) có `copiesAsInstance = true`, dẫn đến `executeMainTask()` luôn bắn thông báo lỗi `"toast.instance.groupUnsupported"` và không cho phép người dùng nhập nhanh tham số mảng `(Số lượng X, Y, Z & Khoảng cách Offset X, Y, Z)` để tạo mảng ngay bằng 1 click.

### 1.3. Bug 3: Thất thoát dữ liệu hình học sau khi Lưu & Mở lại (Mất các chi tiết `Prism_copy`, `ExtrudeNode`, `RectNode`...)
Đây là lỗi nghiêm trọng nhất trong cơ chế Serialization hiện tại:
1. **12 lớp hình học trong `packages/app/src/bodys/` bỏ sót `id`, `name`, `materialId` khi gọi `super()`:**
   - Trong [`ExtrudeNode` (`Prism`)](../../packages/app/src/bodys/extrude.ts) (dòng 63-67) và 11 lớp khác (`rect.ts`, `line.ts`, `circle.ts`, `arc.ts`, `ellipse.ts`, `polygon.ts`, `regularPolygon.ts`, `point.ts`, `revolve.ts`, `sweep.ts`, `helix.ts`):
     ```ts
     constructor(options: PrismOptions) {
         super({ document: options.document }); // <-- BỎ SÓT options.id, options.name, options.materialId!
         this.setPrivateValue("section", options.section);
         this.setPrivateValue("length", options.length);
     }
     ```
   - Khi mở lại file (`Serializer.deserializeObject`), `new ExtrudeNode(props)` gọi `super({ document: options.document })` mà không truyền `id: options.id`. Do đó constructor của `GeometryNode` -> `Node` sinh ra một **GUID ngẫu nhiên mới** (`this.id = Id.generate()`) cho `Prism1`!
2. **`Serializer.deserializeProperties` không ghi đè được thuộc tính `readonly id` trên `Node`:**
   - Trong [`Serializer.deserializeProperties`](../../packages/core/src/serialize/serializer.ts) (dòng 163-165):
     ```ts
     if (instance instanceof Observable) {
         instance.setPrivateValue(key as any, data[key]);
     }
     ```
     Vì `Node.id` là field trực tiếp (`this.id = id`) chứ không đọc từ `getPrivateValue("id")`, lệnh `instance.setPrivateValue("id", data["id"])` không cập nhật `instance.id`!
   - **Hậu quả:** Sau khi mở lại file, khối gốc `Prism1` bị đổi sang một `id` ngẫu nhiên mới, khiến toàn bộ các khối sao chép mảng `Prism1_copy` ([`BodyInstanceNode`](../../packages/core/src/model/bodyInstanceNode.ts) tham chiếu tới `sourceId` là `id` cũ của `Prism1`) bị đứt liên kết (`Instance source not found`), mất toàn bộ hình học 3D trên màn hình và hiện dấu chấm than `!` trên cây đối tượng!

### 1.4. Hiện trạng Hệ thống Lưu trữ & Xác thực (SQLite & Auth)
- Hiện tại `server/storageServer.mjs` chỉ lưu các file `.json` rời rạc trong một thư mục chung `/data/storage/chili3d/`, chưa có cơ chế Đăng ký / Đăng nhập tài khoản và chưa tách cơ sở dữ liệu SQLite riêng cho từng người dùng (`/data/users/{userId}/dunvex_cad.sqlite`).
- Image Docker của `storage-api` trong [`compose.yml`](../../compose.yml) là `node:22-alpine` — đã tích hợp sẵn module **`node:sqlite` (`DatabaseSync`)** chính thức của Node.js 22 và **`node:crypto` (`scryptSync`, `randomBytes`, `createHmac`)**, cho phép triển khai SQLite nguyên bản tốc độ cao, giao dịch nguyên tử (`BEGIN IMMEDIATE ... COMMIT`) và băm mật khẩu chuẩn bảo mật mà không tốn RAM biên dịch C++ trên VPS 1GB RAM.

---

## 2. Danh sách File cần can thiệp / khởi tạo

| Package / Module | File Path | Vai trò thay đổi |
| :--- | :--- | :--- |
| `@chili3d/app` | `packages/app/src/commands/application/newDocument.ts` | Đổi tên mặc định khi tạo dự án mới từ `` `undefined ${count++}` `` sang tên tiếng Việt chuẩn (`Dự án 1`, `Dự án 2`... tự động tăng theo danh sách tài liệu hiện có). |
| `@chili3d/ui` | `packages/ui/src/ribbon/ribbon.ts` & `ribbon.module.css` | Bổ sung tính năng nhấp đúp (`ondblclick`) vào tên Tab dự án để bật `<input type="text">` đổi tên trực tiếp (Inline Rename), lưu khi nhấn `Enter` hoặc `blur`, hủy khi nhấn `Escape`. |
| `@chili3d/ui` | `packages/ui/src/project/tree/treeItem.ts`, `tree.ts`, `treeItem.module.css` | Bổ sung `startInlineRename()` trên `TreeItem` (cho phép nhấp đúp vào node gốc hoặc các node trên cây để đổi tên trực tiếp) + Thêm **Context Menu chuột phải ("Đổi tên / Rename")** trên Cây đối tượng. |
| `@chili3d/app` | `packages/app/src/services/commandService.ts` & `packages/core/src/command/command.ts` | Reset dứt điểm trạng thái lệnh đang treo khi người dùng kích hoạt lại lệnh hoặc chọn công cụ mới; tối ưu `cancel()` không bị trễ 30ms. |
| `@chili3d/app` | `packages/app/src/commands/modify/array.ts` & `transformedCommand.ts` | Đồng bộ đối tượng đang chọn từ cả `getSelectedVisualNodes()` lẫn `getSelectedShapes()` (lấy `shape.owner`); đặt mặc định `isGroup = false`; bổ sung chế độ/bảng nhập nhanh tham số mảng (`offsetX`, `offsetY`, `offsetZ`, `numberX`, `numberY`, `numberZ` + nút **Thực hiện / Áp dụng ngay**) ngay trên thanh tham số lệnh `Array`. |
| `@chili3d/core` & `@chili3d/app` | `packages/core/src/serialize/serializer.ts`, `packages/core/src/modelManager.ts`, `packages/app/src/bodys/*.ts` | Sửa toàn bộ 12 class trong `bodys/*.ts` truyền đủ `super(options)` (`id`, `name`, `materialId`); đảm bảo `Serializer.deserializeProperties` khôi phục chính xác `instance.id = data["id"]`; làm mới mesh của mọi `BodyInstanceNode` (`*_copy`) sau khi deserialize xong toàn bộ cây. |
| `server` | `server/storageServer.mjs` & `compose.yml` | Nâng cấp Backend sang kiến trúc **Auth (Register / Login với JWT & mật khẩu băm `scrypt`)** + **Per-Account SQLite Isolation (`/data/storage/users/{userId}/dunvex_cad.sqlite`)** sử dụng `node:sqlite` (`DatabaseSync`) với đầy đủ 3 bảng `projects`, `cad_entities`, `project_snapshots` và giao dịch nguyên tử (`BEGIN IMMEDIATE ... COMMIT`). |
| `@chili3d/storage` & `@chili3d/ui` | `packages/storage/src/apiCloudStorage.ts`, `packages/ui/src/auth/authDialog.ts` | Tích hợp quản lý phiên đăng nhập JWT, hộp thoại **Đăng nhập / Đăng ký** (Tên người dùng/SĐT, Mật khẩu, Tên đơn vị/Cửa hàng), hiển thị thông tin tài khoản trên thanh tiêu đề & trang chủ, và hỗ trợ Auto-save + `Ctrl + S` vào SQLite. |

---

## 3. Chi tiết Kỹ thuật cần triển khai

### Bước 3.1: Khắc phục Bug 1 — Tên dự án mặc định & Đổi tên trực tiếp (Inline Rename) trên Tab Bar và Cây đối tượng

1. **Sửa tên mặc định trong [`packages/app/src/commands/application/newDocument.ts`](../../packages/app/src/commands/application/newDocument.ts):**
   - Thay thế `` `undefined ${count++}` `` bằng hàm sinh tên dự án sạch sẽ:
     ```ts
     const baseName = "Dự án";
     const existingNames = new Set(Array.from(app.documents).map((d) => d.name));
     let index = count++;
     while (existingNames.has(`${baseName} ${index}`)) {
         index++;
     }
     await app.newDocument(`${baseName} ${index}`);
     ```
   - Ngoài ra, trong `Document.load` (`packages/app/src/document.ts`), nếu `data["name"]` bị rỗng hoặc bắt đầu bằng `"undefined "` (từ các bản vẽ cũ), tự động chuẩn hóa thành `data["name"].replace(/^undefined\s+/i, "Dự án ") || "Dự án 1"`.

2. **Bổ sung Inline Rename trên Tab Bar ([`packages/ui/src/ribbon/ribbon.ts`](../../packages/ui/src/ribbon/ribbon.ts)):**
   - Trong `createViewItem(view: IView)`:
     - Gắn sự kiện `ondblclick` vào vùng tên tab (`div({ className: style.name })`).
     - Khi nhấp đúp:
       - Ẩn `span` hiển thị tên, tạo một thẻ `<input type="text">` có `value = view.document.name`.
       - Gọi `inputEl.focus()` và `inputEl.select()`.
       - Trong `onkeydown` của `inputEl`: gọi `e.stopPropagation()` (để không kích hoạt phím tắt CAD khi đang gõ tên!). Nếu `e.key === "Enter"` thì gọi `commitRename()`; nếu `e.key === "Escape"` thì hủy sửa và khôi phục `span`.
       - Trong `onblur` của `inputEl`: gọi `commitRename()`.
       - Hàm `commitRename()`: nếu `inputEl.value.trim()` khác rỗng và khác `view.document.name`, cập nhật `view.document.name = inputEl.value.trim()` (việc gán `view.document.name` sẽ tự động đồng bộ sang `view.document.modelManager.rootNode.name` và tiêu đề tab).

3. **Bổ sung Inline Rename & Context Menu chuột phải trên Cây đối tượng ([`packages/ui/src/project/tree/treeItem.ts`](../../packages/ui/src/project/tree/treeItem.ts) & [`tree.ts`](../../packages/ui/src/project/tree/tree.ts)):**
   - Trong `TreeItem`:
     - Thêm phương thức `startInlineRename(): void`:
       - Nếu đang ở trạng thái `_isEditing` thì return.
       - Đặt `_isEditing = true`, ẩn `this.name` (`<label>`), chèn `<input type="text">` ngay tại vị trí của `this.name` với giá trị `this.node.name`.
       - Chặn `e.stopPropagation()` cho các sự kiện `click`, `dblclick`, `keydown`, `pointerdown` trên ô `<input>`.
       - Khi nhấn **Enter** hoặc **blur**:
         - Lấy `newName = inputEl.value.trim()`.
         - Nếu `newName` hợp lệ và khác `this.node.name`:
           - Nếu `this.node === this.document.modelManager.rootNode`, gán `this.document.name = newName` (cập nhật đồng thời cả `rootNode.name` và `document.name` trên Tab header).
           - Ngược lại, bọc trong `Transaction.execute(this.document, "Rename Node", () => { this.node.name = newName; })`.
         - Xóa `<input>`, hiện lại `this.name`, đặt `_isEditing = false`.
       - Khi nhấn **Escape**: xóa `<input>`, hiện lại `this.name`, đặt `_isEditing = false`.
   - Trong `Tree` (`packages/ui/src/project/tree/tree.ts`):
     - Trong `onDoubleClick`: lấy `treeItem = this.getTreeItem(event.target as HTMLElement)`. Nếu `treeItem` tồn tại:
       - Phát `PubSub.default.pub("nodeDoubleClicked", treeItem.node)`.
       - Nếu `treeItem.node === this.document.modelManager.rootNode` hoặc `treeItem.node instanceof FolderNode` hoặc `treeItem.node instanceof VisualNode` (ngoại trừ `SketchNode` vốn dùng double-click để vào chế độ sửa Sketch), gọi `treeItem.startInlineRename()`.
     - Lắng nghe sự kiện `contextmenu` trên `Tree`:
       - Hiển thị menu ngữ cảnh nhỏ gọn tại vị trí con trỏ chuột với tùy chọn **"✏️ Đổi tên (Rename)"**; khi click vào sẽ gọi `treeItem.startInlineRename()`.

---

### Bước 3.2: Khắc phục Bug 2 — Ổn định lệnh Sao chép mảng (`ArrayCommand`) với 1-Click & Bảng tham số Array

1. **Sửa lỗi nghẽn lệnh trong [`packages/app/src/services/commandService.ts`](../../packages/app/src/services/commandService.ts) & [`packages/core/src/command/command.ts`](../../packages/core/src/command/command.ts):**
   - Trong `CancelableCommand.cancel()`:
     ```ts
     async cancel() {
         this._isCanceled = true;
         this.controller?.cancel();
         while (!this._isCompleted) {
             await new Promise((r) => setTimeout(r, 5));
         }
     }
     ```
   - Trong `CommandService.checking(commandName)`:
     - Khi đang có `this.app.executingCommand`:
       - Nếu `runningKey === commandName`: thay vì báo lỗi `"toast.command.{0}excuting"` và từ chối thực thi, nếu `isCancelableCommand(runningCommand)` là `true` thì gọi `await runningCommand.cancel()` và trả về `true` để khởi chạy lại lệnh mới ngay lập tức trong 1 click!
       - Trước khi bắt đầu lệnh mới trong `executeAsync`, đảm bảo xóa mọi trạng thái chọn tạm hoặc controller cũ.

2. **Đồng bộ Active Selection trong [`ArrayCommand`](../../packages/app/src/commands/modify/array.ts) & [`TransformedCommand`](../../packages/app/src/commands/modify/transformedCommand.ts):**
   - Viết hàm lấy danh sách `VisualNode` đang được chọn từ cả Node Selection lẫn Shape Selection:
     ```ts
     private getActiveSelectedModels(transformable: (node: VisualNode) => boolean): VisualNode[] {
         const selectedNodes = this.document.selection.getSelectedVisualNodes().filter(transformable);
         if (selectedNodes.length > 0) return selectedNodes;

         const fromShapes = new Set<VisualNode>();
         for (const shape of this.document.selection.getSelectedShapes()) {
             if (shape.owner && transformable(shape.owner)) {
                 fromShapes.add(shape.owner);
             }
         }
         return Array.from(fromShapes);
     }
     ```
   - Trong `ensureSelectedModels()`:
     - Sử dụng `getActiveSelectedModels(transformable)`. Nếu đã có đối tượng được chọn (trên Viewport hoặc trên Cây đối tượng), trả về `true` ngay lập tức mà không bắt người dùng chọn lại!
     - Nếu chưa có đối tượng nào được chọn, hiển thị thông báo hướng dẫn rõ ràng và mở `this.document.picker.pickNode(...)`. Đặc biệt: khi chọn qua `pickNode`, nếu người dùng click trực tiếp vào một khối 3D/2D trên màn hình hoặc trên cây đối tượng, cho phép tự động xác nhận hoặc hiển thị rõ nút xác nhận `✓`.

3. **Đặt mặc định `isGroup = false` và bổ sung tính năng Tạo mảng nhanh theo thông số trục X, Y, Z trong [`ArrayCommand`](../../packages/app/src/commands/modify/array.ts):**
   - Đổi mặc định `get isGroup()` từ `true` sang `false` (`return this.getPrivateValue("isGroup", false);`) để các khối được sao chép mảng tạo thành các node độc lập trên Cây đối tượng và không gặp lỗi `toast.instance.groupUnsupported`.
   - Bổ sung các thuộc tính nhập khoảng cách trực tiếp trên thanh công cụ `ArrayCommand`:
     - `offsetX` (mặc định `1000`), `offsetY` (mặc định `0`), `offsetZ` (mặc định `0`).
     - Thêm nút hành động `@property("command.modify.array")` `applyQuickArray = () => { ... }` ngay trên thanh tham số của lệnh `Array`: khi người dùng đã chọn đối tượng và nhập số lượng (`count` hoặc `numberX, numberY, numberZ`) cùng khoảng cách (`offsetX, offsetY, offsetZ`), chỉ cần bấm nút **Thực hiện** (hoặc chọn 2 điểm trên màn hình như cũ) là hệ thống lập tức tạo mảng hoàn chỉnh!

---

### Bước 3.3: Khắc phục Bug 3 — Chống thất thoát dữ liệu hình học (`Prism_copy`, `ExtrudeNode`, v.v.) khi Lưu & Mở lại

1. **Sửa toàn bộ 12 class trong `packages/app/src/bodys/` để truyền đầy đủ `options` (`id`, `name`, `materialId`) lên `super(options)`:**
   - Mở rộng interface Options của 12 file sau kế thừa `ParameterShapeNodeOptions` (hoặc thêm `id?: string; name?: string; materialId?: string;`) và đổi `super({ document: options.document })` thành `super(options)`:
     1. [`packages/app/src/bodys/extrude.ts`](../../packages/app/src/bodys/extrude.ts) (`PrismOptions extends ParameterShapeNodeOptions`, `super(options)`)
     2. [`packages/app/src/bodys/rect.ts`](../../packages/app/src/bodys/rect.ts) (`RectOptions extends ParameterShapeNodeOptions`, `super(options)`)
     3. [`packages/app/src/bodys/line.ts`](../../packages/app/src/bodys/line.ts) (`LineOptions extends ParameterShapeNodeOptions`, `super(options)`)
     4. [`packages/app/src/bodys/circle.ts`](../../packages/app/src/bodys/circle.ts) (`CircleOptions extends ParameterShapeNodeOptions`, `super(options)`)
     5. [`packages/app/src/bodys/arc.ts`](../../packages/app/src/bodys/arc.ts) (`ArcOptions extends ParameterShapeNodeOptions`, `super(options)`)
     6. [`packages/app/src/bodys/ellipse.ts`](../../packages/app/src/bodys/ellipse.ts) (`EllipseOptions extends ParameterShapeNodeOptions`, `super(options)`)
     7. [`packages/app/src/bodys/polygon.ts`](../../packages/app/src/bodys/polygon.ts) (`PolygonOptions extends ParameterShapeNodeOptions`, `super(options)`)
     8. [`packages/app/src/bodys/regularPolygon.ts`](../../packages/app/src/bodys/regularPolygon.ts) (`RegularPolygonOptions extends ParameterShapeNodeOptions`, `super(options)`)
     9. [`packages/app/src/bodys/point.ts`](../../packages/app/src/bodys/point.ts) (`PointOptions extends ParameterShapeNodeOptions`, `super(options)`)
     10. [`packages/app/src/bodys/revolve.ts`](../../packages/app/src/bodys/revolve.ts) (`RevolveOptions extends ParameterShapeNodeOptions`, `super(options)`)
     11. [`packages/app/src/bodys/sweep.ts`](../../packages/app/src/bodys/sweep.ts) (`SweepOptions extends ParameterShapeNodeOptions`, `super(options)`)
     12. [`packages/app/src/bodys/helix.ts`](../../packages/app/src/bodys/helix.ts) (`HelixOptions extends ParameterShapeNodeOptions`, `super(options)`)

2. **Đảm bảo khôi phục `id` tuyệt đối trong [`Serializer.deserializeProperties`](../../packages/core/src/serialize/serializer.ts):**
   - Trong `Serializer.deserializeProperties(document: IDocument, instance: any, data: Record<string, any>)`:
     ```ts
     if (typeof data["id"] === "string" && instance && "id" in instance && instance.id !== data["id"]) {
         instance.id = data["id"];
     }
     ```
     Đảm bảo 100% mọi đối tượng sau khi deserialize luôn giữ đúng GUID gốc đã lưu.

3. **Khôi phục liên kết `BodyInstanceNode` (`*_copy`) không phụ thuộc thứ tự node trong [`ModelManager.deserialize`](../../packages/core/src/modelManager.ts):**
   - Trong `ModelManager.deserialize`, ngay sau khi gán `this.rootNode = rootNode!` và trước khi gọi `this.notifyNodeChanged(...)`:
     - Duyệt qua toàn bộ các node trong cây (`NodeUtils.children(this.rootNode)`): nếu node là `BodyInstanceNode` (hoặc có `isInstance === true`), truy cập `node.source` để kết nối watcher và gọi `node.refreshMesh()` / `invalidateMesh()` để đảm bảo dù `Prism_copy` nằm trước hay sau `Prism` trong danh sách node thì hình học 3D vẫn được khởi tạo đầy đủ 100%!

---

### Bước 3.4: Xây dựng Hệ thống Xác thực (Register / Login) & Cơ sở dữ liệu SQLite riêng theo từng Tài khoản (`server/storageServer.mjs` & Frontend)

#### A. Kiến trúc Backend SQLite & Auth trong [`server/storageServer.mjs`](../../server/storageServer.mjs)
Sử dụng module **`node:sqlite` (`DatabaseSync`)** và **`node:crypto` (`scryptSync`, `randomBytes`, `createHmac`, `timingSafeEqual`)** có sẵn trong Node.js 22 (`node:22-alpine`):

1. **Cơ sở dữ liệu Quản lý Người dùng (`/data/storage/auth.sqlite`):**
   - Bảng `users`:
     ```sql
     CREATE TABLE IF NOT EXISTS users (
         id TEXT PRIMARY KEY,
         username TEXT UNIQUE NOT NULL,
         password_hash TEXT NOT NULL,
         store_name TEXT NOT NULL,
         created_at DATETIME DEFAULT CURRENT_TIMESTAMP
     );
     ```
   - Mật khẩu được băm bằng `crypto.scryptSync(password, salt, 64).toString("hex")` lưu dạng `${salt}:${hash}`.
   - Token phiên làm việc (JWT chuẩn HMAC-SHA256) chứa `{ sub: user.id, username: user.username, storeName: user.store_name, exp }` ký bằng `JWT_SECRET` (từ biến môi trường hoặc khóa bí mật lưu bền vững trong `/data/storage/.jwt_secret`).
   - Cung cấp các API Xác thực:
     - `POST /api/auth/register`: Nhận `{ username, password, storeName }` $\rightarrow$ kiểm tra hợp lệ, tạo tài khoản mới, khởi tạo ngay file SQLite riêng `/data/storage/users/${userId}/dunvex_cad.sqlite`, trả về `{ token, user }`.
     - `POST /api/auth/login`: Nhận `{ username, password }` $\rightarrow$ xác thực mật khẩu, trả về `{ token, user }`.
     - `GET /api/auth/me`: Kiểm tra header `Authorization: Bearer <token>`, trả về `{ user }`.

2. **Cơ sở dữ liệu SQLite Độc lập cho từng Tài khoản (`/data/storage/users/{userId}/dunvex_cad.sqlite`):**
   - Mỗi `userId` (hoặc `"guest"` khi chưa đăng nhập) có một thư mục và file SQLite riêng biệt: `/data/storage/users/${sanitizeSegment(userId)}/dunvex_cad.sqlite`.
   - Bật `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;` để tối ưu tốc độ đọc/ghi và chống hỏng file (corrupted data).
   - Khởi tạo đầy đủ 3 bảng theo đúng đặc tả:
     ```sql
     CREATE TABLE IF NOT EXISTS projects (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         created_at DATETIME NOT NULL,
         updated_at DATETIME NOT NULL,
         thumbnail TEXT,
         metadata TEXT,
         document_json TEXT NOT NULL
     );

     CREATE TABLE IF NOT EXISTS cad_entities (
         id TEXT NOT NULL,
         project_id TEXT NOT NULL,
         parent_id TEXT,
         entity_type TEXT NOT NULL,
         name TEXT,
         geometry_data TEXT,
         transform_matrix TEXT,
         parameters TEXT,
         display_order INTEGER NOT NULL,
         raw_json TEXT NOT NULL,
         PRIMARY KEY (project_id, id)
     );

     CREATE TABLE IF NOT EXISTS project_snapshots (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         project_id TEXT NOT NULL,
         created_at DATETIME NOT NULL,
         document_json TEXT NOT NULL
     );
     ```
3. **Quy trình Ghi Atomic Transaction (`PUT /api/storage/:db/:table/:id`) & Đọc (`GET`):**
   - Khi nhận `PUT /api/storage/:db/documents/:id`:
     - Thực thi trong một **Atomic Transaction** (`BEGIN IMMEDIATE ... COMMIT`, `ROLLBACK` nếu lỗi):
       1. Lưu thông tin tổng thể dự án vào bảng `projects` (`id`, `name`, `created_at`, `updated_at`, `metadata`, `document_json`).
       2. Xóa các dòng `cad_entities` cũ của `project_id` và duyệt qua toàn bộ `document.models.nodes` để lưu từng thực thể vào bảng `cad_entities` theo đúng thứ tự phân cấp `display_order` (trích xuất `id`, `parentId`, `__cla$$__` làm `entity_type`, `name`, `shape`/`section` làm `geometry_data`, `transform` làm `transform_matrix`, các tham số còn lại làm `parameters`, và `raw_json`).
       3. Lưu bản chụp dự phòng vào `project_snapshots` (giữ tối đa 10 phiên bản gần nhất cho mỗi dự án để khôi phục nếu có sự cố).
   - Khi nhận `PUT /api/storage/:db/recents/:id`:
     - Cập nhật cột `thumbnail`, `name`, `updated_at` của dự án tương ứng trong bảng `projects`.
   - Khi nhận `GET /api/storage/:db/documents/:id`:
     - Truy vấn dự án từ bảng `projects` và danh sách thực thể từ `cad_entities` (sắp xếp theo `display_order ASC`), tái tạo lại đầy đủ cấu trúc `document` (`models.nodes`, `models.components`, `models.materials`, `variables`, `acts`, `userData`) trả về cho client.
   - Khi nhận `GET /api/storage/:db/recents`:
     - Truy vấn danh sách dự án từ bảng `projects` của đúng tài khoản đang đăng nhập (`ORDER BY updated_at DESC LIMIT ? OFFSET ?`), trả về mảng `{ id, name, date, image }`.
   - **Tự động di trú (Migration) dữ liệu cũ:** Khi khởi động server, nếu phát hiện các file `.json` cũ trong `/data/storage/chili3d/`, tự động nạp chúng vào SQLite của `"guest"` (và sao chép sang tài khoản đầu tiên đăng ký nếu cần) để không mất bất kỳ bản vẽ nào đã vẽ trước đó.

#### B. Tích hợp Frontend: Hộp thoại Đăng nhập / Đăng ký & Đồng bộ Lưu trữ (`@chili3d/storage`, `@chili3d/ui`)
1. **Quản lý Token & Tách biệt Cache theo User trong [`packages/storage/src/apiCloudStorage.ts`](../../packages/storage/src/apiCloudStorage.ts):**
   - Đọc token xác thực từ `localStorage.getItem("dunvex_auth_token")` (nếu không truyền `getAuthToken` riêng).
   - Khi lưu/đọc dự phòng vào `IndexedDBStorage`, ghép thêm `userId` (từ `localStorage.getItem("dunvex_auth_user")`) vào khóa `id` của IndexedDB (ví dụ `${userId}:${id}`) để khi đổi tài khoản trên cùng trình duyệt, danh sách dự án giữa các tài khoản hoàn toàn tách biệt.
2. **Xây dựng giao diện Đăng nhập / Đăng ký (`packages/ui/src/auth/authDialog.ts` & tích hợp vào `RibbonUI` / `Home`):**
   - Tạo component modal `AuthDialog` hỗ trợ chuyển đổi giữa 2 chế độ **Đăng nhập** và **Đăng ký**:
     - Trường thông tin:
       - **Tên người dùng / Số điện thoại** (`username`)
       - **Mật khẩu** (`password`)
       - **Tên đơn vị / Cửa hàng** (`storeName` — hiển thị khi Đăng ký)
   - Hiển thị nút/thẻ Tài khoản ở góc phải thanh Header (`RibbonUI.rightPanel()`) và ở cột trái màn hình `Home`:
     - Khi chưa đăng nhập: hiển thị nút **"Đăng nhập / Đăng ký"**.
     - Khi đã đăng nhập: hiển thị **"👤 [Tên Cửa hàng / Người dùng]"** kèm nút **"Đăng xuất"** (khi đăng nhập/đăng xuất thành công sẽ làm mới lại danh sách dự án trên màn hình `Home` theo đúng cơ sở dữ liệu SQLite của tài khoản đó).
3. **Auto-Save & `Ctrl + S`:**
   - Khi người dùng nhấn `Ctrl + S` (hoặc nút Save), thực thi lưu tức thì vào SQLite.
   - Bổ sung cơ chế Auto-save ngầm định kỳ (mỗi 60 giây khi tài liệu có thay đổi trong `History`) để phòng ngừa mất dữ liệu nếu trình duyệt đóng đột ngột.

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria) & Kiểm thử

1. **Nghiệm thu Bug 1 (Inline Rename & Tên dự án):**
   - Tạo dự án mới: tên mặc định hiển thị là `Dự án 1`, `Dự án 2` (không còn `undefined 1`).
   - Nhấp đúp vào tên dự án trên thanh Tab hoặc node gốc trên Cây đối tượng (hoặc click chuột phải chọn **"Đổi tên"**): xuất hiện ô `<input>`, gõ tên mới (kể cả chứa các chữ cái phím tắt như `L`, `R`, `C`, `H`) không bị nhảy lệnh tắt, nhấn `Enter` hoặc click ra ngoài cập nhật ngay tên mới lên cả Tab Bar, Cây đối tượng và Header.
2. **Nghiệm thu Bug 2 (Sao chép mảng `Array`):**
   - Chọn một khối `Prism1` hoặc `Box1` trên màn hình (hoặc chưa chọn), bấm nút `Sao chép mảng (Array)` **1 lần duy nhất** là lệnh kích hoạt ngay.
   - Có thể nhập nhanh số lượng & khoảng cách Offset rồi bấm **Thực hiện**, hoặc pick điểm trên màn hình; các khối sao chép được tạo ra ngay lập tức và không báo lỗi `toast.instance.groupUnsupported`.
3. **Nghiệm thu Bug 3 (Không mất dữ liệu khi Lưu & Mở lại):**
   - Vẽ khối `Prism1` (Extrude), thực hiện `Sao chép mảng (Array)` tạo ra các khối `Prism1_copy`, nhấn Lưu (`Ctrl + S`), tải lại trang và mở lại dự án: **100% các khối `Prism1` và `Prism1_copy` hiển thị đầy đủ trên cả màn hình 3D và Cây đối tượng**, giữ nguyên đúng vị trí, kích thước và màu sắc.
4. **Nghiệm thu Hệ thống SQLite & Auth:**
   - Đăng ký tài khoản mới (Tên người dùng/SĐT, Mật khẩu, Tên đơn vị/Cửa hàng) $\rightarrow$ hệ thống tự động tạo file `/data/storage/users/{userId}/dunvex_cad.sqlite` chứa đủ 3 bảng `projects`, `cad_entities`, `project_snapshots`.
   - Lưu dự án trong tài khoản A, đăng xuất và đăng nhập tài khoản B: dữ liệu giữa 2 tài khoản tách biệt hoàn toàn trong 2 file SQLite riêng.
5. **Unit Tests & Triển khai Production:**
   - Viết unit test kiểm tra:
     - Deserialization của `ExtrudeNode` + `BodyInstanceNode` (`Prism_copy`) giữ nguyên `id` và `source`.
     - API Auth (`/api/auth/register`, `/api/auth/login`) và lưu/mở dự án qua SQLite per-account (`projects`, `cad_entities`, `project_snapshots`).
   - Chạy `npm run test` và `npm run build` pass 100%.
   - Commit, push lên GitHub (`dev` & `main`) và chạy `./scripts/deploy-vps.sh` để cập nhật lên VPS `http://136.66.95.155`.
