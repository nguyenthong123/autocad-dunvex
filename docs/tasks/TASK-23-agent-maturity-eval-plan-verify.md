# TASK-23: Nâng cấp agent trong app — bộ đánh giá, kế hoạch, kiểm chứng kết quả

> **Trạng thái:** `[ ] TODO` (S1 Khung đánh giá đã hoàn thành; chưa có baseline thật)
> **Mức độ ưu tiên:** P1 (nền tảng cho mọi cải tiến agent khác)
> **Phụ thuộc:** `TASK-21` (công cụ đo và Array là công cụ kiểm chứng), `TASK-22` (đo đa mô hình)
> **Hướng dẫn chung:** [docs/AGENT-DEVELOPMENT-GUIDE.md](../AGENT-DEVELOPMENT-GUIDE.md)

---

## 1. Mục tiêu

Biến agent trong app từ "gọi công cụ được" thành "hoàn thành đúng yêu cầu và chứng minh được điều đó". Cụ thể:

1. **Có bộ đánh giá** để đo tỉ lệ thành công trước và sau mỗi thay đổi.
2. **Có kế hoạch** cho tác vụ nhiều bước, và theo dõi tiến độ.
3. **Có bước kiểm chứng** bắt buộc sau khi ghi, so số liệu thật với mục tiêu.

Lý do thứ tự này: nếu không có bộ đánh giá, không biết thay đổi có làm agent tốt hơn hay không. Đây là việc làm trước.

## 2. Hiện trạng đã kiểm chứng

| Năng lực | Trạng thái | Bằng chứng |
|---|---|---|
| Vòng lặp công cụ, giới hạn 100 bước | Có | `packages/ai/src/llm/agent.ts`, `MAX_AGENT_ITERATIONS` |
| Tự nhắc khi mô hình chỉ nói mà không làm | Có | `agent.ts`, `MAX_IDLE_NUDGES`, `promisedToAct` |
| Nén ngữ cảnh + nhật ký | Có | `journal.ts`, `JOURNAL_MAX_CHARS = 3000` |
| Ref hình học tính lại theo cảnh | Có | `capabilityEngine.ts` (`re-read` khi resolve) |
| Nạp kỹ năng theo yêu cầu | Có | `skills/`, công cụ `load_skill` |
| Hỏi người dùng | Có | `ask_user` (không qua bridge) |
| **Công cụ kế hoạch / todo** | **Không có** | Không tìm thấy công cụ nào tên plan, todo, write_todos |
| **Bước kiểm chứng bắt buộc sau khi ghi** | **Không có** | Chỉ là một dòng trong `prompt.ts`; không có công cụ đo lại sau khi ghi |
| **Chạy công cụ song song** | Không, cố ý | `agent.ts` ghi chú: song song sẽ làm hỏng ref phụ thuộc |
| **Sub-agent** | **Không có** | Không tìm thấy cơ chế tách việc con |
| **Bộ nhớ dài hạn giữa các phiên** | **Không có** | Chỉ lưu lịch sử hội thoại; không lưu quy ước dự án |
| **Bộ đánh giá chất lượng agent** | **Không có** | Không có thư mục eval hay bộ tình huống chuẩn trong `packages/ai/test` |

## 3. Phạm vi

### 3.1. Bộ đánh giá (làm trước tiên)

**Vị trí:** `packages/ai/eval/` (mới). Không nằm trong `test/` để không chạy mặc định trong CI.

**Định dạng tình huống** (`packages/ai/eval/scenarios/*.json`):
```json
{
  "id": "array-wall-slats-01",
  "prompt": "Phủ tường 530 x 370 bằng thanh lam 5 x 21 x 100 cách nhau 5 mm",
  "fixture": "fixtures/wall-empty.json",
  "expect": {
    "countNodes": { "name": "lam*", "equals": 25 },
    "boundsWithin": { "mm": 0.5, "region": "wall" },
    "noOverlap": true
  },
  "budget": { "maxToolCalls": 40, "maxSeconds": 120 }
}
```

- `fixture`: bản vẽ mẫu có sẵn (tường, sàn...), tải vào trước khi chạy. Không dùng dự án thật của người dùng.
- `expect`: kiểm tra bằng số liệu, không bằng ảnh. Các kiểu kiểm tra: đếm node, sai số kích thước, không chồng lấn, vật liệu đúng, tổng khối lượng.
- `budget`: giới hạn số lần gọi công cụ và thời gian, để phát hiện agent quẩn vòng.

**Hai chế độ chạy:**
- **Phát lại (replay):** dùng phản hồi mô hình đã ghi, xác định, chạy được trong CI. Dùng để kiểm tra logic công cụ và kiểm tra kết quả.
- **Trực tiếp (live):** gọi API thật qua khóa trong biến môi trường. Chạy thủ công, ghi chi phí và kết quả.

**Đầu ra:** một báo cáo JSON và bảng tóm tắt: tỉ lệ đạt, số lần gọi công cụ trung bình, số token, thời gian, và phân loại lỗi (dùng `classifyProviderError` của TASK-22).

**Số tình huống tối thiểu ban đầu:** 12, phủ các nhóm: đọc số liệu, đổi màu, vẽ một khối, vẽ nhiều bản sao (Array), tính BOM, xử lý khi thiếu thông tin (phải hỏi), và tình huống không thể làm (phải báo, không bịa).

**Scenario bổ sung từ bản vẽ thực tế (in-app AI):** người dùng yêu cầu thêm 50 tấm vào vách; AI đo vách dài 1.080 mm nhưng tự giả định mỗi tấm dài 100 mm, tạo tổng chiều dài 5.000 mm rồi mới hỏi cách xử lý phần vượt. Kết quả này phải được xem là **FAIL**. Trước khi ghi, agent phải đọc kích thước thực, xác nhận kích thước/kiểu phân bố còn thiếu, tính `count × panelSize + gaps`, và chặn mọi phương án vượt vùng. Nếu thiếu kích thước tấm, phải gọi `ask_user`; nếu không vừa, phải trình phép tính và hỏi lựa chọn. Tuyệt đối không tạo trước rồi mới hỏi.

### 3.2. Công cụ kế hoạch (`plan`)

- Công cụ `update_plan` (mới): nhận danh sách bước `{id, title, status: pending|doing|done|blocked, evidence?}`.
- Trạng thái kế hoạch nằm trong phiên, được đưa lại vào ngữ cảnh mỗi vòng, và không bị xóa khi nén (ghi vào nhật ký).
- Giao diện chat hiển thị kế hoạch dạng danh sách có trạng thái.
- Prompt hướng dẫn: tác vụ có từ ba bước trở lên thì phải lập kế hoạch trước khi ghi.
- Không dùng kế hoạch để thay thế kiểm chứng (mục 3.3).

### 3.3. Bước kiểm chứng bắt buộc

- Sau mỗi lần ghi (`run_program`, `apply_array`, `set_material`, `delete_node`...), agent phải gọi công cụ đo (`measure_nodes` của TASK-21) để xác nhận số liệu.
- Với tác vụ có mục tiêu số liệu (số lượng, kích thước, phủ kín vùng), agent phải so với mục tiêu và ghi kết quả vào kế hoạch.
- Nếu kiểm chứng không khớp: agent phải sửa, không được báo hoàn thành.
- Với Array, xác nhận trước ghi: số lượng yêu cầu, kích thước nguồn, kích thước vùng, pitch/gap và quy tắc căn chỉnh; nếu dữ liệu cần thiết thiếu hoặc tổng bố trí vượt vùng thì không tạo node và phải hỏi người dùng.
- Cơ chế thực thi: không chỉ dựa vào prompt. Nếu agent kết thúc mà chưa có kiểm chứng sau ghi, hệ thống tự nhắc (tương tự `MAX_IDLE_NUDGES`), giới hạn số lần nhắc.

### 3.4. Sub-agent và song song (chỉ sau khi có số liệu)

- Không làm trong phạm vi task này. Chỉ mở task mới nếu bộ đánh giá cho thấy tuần tự là nút thắt (ví dụ thời gian vượt `maxSeconds` thường xuyên).
- Nguyên tắc nếu làm: sub-agent chỉ đọc (đo, phân loại), không ghi; ghi luôn đi qua agent chính.

### 3.5. Bộ nhớ dài hạn (chỉ sau khi có quy tắc quyền riêng tư)

- Không làm trong task này. Cần quyết định trước: dữ liệu nào được nhớ, lưu ở đâu (trên máy hay VPS), người dùng xem và xóa được không.

## 4. Ngoài phạm vi

- Không thay đổi định dạng tài liệu.
- Không thêm hãng mô hình mới (việc đó thuộc TASK-22).
- Không lưu dữ liệu dự án thật của người dùng vào bộ đánh giá.

## 5. Tiêu chí nghiệm thu

**Bộ đánh giá:**
- [x] Có ít nhất 12 tình huống, mỗi tình huống có `expect` bằng số liệu và `budget`.
- [x] Chạy ở chế độ phát lại trong `npx --yes tsx packages/ai/eval/runner.ts`, kết quả xác định (chạy hai lần cho cùng kết quả).
- [x] Báo cáo JSON có: tỉ lệ đạt, số lần gọi công cụ, thời gian, lỗi phân loại.
- [ ] Có kết quả baseline trước khi sửa agent (ghi vào Execution Log) — *Đang chờ người dùng quyết định chế độ chạy (A - Gọi API thật hay B - Giữ tổng hợp chờ TASK-22) ở Bước 4.*

**Kế hoạch:**
- [ ] `update_plan` có test: thêm, cập nhật trạng thái, giữ qua nén ngữ cảnh.
- [ ] Giao diện chat hiển thị kế hoạch (ảnh chụp kèm theo).
- [ ] Trên bộ đánh giá, tỉ lệ tình huống nhiều bước tăng so với baseline, hoặc không giảm ở tình huống khác.

**Kiểm chứng:**
- [ ] Sau mỗi ghi, agent gọi công cụ đo (test theo dõi lệnh gọi).
- [ ] Tình huống có mục tiêu số liệu không được báo hoàn thành khi số liệu không khớp (test cụ thể).
- [ ] Scenario “50 tấm × 100 mm trên vách 1.080 mm”: agent không được ghi bất kỳ node nào trước khi hỏi/chốt kích thước hoặc cách bố trí; kế hoạch vượt vùng bị từ chối.
- [ ] Nhắc tự động có giới hạn số lần, không lặp vô hạn (test).

**Chung:**
- [ ] Không hồi quy trên các test hiện có trong `packages/ai/test/`.
- [ ] `npm run check`, `npm run test`, `npm run build` đều pass.
- [ ] Execution Log có số liệu trước và sau, không chỉ mô tả.

## 6. Câu hỏi cần người dùng quyết định

1. Đồng ý với 12 tình huống ban đầu và các nhóm đã nêu không? Bạn có muốn thêm tình huống nào từ công việc thật không?
2. Chế độ trực tiếp (gọi API thật) có được phép chạy thủ công không? Chi phí do bạn chịu.
3. Lệnh chạy bộ đánh giá: `npm run eval` có ổn không?

---

## 7. Nhật ký Thực thi (Execution Log)

### Đợt thực thi S1: Xây dựng Khung Đánh giá (TASK-23 §3.1)
- **Thời gian:** 2026-11-02
- **Mã commit khung đánh giá:** `9a84ffc2`
- **Trạng thái S1:** **Khung đã hoàn thành, baseline thật chưa có** (chờ người dùng quyết định phương án A/B).
- **Lệnh thực thi khung:** `npx --yes tsx packages/ai/eval/runner.ts` (không sửa `package.json`).
- **Cấu trúc đã xây dựng:**
  - `packages/ai/eval/scenarios/` (12 tình huống phủ các nhóm: đọc số liệu, đổi màu, vẽ khối, nhân bản, BOM, hỏi khi thiếu tin, từ chối khi bất khả thi, biến đổi node, xóa node, dựng hình kết hợp)
  - `packages/ai/eval/fixtures/` (5 bản vẽ mẫu: `empty.json`, `floor-box.json`, `wall-empty.json`, `single-cube.json`, `multi-material.json`)
  - `packages/ai/eval/synthetic-recordings/` (toàn bộ gắn nhãn `"source": "synthetic-hand-written"`)
  - `packages/ai/eval/reports/` (báo cáo chạy thử khung: `synthetic-smoke-2026-11-02.json`)
  - `packages/ai/eval/runner.ts`, `types.ts`, `replayProvider.ts`, `setupGlobals.ts`

#### Bảng Kiểm kê & Trạng thái Kịch bản (Kiểm tra Khung Smoke Test):
| Kịch bản | Trạng thái | Ghi chú |
|---|---|---|
| `01-read-box-dimensions` | Pass (Smoke) | Đọc thông tin khối hộp từ `floor-box.json` |
| `02-change-material-color` | Needs Review | Khôi phục `expect.materialId: "mat_red"`; không tính vào pass rate |
| `03-draw-single-box` | Pass (Smoke) | Vẽ khối hộp 40x30x20 qua `run_program` |
| `04-draw-cylinder` | Pass (Smoke) | Vẽ khối trụ qua `run_program` |
| `05-array-wall-slats` | Pending (T-21) | Chờ TASK-21 `apply_array` / `measure_nodes` |
| `06-duplicate-copy-shapes` | Needs Review | Khôi phục `expect.toolCalled: ["duplicate_node"]`; không tính vào pass rate |
| `07-bom-takeoff` | Pass (Smoke) | Thống kê danh mục vật tư |
| `08-missing-info-ask-user` | Pass (Smoke) | Gọi `ask_user` khi thiếu kích thước |
| `09-impossible-request-refusal` | Pass (Smoke) | Từ chối yêu cầu đa giác 4D phi Euclid |
| `10-transform-move-node` | Pass (Smoke) | Di chuyển vị trí qua `transform_node` |
| `11-delete-node` | Pass (Smoke) | Xóa node qua `delete_node` |
| `12-multi-step-modeling` | Pass (Smoke) | Kết hợp tạo chân đế và cột trụ |

- **Báo cáo chạy thử khung:** `packages/ai/eval/reports/synthetic-smoke-2026-11-02.json`
- **Cảnh báo bắt buộc:** *KHÔNG phải baseline chất lượng agent — chỉ dùng để kiểm tra khung chạy (smoke test) với kịch bản tổng hợp viết tay.*


