# TASK-40 Đợt C3 — Phương án sửa sai theo sai lệch đo được (chờ Reviewer duyệt, CHƯA code)

Nền: C1/C1.1/C1.2/C1.3 (`9f6beda9`, đã nghiệm thu metadata `70e41818`) + C2 (dòng criteria→đo→thẻ
bằng chứng, SHA bàn giao trong plan Đợt C). **Tài liệu này chỉ là phương án; không cấp thêm quyền nào
cho tới khi Reviewer duyệt.** C2 chỉ đo và đối chiếu — việc đo không tự mở đường cho sửa.

## 1. Luồng đề xuất (máy đo → người duyệt → máy sửa → máy đo lại)

```
finalizeTaskVerification (C2) ── có hàng ❌ ──► luồng sửa C3:
 1. TRÍCH LỆCH CÓ CẤU TRÚC   runner trả kèm {subjectNodeId, axis, measuredMm, expectedMm, deltaMm}
                              (thay vì chỉ chuỗi text như C2). Không có số đo → không có cơ sở sửa.
 2. PHÂN LOẠI NGUYÊN NHÂN    chỉ sửa khi: (a) tiêu chí REQUIRED, (b) status = fail (KHÔNG phải
                              unknown), (c) đối tượng nằm trong scope kế hoạch đã duyệt.
                              unknown (thiếu subject, dung sai, marker, probe) → HỎI người dùng,
                              không đoán, không sửa bừa.
 3. ĐỀ XUẤT SỬA              propose_task_plan (mới) với: quyền đúng bằng các node/vùng đã đo lệch,
                              op sửa (chỉnh tham số feature / transform hiệu chỉnh delta), và criteria
                              GIỮ NGUYÊN từ lần đo trước (để đo lại bằng đúng thang đo cũ).
                              Card hiển thị: "lệch X -100 mm → đề xuất đổi dx 700→800".
 4. NGƯỜI DUYỆT              nút duyệt thật trên card (như C2). Không duyệt → dừng, thẻ giữ ❌.
 5. ÁP DỤNG + ĐO LẠI         governed router ghi (cổng B giữ nguyên, không nới quyền),
                              finalizeTaskVerification chạy lại sau lần ghi cuối.
 6. SO SÁNH TIẾN TRIỂN       deltaMm mới so với deltaMm cũ từng subject+trục.
                              nhỏ hơn  → tính là tiến triển, cho quyền thêm tối đa 1 lần (tổng ≤ 2).
                              không nhỏ hơn / bằng / xấu đi → DỪNG THẲNG, báo cáo chênh hiện tại,
                              không thử mò.
 7. KẾT                      mọi required pass → ✔ HOÀN TẤT. còn ❌ sau 2 lần → báo người dùng
                              kèm bảng lệch; tuyệt đối không báo hoàn tất.
```

## 2. Bất biến bắt buộc

- **Không quyền mới từ phép đo:** vòng sửa chỉ dùng đúng `allowedModifiedNodeIds` + vùng đã duyệt ở
  bước 3; cổng B (impact analysis) chạy từng lệnh như thường lệ.
- **Max 2 lần sửa / tác vụ**, đếm theo lần DUYỆT thành công (không đếm ý định). State lưu trong
  TaskProfile (`repairAttempts`, `lastDeltas`), reset khi người dùng mở plan mới.
- **Không tự sửa khi `unknown`:** unknown là "chưa đủ dữ kiện", sửa trong mù máy = vi phạm chuẩn
  chống áp dụng máy móc.
- **Không tự sửa khi lệch nằm NGOÀI subject đã đo** (vd body khác dính boolean): báo phạm vi ảnh
  hưởng, yêu cầu plan phủ đúng vùng đó rồi mới sửa.
- Mọi vòng sửa phải đi qua **cùng** evidence store + markers C1.3: sửa xong, binding cũ tự stale,
  bắt buộc đo lại mới có giá trị; cấm ghi đè bằng chứng thủ công.

## 3. Phạm vi code dự kiến (khi được duyệt)

| File | Việc |
| --- | --- |
| `verification/runners/geometry.ts` | trả `structured deltas` (mảng {nodeId, axis, measured, expected, delta}) song song chuỗi text |
| `governance/taskProfile.ts` | `repairAttempts` + `lastDeltas` trong TaskScope |
| `chatPanel.ts` | nhánh "đề xuất sửa" sau fail required (tái dùng card plan C2, thêm dòng trước/sau) |
| `verification/runtime.ts` | `evaluateRepairProgress(prev, now)` — tiến triển hoặc dừng |
| test | unit (phân loại fail/unknown, đếm 2 lần, stop-on-no-progress) + kernel (lệch -100 → sửa dx → pass; sửa không tiến triển → dừng sau 1 lần tiếp theo) + ca CDP qua ChatPanel |

Ước lượng: 1 đợt code + test; không đụng core/PDF/app ngoài packages/ai.

## 4. ca nghiệm thu C3 dự kiến (reviewer chốt trước khi code)

1. Dựng thiếu 100 mm → ❌ → đề xuất đúng 1 op đổi tham số → duyệt → pass ✔ (1/2 lần).
2. Dựng sai vị trí +130 mm → ❌ → sửa đúng delta → pass.
3. "Sửa" không đổi delta (thử mù) → lần 2 không tiến triển → DỪNG + bảng lệch, không ✔.
4. Thiếu dung sai (unknown) → hỏi lại, KHÔNG sửa.
5. Quyền: đề xuất sửa node ngoài scope đã duyệt → router từ chối như mọi lệnh ghi thường.
6. Sau 2 lần vẫn ❌ → thẻ giữ ❌, badge ⏳ vĩnh viễn tới khi người dùng can thiệp.

## 5. Rủi ro đã nhận

- Op chỉnh tham số feature (editParameter) cần cổng B cho feature-editing — nếu Reviewer muốn C3 chỉ
  dùng transform/replace op thì phạm vi hẹp lại (biến thể "dựng lại object đúng trong scope, xóa bản
  sai" — cần quyền xóa trong plan). Quyết định ở bước duyệt phương án.
- Delta hộp bao không đủ mô tả lỗi cho nhóm Khoan/Bool (bbox có thể không đổi) — C3 giai đoạn đầu chỉ
  nhận sửa khi tiêu chí fail CÓ số đo; các nhóm chưa có runner riêng sẽ mặc nhiên "hỏi người dùng".
