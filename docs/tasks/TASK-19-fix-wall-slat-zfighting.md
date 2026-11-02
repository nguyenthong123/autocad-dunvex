# TASK-19: Khắc phục Triệt để Hiện tượng Sọc Caro Đỏ-Xám (Z-Fighting) giữa Bức Tường (`Prism3`) và Các Thanh Lam / Tấm Ốp (`Prism10`, `Prism11`, `Prism12`)

> **Trạng thái:** `[?] WAITING_REVIEW`  
> **Mức độ ưu tiên:** P0 (Critical Visual & Graphic Quality Bug — Sọc caro Z-fighting giữa tường và thanh lam trang trí)  
> **Phụ thuộc:** `TASK-08`, `TASK-18`

---

## 1. Hiện tượng Thực tế & Đo đạc Khách quan

- **Hiện tượng:**
  - Trên máy chủ Live `http://136.66.95.155/`, dự án *"thành-công trình kiến đức"* (`id: "udYMcajQ_OthrFnzPTNwQ"`):
  - Các thanh lam màu đỏ/vàng bên phải tường bị sọc caro đỏ-xám (Z-fighting) loang lổ trên bề mặt tiếp xúc với bức tường xám `Prism3`.
  - Phía bên trái tường hiển thị sạch sẽ, không sọc caro.
- **Ảnh bằng chứng trước khi sửa (Before):**
  - Đã chụp từ trình duyệt headless tại máy chủ VPS live: `screenshots/task19-before.png`.

---

## 2. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

Trong `packages/three/src/threeGeometry.ts` (triển khai từ `TASK-18`):
1. Hàm `isThinOverlaySolid()` kiểm tra:
   `minDim <= 50.0 && maxDim >= 100.0 && minDim / maxDim <= 0.2`
2. Bức tường `Prism3` có kích thước thực tế: $530 \times 10 \times 370\text{ mm}$ (dài $530\text{ mm}$, dày $10\text{ mm}$, cao $370\text{ mm}$).
   - Chiều dày nhỏ nhất $T = 10\text{ mm} \le 50\text{ mm}$.
   - Kích thước lớn nhất $530\text{ mm} \ge 100\text{ mm}$.
   - Tỉ lệ $10 / 530 = 0.018 \le 0.2$.
   $\rightarrow$ `isThinOverlaySolid()` coi bức tường `Prism3` là *"tấm mỏng ốp tường"*!
3. Trong `getPolygonOffsetTier()`:
   `if (this.isThinOverlaySolid() || this.hasCustomFaceMaterial()) return 1;`
   Vì có toán tử `||`, bức tường `Prism3` (dù mang vật liệu mặc định thô `LightGray`) vẫn bị xếp vào **Tier 1**!
4. Sàn `Prism2` ($510 \times 1060 \times 20\text{ mm}$) cũng có độ dày $20\text{ mm} \le 50\text{ mm}$ $\rightarrow$ cũng bị xếp vào **Tier 1**!
5. Các thanh lam `Prism10`, `Prism10_copy`, `Prism12` ($5 \times 21\text{ mm}$) đùn âm `length: -5` vào tường cũng nhận **Tier 1**!
6. **Hệ quả:** Cả tường `Prism3` và các thanh lam `Prism10/12` cùng nhận hệ số offset `factor = -0.5, units = -2.0`. Cả hai mặt phẳng bị GPU đẩy về phía camera cùng một lượng, khoảng cách tương đối trong Z-buffer vẫn là $0\text{ mm}$ $\rightarrow$ GPU không phân biệt được bề mặt nào trước, gây ra sọc caro đỏ-xám (Z-fighting)!

---

## 3. Giải pháp Kỹ thuật Đã Đánh giá & Lựa chọn

### 3.1. Đánh giá 2 Hướng Tiếp cận
- **Hướng 1:** Khối 3D solid không có vật liệu riêng (`!hasCustomFaceMaterial()`, tức dùng vật liệu mặc định của hệ thống `LightGray`) **tuyệt đối không nhận offset (Tier 0)**.
- **Hướng 2:** Tách biệt hình học giữa mảng tường/sàn lớn và thanh lam/tấm ốp mỏng:
  - Bức tường hoặc sàn lớn có 2 chiều kích thước lớn ($\ge 200\text{ mm}$) và độ dày $> 8\text{ mm}$ $\rightarrow$ là khối kết cấu nền, không phải tấm mỏng.
  - Thanh lam / nẹp chỉ: có bề rộng thanh hẹp ($\le 100\text{ mm}$) và chiều dài lớn.
  - Tấm ốp nano / alu: có chiều dày siêu mỏng ($\le 8\text{ mm}$).

### 3.2. Giải pháp Tổng hợp Triệt để (Kết hợp Hướng 1 & Hướng 2)
1. **Ràng buộc Vật liệu riêng cho Tier 1:** Khối 3D solid bắt buộc phải có vật liệu riêng (`hasCustomFaceMaterial() === true`) VÀ thỏa mãn điều kiện tấm mỏng/thanh lam (`isThinOverlaySolid() === true`) mới được nhận Tier 1. Khối mang vật liệu mặc định thô (`LightGray` như `Prism3` và `Prism2`) luôn ở Tier 0.
2. **Loại trừ Mảng Tường/Sàn trong `isThinOverlaySolid()`:** Nếu một khối có 2 chiều $\ge 200\text{ mm}$ và độ dày $> 8\text{ mm}$, nó được định danh là mảng tường hoặc sàn lớn (`isBroadWallOrFloor`), trả về `false` ngay lập tức. Nhờ đó, kể cả khi người dùng đổi màu sơn cho bức tường `Prism3`, bức tường vẫn ở Tier 0 và không bị z-fighting với thanh lam!

---

## 4. Bảng Kiểm tra Hồi quy Chức năng (Regression Matrix)

Kiểm tra trực tiếp trên app đang chạy bản vẽ thực tế *"thành-công trình kiến đức"* (kịch bản tự động hóa `scripts/verify-task19-suite.mjs`):

| Chức năng | Task liên quan | Trạng thái | Bằng chứng kiểm chứng thực tế |
| :--- | :---: | :---: | :--- |
| Tải dự án, mở mắt & Camera Fit 2D/3D | `TASK-15` | **PASS** | Tải đầy đủ 162 nodes, 139 prisms (136 visible), 154 context objects. Bounding sphere tự động căn đúng không văng camera xa. Ảnh bằng chứng: [`screenshots/verification/task15-project-load-fit.png`](../../screenshots/verification/task15-project-load-fit.png). |
| Ưu tiên raycast chi tiết nhỏ đồng phẳng `sortCoplanarHits` | `TASK-18` | **PASS** | Bấm vào bề mặt tiếp xúc giữa tường `Prism3` và thanh lam `Prism10`, `sortCoplanarHits` sắp xếp thanh lam lên trước (`topIsSlat: true`). Chọn thành công `Prism10` với thuộc tính dày -5, vật liệu `lam 3 sóng khổ 21 phân`. Ảnh: [`screenshots/verification/task18-coplanar-slat-selection.png`](../../screenshots/verification/task18-coplanar-slat-selection.png). |
| Chọn đối tượng từ Cây thư mục (Model Tree) | `TASK-13` | **PASS** | Chọn trực tiếp `Rectangle4` trên Cây thư mục thành công (`selectedName: Rectangle4`, `selectedType: 16 (face)`). Ảnh: [`screenshots/verification/task13-extrude-tree-selection.png`](../../screenshots/verification/task13-extrude-tree-selection.png). |
| Đổi màu Đường kẻ & Đồng bộ màu nhiều vật thể | `TASK-14` | **PASS** | Quét chọn đồng thời đường kẻ `Line1` (`hasEdges: true`) và thanh lam `Prism10` (`hasFaces: true`), bảng thuộc tính hiển thị trường `Vật liệu` chung để đổi màu hàng loạt. Ảnh: [`screenshots/verification/task14-wire-multiselect-material.png`](../../screenshots/verification/task14-wire-multiselect-material.png). |
| Chọn `Face1` đồng phẳng và đùn khối | `TASK-08` | **PASS** | Kiểm tra mặt 2D `Rectangle4` (`shapeType: 16 (face)`) đồng phẳng trên sàn/tường, luôn nhận Tier 2 (`polygonOffset = true, factor = -1.0, units = -4.0`), hiển thị nổi hoàn toàn trên bề mặt 3D solid. Ảnh: [`screenshots/verification/task08-coplanar-face-check.png`](../../screenshots/verification/task08-coplanar-face-check.png). |

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

### 5.1. Thông tin Chung & Truy vết Commit
- **Thời gian thực hiện:** 2026-11-02 21:25 (GMT+7)
- **Kỹ sư AI thực thi:** Antigravity Worker AI
- **Mã Commit Code Fix:** `7e7cfb53` (`🐛 fix(three): eliminate wall and slat coplanar z-fighting with geometric tier filtering`)
- **Mã Commit Test & Bằng chứng:** `5db2344c` (`test(three): verify tier 0 assignment for thick solids with custom material`)
- **Ghi chú Hash Commit:** Theo quy tắc bất biến của Git, một commit không thể tự nhúng hash của chính nó. Do đó, mã commit sửa code là `7e7cfb53`, mã commit bổ sung test là `5db2344c`, và commit tài liệu này được tạo riêng biệt sau đó.
- **Trạng thái:** `[?] WAITING_REVIEW` (Chờ người dùng nghiệm thu)

### 5.2. Bảng kê File Thay đổi & Chi tiết Kỹ thuật
| File | Vị trí / Hàm | Mô tả thay đổi kỹ thuật |
| :--- | :--- | :--- |
| `packages/three/src/threeGeometry.ts` | `isThinOverlaySolid()` | Phân loại chính xác 3 chiều `[minDim, midDim, maxDim]`: loại trừ các mảng tường/sàn lớn (`minDim > 8mm && midDim >= 200mm && maxDim >= 200mm`), chỉ nhận tấm ốp siêu mỏng ($\le 8\text{mm}$) hoặc thanh lam hẹp ($\text{min} \le 50\text{mm}, \text{mid} \le 100\text{mm}, \text{max} \ge 100\text{mm}$). |
| `packages/three/src/threeGeometry.ts` | `getPolygonOffsetTier()` | Tier 1 bắt buộc thỏa mãn cả 2 điều kiện: `hasCustomFaceMaterial() && isThinOverlaySolid()`. Khối solid mang vật liệu mặc định thô (`LightGray` như tường `Prism3`, sàn `Prism2`) luôn ở Tier 0. |
| `packages/three/src/threeGeometry.ts` | `updateEffectiveFaceMaterial()` | Đồng bộ ngay `this._faces.material = this._effectiveFaceMaterial!` khi `this._faces && !this.locked` để đảm bảo Three.js render đúng polygonOffset ngay khi gán vật liệu. |
| `packages/three/test/threeGeometry.test.ts` | Suite `construction` | Bổ sung 4 unit test: (1) Tường và sàn mặc định ở Tier 0; (2) Thanh lam có vật liệu riêng nhận Tier 1; (3) Tường lớn sơn màu vẫn ở Tier 0; (4) Khối đặc dày có vật liệu riêng (tủ $300 \times 400 \times 500$) nhận Tier 0. |
| `ROADMAP.md` | Bảng Roadmap & Mục 2 | Thêm `TASK-19` và cập nhật trạng thái `[?] WAITING_REVIEW`. |
| `screenshots/verification/` | Bằng chứng thực nghiệm | Bộ 11 ảnh chụp kiểm chứng đa góc nhìn (Before/After) và ảnh chứng minh 5 kịch bản kiểm tra hồi quy. |
| `scripts/verify-task19-suite.mjs` | Tooling | Kịch bản tự động hóa CDP kiểm chứng toàn diện 5 kịch bản hồi quy và 3 góc nhìn $\times$ 2 cự ly. |

### 5.3. Kết quả Kiểm thử & Build
- **Linter & Code Format:** `npm run check` $\rightarrow$ 0 lỗi.
- **Toàn bộ Unit Tests:** `npm run test` $\rightarrow$ **586/586 file pass, 9.983/9.983 test pass**, 0 lỗi.
- **Production Build:** `npm run build` $\rightarrow$ Biên dịch thành công Rspack production bundle và plugins.
- **Triển khai VPS Live:**
  - Script `FORCE_BUILD=0 bash scripts/deploy-vps.sh` đã chạy hoàn tất.
  - Container `autocad-dunvex-chili3d-1` đã chạy trên máy chủ `http://136.66.95.155/`.

---

## 6. Đánh giá Góc nhìn, Cự ly & Rủi ro Kỹ thuật

### 6.1. Danh sách 3 Góc nhìn và 2 Cự ly (Before & After)
Đã chụp trực tiếp từ vị trí tọa độ thực tế của thanh lam (`slatCenter = {-800, -714.5, -45.9}`):
1. **Góc 1 — Phối cảnh Isometric (Facing Slat):**
   - Far (Xa): [`angle1-iso-far-before.png`](../../screenshots/verification/angle1-iso-far-before.png) vs [`angle1-iso-far-after.png`](../../screenshots/verification/angle1-iso-far-after.png)
   - Close (Gần): [`angle1-iso-close-before.png`](../../screenshots/verification/angle1-iso-close-before.png) vs [`angle1-iso-close-after.png`](../../screenshots/verification/angle1-iso-close-after.png)
   - *Kết quả:* Trước khi sửa, các thanh lam vàng bị vệt sọc xám cắt ngang; sau khi sửa hiển thị sạch và đồng nhất.
2. **Góc 2 — Chính diện trực giao (Frontal View):**
   - Far (Xa): [`angle2-front-far-before.png`](../../screenshots/verification/angle2-front-far-before.png) vs [`angle2-front-far-after.png`](../../screenshots/verification/angle2-front-far-after.png)
   - Close (Gần): [`angle2-front-close-before.png`](../../screenshots/verification/angle2-front-close-before.png) vs [`angle2-front-close-after.png`](../../screenshots/verification/angle2-front-close-after.png)
   - *Kết quả:* Sau khi sửa, bề mặt lam đỏ/vàng phẳng mịn tuyệt đối, không có vệt rách do Z-fighting.
3. **Góc 3 — Góc nhìn xiên hẹp sát bề mặt tường (Oblique Grazing Side Angle):**
   - Far (Xa): [`angle3-side-far-before.png`](../../screenshots/verification/angle3-side-far-before.png) vs [`angle3-side-far-after.png`](../../screenshots/verification/angle3-side-far-after.png)
   - Close (Gần): [`angle3-side-close-before.png`](../../screenshots/verification/angle3-side-close-before.png) vs [`angle3-side-close-after.png`](../../screenshots/verification/angle3-side-close-after.png)
   - *Ghi chú trung thực:* Ở góc nhìn xiên cực hẹp sát mép tường ($< 5^\circ$), do giới hạn độ chính xác z-buffer của WebGL khi góc chiếu gần như song song với mặt phẳng, vẫn có thể xuất hiện độ rung vi mô ở mép biên ngoài cùng. **Không tuyên bố "sạch 100%" ở mọi góc nhìn cực đoan.**

### 6.2. Phân tích Rủi ro Khối đặc Dày có Màu Riêng Đặt Sát Tường
- **Hành vi thực tế:** Unit test `assigns tier 0 to thick solid with custom material (e.g. 300x400x500 cabinet)` chứng minh: Một khối đặc dày (ví dụ tủ gỗ dày 300mm) có màu riêng sẽ nhận **Tier 0** (không offset).
- **Hệ quả:** Nếu người dùng đặt một khối tủ dày 300mm đồng phẳng mặt trước với bức tường (cũng Tier 0), tại diện tích tiếp xúc nhìn thấy từ camera, hai khối sẽ có cùng độ sâu Z-buffer và xảy ra hiện tượng Z-fighting.
- **Đề xuất giải pháp lâu dài:**
  - Không nên tự động đẩy mọi khối đặc có màu lên Tier 1, vì nếu tường được sơn màu (cũng có màu riêng) thì cả hai lại cùng Tier 1 và vẫn Z-fight.
  - Trong CAD, hai khối đặc dày tiếp giáp nhau nên được giải quyết thông qua lệnh Boolean Union hoặc gán thuộc tính hiển thị tường minh (ví dụ nút "Đưa lên trên / Bring to Front" trong Bảng thuộc tính).
