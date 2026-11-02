# TASK-17: [Ưu tiên 1] Khắc phục Lỗi Màn hình Home Nhảy Nhầm Dự án + [Ưu tiên 2] Cây Đối tượng Phân cấp Thông minh (`Cha -> Con -> Cháu`) & Ẩn/Hiện Hàng loạt 1 Click + [Ưu tiên 3] Bảng Thống kê Vật tư (`BOM` / `TK` / `LI`)

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Mức độ ưu tiên:** P0 (Thứ tự thực thi bắt buộc: **Phần 1: Sửa lỗi nhảy nhầm dự án ngoài Home** $\rightarrow$ **Phần 2: Cây đối tượng Phân cấp Thông minh & Ẩn/Hiện Hàng loạt 1 Click** $\rightarrow$ **Phần 3: Bảng Thống kê Vật tư BOM / Terminal `TK`, `BOM`, `LI`**)
> **Phụ thuộc:** `TASK-11`, `TASK-14`, `TASK-15`, `TASK-16`

---

## PHẦN 1 (ƯU TIÊN SỐ 1 — VÁ LỖI TRƯỚC): Khắc phục Triệt để Lỗi Màn hình Home Click Dự án này lại Mở ra Dự án kia

### 1.1. Hiện tượng Lỗi (User Report)
- Ngoài màn hình **Home (`BẢN VẼ GẦN ĐÂY`)** đang có nhiều dự án (`thành-công trình kiến đức`, `trần cho anh đá hoa cương phú tài`, `Dự án 2`).
- Khi người dùng click vào một dự án trên màn hình Home, giao diện lại hiển thị dự án đang mở trước đó chứ không chuyển sang dự án vừa click.

### 1.2. Nguyên nhân Gốc rễ & Giải pháp Kỹ thuật Bắt buộc
1. **Tại [`packages/ui/src/home/home.ts`](../../packages/ui/src/home/home.ts) (`handleDocumentClick`):**
   - **Nguyên nhân:** Khi `this.hasOpen(item.id)` trả về `true` (do dự án đó đã từng được mở trong phiên làm việc), `handleDocumentClick` chỉ gọi `PubSub.default.pub("displayHome", false)` mà **quên không chuyển `this.app.activeView` sang View của `item.id`**, khiến màn hình bị giữ nguyên ở dự án cũ!
   - **Cách sửa:**
     - Khi `this.hasOpen(item.id)` là `true`:
       - Tìm `openDoc = Array.from(this.app.documents).find((d) => d.id === item.id)`.
       - Tìm `targetView = this.app.views.find((v) => v.document.id === item.id || v.document === openDoc)`.
       - Nếu tìm thấy `targetView`:
         - Gán `this.app.activeView = targetView;`
         - Đóng màn hình Home: `PubSub.default.pub("displayHome", false);`
         - Gọi `requestAnimationFrame(() => { if (targetView.width > 1 && targetView.height > 1) targetView.resize(targetView.width, targetView.height); targetView.update(); });`
       - Nếu không tìm thấy `targetView`: xóa `openDoc` khỏi `this.app.documents` và mở lại qua `await this.app.openDocument(item.id)`.
     - Khi `!this.hasOpen(item.id)`: sau khi `await this.app.openDocument(item.id)` hoàn tất trong `showPermanent`, đảm bảo gọi `PubSub.default.pub("displayHome", false)` và `fitContent({ scope: "all", duration: CAMERA_FLY_DURATION })`.
2. **Tại [`packages/app/src/application.ts`](../../packages/app/src/application.ts) (`openDocument` & `set activeView`):**
   - Trong `openDocument(id)`: nếu đã có view của `id` trong `this.views`, chuyển thẳng `this.activeView = existingView` và trả về `existingView.document`.
   - Trong `set activeView(value)`: khi chuyển sang `value?.document`, tự động đồng bộ `Config.instance.is2DDraftingMode` (`this.has3DContent(value.document)` $\rightarrow$ `is2DDraftingMode = false`, `dynamicWorkplane = true`; ngược lại đọc từ `userData?.viewState?.is2DDraftingMode`).
3. **Tại [`packages/ui/src/viewport/layoutViewport.ts`](../../packages/ui/src/viewport/layoutViewport.ts) (`_handleActiveViewChanged`):**
   - Khi gỡ class `style.hidden` khỏi viewport được kích hoạt (`v.view === view`), gọi `v.view.update()` và trong `requestAnimationFrame` gọi `v.view.resize(v.clientWidth, v.clientHeight)` + `v.view.update()`.
4. **Tại [`packages/app/src/document.ts`](../../packages/app/src/document.ts) (`serialize` & `save`):**
   - Lấy đúng view của chính `this` (`this.application?.views.find((v) => v.document === this)`) thay vì `this.application?.activeView` để auto-save của dự án ngầm không lấy nhầm camera và thumbnail của dự án khác.

---

## PHẦN 2 (ƯU TIÊN SỐ 2 — SỬA BẤT TIỆN CÂY ĐỐI TƯỢNG & ẨN/HIỆN HÀNG LOẠT): Sắp xếp Phân cấp Thông minh (`Cha -> Con -> Cháu`) & Ẩn/Hiện Hàng loạt bằng 1 Click

### 2.1. Hiện tượng Bất tiện (User Report & Ảnh chụp màn hình)
1. **Quét chọn cả mảng tường (gồm hàng chục thanh `Prism10_copy`, `Prism11_copy`) nhưng không thể ẩn hàng loạt bằng 1 cú click:**
   - Khi người dùng quét chọn toàn bộ mảng tường trên màn hình 3D, Cây đối tượng đã bôi xám (chọn) cả chục dòng `Prism10_copy`.
   - Tuy nhiên, khi bấm vào biểu tượng con mắt (`👁️`) trên 1 dòng đang chọn, hệ thống lại **chỉ ẩn đúng 1 thanh đó**, bắt người dùng phải bấm 50–80 lần vào từng con mắt mới ẩn xong mảng tường!
2. **Cây đối tượng chưa hỗ trợ gom nhóm phân cấp thông minh `Cha -> Con -> Cháu` (`Tường -> Cửa / Lam sóng -> Ổ khóa`):**
   - Khi chạy lệnh Sao chép mảng (`Array`), 50 thanh `Prism10_copy` và 25 tấm `Prism11_copy` bị xả thẳng ra gốc cây bản vẽ làm danh sách dài lê thê.
   - Khi bấm nút **"📁 Tạo nhóm"** (`create.folder`) trong lúc đang chọn các đối tượng, nó chỉ tạo ra một thư mục rỗng ở cuối cây chứ không gom các đối tượng đang chọn vào thư mục đó.
   - Khi kéo thả chi tiết con (ví dụ: `Cửa` hoặc `Lam sóng`) vào một khối cha (ví dụ: `Tường - Prism2`), cây không tự tạo nhóm cha–con.

### 2.2. Giải pháp Kỹ thuật Bắt buộc cho Phần 2

1. **Click 1 Con Mắt = Ẩn/Hiện TOÀN BỘ các đối tượng đang được chọn ([`packages/ui/src/project/tree/treeItem.ts`](../../packages/ui/src/project/tree/treeItem.ts)):**
   - Trong `TreeItem.onVisibleIconClick`:
     ```ts
     private readonly onVisibleIconClick = (e: MouseEvent) => {
         e.stopPropagation();
         const selected = this.document.selection.getSelectedNodes();
         const targets = selected.length > 1 && selected.includes(this.node) ? selected : [this.node];
         const nextVisible = !this.node.visible;
         Transaction.execute(this.document, "change visible", () => {
             for (const target of targets) {
                 target.visible = nextVisible;
             }
         });
         this.document.visual.update();
     };
     ```
   - **Kết quả:** Khi người dùng quét chọn cả mảng tường trên màn hình 3D (hoặc chọn nhiều dòng bằng `Shift`/`Ctrl` trên cây), chỉ cần **bấm vào con mắt của BẤT KỲ dòng nào đang được chọn** là **toàn bộ 50–100 chi tiết đang chọn sẽ Ẩn (hoặc Hiện) cùng lúc chỉ bằng 1 cú click duy nhất**!

2. **Nâng cấp Lệnh `create.folder` / Nút "📁 Tạo nhóm" & Phím tắt `G` / `GROUP` hỗ trợ Phân cấp `Cha -> Con -> Cháu` ([`packages/app/src/commands/folder.ts`](../../packages/app/src/commands/folder.ts)):**
   - Khi người dùng bấm nút **"📁 Tạo nhóm"** trên Ribbon, hoặc nút `📁+` trên đầu Cây đối tượng, hoặc gõ lệnh **`G` / `GROUP`** trên Terminal:
     - Lấy danh sách đối tượng đang chọn (`selectedNodes` từ `document.selection.getSelectedNodes()`, hoặc từ `getSelectedShapes().map(s => s.owner)`).
     - Lọc bỏ `rootNode` và các node con nằm bên trong một node cha cũng đang được chọn (`NodeUtils.findTopLevelNodes`), lọc bỏ `consumedTool`.
     - **Trường hợp A — Đang chọn 1 hoặc nhiều đối tượng hình học / thư mục (ví dụ: chọn bức tường + các thanh lam, hoặc chọn các chi tiết cửa):**
       - Nếu chỉ chọn đúng **1 `FolderNode` duy nhất** (ví dụ đang chọn thư mục `📁 Tường`): tạo một **thư mục con (`FolderNode`) nằm BÊN TRONG thư mục `📁 Tường` đó** (để tạo cấp con như `📁 Cửa` trong `📁 Tường`, hoặc `📁 Ổ khóa` trong `📁 Cửa`).
       - Nếu đang chọn **các đối tượng hình học (hoặc nhiều node)**:
         - Xác định thư mục cha chung (`targetParent`: nếu tất cả các đối tượng đang chọn cùng nằm trong một `FolderNode` như `📁 Tường`, thì `targetParent` chính là `📁 Tường`; ngược lại là `document.modelManager.currentNode` hoặc `rootNode`).
         - Tạo `FolderNode` mới đặt tên gợi ý thông minh (ví dụ: nếu đối tượng đầu tiên là `Prism2` thì đặt tên `Nhóm Prism2 (<số_lượng>)` hoặc `Thư mục 1`), chèn vào `targetParent` ngay tại vị trí của đối tượng đầu tiên.
         - **Tự động di chuyển toàn bộ các đối tượng đang chọn vào bên trong `FolderNode` mới này (`node.parent?.move(node, folder, undefined)`)** trong 1 `Transaction`!
         - Chọn `folder` mới tạo (`document.selection.setSelectedNodes([folder], false)`), đặt `document.modelManager.currentNode = folder`, và phát sự kiện `PubSub.default.pub("startRenameNode", folder)` để mở ngay ô nhập tên trên Cây đối tượng cho người dùng đặt tên (`"Tường phòng khách"`, `"Cửa chính"`, `"Ổ khóa"`).

3. **Kéo thả (Drag & Drop) Chi tiết Con vào Khối Cha tự động Tạo Thư mục Cha–Con ([`packages/ui/src/project/tree/tree.ts`](../../packages/ui/src/project/tree/tree.ts)):**
   - Hiện tại trong `Tree.onDrop`: nếu người dùng kéo các chi tiết (ví dụ: `Cửa`, `Ổ khóa`, `Lam sóng`) thả lên một đối tượng hình học (ví dụ: khối `Prism2 - Tường` không phải là `FolderNode`), hệ thống chỉ đặt ngang hàng (sibling).
   - **Cải tiến thông minh:**
     - Khi người dùng kéo thả các node (`this.dragging`) vào một `node` là `VisualNode` (không phải `FolderNode` và không phải consumed tool):
       - Nếu người dùng giữ phím `Shift` hoặc thả trực tiếp vào giữa dòng của `VisualNode` đó (hoặc thông qua menu chuột phải **"📁 Gom vào chung nhóm Cha–Con"**):
       - Hoặc đơn giản: nâng cấp Context Menu chuột phải và hỗ trợ kéo thả vào `FolderNode` đa tầng (`Tường` $\rightarrow$ `Cửa` $\rightarrow$ `Ổ khóa`). Đặc biệt, trong `Tree.onDrop`, nếu thả một hoặc nhiều đối tượng lên một `VisualNode` mà `VisualNode` đó chưa phải là `FolderNode`: kiểm tra nếu vùng thả nằm ở phần giữa của dòng (`offsetY` trong khoảng 25%–75% chiều cao dòng), **tự động tạo một `FolderNode` mang tên của `VisualNode` đích (ví dụ: `📁 Prism2`), đưa `VisualNode` đích làm phần tử đầu tiên rồi đưa toàn bộ các đối tượng vừa kéo thả vào làm con bên trong `📁 Prism2`**! (Nếu thả ở mép trên/dưới 25% thì vẫn sắp xếp thứ tự ngang hàng như cũ).

4. **Tự động Gom Nhóm khi Sao chép mảng (`Array`) & Công cụ "✨ Gom gọn tự động các bản sao (`*_copy`)" ([`packages/app/src/commands/modify/array.ts`](../../packages/app/src/commands/modify/array.ts) & [`packages/ui/src/project/toolBar.ts`](../../packages/ui/src/project/toolBar.ts)):**
   - **Trong `ArrayCommand` (`executeQuickArray` và `executeMainTask` tại `packages/app/src/commands/modify/array.ts`):**
     - Khi tạo mảng sao chép không gộp Component (`!this.isGroup` hoặc `hasInstances`) và tổng số đối tượng tạo ra $\ge 2$:
       - Thay vì gọi `this.document.modelManager.addNode(...nodes)` làm xả hàng chục dòng `*_copy` rời rạc ra ngoài cây:
       - Tự động tạo một `FolderNode` tên là `Mảng ${baseName} (${totalCount})` ngay trong thư mục cha của đối tượng gốc, và đưa cả đối tượng gốc (nếu `copiesAsInstance`) lẫn toàn bộ các bản sao `nodes` vào bên trong `FolderNode` đó!
   - **Thêm nút `"✨ Tự động gom nhóm gọn Cây bản vẽ"` trên thanh công cụ Cây đối tượng (`packages/ui/src/project/toolBar.ts`) & trong Context Menu chuột phải:**
     - Khi bấm nút này (hoặc chọn **"✨ Tự động gom gọn các chi tiết cùng loại"** trong menu chuột phải), hệ thống quét các node nằm rời rạc trong cùng một thư mục:
       - Gom tất cả các cụm `<Tên_gốc>` + `<Tên_gốc>_copy` (ví dụ: `Prism10` + 50 thanh `Prism10_copy`; `Prism11` + 25 tấm `Prism11_copy`) vào các thư mục tương ứng **`📁 Mảng Prism10 (51)`** và **`📁 Mảng Prism11 (26)`**!
       - Đồng thời, nếu có các đối tượng cùng gán một Vật liệu tùy chỉnh (như `lam 3 sóng khổ 21 phân`), hỗ trợ gom gọn để người dùng bật/tắt con mắt cả mảng chỉ bằng 1 cú click!

5. **Nâng cấp Menu Chuột phải (Context Menu) trên Cây đối tượng & Lệnh Terminal Ẩn/Hiện/Cô lập Nhanh ([`packages/ui/src/project/tree/tree.ts`](../../packages/ui/src/project/tree/tree.ts) & `shortcutProfiles.ts`):**
   - Trong `Tree.showContextMenu(x, y, item)`:
     - Nếu người dùng click chuột phải vào một node chưa nằm trong vùng chọn, tự động chọn node đó; nếu node đó **đã nằm trong vùng chọn nhiều đối tượng (`this.selectedNodes.has(item.node)` và `this.selectedNodes.size > 1`)**, giữ nguyên toàn bộ vùng chọn nhiều đối tượng và áp dụng thao tác cho **TẤT CẢ các đối tượng đang chọn (`targetNodes`)**:
       1. **`📁 Gom vào thư mục mới (Group Selected - G)`**: Gom toàn bộ `targetNodes` vào 1 `FolderNode` mới và mở ô đặt tên ngay.
       2. **`✨ Tự động gom gọn các bản sao (*_copy)`**: Tự động gom các cụm `<Tên>` + `<Tên>_copy` rời rạc vào thư mục mảng gọn gàng.
       3. **`👁️ Ẩn đối tượng đang chọn (${targetNodes.length})`**: Đặt `visible = false` cho toàn bộ `targetNodes`.
       4. **`👁️ Hiện đối tượng đang chọn (${targetNodes.length})`**: Đặt `visible = true` cho toàn bộ `targetNodes`.
       5. **`🎯 Cô lập: Chỉ hiện đối tượng đang chọn (Isolate)`**: Giữ `visible = true` cho `targetNodes` (và cha của chúng), đặt `visible = false` cho tất cả các đối tượng khác để dễ dàng chỉnh sửa chi tiết nhỏ (như vẽ ổ khóa trên cửa).
       6. **`☀️ Hiện lại toàn bộ bản vẽ (Show All)`**: Đặt `visible = true` cho toàn bộ các node hình học trong bản vẽ (trừ các outlier annotation đã lọc).
       7. **`✏️ Đổi tên (Rename)`**
       8. **`🔍 Phóng tới đối tượng (Zoom to Object)`**
       9. **`🗑️ Xóa đối tượng đang chọn (${targetNodes.length})`**: Xóa **toàn bộ `targetNodes`** đang chọn (chứ không chỉ xóa 1 dòng như cũ!).
   - Đăng ký thêm alias trên Terminal (`AutoCADCommandAliases` trong `shortcutProfiles.ts`):
     - `G`, `GROUP` $\rightarrow$ `"create.folder"` (Gom các đối tượng đang chọn vào Thư mục).
     - `HIDE`, `AN` $\rightarrow$ `"modify.hideSelected"` (Ẩn các đối tượng đang chọn).
     - `SHOWALL`, `UNHIDE`, `UNISOLATE`, `HIEN` $\rightarrow$ `"modify.showAll"` (Hiện lại toàn bộ các đối tượng).
     - `ISOLATE`, `COLAP` $\rightarrow$ `"modify.isolateSelected"` (Cô lập chỉ hiện các đối tượng đang chọn).

---

## PHẦN 3 (ƯU TIÊN SỐ 3 — TÍNH NĂNG BÓC TÁCH VẬT TƯ): Bảng Thống kê Vật tư & Bóc tách Khối lượng (`BOM` / `TK` / `LI` trên Terminal)

### 3.1. Luồng Thao tác Người dùng (User Workflow)
1. **Gõ lệnh trên Terminal (`COMMAND:` Bar) hoặc Phím tắt (`Shift+B`):**
   - Hỗ trợ các lệnh: **`BOM`**, **`TK`**, **`THONGKE`**, **`VT`**, **`LI`**, **`LIST`** $\rightarrow$ gọi lệnh `"measure.bom"`.
   - **Nếu đã quét chọn sẵn các vật thể trên màn hình (hoặc chọn 1 Thư mục mảng tường trên Cây bản vẽ):** Mở ngay Bảng Thống kê Vật tư Chi tiết cho đúng các đối tượng đang chọn (nếu chọn `FolderNode` thì tự động lấy toàn bộ các khối hình học con bên trong thư mục đó!).
   - **Nếu chưa chọn đối tượng nào:** Bật chế độ quét chọn đa đối tượng (`document.picker.pickNode` với `multi: true`). Người dùng quét chọn rồi nhấn `Enter` sẽ hiện bảng thống kê cho cụm vừa chọn; nếu nhấn `Enter` / `Escape` ngay thì thống kê toàn bộ các đối tượng đang hiển thị trong bản vẽ.
2. **Nút bấm trực tiếp trên Thanh Công cụ Ribbon:**
   - Thêm nút **"📊 Thống kê vật tư (BOM)"** (`measure.bom`) vào nhóm **Đo lường (`ribbon.group.measure`)** trên tab **Cơ bản**.

### 3.2. Thiết kế Bảng Thống kê Vật tư Chi tiết (`BomCommand` & `showBomDialog`)
1. **Thuật toán Tự động Đo Quy cách ($Dài \times Rộng \times Dày$) & Gom nhóm (`computeBomReport`):**
   - Duyệt qua các node hình học (`GeometryNode` / `ShapeNode` / `BodyInstanceNode`, nếu đầu vào có `FolderNode` thì đệ quy lấy tất cả node hình học con bên trong, bỏ qua `Annotation`).
   - Tra cứu `materialId` trong `document.modelManager.materials` để lấy **Màu sắc (`#RRGGBB`)** và **Tên sản phẩm / Vật liệu (`material.name`)** (ví dụ: `lam 3 sóng khổ 21 phân`, `nano vân đá rộng 400`).
   - Tính 3 chiều từ khung bao ($\Delta X, \Delta Y, \Delta Z$), làm tròn đến $0.1\text{ mm}$, sắp xếp giảm dần $L \ge W \ge T$ ($\text{mm}$), tạo chuỗi quy cách chuẩn `L × W × T mm` (hoặc `L × W mm` cho 2D, `L mm` cho 1D).
   - Gom nhóm tự động theo `[Mã Vật liệu + Quy cách (L × W × T)]`, cộng dồn **Số lượng**, **Tổng Mét dài ($\text{m}$)** và **Tổng Diện tích ($\text{m}^2$)**.
2. **Giao diện Bảng Thống kê (`showBomDialog`):**
   - Bộ lọc chuyển đổi nhanh: `[ Đang chọn (X vật thể) ]` $\leftrightarrow$ `[ Toàn bộ bản vẽ (Y vật thể) ]`.
   - Các cột: `STT` | `Màu` (ô màu + mã Hex) | `Tên Sản phẩm / Vật liệu` | `Quy cách (Dài × Rộng × Dày)` | `Số lượng` | `Tổng Mét dài (m)` | `Tổng Diện tích (m²)` | `Đơn vị tính` (`Thanh/Tấm` / `m²` / `m dài`) | `Đơn giá (VNĐ)` | `Thành tiền (VNĐ)` | `🎯 Chọn`.
   - Bảng tổng hợp theo từng Loại Vật liệu & Tổng tiền cuối bảng.
   - Các nút tiện ích: **📥 Xuất file Excel (`.CSV` UTF-8 có BOM `\uFEFF`)**, **📋 Copy Báo giá (Zalo)**, **🖨️ In Bảng Vật tư**.

---

## 4. Tổng hợp Danh sách File Cần Can thiệp (Phần 1 + Phần 2 + Phần 3)

| STT | Phần | Package | File Path | Nội dung thực hiện |
| :---: | :---: | :--- | :--- | :--- |
| 1 | **Phần 1 (Fix Home)** | `@chili3d/ui` | `packages/ui/src/home/home.ts` | Sửa `handleDocumentClick(item)`: khi `this.hasOpen(item.id)` là `true`, tìm đúng `targetView` của `item.id` trong `this.app.views`, gán `this.app.activeView = targetView`, đóng Home (`displayHome: false`), resize & update `targetView`. |
| 2 | **Phần 1 (Fix Home)** | `@chili3d/app` | `packages/app/src/application.ts` | Trong `openDocument(id)`: nếu đã mở thì kích hoạt view hiện có. Trong `set activeView`: đồng bộ `Config.instance.is2DDraftingMode` theo document được chuyển tới. |
| 3 | **Phần 1 (Fix Home)** | `@chili3d/ui` | `packages/ui/src/viewport/layoutViewport.ts` | Trong `_handleActiveViewChanged`: khi bỏ `style.hidden`, gọi `resize` và `update` trong `requestAnimationFrame`. |
| 4 | **Phần 1 (Fix Home)** | `@chili3d/app` | `packages/app/src/document.ts` | Trong `serialize()` và `save()`: tìm đúng view của chính `this` (`this.application.views.find(v => v.document === this)`), không lấy nhầm `activeView` của dự án khác. |
| 5 | **Phần 2 (Tree & Visibility)** | `@chili3d/ui` | `packages/ui/src/project/tree/treeItem.ts` | Trong `onVisibleIconClick`: nếu `this.node` nằm trong danh sách đang chọn nhiều đối tượng (`selected.length > 1`), bật/tắt `visible` cho **toàn bộ các đối tượng đang chọn** chỉ bằng 1 cú click vào con mắt! |
| 6 | **Phần 2 (Tree & Visibility)** | `@chili3d/app` | `packages/app/src/commands/folder.ts` | Nâng cấp `NewFolder` (`create.folder`) và thêm các lệnh `modify.hideSelected`, `modify.showAll`, `modify.isolateSelected`, `modify.autoOrganizeTree`:<br>- Khi chạy `create.folder` (`G` / `GROUP` / nút `Tạo nhóm`), nếu đang chọn nhiều đối tượng thì tự động gom tất cả vào `FolderNode` mới; nếu đang chọn 1 `FolderNode` thì tạo thư mục con bên trong nó (`Cha -> Con -> Cháu`). |
| 7 | **Phần 2 (Tree & Visibility)** | `@chili3d/ui` | `packages/ui/src/project/tree/tree.ts` & `packages/ui/src/project/toolBar.ts` | - Trong `Tree.onDrop`: hỗ trợ kéo thả chi tiết con vào giữa 1 khối hình học cha (`VisualNode`) để tự động tạo thư mục cha–con.<br>- Nâng cấp `showContextMenu`: hỗ trợ Gom nhóm các đối tượng đang chọn, Tự động gom gọn `*_copy`, Ẩn/Hiện/Cô lập/Xóa hàng loạt các đối tượng đang chọn.<br>- Thêm nút `"✨ Tự động gom nhóm gọn Cây bản vẽ"` trên `ToolBar`. |
| 8 | **Phần 2 (Tree & Visibility)** | `@chili3d/app` | `packages/app/src/commands/modify/array.ts` | Khi lệnh `Array` tạo $\ge 2$ phần tử (không gộp Component), tự động đặt các phần tử mảng vào một `FolderNode` (`Mảng <Tên> (<SL>)`) để cây bản vẽ luôn gọn gàng. |
| 9 | **Phần 3 (Tính năng BOM)** | `@chili3d/i18n` & `@chili3d/core` | `packages/i18n/src/en.ts`, `packages/i18n/src/vi.ts`, `packages/core/src/command/shortcutProfiles.ts` | Thêm khóa i18n và đăng ký các lệnh Terminal: `BOM`, `TK`, `THONGKE`, `VT`, `LI`, `LIST` $\rightarrow$ `"measure.bom"`; `G`, `GROUP` $\rightarrow$ `"create.folder"`; `HIDE`, `AN` $\rightarrow$ `"modify.hideSelected"`; `SHOWALL`, `HIEN` $\rightarrow$ `"modify.showAll"`; `ISOLATE`, `COLAP` $\rightarrow$ `"modify.isolateSelected"`. |
| 10 | **Phần 3 (Tính năng BOM)** | `@chili3d/app`, `@chili3d/builder`, `@chili3d/ui` | `packages/app/src/commands/measure/bom.ts`, `packages/builder/src/ribbon.ts`, `packages/ui/src/statusBar/commandBar.ts` | Triển khai lệnh `BomCommand` (`measure.bom`), hàm `computeBomReport` (hỗ trợ cả chọn rời và chọn cả `FolderNode` cha), hộp thoại `showBomDialog` (Màu, Tên vật liệu, Quy cách $Dài \times Rộng \times Dày$, SL, Mét dài, $\text{m}^2$, Đơn giá, Xuất CSV, Copy Zalo) và nút trên Ribbon. |

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log - Do AI Thực thi ghi)

- **Ngày thực hiện:** 02/11/2026
- **Git Commit:** `3a7edc2b`
- **Trạng thái bàn giao:** `[?] WAITING_REVIEW`
- **Môi trường triển khai:** VPS `http://136.66.95.155` (Docker Compose: `autocad-dunvex-chili3d-1` & `autocad-dunvex-storage-api-1` Up)

### 5.1. Bảng kê File Thay đổi & Chức năng Triển khai

| STT | Phần | Package | File Path | Chi tiết thay đổi |
| :---: | :---: | :--- | :--- | :--- |
| 1 | **Phần 1** | `@chili3d/ui` | `packages/ui/src/home/home.ts` | Trong `handleDocumentClick`: khi `this.hasOpen(item.id)` là `true`, tìm đúng `targetView` của tài liệu trong `this.app.views`, gán `this.app.activeView = targetView`, đóng Home (`displayHome: false`), kích hoạt resize và update view. Nếu chưa mở, mở qua `openDocument(item.id)`, đóng Home và fit content camera. |
| 2 | **Phần 1** | `@chili3d/app` | `packages/app/src/application.ts` | Trong `openDocument`: nếu view đã tồn tại trong `this.views`, kích hoạt `existingView` và trả về `existingView.document`. Trong `set activeView`: tự động đồng bộ `Config.instance.is2DDraftingMode` dựa trên `has3DContent` và `userData.viewState`. |
| 3 | **Phần 1** | `@chili3d/ui` | `packages/ui/src/viewport/layoutViewport.ts` | Trong `_handleActiveViewChanged`: khi bỏ class `style.hidden` trên viewport kích hoạt, gọi `update()` và `resize()` trong `requestAnimationFrame`. |
| 4 | **Phần 1** | `@chili3d/app` | `packages/app/src/document.ts` | Trong `serialize()` và `save()`: lấy đúng view sở hữu bởi `this` (`this.application.views.find(v => v.document === this)`), tránh lưu nhầm camera thumbnail của dự án khác. Truy cập an toàn `(this.userData as any)?.viewState`. |
| 5 | **Phần 2** | `@chili3d/ui` | `packages/ui/src/project/tree/treeItem.ts` | Trong `onVisibleIconClick`: nếu `this.node` nằm trong danh sách đang chọn nhiều đối tượng (`selected.length > 1`), bật/tắt `visible` đồng loạt cho **toàn bộ đối tượng đang chọn** trong cùng 1 Transaction. |
| 6 | **Phần 2** | `@chili3d/app` | `packages/app/src/commands/folder.ts` | - Nâng cấp `NewFolder` (`create.folder`): hỗ trợ tạo thư mục con đa tầng (`Cha -> Con -> Cháu`), gom hàng loạt đối tượng đang chọn vào `FolderNode` mới và tự động mở ô đổi tên inline rename qua `startRenameNode`.<br>- Thêm các lệnh: `HideSelectedCommand` (`modify.hideSelected`), `ShowAllCommand` (`modify.showAll`), `IsolateSelectedCommand` (`modify.isolateSelected`), `AutoOrganizeTreeCommand` (`modify.autoOrganizeTree`). |
| 7 | **Phần 2** | `@chili3d/ui` | `packages/ui/src/project/tree/tree.ts` | - Hỗ trợ kéo thả `onDrop`: khi thả vào giữa dòng 1 đối tượng hình học (`VisualNode`), tự động tạo `FolderNode` mang tên đối tượng đó và gom các chi tiết con vào trong.<br>- Nâng cấp Context Menu chuột phải: hỗ trợ đa đối tượng (`targetNodes`): Gom nhóm (G), Tự động gom gọn `*_copy`, Ẩn, Hiện, Cô lập (Isolate), Hiện tất cả (Show All), Đổi tên, Phóng tới, Xóa hàng loạt.<br>- Đăng ký lắng nghe sự kiện `startRenameNode` để kích hoạt inline rename khi tạo nhóm. |
| 8 | **Phần 2** | `@chili3d/ui` | `packages/ui/src/project/toolBar.ts` | Thêm nút `"✨ Tự động gom nhóm gọn Cây bản vẽ"` (`command.modify.autoOrganizeTree`) vào thanh công cụ Tree toolbar bên cạnh nút tạo thư mục mới. |
| 9 | **Phần 2** | `@chili3d/app` | `packages/app/src/commands/modify/array.ts` | Trong `executeQuickArray` và `executeMainTask`: khi sao chép mảng không gộp Component (`!isGroup` hoặc `hasInstances`) với $\ge 2$ phần tử, tự động gom toàn bộ các bản sao vào `FolderNode` mang tên `Mảng <Tên> (<SL>)`. |
| 10 | **Phần 3** | `@chili3d/core` | `packages/core/src/foundation/pubsub.ts` & `keys.ts` & `shortcutProfiles.ts` | - Thêm event `startRenameNode: (node: INode) => void` vào `PubSubEventMap`.<br>- Thêm khóa i18n cho lệnh BOM và các lệnh ẩn/hiện/cô lập/gom nhóm.<br>- Đăng ký AutoCAD aliases: `BOM`, `TK`, `THONGKE`, `VT`, `LI`, `LIST` $\rightarrow$ `"measure.bom"`; `G`, `GROUP` $\rightarrow$ `"create.folder"`; `HIDE`, `AN` $\rightarrow$ `"modify.hideSelected"`; `SHOWALL`, `HIEN` $\rightarrow$ `"modify.showAll"`; `ISOLATE`, `COLAP` $\rightarrow$ `"modify.isolateSelected"`.<br>- Phím tắt `"shift+b"` cho `"measure.bom"`. |
| 11 | **Phần 3** | `@chili3d/i18n` | `en.ts`, `vi.ts`, `zh-cn.ts`, `ru.ts` | Bổ sung đầy đủ bản dịch 4 ngôn ngữ cho `"command.measure.bom"`, `"command.modify.*"` và `"toast.bom.copied"`. |
| 12 | **Phần 3** | `@chili3d/ui` | `packages/ui/src/statusbar/commandBar.ts` | Cập nhật gợi ý placeholder: `"Nhập lệnh AutoCAD (VD: L, REC, C, TR, BOM, TK)..."`. |
| 13 | **Phần 3** | `@chili3d/builder` | `packages/builder/src/ribbon.ts` | Bổ sung nút **"📊 Thống kê vật tư (BOM)"** (`measure.bom`) vào nhóm Đo lường (`ribbon.group.measure`) trên tab Cơ bản. |
| 14 | **Phần 3** | `@chili3d/app` | `packages/app/src/commands/measure/bom.ts` & `bom.module.css` & `index.ts` | Triển khai hoàn chỉnh lệnh `BomCommand`, hàm thuật toán `computeBomReport` (đo $L \ge W \ge T$, phân loại vật liệu, tính mét dài và $\text{m}^2$, lọc recursive qua FolderNode), giao diện `showBomDialog` (chuyển đổi scope Đang chọn $\leftrightarrow$ Toàn bộ, chỉnh ĐVT, Đơn giá, Thành tiền, chọn nhanh 3D, xuất CSV UTF-8 BOM, Copy báo giá Zalo, In ấn). |

### 5.2. Kết quả Kiểm thử & Đóng gói (Unit Test & Build Verification)
- **Unit test Home đa dự án:** `packages/ui/test/home.test.ts` (2/2 tests PASSED).
- **Unit test BOM:** `packages/app/test/commands/bom.test.ts` (5/5 tests PASSED).
- **Unit test Thư mục & Ẩn/Hiện/Gom nhóm:** `packages/app/test/commands/folder.test.ts` (10/10 tests PASSED).
- **Toàn bộ Unit Test UI:** 49 test files, 624 tests PASSED 100%.
- **Toàn bộ Unit Test App Commands:** 83 test files, 1104 tests PASSED 100%.
- **Kiểm tra cú pháp & Lint:** `npm run check` (Biome) PASSED.
- **Biên dịch Production:** `npm run build` PASSED (0 lỗi TypeScript, Rspack bundle thành công, plugins macro & visual-programming đóng gói hoàn tất).
- **Triển khai VPS:** Đã chạy `scripts/deploy-vps.sh`, cập nhật thành công lên máy chủ `http://136.66.95.155`.
