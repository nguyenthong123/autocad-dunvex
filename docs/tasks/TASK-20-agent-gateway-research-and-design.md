# TASK-20: Cổng Agent bên ngoài (Agent Gateway) — Nghiên cứu & Thiết kế

> **Trạng thái:** `[ ] TODO` (chỉ nghiên cứu và thiết kế. Chưa triển khai. Cần người dùng phê duyệt phương án trước khi làm).
> **Mức độ ưu tiên:** P1 (tính năng lớn, ảnh hưởng bảo mật)
> **Phụ thuộc:** `TASK-06` (lưu trữ đám mây), `TASK-12` (xác thực), `TASK-17` (BOM), `TASK-19` (đang WAITING_REVIEW)
> **Hướng dẫn chi tiết cho người thực hiện:** [docs/AGENT-GATEWAY-GUIDE.md](../AGENT-GATEWAY-GUIDE.md)

---

## 1. Yêu cầu của người dùng

Người dùng muốn một cổng để một agent bên ngoài (ví dụ một mô hình AI chạy trên máy khác) có thể:

1. Gửi một **đường dẫn (link) hoặc webhook**, agent truy cập vào và **đọc dự án**, **xem bản vẽ**.
2. **Chạy lệnh** trên bản vẽ (lệnh như thanh lệnh AutoCAD, hoặc thao tác tương đương).
3. **Tính vật liệu** (bảng BOM / TK / LI theo TASK-17).
4. **Vẽ thêm** hình học và **gán vật liệu** tương ứng.
5. **Biết người dùng đang nhấp chuột vào vật thể nào** (theo thời gian thực).
6. **Đổi màu** vật thể.
7. Gần như **làm việc như một người vẽ hoàn chỉnh**, có thể cộng tác với người dùng.

## 2. Hiện trạng đã kiểm chứng trong mã nguồn

| Năng lực | Hiện có? | Bằng chứng |
|---|---|---|
| Danh mục công cụ cho agent | **Có**, 119 tool | `packages/ai/src/tools/*.ts`, `host.ts` có `list()` và `call()` |
| Đọc trạng thái bản vẽ | Có | `get_document_state`, `get_node_properties`, `get_selection`, `list_materials`, `get_material` |
| Chọn, ẩn, di chuyển, xóa, biến đổi | Có | `select_nodes`, `set_node_visible`, `move_nodes`, `delete_node`, `transform_node` |
| Đổi vật liệu | Có | `set_material`, `set_material_properties` |
| Vẽ hình học | Có, qua ops | `run_program` (`capabilityEngine.ts`), `run_parametric` |
| Chụp khung nhìn | Có | `capture_screenshot`, `capture_views` |
| Undo/redo | Có | `undo`, `redo` |
| Lệnh kiểu thanh lệnh (`L`, `REC`, `BOM`...) | **Chưa có tool** | Không có tool nào gọi `CommandService`. Chỉ có `run_program` và `run_parametric` |
| Tính BOM qua tool | **Chưa có tool** | Có hàm `computeBomReport(doc, nodes)` trong `packages/app/src/commands/measure/bom.ts`, nhưng không được đưa ra làm tool |
| Gửi sự kiện chọn ra ngoài | **Chưa có** | Có `selectionManager.onNodeChanged` (Signal) trong trang, nhưng không có kênh nào đẩy ra agent |
| Cầu nối cục bộ (`?bridge=<port>`) | **Có một phần** | `packages/ai/src/bridge/index.ts`: trang mở WebSocket đi ra `ws://127.0.0.1:<port>/ws`, gửi `hello` kèm danh sách tool, nhận `call` và trả `result`. Bị khóa ở `ask_user` |
| Daemon `chili3d-mcp` / `@chili3d/mcp` | **Không có trong repo** | `AGENTS.md` và thông báo lỗi của bridge nhắc tới, nhưng không tìm thấy thư mục nào trong repo |
| Server lưu trữ đám mây | Có | `server/storageServer.mjs`, JWT, API `/api/storage/...` và `/api/auth/...`, cổng 3000 trong container |
| Nginx cho WebSocket | **Không có** | `nginx.conf` chỉ có `proxy_pass` cho `/api/`, không có `Upgrade` / `Connection` |
| Tài nguyên VPS | 1 vCPU, 1 GB RAM | `docs/MAINTENANCE.md` mục 3 |

**Kết luận từ hiện trạng:**
- Phần lớn "bộ não thao tác" đã có. Agent đã có thể đọc, chọn, đổi màu, di chuyển, vẽ bằng `run_program`, và chụp ảnh.
- Thiếu bốn thứ để đạt yêu cầu: (a) tool chạy lệnh kiểu thanh lệnh, (b) tool BOM, (c) kênh sự kiện chọn theo thời gian thực, (d) một **cổng trung gian** để agent ở máy khác tiếp cận được trình duyệt đang mở.
- **Điểm quyết định về kiến trúc (đã hiệu chỉnh, xem mục 2A):** nhân OCCT (WASM) và mọi phép tính hình học chạy **trong trình duyệt của người dùng**. Dữ liệu bản vẽ thì được **lưu trên VPS** (theo người dùng hoặc tài khoản `guest`), trình duyệt chỉ giữ bản cache IndexedDB. Vì vậy agent đọc JSON bản vẽ được từ server, nhưng muốn vẽ và nhận diện hình học chính xác thì vẫn cần kernel chạy trong trình duyệt.

## 2A. Hiệu chỉnh sau khi làm rõ với người dùng

**Ý người dùng:** "agent" là một trợ lý AI có công cụ, giống mình hoặc ChatGPT. Người dùng tạo một **đường dẫn (cổng phiên)** trong profile của app. Agent mở đường dẫn đó để vào bản vẽ, chủ yếu để **vẽ** và **nhận diện chính xác**. Việc xoay, xem, chọn trên trình duyệt đã có tool trong app.

**Kiểm chứng giả định "dữ liệu nằm trên máy, VPS chỉ hiển thị":**

| Phát biểu | Kết quả kiểm chứng | Bằng chứng |
|---|---|---|
| VPS chỉ hiển thị trang web | **Sai.** VPS lưu dự án | `packages/web/src/index.ts` dùng `.useCloudStorage("/api/storage")`. `server/storageServer.mjs` ghi vào `DATA_DIR/users/<id>/dunvex_cad.sqlite` (bảng `projects`, cột `document_json`). Không có token thì dùng bucket `guest` trên VPS |
| Dữ liệu nằm trên máy người dùng | **Đúng một phần.** Trình duyệt chỉ là cache và phương án dự phòng | `packages/storage/src/apiCloudStorage.ts`: `get` ghi bản sao vào IndexedDB. Khi lỗi mạng thì đọc từ IndexedDB |
| Tính toán chạy trên máy người dùng | **Đúng** | OCCT WASM chạy trong trang (`packages/wasm`), không chạy trên server |
| Có tính năng "cổng phiên" trong profile | **Chưa có.** Profile chỉ có đăng nhập/đăng ký | `packages/ui/src/auth/authDialog.ts` |

**Hệ quả với thiết kế:**
1. Agent **đọc được bản vẽ từ VPS** mà không cần trình duyệt mở. Nhưng để **vẽ và nhận diện đúng** thì phải chạy kernel. Hai đường:
   - (i) Cổng phiên mở trang app trong trình duyệt của người dùng. Agent điều khiển trang đó qua relay. Đây là phương án chính, vì kernel và dữ liệu hiển thị đúng với người dùng.
   - (ii) Worker headless trên máy riêng tải JSON từ VPS và chạy kernel. Chỉ dùng cho tác vụ hàng loạt, không dùng VPS 1 GB.
2. Cổng phiên phải gắn với **một dự án của một người dùng**. Vì dữ liệu nằm trên VPS, phải kiểm tra quyền trên server trước khi trả dữ liệu.
3. Dự án của tài khoản `guest` cũng nằm trên VPS và không có xác thực, nên bất kỳ ai biết `id` đều có thể đọc. Đây là rủi ro cần xử lý trước khi mở cổng phiên. Hiện đã có một bản copy dự án thật vào `guest` (xem báo cáo TASK-19).

**Cổng phiên được đề xuất (thay cho "webhook" chung chung):**
- Người dùng bấm "Tạo cổng cho agent" trong profile → chọn dự án, phạm vi (`read` / `draw` / `write`), thời hạn → app hiện đường dẫn một lần.
- Đường dẫn chứa mã một lần, không chứa token dài hạn. Agent đổi mã lấy token phiên ngắn hạn.
- Khi người dùng mở đường dẫn, trình duyệt kết nối ra relay trên VPS. Từ đó agent gọi tool, và kernel trong trình duyệt thực thi.
- Thao tác ghi cần người dùng xác nhận trong trình duyệt, trừ khi bật chế độ tin cậy trong phiên.
- Mọi thao tác được ghi nhật ký kiểm toán.

Chi tiết triển khai được cập nhật trong `docs/AGENT-GATEWAY-GUIDE.md`, mục 3.

## 3. Các phương án đã cân nhắc

### Phương án A — Hoàn thiện cầu nối cục bộ (đề xuất giai đoạn 1)
- Tận dụng `?bridge=<port>` đã có. Viết daemon cục bộ (`chili3d-mcp`) mở cổng HTTP/MCP cho agent (Claude Code, opencode, v.v.) và chuyển tiếp sang WebSocket của trang.
- Ưu điểm: nhanh, ít rủi ro, không đưa dữ liệu lên server, dùng lại 119 tool.
- Nhược điểm: trang phải mở trên **cùng máy** với daemon. Không phải "gửi link là chạy".

### Phương án B — Cổng trung gian trên VPS (đề xuất giai đoạn 2)
- Thêm dịch vụ **relay** vào `storageServer.mjs` (hoặc dịch vụ riêng) với:
  - Trang trình duyệt **tự mở kết nối đi ra** tới `wss://<domain>/api/agent/ws` (không cần mở cổng trên máy người dùng).
  - Agent gọi **HTTPS** tới `POST /api/agent/sessions/{id}/call` với token phiên, và nhận sự kiện qua SSE hoặc webhook.
  - Mỗi phiên có **token ngắn hạn, một lần, có phạm vi (scope)**. Có thể thu hồi.
- Yêu cầu hạ tầng: nginx phải thêm `Upgrade` / `Connection` cho `/api/agent/ws`.
- Ưu điểm: đúng ý "gửi link là agent vào". Đa người dùng có kiểm soát.
- Nhược điểm: dữ liệu bản vẽ đi qua VPS. Phải có mã hóa, nhật ký kiểm toán và phân quyền. Việc tạo token và chia sẻ đường dẫn phải rất cẩn trọng.

### Phương án C — Worker headless (giai đoạn 3, không đặt trên VPS)
- Chạy Chrome headless + app trên máy riêng (không phải VPS 1GB) để xử lý tác vụ hàng loạt, ví dụ tính BOM cho nhiều dự án.
- Ưu điểm: không cần người dùng mở trình duyệt.
- Nhược điểm: tốn tài nguyên, phức tạp, cần cơ chế nạp dự án.

### Phương án D — Chạy OCCT trên server (không đề xuất)
- Phải biên dịch lại và chạy nhân WASM/OCCT trên server. Vượt quá tài nguyên VPS và thay đổi kiến trúc lớn.

## 4. Đề xuất

**Thực hiện theo ba giai đoạn, mỗi giai đoạn có tiêu chí nghiệm thu riêng:**

1. **Giai đoạn 1 — Cầu nối cục bộ hoàn chỉnh (Phương án A).**
   - Thêm tool còn thiếu: `run_command` (chạy lệnh theo tên, có khóa tương tác), `bom_report` (gọi `computeBomReport`), `subscribe_selection` (sự kiện chọn, xem bên dưới).
   - Viết daemon `chili3d-mcp` (vị trí: `packages/mcp/` hoặc `tools/chili3d-mcp/`, quyết định ở giai đoạn 1).
   - Mục tiêu: một agent trên cùng máy đọc bản vẽ, tính BOM, đổi màu, vẽ và nhận biết đối tượng đang được chọn.

2. **Giai đoạn 2 — Cổng relay trên VPS (Phương án B), chỉ sau khi giai đoạn 1 đạt và có phê duyệt bảo mật.**
   - Token phiên ngắn hạn, scope `read` / `write` / `draw`, hết hạn, thu hồi được.
   - Mọi lệnh ghi phải qua **xác nhận của người dùng** trong trình duyệt (dùng cơ chế `ask_user`/card có sẵn ở phía trang, không dùng qua bridge).
   - Nhật ký kiểm toán cho mỗi lệnh.

3. **Giai đoạn 3 — Worker headless (Phương án C)**, chỉ khi có nhu cầu tác vụ hàng loạt.

### Sự kiện "người dùng đang nhấp vào vật thể nào"
- Lấy từ `selectionManager.onNodeChanged` (đã có trong trang). Đẩy ra gateway khi có thay đổi, kèm `nodeId`, `name`, `materialId`, `bounds` rút gọn. Không gửi toàn bộ hình học.
- Phải có **bật/tắt rõ ràng** trong giao diện, và hiển thị cho người dùng biết agent đang theo dõi lựa chọn.

## 5. Rủi ro và yêu cầu bảo mật (bắt buộc)

| # | Rủi ro | Biện pháp bắt buộc |
|---|---|---|
| R1 | **Đường dẫn chứa token bị lộ** qua lịch sử trình duyệt, log nginx, hoặc chia sẻ nhầm | Không đưa token dài hạn vào URL. Dùng token một lần đổi lấy phiên ngắn. Không ghi token vào log. |
| R2 | **Prompt injection**: tên node, ghi chú, hoặc văn bản trong bản vẽ chứa lệnh giả để agent làm việc xấu | Coi mọi dữ liệu bản vẽ là **không đáng tin**. Agent không được thực thi chỉ dẫn lấy từ dữ liệu. Gắn nhãn dữ liệu trong kết quả tool. |
| R3 | **Rò rỉ dữ liệu**: agent đọc bản vẽ của người khác | Token gắn với đúng một dự án và một người dùng. Kiểm tra quyền trên server trước khi trả dữ liệu. |
| R4 | **Ghi trái phép**: agent xóa hoặc đổi bản vẽ | Scope `read` mặc định. Mọi thao tác ghi cần người dùng xác nhận trong trình duyệt (với giai đoạn 2). Có undo. |
| R5 | **Lạm dụng tài nguyên** trên VPS 1 GB | Giới hạn tần suất gọi, kích thước payload, số phiên đồng thời. Không xử lý hình học nặng trên server. |
| R6 | **Thiếu kiểm toán** | Ghi nhật ký: thời điểm, phiên, tool, tham số rút gọn, kết quả (ok/fail). Không ghi dữ liệu nhạy cảm. |
| R7 | **nginx không hỗ trợ WebSocket** | Thêm `Upgrade`/`Connection` cho `/api/agent/ws` và kiểm tra `docker compose` trên VPS. |
| R8 | **Gửi dữ liệu bản vẽ cho nhà cung cấp mô hình** | Ghi rõ trong giao diện và tài liệu. Cho phép người dùng chọn không chia sẻ. |
| R9 | **Mở cổng cục bộ cho mạng ngoài** | Daemon chỉ lắng nghe `127.0.0.1`. Không bind `0.0.0.0`. |
| R10 | **Hai tab cùng kết nối** | Giữ cơ chế `replaced` (mã 4002) có sẵn trong bridge. |

## 6. Phạm vi KHÔNG làm trong TASK-20

- Không chạy OCCT trên VPS.
- Không thay đổi định dạng tài liệu (`documentVersion`) trừ khi có phê duyệt riêng.
- Không cho agent truy cập hệ thống tệp của máy người dùng hoặc shell.
- Không thay đổi trạng thái của TASK-08, TASK-18, TASK-19.

## 7. Tiêu chí nghiệm thu (theo giai đoạn)

**Giai đoạn 1:**
- [ ] Agent cục bộ liệt kê được tool, đọc `get_document_state`, và nhận đúng dữ liệu.
- [ ] `bom_report` trả về bảng khớp với kết quả lệnh BOM trên giao diện, cùng một bản vẽ.
- [ ] `run_command` chạy được ít nhất `BOM` và `TK` (lệnh không mở hộp thoại chờ), và từ chối lệnh mở hộp thoại thay vì treo.
- [ ] `subscribe_selection` gửi đúng `nodeId` khi người dùng click, và dừng khi tắt.
- [ ] Đổi màu và vẽ thêm vật liệu được thực hiện, undo hoạt động.
- [ ] Test tự động cho từng tool mới. `npm run check`, `npm run test`, `npm run build` đều pass.
- [ ] Bảng kiểm tra trực quan: ảnh before/after cho một thao tác đổi màu và một thao tác vẽ.

**Giai đoạn 2 (chỉ khi được phê duyệt):**
- [ ] Token phiên hết hạn đúng, thu hồi được, không dùng lại được.
- [ ] Agent không đọc được dự án không thuộc token.
- [ ] Thao tác ghi bị chặn nếu người dùng không xác nhận.
- [ ] Nhật ký kiểm toán có đủ trường và không có dữ liệu nhạy cảm.
- [ ] nginx WebSocket hoạt động trên VPS, được kiểm chứng bằng kết nối thật.
- [ ] Kiểm thử bảo mật: thử truy cập chéo dự án, token hết hạn, token bị thu hồi, prompt injection trong tên node.

## 8. Câu hỏi cần người dùng quyết định trước khi triển khai

1. Có chấp nhận giai đoạn 1 (cầu nối cục bộ) trước không? Hay muốn đi thẳng tới giai đoạn 2 (VPS)?
2. Dữ liệu bản vẽ có được phép đi qua VPS không? Nếu không thì giai đoạn 2 không làm được.
3. Agent nên dùng nhà cung cấp mô hình nào? (ảnh hưởng tới R8)
4. Ai được phép tạo token và chia sẻ link? Chỉ bạn, hay cả người khác?
5. Thao tác ghi có cần xác nhận từng lần, hay có chế độ "tin cậy" trong một phiên?
