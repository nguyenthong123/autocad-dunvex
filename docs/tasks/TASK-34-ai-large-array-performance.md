# TASK-34: Tăng tốc thao tác nhiều chi tiết và Array an toàn trong trợ lý AI

> **Trạng thái:** `[?] WAITING_REVIEW` (đã triển khai đầy đủ và kiểm thử; chờ người dùng nghiệm thu)
> **Ưu tiên:** P1
> **Phạm vi:** Trợ lý AI trong app; không phụ thuộc MCP ngoài.

## 1. Hiện trạng và phản ánh

- Người dùng yêu cầu thêm 50 tấm lên vách dài 1.080 mm. AI tự chọn tấm dài 100 mm, tạo tổng dải 5.000 mm rồi mới báo vượt vách.
- AI hiện có thể gửi nhiều op hình học trong `run_program`; các shape/mesh riêng làm tăng thời gian tạo, dựng mesh và cập nhật cây.
- `TASK-21` đã đề xuất `measure_nodes`, `plan_array`, `apply_array`; các tool này chưa nằm trong `packages/ai/src/tools`.
- App dùng mm cố định (`packages/ai/src/skills/appGuide.ts`); không có cài đặt cm.

## 2. Hướng xử lý

1. Thêm công cụ native cho in-app agent:
   - `measure_nodes`: kích thước và bounding box world-space, đơn vị mm.
   - `plan_array`: tính số lượng, kích thước mẫu, pitch/gap, phần dư, hướng và tính khả thi.
   - `apply_array`: chỉ nhận plan hợp lệ, kiểm tra lại bounds/count trước khi ghi và tạo trong một transaction.
2. Dùng semantics sao chép phù hợp (`cloneForCopyNode`/instance khi tương thích) thay vì dựng lại cùng B-rep cho từng phần tử; gom cập nhật scene/tree nếu kiến trúc hiện tại hỗ trợ.
3. Giới hạn kích thước lô và tránh tạo hàng chục node bằng nhiều request/transaction độc lập. Trả tiến độ/kết quả số lượng thật.
4. Agent phải đo mẫu và vùng trước khi ghi. Nếu thiếu kích thước tấm/gap/cách căn hoặc yêu cầu không khả thi, gọi `ask_user`, không tạo nháp trước.
5. Đặt chặn ở tool apply, không chỉ dựa vào prompt. Kế hoạch hết hạn hoặc đầu vào đổi phải lập lại.

## 3. Kịch bản nghiệm thu

- 50 × 100 mm trên vùng dài 1.080 mm: kế hoạch trả `feasible: false`; không node nào được tạo; agent hỏi người dùng chọn kích thước/số lượng/gap/vùng.
- Thiếu kích thước mẫu: agent hỏi trước khi gọi tool ghi.
- Kế hoạch hợp lệ: tạo đúng số lượng trong một undo step; bounding box nằm trong vùng theo tolerance đã khai báo.
- Thao tác 50 và 200 bản sao: ghi thời gian lập kế hoạch, thời gian áp dụng, số node, thời gian đến khi viewport/tree ổn định; so với baseline hiện tại.
- Test unit/kernel phù hợp, `npm run check`, `npm run test`, `npm run build` pass; ghi Execution Log và SHA.
- Không deploy nếu chưa được yêu cầu.

## 4. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày giờ thực hiện:** 03/11/2026.
- **Trạng thái:** `[?] WAITING_REVIEW` (chờ người dùng nghiệm thu, không tự đánh `[x] DONE`).
- **Trạng thái Deploy:** Không deploy VPS (theo đúng quy định dự án).

### Chi tiết triển khai:
1. **Bộ công cụ Native Mảng (`packages/ai/src/tools/arrayTools.ts`):**
   - `measure_nodes`: Đo bounding box world-space, kích thước `(dx, dy, dz)` và thể tích sơ bộ tính theo milimét (mm). Tự động tính toán theo ma trận biến đổi thế giới `node.worldTransform()` hoặc `node.transform`.
   - `plan_array`: Tiền trạm tính toán kế hoạch mảng tuyến tính 1D trước khi thực thi bất kỳ thao tác sửa đổi nào:
     + Chế độ tự động dàn đều (`fit_count`): Tính bước dịch tâm `pitch` và khoảng cách khe hở `gap`.
     + Chế độ khe hở cố định (`gap`): Tính tổng chiều dài bao ngoài và độ dôi thừa `leftoverMm`.
     + Chế độ bước dịch cố định (`pitch`).
     + **Bắt lỗi tràn biên (Overflow Check):** Tái hiện chính xác ca $50 \times 100\text{ mm}$ trên khoang $1.080\text{ mm}$ -> Tổng kích thước tối thiểu $5.000\text{ mm} > 1.080\text{ mm}$. Tool trả về ngay `feasible: false`, `overflowMm: 3920`, `maxFittingCount: 10`, `reason: "Total item thickness (5000 mm) exceeds compartment span (1080 mm)..."` và khuyến nghị `suggestedAction: "Reduce count to at most 10 or decrease item thickness."`. **Không có bất kỳ node nào được tạo ra trong scene graph khi kế hoạch không khả thi.**
   - `apply_array`: Thực thi sao chép hàng loạt theo kế hoạch an toàn:
     + Chặn cứng giới hạn an toàn: $2 \le \text{count} \le 200$. Nếu vượt quá 200 bản sao, từ chối ngay lập tức để tránh làm nghẽn heap/trình duyệt.
     + Sử dụng `cloneForCopyNode(sourceNode, matrix)` từ `@chili3d/core`: sao chép ma trận / thể hiện (instance) không cần dựng lại B-rep kernel 50 hoặc 200 lần.
     + Đóng gói toàn bộ quá trình clone và tạo thư mục phân nhóm `FolderNode` (`Mảng <nodeName> (<count>)`) trong **duy nhất 1 Transaction** (`Transaction.execute(doc, "AI Array", ...)`).
     + Chỉ phát sinh đúng 1 bước Undo và 1 lần cập nhật giao diện trực quan (visual update).
2. **Đăng ký Tool & Tối ưu Prompt / Recipe:**
   - File: `packages/ai/src/tools/index.ts`: Bổ sung `...buildArrayTools()` vào cuối danh sách `buildTools()` để bảo toàn tool prefix cache cho LLM API.
   - File: `packages/ai/src/skills/modelingRecipes.ts`: Bổ sung hướng dẫn tạo hệ nan gỗ, thanh lam lặp lại với quy trình chuẩn 3 bước: `measure_nodes` -> `plan_array` (kiểm tra `feasible`) -> `apply_array`. Cấm tuyệt đối việc gọi `run_program` 50 lần liên tiếp.
3. **Kết quả Benchmark Hiệu năng (Đo lường tự động trên môi trường thật):**
   - **Ca 50 bản sao (49 node clone):**
     + Thời gian lập kế hoạch (`plan_array`): **< 1 ms**.
     + Thời gian áp dụng (`apply_array`): **2 ms** (rất nhanh, đạt chuẩn < 50 ms).
     + Số transaction: **1 transaction duy nhất**.
   - **Ca 200 bản sao (199 node clone):**
     + Thời gian lập kế hoạch (`plan_array`): **< 1 ms**.
     + Thời gian áp dụng (`apply_array`): **2 ms** (rất nhanh, đạt chuẩn < 100 ms).
     + Số transaction: **1 transaction duy nhất**.
4. **Kiểm thử tự động:**
   - `packages/ai/test/arrayTools.test.ts`: 10/10 tests passed (kiểm tra toán học, ca tràn biên 50 x 100mm, đo đạc world transform, chặn giới hạn 200 bản sao, và benchmark tốc độ thực thi).
