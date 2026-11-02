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

| Chức năng | Task liên quan | Trạng thái | Ghi chú kiểm chứng |
| :--- | :---: | :---: | :--- |
| Chọn `Face1` đồng phẳng và đùn khối | `TASK-08` | **PASS** | Mặt 2D `Face1` giữ nguyên Tier 2 (`factor = -1.0, units = -4.0`), luôn nổi trên khối 3D. |
| Chọn đối tượng từ Cây thư mục (Model Tree) | `TASK-13` | **PASS** | `tree.canSelect()` và `extractVisualShapesFromNodes` không bị ảnh hưởng. |
| Đổi màu Đường kẻ & Đồng bộ màu nhiều vật thể | `TASK-14` | **PASS** | `getCustomEdgeColor()` và `updateEdgeMaterials()` giữ nguyên. |
| Tải dự án, mở mắt & Camera Fit 2D/3D | `TASK-15` | **PASS** | `getBoundingSphere` và logic phục hồi mesh giữ nguyên. |
| Ưu tiên raycast chi tiết nhỏ đồng phẳng `sortCoplanarHits` | `TASK-18` | **PASS** | `sortCoplanarHits` ưu tiên bounding box nhỏ hơn và 2D trước 3D solid giữ nguyên. |
| Hover chuột không giật lag | `TASK-18` | **PASS** | Deduplication trong `highlightDetecteds` giữ nguyên. |

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

### 5.1. Thông tin Chung
- **Thời gian thực hiện:** 2026-11-02 21:05 (GMT+7)
- **Kỹ sư AI thực thi:** Antigravity Worker AI
- **Mã Commit:** `1e821b04`
- **Trạng thái:** `[?] WAITING_REVIEW` (Chờ người dùng nghiệm thu)

### 5.2. Bảng kê File Thay đổi & Chi tiết Kỹ thuật
| File | Vị trí / Hàm | Mô tả thay đổi kỹ thuật |
| :--- | :--- | :--- |
| `packages/three/src/threeGeometry.ts` | `isThinOverlaySolid()` | Phân loại chính xác 3 chiều `[minDim, midDim, maxDim]`: loại trừ các mảng tường/sàn lớn (`minDim > 8mm && midDim >= 200mm && maxDim >= 200mm`), chỉ nhận tấm ốp siêu mỏng ($\le 8\text{mm}$) hoặc thanh lam hẹp ($\text{min} \le 50\text{mm}, \text{mid} \le 100\text{mm}, \text{max} \ge 100\text{mm}$). |
| `packages/three/src/threeGeometry.ts` | `getPolygonOffsetTier()` | Tier 1 bắt buộc thỏa mãn cả 2 điều kiện: `hasCustomFaceMaterial() && isThinOverlaySolid()`. Khối solid mang vật liệu mặc định thô (`LightGray` như tường `Prism3`, sàn `Prism2`) luôn ở Tier 0. |
| `packages/three/src/threeGeometry.ts` | `updateEffectiveFaceMaterial()` | Đồng bộ ngay `this._faces.material = this._effectiveFaceMaterial!` khi `this._faces && !this.locked` để đảm bảo Three.js render đúng polygonOffset ngay khi gán vật liệu. |
| `packages/three/test/threeGeometry.test.ts` | Suite `construction` | Thêm 3 unit test kiểm chứng: tường và sàn mặc định ở Tier 0 (không offset), thanh lam có vật liệu riêng nhận Tier 1 (`factor -0.5, units -2.0`), tường lớn kể cả khi sơn màu vẫn ở Tier 0. |
| `ROADMAP.md` | Bảng Roadmap & Mục 2 | Thêm `TASK-19` và cập nhật trạng thái `[?] WAITING_REVIEW`. |
| `screenshots/task19-before.png` | VPS screenshot | Ảnh chụp thực tế trước khi sửa từ VPS: các thanh lam bên phải tường bị sọc caro đỏ-xám (Z-fighting) loang lổ. |
| `screenshots/task19-after.png` | VPS screenshot | Ảnh chụp thực tế sau khi sửa và deploy lên VPS: toàn bộ thanh lam bên phải tường hiển thị mịn màng, sắc nét, sạch 100% sọc caro Z-fighting. |
| `scripts/capture-vps-screenshot.mjs` | Tooling | Kịch bản tự động hóa chụp ảnh màn hình dự án từ VPS live qua Chrome DevTools Protocol (CDP). |

### 5.3. Kết quả Kiểm thử & Build
- **Linter & Code Format:** `npm run check` $\rightarrow$ Đạt chuẩn Biome.
- **Toàn bộ Unit Tests:** `npm run test` $\rightarrow$ **586/586 file pass, 9.983/9.983 test pass**, 0 lỗi.
- **Production Build:** `npm run build` $\rightarrow$ Biên dịch thành công Rspack production bundle và plugins.
- **Triển khai VPS Live:**
  - Script `FORCE_BUILD=0 bash scripts/deploy-vps.sh` chạy hoàn tất.
  - Container `autocad-dunvex-chili3d-1` đã recreate và chạy thành công trên máy chủ `http://136.66.95.155/`.
  - Ảnh chụp kiểm chứng sau deploy tại `screenshots/task19-after.png` xác nhận thanh lam hoàn toàn sạch lỗi Z-fighting.
