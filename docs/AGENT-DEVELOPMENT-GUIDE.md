# Hướng dẫn phát triển agent tích hợp trong app

Tài liệu này dành cho người thực hiện `TASK-21`, `TASK-22`, `TASK-23`. Áp dụng `docs/WORKFLOW.md` cho mọi bước. Trình tự ở mục 2 là thứ tự đã chốt; không đảo nếu chưa có quyết định mới.

---

## 0. Nguyên tắc

1. **Đo trước, sửa sau.** Mọi thay đổi hành vi agent phải có số liệu trước và sau trên bộ đánh giá (TASK-23). Không báo "tốt hơn" nếu không có số.
2. **Số liệu, không cảm giác.** Kiểm chứng bằng `measure_nodes` và bộ đánh giá, không bằng việc nhìn ảnh rồi kết luận.
3. **Không gắn cứng vào hãng.** Mọi logic riêng của nhà cung cấp nằm trong file giao thức hoặc bảng năng lực, không rải rác.
4. **Không lưu khóa, không lưu dữ liệu thật.** Bộ đánh giá dùng bản vẽ mẫu. Khóa API chỉ trong phiên.
5. **Không đổi `documentVersion`** trừ khi task ghi rõ, và phải có phê duyệt.

---

## 1. Hiện trạng tóm tắt (đã kiểm chứng trong mã nguồn)

- Có 3 giao thức mô hình, có tương thích OpenAI qua `baseURL`. Có test giả lập, chưa có test API thật.
- Có vòng lặp công cụ, nén ngữ cảnh, nhật ký, kỹ năng, hỏi người dùng.
- Chưa có: kế hoạch, kiểm chứng bắt buộc, bộ đánh giá, sub-agent, bộ nhớ dài hạn.
- Công cụ đo, phân loại vật liệu, tính Array, BOM: có trong app nhưng chưa có công cụ cho agent (TASK-21).

Chi tiết và bằng chứng từng dòng: xem các file TASK.

---

## 2. Trình tự phát triển đã chốt (đề xuất, chờ xác nhận)

```
S0  Cổng quyết định (không viết code)
    ├─ Giấy phép AGPL và mô hình thương mại (xem mục 6 của TASK-20 / đã nêu trong trao đổi)
    ├─ Đóng bucket `guest` (không xác thực) và xử lý bản copy dự án đã đưa vào đó
    └─ Chốt danh sách hãng mô hình ưu tiên (TASK-22 mục 6)

S1  TASK-23 §3.1  Bộ đánh giá + baseline
    → Đo agent hiện tại. Đây là mốc để so sánh mọi bước sau.

S2  TASK-22 (§3.1 - §3.2)  Bảng năng lực + phân loại lỗi
    → Đo lại trên bộ đánh giá sau khi đổi mô hình. Không hồi quy so với S1.

S3  TASK-21 (đường đọc + công cụ đo)  measure_nodes, classify_material, plan_array (thuần)
    → Đây là công cụ kiểm chứng cho S4.

S4  TASK-23 §3.2 - §3.3  Kế hoạch + bước kiểm chứng bắt buộc (+ apply_array của TASK-21)
    → Đo lại. Tỉ lệ tình huống nhiều bước phải tăng.

S5  TASK-22 (§3.3 - §3.6)  Lịch sử gắn nhà cung cấp, mức suy luận theo năng lực, kiểm thử API thật
    → Chạy kiểm thử trực tiếp trên ít nhất hai hãng.

S6  Quyết định có nên làm sub-agent / bộ nhớ dài hạn
    → Chỉ khi số liệu S4-S5 cho thấy cần. Mỗi việc cần TASK riêng.

Song song, không phụ thuộc: TASK-20 giai đoạn 1 (cầu nối MCP cục bộ cho opencode/Antigravity/Hermes).
Giai đoạn 2 của TASK-20 (VPS relay) bị chặn bởi S0.
```

**Lý do thứ tự:** S1 là điều kiện để đo mọi thứ sau. S3 đi trước S4 vì kiểm chứng cần công cụ đo. S5 đi sau S4 vì cần bảng năng lực và bộ đánh giá để biết kết quả trên từng hãng.

---

## 3. Quy trình cho mỗi bước

Áp dụng `docs/WORKFLOW.md` mục 1 → 7, cộng thêm:

1. **Trước khi sửa:** chạy bộ đánh giá, lưu báo cáo JSON vào `packages/ai/eval/reports/<ngày>-<nhãn>.json`. Ghi vào Execution Log.
2. **Sau khi sửa:** chạy lại, so sánh hai báo cáo. Bảng so sánh gồm: tỉ lệ đạt, số lần gọi công cụ trung bình, thời gian, lỗi phân loại.
3. **Không chấp nhận** thay đổi làm giảm tỉ lệ đạt ở tình huống không liên quan. Nếu có, phải ghi rõ và có lý do.
4. **Chế độ trực tiếp** (API thật): chạy thủ công, ghi chi phí và mô hình đã dùng.

---

## 4. Thiết kế kỹ thuật chi tiết

### 4.1. Bộ đánh giá (TASK-23 §3.1)
- Thư mục: `packages/ai/eval/` gồm `scenarios/`, `fixtures/`, `reports/`, và `runner.ts`.
- Tình huống: JSON theo định dạng trong TASK-23.
- Chế độ phát lại: ghi phản hồi mô hình vào `eval/recordings/<scenarioId>.json`. Chạy lại không gọi API.
- Chế độ trực tiếp: biến môi trường `AI_EVAL_PROVIDER`, `AI_EVAL_MODEL`, và khóa riêng cho hãng. Không ghi khóa vào báo cáo.
- Kiểm tra `expect`: hàm thuần so số liệu lấy từ `measure_nodes` (hoặc tương đương trong phiên kiểm thử).

### 4.2. Công cụ kế hoạch (TASK-23 §3.2)
- Tên công cụ: `update_plan`.
- Trạng thái lưu trong phiên, không nằm trong `Document`.
- Khi nén ngữ cảnh, giữ kế hoạch hiện tại trong nhật ký (`journal.ts`), không cắt.

### 4.3. Kiểm chứng bắt buộc (TASK-23 §3.3)
- Theo dõi các công cụ ghi. Sau lần ghi cuối cùng của một lượt, nếu chưa có công cụ đo thì tự nhắc.
- Giới hạn nhắc: ví dụ 2 lần, sau đó dừng và báo người dùng "chưa kiểm chứng được".

### 4.4. Bảng năng lực mô hình (TASK-22 §3.1)
- File: `packages/ai/src/llm/capabilities.ts`.
- Mô hình lạ: giá trị an toàn (không ảnh, không suy luận, ngữ cảnh nhỏ nhất).
- Giá trị `toolCalling` lấy từ kết quả bộ đánh giá, không từ tài liệu hãng.

### 4.5. Phân loại lỗi (TASK-22 §3.2)
- File: `packages/ai/src/llm/errors.ts`.
- Mỗi mẫu lỗi có chú thích: nguồn (hãng, phiên bản API) và câu lỗi gốc. Không thêm mẫu chưa có nguồn.

---

## 5. Danh mục kiểm tra trước khi báo WAITING_REVIEW

- [ ] Đã chạy bộ đánh giá trước và sau, báo cáo lưu trong `eval/reports/`.
- [ ] Bảng so sánh có trong Execution Log.
- [ ] Không có khóa API trong mã nguồn, báo cáo, hay commit.
- [ ] Test mới cho từng hành vi mới, test hồi quy cho hành vi cũ.
- [ ] `npm run check`, `npm run test`, `npm run build` đều pass.
- [ ] Nếu có giao diện mới: ảnh chụp before/after.
- [ ] Ghi rõ mô hình nào đã kiểm chứng trên API thật, mô hình nào chỉ giả lập.
- [ ] Trạng thái `[?] WAITING_REVIEW`, không `DONE`.

---

## 6. Điều không làm trong giai đoạn này

- Sub-agent, bộ nhớ dài hạn (chờ S6).
- Thêm hãng mới chưa có kiểm thử hợp đồng.
- Đưa bộ đánh giá vào CI mặc định khi chưa có quyết định về chi phí.
- Mở cổng cho agent bên ngoài (TASK-20 giai đoạn 2) khi chưa qua S0.

---

## 7. Báo cáo cuối

Trả lời đủ 4 ý theo `docs/WORKFLOW.md` mục 7, và thêm:
- bảng so sánh báo cáo trước/sau;
- danh sách mô hình đã chạy trực tiếp và chi phí ước tính.
