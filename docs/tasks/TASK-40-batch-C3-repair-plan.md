# TASK-40 Đợt C3 — Phương án sửa sai theo sai lệch đo được (chờ Reviewer duyệt, CHƯA code)

Nền tảng:
- C1/C1.1/C1.2/C1.3 (`9f6beda9`, nghiệm thu metadata `70e41818`)
- C2 (`7e659dff`, đã duyệt: dòng criteria → đo trên kernel thật → thẻ bằng chứng hậu kiểm, đối chiếu tài liệu đang mở và dừng khi đổi tài liệu)
- Đã triển khai và nghiệm thu trên VPS (`http://136.66.95.155`, hai endpoint `version.json` và `deploy-version.json` cùng SHA `7e659dff1300ae012a45b7df072ffd4c0ef73000`).

**TÀI LIỆU NÀY LÀ BẢN ĐẶC TẢ PHƯƠNG ÁN CHỜ DUYỆT. VÒNG TỰ SỬA CHƯA CODE VÀ CHƯA CẤP QUYỀN GHI MỚI.**

---

## 1. Nguyên lý vận hành: Luồng khép kín (Máy đo → Người duyệt → Máy sửa → Máy đo lại)

```
finalizeTaskVerification (C2) ──► Có hàng ❌ [bắt buộc] (status = "fail")
  │
  ├── 1. TRÍCH XUẤT SAI LỆCH CÓ CẤU TRÚC (Structured Deltas)
  │      Runner trả về mảng chi tiết: { subjectNodeId, kind, axis, measuredMm, expectedMm, deltaMm, toleranceMm }
  │      Không có số đo số học xác định → KHÔNG có cơ sở sửa.
  │
  ├── 2. BẢO TOÀN TIÊU CHÍ VÀ QUYỀN ĐÃ DUYỆT (Invariance Check)
  │      - Tiêu chí: Tái sử dụng chính xác mảng `criteria` ban đầu (cùng id, expected, tolerance, unit).
  │        TUYỆT ĐỐI KHÔNG nới lỏng dung sai, không xoá tiêu chí khó để đạt giả.
  │      - Quyền hạn: Scope sửa `allowedModifiedNodeIds` chỉ gồm các node do task tạo hoặc node đã được duyệt.
  │        TUYỆT ĐỐI KHÔNG nới rộng quyền ra các node ngoài scope đã duyệt.
  │
  ├── 3. BỘ QUY TẮC DỪNG (Stopping Rules)
  │      - Thiếu dữ liệu / unknown: DỪNG NGAY. Báo người dùng làm rõ đối tượng/thông số, không sửa mù.
  │      - Không tiến triển: |delta mới| >= |delta cũ| → DỪNG NGAY, không thử mò lặp lại.
  │      - Giới hạn cứng: Tối đa 2 lần sửa (repairAttempts <= 2) cho mỗi tác vụ.
  │
  ├── 4. ĐỀ XUẤT SỬA MINH BẠCH (Repair Proposal Card)
  │      Card hiển thị rõ: "Lệch trục X: đo 700 mm, mong 800 mm (lệch -100 mm) → Đề xuất sửa dx: 700 → 800 mm".
  │      Người dùng bấm duyệt ("Duyệt sửa") thật trên UI. Không duyệt → dừng, giữ nguyên thẻ ❌.
  │
  ├── 5. THỰC THI QUA GOVERNED ROUTER (Cổng Đợt B)
  │      Chạy lệnh sửa (cập nhật tham số hoặc dịch chuyển bù sai lệch).
  │      Cổng an toàn Đợt B kiểm soát từng thao tác, từ chối nếu vi phạm bảo vệ nguồn.
  │
  └── 6. ĐO LẠI ĐỘC LẬP & ĐÁNH GIÁ HỘI TỤ
         `finalizeTaskVerification` chạy lại trên tài liệu đang mở.
         - Nếu mọi tiêu chí bắt buộc đạt: lật sang ✔ HOÀN TẤT.
         - Nếu chưa đạt nhưng có tiến triển (|delta mới| < |delta cũ|) và chưa quá 2 lần: đề xuất sửa lần 2.
         - Nếu không tiến triển hoặc đã hết 2 lần: DỪNG VĨNH VIỄN, giữ thẻ ❌ kèm bảng lệch để người dùng xử lý.
```

---

## 2. Chi tiết 4 trụ cột kỹ thuật của Đợt C3

### 2.1. Cách dùng sai lệch đo được để đề xuất sửa (Delta-Driven Repair)

Runner của Đợt C2 đã có số đo thật trên kernel. C3 bổ sung channel dữ liệu cấu trúc song song với text mô tả:

```ts
export interface CriterionStructuredDelta {
    criterionId: string;
    subjectNodeId: string;
    kind: "dimension_match" | "position_match";
    axis: "X" | "Y" | "Z";
    measuredMm: number;
    expectedMm: number;
    deltaMm: number;        // measuredMm - expectedMm
    toleranceMm: number;
}
```

**Chiến lược tính toán điều chỉnh:**
1. **Lỗi kích thước (`dimension_match`):**
   - Với khối cơ bản (`BoxNode`): Trục X lệch $\Delta X = \text{measured} - \text{expected} = -100\text{ mm} \implies \text{dx}_{\text{mới}} = \text{dx}_{\text{cũ}} - \Delta X = 700 - (-100) = 800\text{ mm}$.
   - Tương tự với trục Y (`dy`) và trục Z (`dz`).
2. **Lỗi vị trí (`position_match`):**
   - Tâm lệch theo trục Y: $\Delta Y = \text{measured} - \text{expected} = +400\text{ mm}$.
   - Vector bù vị trí: $\vec{T}_{\text{bù}} = [-\Delta X, -\Delta Y, -\Delta Z] = [0, -400, 0]\text{ mm}$.
   - Phát lệnh `transform_node` với translate bù để đưa đối tượng về đúng vị trí mong đợi.
3. **Minh bạch trên giao diện:** Card đề xuất nêu rõ giá trị hiện tại, sai lệch đo được, và giá trị sửa được tính toán toán học chính xác, không dùng văn bản cảm tính.

---

### 2.2. Cách giữ nguyên tiêu chí và quyền đã duyệt (Criteria & Scope Invariance)

Bảo toàn tính nghiêm ngặt của hệ thống đánh giá:
1. **Bảo toàn tiêu chí (Criteria Immutability):**
   - Bộ tiêu chí `criteria` của đề xuất sửa được clone 100% từ lần duyệt đầu: giữ nguyên `id`, `kind`, `expected`, `toleranceMm`, `required`, `unit`.
   - Cấm agent sửa đổi dung sai (ví dụ: thấy lệch 10 mm không được tự ý sửa tolerance từ 2 mm thành 15 mm để pass).
   - Mọi tiêu chí không pass trong lần đo trước phải được đo lại với cùng thước đo.
2. **Bảo toàn quyền hạn (Scope Containment):**
   - Danh sách `allowedModifiedNodeIds` của đề xuất sửa chỉ được chứa các node nằm trong `taskOwnedNodeIds` (node do task tạo) hoặc các node đã được cấp phép sửa ban đầu.
   - Tuyệt đối không cho phép thêm node mới vào danh sách quyền sửa mà không có sự đồng ý của người dùng.
   - Cổng router Đợt B tiếp tục chặn nếu bất kỳ lệnh sửa nào chạm vào các node ngoài scope đã duyệt.
3. **Quyền quyết định tối cao thuộc về người dùng:**
   - Đề xuất sửa hiển thị dưới dạng card xác nhận có nút "Duyệt sửa" và "Từ chối".
   - Agent không được tự ý ghi vào model nếu người dùng chưa nhấn "Duyệt sửa".

---

### 2.3. Quy tắc dừng khi thiếu dữ liệu hoặc không tiến triển (Strict Termination & Anti-Looping)

1. **Dừng khi thiếu dữ liệu (`unknown`):**
   - Nếu bất kỳ tiêu chí bắt buộc nào rơi vào trạng thái `unknown` (ví dụ: không tìm thấy đối tượng, tên gợi ý trùng lặp nhiều node, thiếu đơn vị đo, hình học không đọc được bbox):
   - **Hành vi:** KHÔNG kích hoạt luồng tự sửa. Dừng lại và gửi thông báo yêu cầu người dùng làm rõ đối tượng hoặc quy cách. Sửa khi không biết kích thước/vị trí thật là vi phạm an toàn CAD.
2. **Quy tắc kiểm tra tiến triển (Convergence Check):**
   - Trước khi đề xuất lần 2, hệ thống đối chiếu độ lớn sai lệch:
     $$\epsilon_{\text{now}} = \max_{i} |\Delta_i^{\text{now}}|$$
     $$\epsilon_{\text{prev}} = \max_{i} |\Delta_i^{\text{prev}}|$$
   - **Tiến triển:** $\epsilon_{\text{now}} < \epsilon_{\text{prev}}$ (sai lệch giảm rõ rệt và không phát sinh lỗi mới). Cho phép đề xuất sửa tiếp lần 2.
   - **Không tiến triển / Xấu đi:** $\epsilon_{\text{now}} \ge \epsilon_{\text{prev}}$ hoặc số trục lỗi tăng lên $\implies$ **DỪNG NGAY LẬP TỨC**. Báo lỗi "Thao tác sửa không làm giảm sai lệch — dừng vòng tự động để tránh phá hỏng mô hình".
3. **Giới hạn số lần sửa (Max 2 Attempts):**
   - Mỗi task chỉ có tối đa 2 lần sửa được người dùng duyệt (`repairAttempts <= 2`).
   - Nếu sau lần sửa thứ 2 vẫn còn tiêu chí bắt buộc `fail` hoặc `unknown`:
     - Giữ nguyên thẻ với các dòng `❌` / `❓`.
     - Giữ badge `⏳ CHƯA HOÀN TẤT`.
     - Bàn giao kết quả kèm báo cáo chi tiết sai lệch từng trục, dừng vòng lặp tự động và chờ người dùng thao tác trực tiếp trên giao diện CAD.
4. **Phát hiện can thiệp bên ngoài (State Drift):**
   - Nếu trong quá trình chuẩn bị sửa hoặc đo lại, người dùng thực hiện thao tác UI ngoài luồng (undo, di chuyển, xóa node): toàn bộ bằng chứng và vòng sửa cũ bị hủy ngay lập tức (`state-drift-during-measurement`), trở về trạng thái chưa kiểm chứng.

---

### 2.4. Trạng thái và dữ liệu lưu trữ (State Tracking trong TaskProfile)

Bổ sung trường vào `TaskScope`:
```ts
export interface TaskScope {
    taskId: string;
    documentId: string;
    status: "active" | "completed" | "cancelled";
    repairAttempts: number;                 // Bắt đầu từ 0, tối đa 2
    lastDeltas?: CriterionStructuredDelta[]; // Mốc sai lệch đo được ở lần kiểm tra gần nhất
    taskOwnedNodeIds: readonly string[];
    criteria?: readonly CriterionSpec[];
    // ... các trường bảo vệ nguồn Đợt B giữ nguyên
}
```

---

## 3. Ma trận kiểm chứng nghiệm thu dự kiến cho Đợt C3

| Mã kịch bản | Mô tả tình huống | Kỳ vọng hành vi hệ thống |
|---|---|---|
| **C3-T1** | Sửa kích thước đạt (lệch -100 mm trục X) | Lần 1: đo ra lệch -100 mm $\implies$ đề xuất đổi `dx: 700 → 800` $\implies$ người dùng duyệt $\implies$ đo lại pass $\implies$ `✔ HOÀN TẤT` (tổng 1 lần sửa). |
| **C3-T2** | Sửa vị trí đạt (lệch +400 mm trục Y) | Lần 1: đo ra lệch +400 mm $\implies$ đề xuất dịch chuyển `[-400] Y` $\implies$ người dùng duyệt $\implies$ đo lại pass $\implies$ `✔ HOÀN TẤT` (tổng 1 lần sửa). |
| **C3-T3** | Sửa không tiến triển (thử sửa nhưng lệch không giảm) | Lần 1 lệch 100 mm $\implies$ sửa xong lần 1 vẫn lệch 100 mm hoặc tăng lên 120 mm $\implies$ phát hiện $\epsilon_{\text{now}} \ge \epsilon_{\text{prev}} \implies$ **DỪNG NGAY**, không đề xuất lần 2, giữ `⏳ CHƯA HOÀN TẤT`. |
| **C3-T4** | Chặn tự sửa khi có trạng thái `unknown` | Tiêu chí trỏ tên không tồn tại hoặc thiếu dung sai $\implies$ card hiện `❓` $\implies$ **KHÔNG kích hoạt tự sửa**, yêu cầu làm rõ. |
| **C3-T5** | Chặn sửa vượt quyền đã duyệt | Đề xuất sửa cố tình tác động vào node ngoài `allowedModifiedNodeIds` $\implies$ Router Đợt B chặn ngay lập tức. |
| **C3-T6** | Chạm trần 2 lần sửa vẫn không đạt | Lần 1 sửa còn lệch 20 mm $\implies$ Lần 2 sửa còn lệch 5 mm (vẫn vượt tol 2 mm) $\implies$ Hết 2 lượt $\implies$ **DỪNG**, giữ thẻ `❌` vĩnh viễn, không cho sửa lần 3. |

---

## 4. Kế hoạch triển khai khi Reviewer phê duyệt

1. **Bước 1:** Bổ sung trích xuất `CriterionStructuredDelta` trong [`packages/ai/src/governance/verification/runners/geometry.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/governance/verification/runners/geometry.ts).
2. **Bước 2:** Bổ sung theo dõi `repairAttempts` và hàm `evaluateRepairProgress` trong [`packages/ai/src/governance/verification/runtime.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/governance/verification/runtime.ts).
3. **Bước 3:** Tích hợp card đề xuất sửa trong [`packages/ai/src/chatPanel.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/chatPanel.ts), hiển thị so sánh trước/sau và nút duyệt.
4. **Bước 4:** Viết suite test tự động (unit test + kernel test + CDP scenario) bao phủ toàn bộ 6 ca trong ma trận trên.
5. **Bước 5:** Báo cáo nghiệm thu Đợt C3 cho reviewer trước khi tích hợp vào dev/main.

