# TASK-40 Đợt C — Phương án triển khai (chờ Reviewer duyệt)

> **Ngày:** 06/11/2026  
> **Trạng thái:** `WAITING_REVIEWER_APPROVAL` — chưa viết mã Đợt C  
> **Căn cứ:** Đợt B đã triển khai kiểm tra trên VPS (tip `c5caebd6`, code `b7db4591`)  
> **Tuyên bố ràng buộc:** Đợt B **đã bảo vệ phạm vi** (nguồn / cổng quyền / Undo chuỗi / vòng đời thẻ & quy tắc). **Hậu kiểm theo tiêu chí (criteria verification) và bảng dung sai chưa có hiệu lực.**

---

## 1. Mục tiêu Đợt C

Bổ sung lớp **hậu kiểm có phạm vi hỗ trợ rõ** sau các mutation trong phạm vi kế hoạch đã duyệt, kèm vòng sửa sai và UI trạng thái bằng chứng — **không** thay thế cổng quyền Đợt B.

| Thành phần | Mô tả | Ngoài phạm vi Đợt C |
| --- | --- | --- |
| Criteria engine | Phép kiểm hình học/topology có trạng thái `pass` / `fail` / `unknown` | Selective inversion (đề tài riêng) |
| Evidence lifecycle | Gắn bằng chứng với task + node ids; vô hiệu hóa khi hình học/ids đổi | Sync quy tắc đa thiết bị đầy đủ |
| Tolerance table | Áp dụng **chỉ sau** khi Reviewer chốt bảng Mục 5.2 (hoặc bản rút gọn được duyệt) | Tự nhận “thông suốt tuyệt đối” khi phép kiểm chưa đủ |
| UI | Hiển thị tiêu chí đã hỗ trợ / unknown / fail; không tuyên bố vượt phạm vi | Batch D nghiệm thu vận hành dài |

---

## 2. Thứ tự triển khai đề xuất

### C1 — Khung bằng chứng & trạng thái (không đo hình học sâu)
1. Kiểu `VerificationEvidence` / `CriterionResult` trong `packages/ai/src/governance/` (hoặc `verification/`).
2. Gắn `taskId`, `documentId`, `rulesFingerprint`, danh sách node ids liên quan, `status: pass|fail|unknown`.
3. API: `recordEvidence`, `invalidateEvidenceForNodes`, `getTaskEvidence`.
4. UI status line: cập nhật `getGovernanceStatus()` — `criteriaVerification: "active"` **chỉ khi** ít nhất một criterion runner đã đăng ký; trước đó giữ `deferred`.
5. Test: evidence bị invalidate khi node bị sửa/xóa; không dùng evidence của node cũ.

### C2 — Criterion runners có phạm vi công bố
Ưu tiên các phép **đã thừa nhận giới hạn** trong đề án Đợt A:

| Criterion | Đầu vào | Pass/Fail | Unknown khi |
| --- | --- | --- | --- |
| `volume_delta` | solid trước/sau, dung sai tương đối đã duyệt | ΔV trong ngưỡng | không lấy được volume |
| `ray_probe_clear` | danh sách điểm + hướng | mọi mẫu rỗng theo kỳ vọng | thiếu mẫu / kernel lỗi |
| `bbox_contains` | bbox kỳ vọng vs thực tế | trong dung sai dài | shape null |
| `through_opening` (nếu đủ thời gian) | face trước/sau + probes | có vòng mở hai phía | flush-floor / membrane chưa phân tích đủ → **unknown**, không fail giả |

Mỗi runner khai báo `supportNotes` (chuỗi locale) để UI/prompt nói đúng giới hạn.

### C3 — Vòng sửa sai trong agent loop
1. Sau mutation gated, nếu criterion `fail` → đưa báo cáo vào journal / tool result; agent được phép chỉnh trong **phạm vi plan còn hiệu lực**.
2. Nếu plan đã `PLAN_INVALIDATED` / rules drift → **không** sửa bằng quyền cũ; yêu cầu `propose_task_plan` lại.
3. Ngân sách sửa sai: giới hạn số vòng (cấu hình); vượt ngân sách → dừng + báo user.
4. Test offline harness: fail giả → một vòng sửa → pass; invalidated plan → không ghi tiếp.

### C4 — Tolerance table (cổng Reviewer)
1. Không hard-code bảng 5.2 cho đến khi Reviewer chọn:
   - **(A)** duyệt nguyên bảng 5.2, hoặc  
   - **(B)** duyệt subset (ví dụ chỉ nhóm Nội thất ±0.2 mm / ±0.2°), hoặc  
   - **(C)** trì hoãn bảng; runners dùng `unknown` khi thiếu dung sai.
2. Lưu dung sai đã duyệt trong `DesignRules` (cùng fingerprint Đợt B) — đổi bảng = đổi fingerprint = thu hồi plan.

### C5 — UI & bàn giao
1. Thẻ/khu vực bằng chứng trên ChatPanel: pass/fail/unknown + `supportNotes`.
2. Status: phân biệt rõ “Đợt B bảo vệ phạm vi” vs “Đợt C hậu kiểm”.
3. Ma trận criterion × tool (chỉ các đường đã gắn runner).
4. Test + typecheck + Biome + build; SHA bàn giao; **chờ duyệt trước deploy VPS**.

---

## 3. Quyết định cần Reviewer chốt trước khi code

1. Chọn phương án dung sai **A / B / C** ở mục C4.
2. Criterion nào bắt buộc trong C2 (tối thiểu `volume_delta` + `ray_probe_clear`?).
3. Ngân sách vòng sửa sai mặc định (đề xuất: 2).
4. Có yêu cầu UI riêng ngoài status line + thẻ evidence trong chat không?

---

## 4. Tiêu chí xong Đợt C (để nghiệm thu sau này)

- [ ] Ít nhất hai criterion runners có test pass/fail/unknown.
- [ ] Evidence invalidate đúng khi node/plan/rules đổi.
- [ ] Agent loop tôn trọng fail → sửa trong scope; không vượt plan đã thu hồi.
- [ ] UI không tuyên bố tiêu chí chưa hỗ trợ là đã kiểm.
- [ ] Bảng dung sai chỉ áp dụng đúng quyết định Reviewer.
- [ ] SHA + test/build; deploy VPS chỉ sau duyệt.

---

## 5. Không làm trong Đợt C

- Selective inversion / undo chọn lọc.
- Coi Đợt B là chưa đủ bảo vệ phạm vi (Đợt B đã có hiệu lực).
- Deploy VPS Đợt C trước khi Reviewer duyệt SHA Đợt C.

---

*Tài liệu phương án — chờ Reviewer duyệt trước khi triển khai mã Đợt C.*
