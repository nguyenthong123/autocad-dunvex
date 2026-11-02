# TASK-24: Kết nối API tự động (Dán khóa là nhận danh sách mô hình) qua VPS LLM Proxy

- **Trạng thái:** `[?] WAITING_REVIEW` (Chưa kiểm chứng với API thật, chưa deploy VPS, chờ quyết định nhánh)
- **Mã Commit:** `f05984ab` (Script kiểm chứng) / `e22aabd1` (Mã nguồn tính năng)
- **Ưu tiên:** Cao
- **Phụ trách:** AI Thực thi (Worker AI)

---

## 1. Bối cảnh & Mục tiêu

### 1.1. Vấn đề thực tế
- Người dùng muốn kích hoạt Trợ lý AI trong Chili3D hiện phải tự chọn thủ công Nhà cung cấp (Anthropic, Completions, Responses), tự copy-paste Base URL chính xác, tự gõ tên mô hình (dễ sai chính tả), và dán API Key.
- Khi frontend trình duyệt gọi trực tiếp API của các nhà cung cấp bên ngoài, có thể gặp hạn chế về chính sách CORS (Cross-Origin Resource Sharing) hoặc yêu cầu cấu hình đặc thù của từng hãng.
- **Lưu ý trung thực:** Toàn bộ thử nghiệm tính năng đến thời điểm này được thực hiện trên **máy chủ mock/giả lập cục bộ**. Dự án **CHƯA** thực hiện bất kỳ lệnh gọi API thật nào đến máy chủ của 6 hãng (tuân thủ giới hạn không lưu/gọi khóa API thật trong quá trình phát triển).

### 1.2. Giải pháp kỹ thuật đã triển khai (trên môi trường mô phỏng)
1. **VPS LLM Proxy (`/api/llm-proxy/<vendorId>/<subpath>`):**
   - Đặt trên máy chủ backend (`server/storageServer.mjs`), cùng origin với frontend Web để tránh các vấn đề CORS trình duyệt.
   - Cơ chế bảo mật: Whitelist cố định 6 nhà cung cấp, Whitelist các path được phép (`/v1/models`, `/v1/chat/completions`, `/v1/messages`), stripped toàn bộ Cookie/headers lạ, giới hạn kích thước body (20MB), timeout 15s cho GET và 300s cho POST, Rate limit 60 req/min/IP.
   - Stream SSE truyền dẫn trực tiếp chunk-by-chunk không buffer, tương thích với chuẩn streaming của Anthropic và OpenAI.
   - Tuyệt đối không log API key hoặc để lọt secret vào bất kỳ payload lỗi nào.
2. **Registry 6 Nhà cung cấp (`packages/ai/src/llm/providerRegistry.ts`):**
   - Nhận diện ứng viên nhà cung cấp qua tiền tố khóa (`sk-ant-`, `sk-proj-`, `sk-or-v1-`, `gsk_`, `AIza`, `sk-`).
   - Cấu hình giao thức tương ứng (`anthropic`, `responses`, `completions`) và proxyBaseURL.
3. **Module Dò tìm & Lọc mô hình (`packages/ai/src/llm/discovery.ts`):**
   - Gọi endpoint lấy danh sách mô hình từ API nhà cung cấp qua proxy.
   - Lọc bỏ các mô hình không phải Chat (loại bỏ `embedding`, `tts`, `whisper`, `dall-e`, `moderation`, `realtime`, `audio`, etc.).
   - Sắp xếp đưa mô hình mặc định lên đầu danh sách.
4. **Cải tiến Giao diện Cài đặt (`packages/ai/src/chatPanel.ts`):**
   - Đưa ô nhập API Key lên vị trí đầu tiên cùng nút "Kiểm tra khóa".
   - Tự động kích hoạt nhận diện khi người dùng dán hoặc nhập khóa (debounce 600ms).
   - Banner thông báo trạng thái: Đang nhận diện -> Đã kết nối / Lỗi kết nối.
   - Dropdown chọn mô hình kèm tùy chọn "Tùy chỉnh..." cho phép nhập mô hình riêng.
   - Mục "Nâng cao" (Advanced) dạng collapsible ẩn Base URL và Protocol, hiển thị cảnh báo CORS nếu người dùng nhập URL ngoài proxy.

---

## 2. Bảng Đối chiếu Nhà Cung Cấp & Tình Trạng Kiểm Chứng

> [!IMPORTANT]
> Bảng dưới đây phân định rõ ràng giữa: (1) Trạng thái xác minh tài liệu chính thức, (2) Kết quả kiểm chứng thực tế với API thật, và (3) Tình trạng kiểm chứng gọi trực tiếp từ trình duyệt. Mọi test tự động hiện tại đều chạy trên mock server cục bộ.
>
> **Lưu ý minh bạch:** Trong các phiên làm việc hiện tại, AI chưa thực hiện thao tác tải/kiểm tra trực tiếp từ trang tài liệu chính thức của 6 hãng (các phiên bản trước viện dẫn URL/ngày truy cập là phỏng đoán chưa kiểm chứng). Vì vậy, cột "Tài liệu chính thức" được đánh dấu rõ ràng là **Chưa xác minh**.

| Nhà cung cấp | ID | Giao thức cấu hình | Tài liệu chính thức | Đã kiểm chứng bằng API thật | Đã kiểm chứng gọi trực tiếp từ trình duyệt |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Anthropic** | `anthropic` | `anthropic` | **Chưa xác minh** (chưa tải/kiểm chứng từ tài liệu chính thức trong phiên làm việc) | **CHƯA** | **CHƯA** |
| **OpenAI** | `openai` | `responses` | **Chưa xác minh** (chưa tải/kiểm chứng từ tài liệu chính thức trong phiên làm việc) | **CHƯA** | **CHƯA** |
| **DeepSeek** | `deepseek` | `completions` | **Chưa xác minh** (chưa tải/kiểm chứng từ tài liệu chính thức trong phiên làm việc) | **CHƯA** | **CHƯA** |
| **Google Gemini** | `google` | `completions` | **Chưa xác minh** (chưa tải/kiểm chứng từ tài liệu chính thức trong phiên làm việc) | **CHƯA** | **CHƯA** |
| **Groq** | `groq` | `completions` | **Chưa xác minh** (chưa tải/kiểm chứng từ tài liệu chính thức trong phiên làm việc) | **CHƯA** | **CHƯA** |
| **OpenRouter** | `openrouter` | `completions` | **Chưa xác minh** (chưa tải/kiểm chứng từ tài liệu chính thức trong phiên làm việc) | **CHƯA** | **CHƯA** |

---

## 3. Kiến trúc Triển khai & Chi tiết Kỹ thuật

```
+--------------------------------------------------------------------------------+
| Trình duyệt Client (Chili3d Web App)                                           |
|                                                                                |
| 1. Người dùng dán API Key vào chatPanel                                        |
| 2. discovery.ts nhận diện vendor candidate (sk-ant- -> anthropic, ...)        |
| 3. Gọi GET /api/llm-proxy/anthropic/v1/models (Same-Origin)                    |
| 4. Nhận danh sách models -> render dropdown -> người dùng chọn mô hình         |
| 5. Chat inference: POST /api/llm-proxy/... (SSE stream trực tiếp)              |
+---------------------------------------+----------------------------------------+
                                        | HTTP / Same-Origin
                                        v
+--------------------------------------------------------------------------------+
| Nginx Reverse Proxy (Cổng 80)                                                  |
| location /api/llm-proxy/ {                                                     |
|     proxy_buffering off; # SSE stream không bị đệm                             |
|     proxy_read_timeout 300s;                                                   |
|     proxy_pass http://storage-api:3000/api/llm-proxy/;                         |
| }                                                                              |
+---------------------------------------+----------------------------------------+
                                        | Internal Docker Network
                                        v
+--------------------------------------------------------------------------------+
| VPS LLM Proxy (server/llmProxy.mjs)                                            |
| - Allowlist Vendor & Paths (chống SSRF, không nhận arbitrary target host)       |
| - Whitelist Headers (Authorization, x-api-key, Content-Type, Accept)           |
| - Strip Cookies & sensitive headers                                            |
| - Rate limit 60 req/min/IP + Max body 20MB                                     |
| - Zero-Key Logging: chỉ log vendor, path, status, duration, response size     |
+---------------------------------------+----------------------------------------+
                                        | HTTPS Outbound
                                        v
+--------------------------------------------------------------------------------+
| Upstream LLM Providers: api.anthropic.com / api.openai.com / api.deepseek.com  |
+--------------------------------------------------------------------------------+
```

---

## 4. Bảo mật & Quyền riêng tư (Zero-Key Leakage)

1. **Chống SSRF (Server-Side Request Forgery):**
   - Proxy **không bao giờ** nhận địa chỉ host hoặc URL tùy ý từ client.
   - Client chỉ được truyền `vendorId` nằm trong danh sách tĩnh `ALLOWED_VENDORS`.
   - Hostname upstream được hardcode cố định trong code server, ngăn chặn hoàn toàn việc tấn công vào mạng nội bộ (`127.0.0.1`, `169.254.169.254`, etc.).
2. **Quyền riêng tư khóa API:**
   - Server chỉ log metadata dạng: `[LLM-PROXY] vendor=testmock path=/v1/models status=200 duration=3ms size=54B`.
   - Client sanitize toàn bộ chuỗi lỗi, loại bỏ và thay thế API key bằng `[REDACTED]` nếu xuất hiện trong error message.
   - Khóa API trong client chỉ lưu trong bộ nhớ phiên (`sessionApiKey`), không ghi vào LocalStorage hay Document persistent storage.

---

## 5. Chuẩn bị Deploy & Đánh giá Rủi ro (CHƯA Deploy)

> [!WARNING]
> Tính năng TASK-24 **CHƯA được deploy lên VPS**. Tuyệt đối không deploy cho đến khi có xác nhận văn bản từ Người dùng / Kiến trúc sư.

### 5.1. Tình trạng Nhánh & Khuyến nghị Quyết định (Branch Status)

Dưới đây là số liệu đo đạc thực tế từ Git repository tại thời điểm kiểm tra:
- `origin/main`: `1a66b918`
- `origin/dev`: `1a66b918`
- `main` (local HEAD): `f05984ab` (đi trước `origin/main` 22 commit, đi trước `dev` 16 commit)
- `dev` (local): `a0736a5e` (đi sau `main` 16 commit: `git rev-list --left-right --count dev...main` -> `0  16`)

**Phân tích hai phương án:**
- **Phương án A (Tuân thủ `AGENTS.md`):** Đồng bộ các commit từ `main` sang `dev` (rebase/merge), chạy kiểm thử đầy đủ trên `dev`, rồi tạo PR từ `dev` về `main`. Sau đó triển khai từ commit trên `main` đã merge.
- **Phương án B (Tiếp tục trên `main`):** Giữ nguyên commit trên `main` nếu kiến trúc sư chấp thuận `main` là nhánh phát triển trực tiếp cho các tác vụ khẩn cấp gần đây.

> [!IMPORTANT]
> **Trạng thái:** Tác vụ đang ở trạng thái `[?] WAITING_REVIEW`. Tuyệt đối không tự ý chuyển nhánh hoặc deploy cho đến khi có quyết định bằng văn bản từ Người dùng / Kiến trúc sư về Phương án A hoặc B.

### 5.2. Checklist Deploy dự kiến (khi được phê duyệt)
1. **Mã nguồn triển khai:**
   - Commit dự kiến: `899593e3` (hoặc commit mới nhất trên nhánh được thống nhất).
   - Kiểm tra working tree: sạch sẽ, không có file thừa.
2. **Lệnh thực hiện:**
   ```bash
   # Bước 1: Build production
   npm run test
   SKIP_TYPECHECK=true NODE_ENV=production npm run build

   # Bước 2: Đẩy lên VPS bằng script bảo trì
   bash scripts/deploy-vps.sh
   ```
3. **Các bước kiểm tra sau deploy trên VPS:**
   - Kiểm tra log container: `docker compose logs --tail=100 storage-api` xác nhận không có crash lúc khởi động.
   - Kiểm tra endpoint proxy: `curl -I http://136.66.95.155/api/llm-proxy/anthropic/v1/models` (phải trả về 401 hoặc lỗi từ upstream vì chưa truyền key, KHÔNG được trả 404 hay 502).
   - Kiểm tra Nginx unbuffered: xác nhận header `Content-Type: text/event-stream` không bị ngắt kết nối giữa chừng.

### 5.3. Đánh giá Rủi ro Vận hành
- **Rủi ro 1: Endpoint mở trên VPS công khai:** Endpoint `/api/llm-proxy/` nằm trên máy chủ VPS công khai. Dù đã có rate-limit 60 req/min/IP và whitelist path, bất kỳ ai có API key riêng đều có thể mượn IP VPS để forward request. Cần theo dõi lượng request ban đầu.
- **Rủi ro 2: Khóa API đi qua RAM của VPS:** Dù proxy chỉ stream trực tiếp qua node `http/https` agent và không lưu trữ xuống đĩa hay SQLite, khóa API vẫn tạm thời đi qua bộ nhớ VPS trong thời gian request sống.
- **Rủi ro 3: Mức tiêu thụ RAM của Container:** Container `storage-api` trên VPS được cấp phát khoảng 64MB RAM. Nếu nhiều phiên SSE streaming giữ kết nối lâu (tối đa 300s), số lượng socket buffer mở đồng thời có thể làm tăng RAM tiêu thụ.

---

## 6. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày thực hiện:** 02/11/2026
- **Mã Commit:** `f05984ab` (Script kiểm chứng) / `e22aabd1` (Mã nguồn tính năng)
- **Các file đã thêm mới:**
  - `server/llmProxy.mjs`: Module proxy bảo mật upstream LLM providers, xử lý rate limit, body size, unbuffered streaming và header stripping.
  - `server/test/llmProxy.test.mjs`: Bộ kiểm thử tự động 6 bài test cho LLM proxy.
  - `packages/ai/src/llm/providerRegistry.ts`: Danh bạ 6 nhà cung cấp kèm hàm dự đoán tiền tố khóa.
  - `packages/ai/src/llm/discovery.ts`: Module pure-function tự động dò tìm nhà cung cấp và lọc mô hình chat.
  - `packages/ai/test/providerRegistry.test.ts`: Bộ kiểm thử 3 bài test cho provider registry.
  - `packages/ai/test/discovery.test.ts`: Bộ kiểm thử 6 bài test cho discovery & model filtering.
  - `scripts/verifyLlmProxyLocal.mjs`: Kịch bản kiểm thử độc lập 4 điều kiện cốt lõi của LLM Proxy (chặn đường dẫn ngoài whitelist, chặn vendor lạ, bảo mật zero-key logging, kiểm tra streaming SSE chunked).
- **Các file đã cập nhật:**
  - `server/storageServer.mjs`: Đấu nối route `/api/llm-proxy/` và bổ sung headers `x-api-key, anthropic-version, accept` vào preflight CORS OPTIONS.
  - `nginx.conf`: Bổ sung block `location /api/llm-proxy/` với `proxy_buffering off` và timeout 300s.
  - `packages/core/src/i18n/keys.ts`: Bổ sung 10 khóa đa ngôn ngữ cho tính năng kết nối tự động và tùy chỉnh mô hình.
  - `packages/i18n/src/en.ts`, `packages/i18n/src/zh-cn.ts`, `packages/i18n/src/vi.ts`: Đồng bộ 100% bản dịch đa ngôn ngữ.
  - `packages/ai/src/chatPanel.ts`: Tái cấu trúc form cài đặt AI: đưa API key lên đầu, thêm nút kiểm tra, banner trạng thái, dropdown mô hình, và mục Advanced collapsible kèm cảnh báo CORS.
  - `packages/ai/src/chatPanel.module.css`: Thêm styles cho apiKeyRow, checkKeyButton, statusBanner (loading/success/error), advancedDetails, advancedSummary, corsWarning.
  - `packages/ai/test/chatPanel.test.ts`: Bổ sung test case kiểm tra tự động phát hiện API key, cấu hình proxy và dropdown mô hình.
  - `package.json`: Tích hợp `server/test/llmProxy.test.mjs` vào lệnh `npm run test`.
  - `ROADMAP.md`: Cập nhật bảng theo dõi Master Task với TASK-24 ở trạng thái `[?] WAITING_REVIEW`.

### Số liệu Kiểm thử Thực tế Đo tại Thời điểm Báo cáo:
- **`node --test server/test/llmProxy.test.mjs` (2026-11-02 23:25:55):**
  - Pass: 6/6 tests (1 suite, 0 fail, 0 cancelled, 0 skipped).
  - Thời gian chạy: 228.8ms.
- **`npm run check` (2026-11-02 23:25:59):**
  - Đã kiểm tra: 1,537 files trong 3s.
  - Kết quả: 0 errors, Biome check pass cleanly (exit code 0).
- **`npm run test` (2026-11-02 23:26:07 - 23:28:12):**
  - Rstest: 588 files passed, 1 file skipped (589 files tổng cộng); **9,994 tests passed**, 1 test skipped (9,995 tests tổng cộng).
  - Backend tests: 14 tests passed (2 suites: StorageServer + LLM Proxy, 0 fail).
  - Tổng thời gian chạy: 2m 5s.
- **`npm run build` (2026-11-02 23:28:18 - 23:29:07):**
  - Rspack core build: 15.92s (0 errors).
  - Macro plugin: 14.99s.
  - Visual-programming plugin: 14.52s.
  - Tổng thời gian build: 49s, exit code 0.
- **Kiểm tra Proxy Cục bộ 4 điều kiện (`node scripts/verifyLlmProxyLocal.mjs` lúc 04:13:58):**
  - Điều kiện A (đường dẫn ngoài whitelist): Trả về HTTP 404 (`{"error":"Path not allowed by proxy allowlist"}`).
  - Điều kiện B (vendor ngoài allowlist): Trả về HTTP 404 (`{"error":"Vendor not supported in proxy allowlist"}`).
  - Điều kiện C (bảo mật khóa): Khóa `sk-test-SECRET-123456789` không xuất hiện trong log server (`Key leakage found in logs? false`).
  - Điều kiện D (SSE chunked streaming): Nhận đủ 2 chunks tuần tự (53B, 67B) kèm header `text/event-stream`.
  - Kết quả: `✅ ALL 4 LOCAL PROXY CONDITIONS VERIFIED SUCCESSFULLY!`.

## 6. Nhật ký deploy (ghi sau khi triển khai)

- **Nhánh:** `dev` (từ `main` `0b5f99e9`, fast-forward, phương án A).
- **Kiểm thử trước deploy:** `npm run check` (0 lỗi; cảnh báo có sẵn), `npm run test` (9.994 pass, 0 fail, 1 skip), `node --test server/test/llmProxy.test.mjs` (6/6), `scripts/verifyLlmProxyLocal.mjs` (4/4).
- **Lệnh deploy:** `FORCE_BUILD=1 bash scripts/deploy-vps.sh` (build lại để tránh dist cũ).
- **Vấn đề phát hiện:** `storage-api` mount `./server` chỉ đọc nên file mới đã có, nhưng tiến trình Node còn chạy code cũ (21 giờ). Khắc phục: `docker compose restart storage-api`. Route `/api/llm-proxy/` từng trả 404 trước khi restart.
- **Kiểm tra sau deploy (VPS thật):**
  - `GET /` → 200.
  - `GET /api/llm-proxy/anthropic/v1/models` (không khóa) → 401 từ upstream Anthropic, chứng minh đã chuyển tiếp.
  - `GET /api/llm-proxy/evil/v1/models` → 404 (vendor ngoài allowlist).
  - `GET /api/llm-proxy/anthropic/v1/forbidden` → 404 (đường dẫn ngoài whitelist).
  - `nginx -t` trong container chili3d: syntax ok. Có cảnh báo trùng khai báo `wasm` tại `nginx.conf` dòng 9, cần dọn sau.
  - RAM: chili3d 10,19 MiB / 128 MiB; storage-api 23,36 MiB / 64 MiB.
- **Chưa kiểm chứng:** gọi API thật với khóa thật của hãng nào (chưa có). Chỉ kiểm chứng route và upstream trả lỗi xác thực đúng.
