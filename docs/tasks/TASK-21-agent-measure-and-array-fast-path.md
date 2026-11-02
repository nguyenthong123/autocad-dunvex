# TASK-21: Đường đọc nhanh cho agent — đo kích thước, nhận diện vật liệu, tính mảng (Array) & số lượng

> **Trạng thái:** `[ ] TODO` (nghiên cứu & thiết kế. Chưa triển khai).
> **Mức độ ưu tiên:** P1
> **Phụ thuộc:** `TASK-20` (cổng agent), `TASK-17` (BOM), `TASK-12` (ổn định Array), `TASK-06` (lưu trữ đám mây)
> **Hướng dẫn triển khai:** chưa có. Sẽ bổ sung sau khi người dùng trả lời mục 8.

---

## 1. Kịch bản người dùng

1. Người dùng vẽ **một** vật liệu (ví dụ một thanh lam 5 × 21 × 100 mm trên tường).
2. Người dùng nói với một agent bên ngoài (ví dụ ChatGPT): "vẽ thêm cho đủ".
3. Agent qua cổng phiên (TASK-20) cần trả lời nhanh và đúng:
   - Kích thước dài / rộng / cao của vật liệu mẫu là bao nhiêu?
   - Vật liệu thuộc loại nào, dạng gì (tấm, thanh, viên, gỗ, đá...)?
   - Phủ kín vùng mục tiêu cần bao nhiêu bản sao, với khoảng cách (pitch) nào?
   - Áp dụng Array như thế nào (hàng, cột, khoảng cách)?
   - Vẽ xong thì kiểm tra lại bằng số liệu, không chỉ bằng ảnh.

Yêu cầu chất lượng: **nhanh** (trả lời đọc số liệu trong vài trăm ms, không chờ dựng lại hình học) và **chính xác** (số liệu khớp với những gì người dùng thấy).

## 2. Hiện trạng đã kiểm chứng trong mã nguồn

| Năng lực | Hiện có? | Bằng chứng / ghi chú |
|---|---|---|
| Đọc cây đối tượng (id, tên, loại, cha) | **Có** | `get_document_state` (`packages/ai/src/tools/readTools.ts`) |
| Đọc tham số hình học (dài/rộng/cao cho hộp, bán kính...) | **Có, qua node** | `get_node_properties` (`propertyTools.ts`) đọc các dòng của bảng thuộc tính. Với hộp: `dx`, `dy`, `dz`. Với khối đùn: `length` |
| Đọc khung bao (bounding box) của hình bất kỳ | **Có, nhưng cần nhân OCCT** | Truy vấn `bounds` trong `capabilities.generated.ts` (chạy trong trình duyệt). Không lưu sẵn trong dữ liệu |
| Đọc vật liệu: tên, màu, độ mờ, ảnh vân | **Có** | `list_materials`, `get_material` (`materialTools.ts`) |
| **Phân loại vật liệu** (loại, dạng: tấm/thanh/viên/gỗ...) | **Không có** | Vật liệu chỉ có tên và thuộc tính hiển thị. Không có trường phân loại. Phải suy ra từ tên hoặc tỉ lệ kích thước |
| **Tính Array** (hàng, cột, khoảng cách) | **Có trong app, không có tool cho agent** | `ArrayCommand` (`packages/app/src/commands/modify/array.ts`): `numberX`, `numberY`, `offsetX`, `offsetY`, `offsetZ`, `count`. Không có tool `array` trong `packages/ai` |
| Vẽ nhiều bản sao trong một bước | **Một phần** | `run_program` có op biến đổi `transformedMul` (`capabilityEngine.ts`). Agent phải tự tính từng bản sao |
| Ghi nhóm Array vào cây | **Có** (TASK-17) | Cây tự gom nhóm `Array`. `ArrayRecord` có trong `core` |
| Tính BOM / số lượng vật tư | **Có trong app, không có tool** | `computeBomReport` (`packages/app/src/commands/measure/bom.ts`) |
| Số liệu đọc không cần trình duyệt | **Không** | Bản vẽ và khung bao nằm trong trình duyệt (nhân OCCT). Server chỉ giữ JSON |

**Quan sát quan trọng:** dữ liệu lưu trên VPS là JSON của các node. Với khối đùn (`ExtrudeNode`), chiều dài `length` và tiết diện được lưu trực tiếp (`packages/app/src/bodys/extrude.ts`). Với hộp, `dx/dy/dz` cũng lưu sẵn. Nghĩa là **nhiều kích thước có thể đọc được từ JSON mà không cần chạy kernel**. Khung bao của hình phức tạp (sau boolean, bo góc, nhập file) thì không đọc được như vậy.

## 3. Giải pháp tối ưu đề xuất: tách hai đường

Không đẩy mọi việc qua trình duyệt, và cũng không cố tính hình học trên VPS 1 GB. Chia thành hai đường:

### Đường A — Đọc nhanh (không cần kernel, chạy trên VPS)
Phục vụ câu hỏi "đo, phân loại, đếm":
- **Lưu sẵn số liệu đo khi lưu bản vẽ.** Mỗi lần người dùng lưu, trình duyệt tính sẵn cho mỗi node: khung bao `min/max`, dài/rộng/cao đã sắp xếp (`minDim`, `midDim`, `maxDim`), thể tích, diện tích bề mặt, và `shapeKind`. Lưu vào một trường `metrics` trong JSON. Đây là bước then chốt: kernel chạy **một lần khi lưu**, mọi lần đọc sau là tra cứu.
- **Endpoint đọc** trên VPS trả `metrics` và thông tin vật liệu của node, không cần mở trình duyệt. Thời gian mục tiêu: dưới 300 ms cho dự án vài trăm node (đo lại khi triển khai).
- Khi `metrics` chưa có (bản vẽ cũ), trả `status: "stale"` và yêu cầu mở trình duyệt để cập nhật. Không trả số đoán.

### Đường B — Ghi và tính chính xác (cần kernel trong trình duyệt của người dùng)
Phục vụ "vẽ thêm", "nhân bản", "gán vật liệu":
- Gửi **một lô thao tác** (batch) qua cổng phiên. Cả lô chạy trong **một Transaction**, một bước undo.
- Sau khi ghi, trình duyệt tính lại `metrics` cho node vừa tạo và trả về để agent kiểm tra số liệu.

## 4. Các công cụ cần thêm (thiết kế, chưa triển khai)

| Tool | Đường | Mục đích | Đầu vào | Đầu ra |
|---|---|---|---|---|
| `measure_nodes` | A | Đo dài/rộng/cao, thể tích, diện tích | `ids` | `metrics` mỗi node, `status` |
| `classify_material` | A | Suy loại và dạng vật liệu | `materialId` hoặc `ids` | `category`, `form`, `evidence` (tên, tỉ lệ kích thước) |
| `plan_array` | A | Tính số bản sao để phủ vùng | `source`, `region` (node hoặc hộp), `pitchX/Y/Z`, `gap`, `axis` | `count`, `offsets[]`, `coverage`, `leftover` |
| `apply_array` | B | Tạo các bản sao theo kế hoạch, một transaction | `plan` (từ `plan_array`) | `createdIds[]`, `metrics` kiểm tra |
| `bom_report` | A | Bảng vật tư, số lượng theo vật liệu | `ids?` | `items[]` (cùng logic `computeBomReport`) |
| `run_command` | B | Chạy lệnh có allowlist, từ chối lệnh cần hộp thoại | `command`, `args?` | kết quả hoặc lỗi rõ ràng |

### Chi tiết `plan_array` (tính thuần, không cần kernel)
- Đầu vào: kích thước mẫu `(L, W, H)` lấy từ `metrics`, vùng mục tiêu `(Lr, Wr, Hr)` và gốc, khoảng hở `gap` (mặc định 0), trục chính.
- Công thức cho một trục: `pitch = L + gap`, `count = floor((Lr + gap) / pitch)`, `leftover = Lr − (count × pitch − gap)`.
- Nếu `leftover > 0`: báo ra, không tự cắt mẫu. Agent hỏi người dùng: căn giữa, căn trái, hay cắt mẫu cuối.
- Nhiều trục: nhân số đếm theo từng trục, trả `offsets[]` theo thứ tự hàng/cột.
- Hàm này phải là **hàm thuần** trong `packages/core` hoặc một module nhỏ không phụ thuộc kernel, để kiểm thử dễ và chạy nhanh.

### Chi tiết `classify_material` (quy tắc, không đoán)
- Tỉ lệ kích thước `minDim / maxDim` và `midDim / maxDim` quyết định dạng:
  - Tấm: `minDim` rất nhỏ so với hai chiều còn lại.
  - Thanh: `minDim` và `midDim` nhỏ, `maxDim` lớn.
  - Khối/viên: ba chiều gần nhau.
- Tên vật liệu chỉ là **gợi ý phụ**, không quyết định (ví dụ "lam 3 sóng" gợi ý thanh; tên người dùng đặt có thể sai).
- Kết quả luôn kèm `evidence`. Nếu không chắc, trả `form: "unknown"` và liệt kê lý do.
- Trường `category` của vật liệu (nếu thêm vào) là thay đổi dữ liệu: phải bump `documentVersion` theo `AGENTS.md`. Giai đoạn đầu **không** thêm trường, chỉ suy ra.

## 5. Vì sao đây là giải pháp tối ưu

| Tiêu chí | Đường A (VPS, lưu sẵn số liệu) | Đường B (trình duyệt, kernel) |
|---|---|---|
| Tốc độ đọc | Tra cứu JSON, rất nhanh | Chạy kernel, chậm hơn |
| Cần người dùng mở trang | Không | Có |
| Chính xác | Đúng với lần lưu gần nhất (có `stale`) | Đúng nhất, tính lại ngay |
| Tải VPS | Thấp | Không đặt lên VPS |

Kết hợp hai đường: agent đọc và tính nhanh trên VPS, chỉ khi **ghi** mới cần trình duyệt. Số liệu ghi xong được tính lại bằng kernel để xác nhận.

## 6. Rủi ro

| # | Rủi ro | Biện pháp |
|---|---|---|
| R1 | `metrics` lưu sẵn bị lệch sau khi chỉnh sửa mà chưa lưu | Đánh dấu `stale` theo phiên bản; agent không dùng số cũ để ghi |
| R2 | Phân loại sai (tên gây hiểu nhầm) | Quy tắc hình học là chính; tên chỉ là gợi ý; kèm `evidence` |
| R3 | Bản sao vượt vùng mục tiêu hoặc chồng lên nhau | `plan_array` kiểm tra `leftover` và `gap`; `apply_array` kiểm tra va chạm trước khi tạo |
| R4 | Lô thao tác lớn làm treo trình duyệt | Giới hạn số bản sao mỗi lô (ví dụ 500); chia lô |
| R5 | Dữ liệu trên `guest` không có xác thực | Xử lý trước khi mở đường đọc (xem TASK-20 mục 2A) |
| R6 | Prompt injection qua tên node | Bọc dữ liệu trong khối nhãn, không để tên node ra lệnh (xem AGENT-GATEWAY-GUIDE mục 4) |

## 7. Tiêu chí nghiệm thu

- [ ] `measure_nodes` trả đúng dài/rộng/cao cho: hộp, khối đùn, thanh lam, tường. So với `get_node_properties` và số đo trên giao diện, sai số ≤ 0,01 mm.
- [ ] Kích thước đọc từ JSON (đường A) khớp với kernel (đường B) cho cùng bản vẽ.
- [ ] Bản vẽ cũ không có `metrics` trả `stale`, không trả số đoán.
- [ ] `plan_array` có test: đúng số đếm, `leftover` đúng, gap đúng, nhiều trục đúng thứ tự, trường hợp biên (vùng nhỏ hơn mẫu → `count = 0`).
- [ ] `apply_array` tạo đúng số bản sao, một bước undo hoàn tác toàn bộ.
- [ ] `classify_material` có test cho tấm, thanh, khối, và trường hợp `unknown`.
- [ ] Đo thời gian đọc đường A trên dự án thật, ghi số liệu vào Execution Log.
- [ ] `npm run check`, `npm run test`, `npm run build` đều pass.
- [ ] Bằng chứng trên app: ảnh before/after cho một lần `apply_array`.

## 8. Câu hỏi cần người dùng quyết định

1. Chấp nhận lưu `metrics` vào JSON khi lưu bản vẽ? Việc này làm dung lượng mỗi node tăng vài trường số.
2. Có cần thêm trường phân loại vật liệu (`category`, `form`) vào dữ liệu không? Nếu có, phải bump `documentVersion`.
3. "Cho đủ" nghĩa là phủ kín vùng nào? Mặc định agent cần một vùng được chọn rõ (mặt tường hoặc hộp), không đoán.
4. Khi `leftover > 0`, mặc định căn giữa hay cắt mẫu cuối?
