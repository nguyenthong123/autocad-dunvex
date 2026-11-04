# TASK-37: Bằng chứng Thực tế trên App Thật cho AI run_command và Parity BOM

> **Trạng thái:** `[?] WAITING_REVIEW`  
> **Người thực hiện:** AI Thợ (Executor)  
> **Môi trường kiểm thử:** Trình duyệt Headless Chrome (CDP WebSocket) kết nối ứng dụng Chili3D thật chạy tại `http://localhost:8080/` (dev server active, kernel WebAssembly OCCT v8.0.0 khởi tạo đầy đủ).  
> **Bằng chứng thực thi:** Lưu tại `docs/tasks/TASK-37-evidence/`.

---

## 1. Mục tiêu Kiểm thử Thực tế
Xác minh thực tế trên ứng dụng Chili3D đang chạy (không dùng mock):
1. **BOM Parity:** Đảm bảo tool AI `bom_report` và thuật toán UI `computeBomReport` (`packages/app/src/commands/measure/bom.ts`) cho kết quả đồng nhất 100% trên cùng một tập đối tượng 3D thực.
2. **`run_command` Thực tế:** Kiểm tra tool AI `run_command` điều khiển ứng dụng thật qua 4 bước: kiểm tra điều kiện tiên quyết khi selection rỗng, ẩn đối tượng khi được chọn, hiện lại toàn bộ bản vẽ, và từ chối lệnh trùng lặp (`U` -> `undo`).
3. **Cổng Hậu kiểm (Verification Gate):** Đánh giá luồng hậu kiểm của AI Agent.

---

## 2. Bằng chứng C1: Parity Tuyệt đối giữa `bom_report` (AI) và `computeBomReport` (UI)

### 2.1. Thiết lập Mô hình Kiểm thử Thực tế
Tạo trên tài liệu thật (`doc.new`):
- `Box 100x50x20` (dx: 100, dy: 50, dz: 20 mm, vật liệu mặc định `#dedede`)
- `Box 200x50x50` (dx: 200, dy: 50, dz: 50 mm, vật liệu mặc định `#dedede`)
- `Box 500x300x18` (dx: 500, dy: 300, dz: 18 mm, vật liệu mặc định `#dedede`)
- `TestFolder` (FolderNode rỗng, kiểm tra bỏ qua node nhóm)

### 2.2. Bảng Đối chiếu Chi tiết Từng Dòng Dữ liệu

| STT | Quy cách Kích thước (`dimensions`) | Chiều dài `lengthMm` | Chiều rộng `widthMm` | Độ dày `thicknessMm` | Số lượng `count` | Chiều dài `totalLengthM` | Diện tích `totalAreaM2` | Đơn vị `unit` | AI Form | Trạng thái Khớp |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `100 × 50 × 20 mm` | UI: 100<br>AI: 100 | UI: 50<br>AI: 50 | UI: 20<br>AI: 20 | UI: 1<br>AI: 1 | UI: 0.1<br>AI: 0.1 | UI: 0.01<br>AI: 0.01 | UI: piece<br>AI: piece | block | **KHỚP 100%** |
| 2 | `200 × 50 × 50 mm` | UI: 200<br>AI: 200 | UI: 50<br>AI: 50 | UI: 50<br>AI: 50 | UI: 1<br>AI: 1 | UI: 0.2<br>AI: 0.2 | UI: 0.01<br>AI: 0.01 | UI: piece<br>AI: piece | bar | **KHỚP 100%** |
| 3 | `500 × 300 × 18 mm` | UI: 500<br>AI: 500 | UI: 300<br>AI: 300 | UI: 18<br>AI: 18 | UI: 1<br>AI: 1 | UI: 0.5<br>AI: 0.5 | UI: 0.15<br>AI: 0.15 | UI: piece<br>AI: piece | sheet | **KHỚP 100%** |

- File xuất UI BOM: `docs/tasks/TASK-37-evidence/bom-report-ui.json` (3 mặt hàng).
- File xuất AI BOM: `docs/tasks/TASK-37-evidence/bom-report-ai.json` (3 mặt hàng kèm `summary` và `form`).
- **Kết luận C1:** Sai lệch = 0. Thuật toán gom nhóm, làm tròn (`Math.round(val * 10) / 10`), tính diện tích và phân loại đơn vị khớp nhau tuyệt đối.

---

## 3. Bằng chứng C2: Kiểm tra `run_command` trên App Thật

| Bước | Lệnh gọi | Trạng thái Chọn (`Selection`) | Kết quả Thực tế | Bằng chứng Trạng thái Đối tượng | Đánh giá |
|:---:|:---|:---|:---|:---|:---:|
| 1 | `HIDE` (`modify.hideSelected`) | Rỗng (0 node) | Chặn thực thi: `preconditionFailed: true`, `success: false`. Thông báo: *"Lệnh 'modify.hideSelected' yêu cầu phải có đối tượng đang được chọn..."* | Không có lệnh nào được dispatch sai. | **PASSED** |
| 2 | `HIDE` (`modify.hideSelected`) | Đã chọn `Box 100x50x20` | Thực thi thành công: `success: true`, `completed: true`. | `targetBox.visible === false` (Node thật bị ẩn khỏi viewport). | **PASSED** |
| 3 | `SHOWALL` (`modify.showAll`) | Không chọn | Thực thi thành công: `success: true`, `completed: true`. | `targetBox.visible === true` (Node thật đã hiện lại). | **PASSED** |
| 4 | `U` (alias của `edit.undo`) | - | Bị từ chối: `success: false`, `isDuplicateTool: true`. Hướng dẫn: *"Lệnh 'edit.undo' trùng với công cụ có sẵn. Hãy sử dụng tool 'undo'..."* | Không chạy lệnh trùng lặp, hướng dẫn đúng tool chuyên biệt. | **PASSED** |

- File log chi tiết 4 bước: `docs/tasks/TASK-37-evidence/run-command-real-app.json`.
- **Kết luận C2:** Toàn bộ 4 kịch bản điều khiển lệnh trên app thật đều hoàn thành đúng logic an toàn.

---

## 4. Phát hiện Kỹ thuật & Hiện trạng Cổng Hậu kiểm (C3, C4)

### 4.1. Phát hiện Kỹ thuật (C4)
1. **Xử lý Thư mục Rỗng (`FolderNode`):** Cả UI `computeBomReport` và AI `bom_report` đều bỏ qua các folder rỗng vì folder không có bounding box hình học 3D (`!(n instanceof FolderNode)`). Logic cây thư mục được giữ an toàn.
2. **Tính Năng Bổ sung của AI BOM:** Ngoài 100% các trường khớp với UI, tool AI cung cấp thêm:
   - `form` ("sheet" | "bar" | "block" | "profile" | "hardware") giúp LLM hiểu tính chất vật tư xưởng gỗ/cơ khí.
   - `summary` (`totalTypes`, `totalPieces`, `totalLengthM`, `totalAreaM2`).
   - `hiddenCount` thông báo số chi tiết đang bị ẩn trong bản vẽ.

### 4.2. Hiện trạng Kiểm thử Cổng Hậu kiểm với Agent Thật (C3)
- **CHƯA KIỂM — thiếu khóa LLM (không giả lập kết quả thành công):** Môi trường chạy tự động hiện tại chưa cấu hình biến môi trường chứa LLM API key trực tiếp (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`).
- **Phạm vi đã kiểm chứng bằng code:**
  - Logic Verification Gate trong `agent.ts` (phát hiện `needsVerification`, nhắc nhở `verifyNudges`, đánh dấu `lastVerification`) đã được kiểm thử 100% tự động trong `packages/ai/test/agent.test.ts` (EXIT=0).
  - Trạng thái hiển thị cảnh báo `⚠️ Chưa kiểm chứng` trên thanh trạng thái phiên AI đã được kiểm thử trong `packages/ai/test/chatPanel.test.ts` (EXIT=0).

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

### 5.1. Bằng chứng Thực thi
- **Lệnh thực thi:** `node scripts/verifyTask37RealApp.mjs`
- **File nhật ký gốc:** `docs/tasks/TASK-37-evidence/task37-execution.log`
- **Thời gian chạy:** 2026-11-04T05:30:25Z
- **Commit SHA đối chiếu:** `511de32046c7c61d4d19a664e1cbfe108415a400`
- **Mã thoát (Exit Code):** `EXIT=0`

### 5.2. Danh mục Bằng chứng Lưu trữ
- `docs/tasks/TASK-37-evidence/bom-report-ui.json`: Báo cáo BOM xuất từ hàm UI `computeBomReport`.
- `docs/tasks/TASK-37-evidence/bom-report-ai.json`: Báo cáo BOM xuất từ tool AI `bom_report`.
- `docs/tasks/TASK-37-evidence/run-command-real-app.json`: Kết quả thực thi 4 bước `run_command` trên app thật.
- `docs/tasks/TASK-37-evidence/task37-execution.log`: Toàn bộ đầu ra log thực tế từ đầu đến cuối có gắn mã thoát.

### 5.3. Trạng thái Triển khai
- **CHƯA DEPLOY** (Tuân thủ nghiêm ngặt quy tắc không tự ý deploy VPS và không git push).
