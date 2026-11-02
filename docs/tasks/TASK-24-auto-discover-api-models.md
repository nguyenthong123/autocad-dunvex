# TASK-24: Kết nối API tự động (Dán khóa là nhận danh sách mô hình) qua VPS LLM Proxy

- **Trạng thái:** `[?] WAITING_REVIEW`
- **Mã Commit:** `e22aabd1`
- **Ưu tiên:** Cao
- **Phụ trách:** AI Thực thi (Worker AI)

---

## 1. Bối cảnh & Mục tiêu

### 1.1. Vấn đề thực tế
- Trước đây, người dùng muốn kích hoạt Trợ lý AI trong Chili3D phải tự chọn thủ công Nhà cung cấp (Anthropic, Completions, Responses), tự copy-paste Base URL chính xác, tự gõ tên mô hình (dễ sai chính tả), và dán API Key.
- Khi người dùng muốn kết nối trực tiếp từ trình duyệt đến các API upstream chính thống (Anthropic, OpenAI, DeepSeek, Google Gemini, Groq), trình duyệt sẽ chặn request do chính sách **CORS (Cross-Origin Resource Sharing)** vì các nhà cung cấp trên không cho phép gọi API trực tiếp từ frontend origin của bên thứ ba bằng web client.

### 1.2. Giải pháp kỹ thuật đã triển khai
1. **VPS LLM Proxy (`/api/llm-proxy/<vendorId>/<subpath>`):**
   - Đặt ngay trên máy chủ backend (`server/storageServer.mjs`), cùng origin với frontend Web, giải quyết dứt điểm rào cản CORS của trình duyệt.
   - Cơ chế bảo mật nghiêm ngặt: Whitelist cố định 6 nhà cung cấp, Whitelist các path được phép (`/v1/models`, `/v1/chat/completions`, `/v1/messages`), stripped toàn bộ Cookie/headers lạ, giới hạn kích thước body (20MB), timeout 15s cho GET và 300s cho POST, Rate limit 60 req/min/IP.
   - Stream SSE truyền dẫn trực tiếp chunk-by-chunk không buffer, hoàn toàn tương thích với streaming chat/responses của Anthropic và OpenAI SDK.
   - Tuyệt đối không log API key hoặc để lọt secret vào bất kỳ payload lỗi nào.
2. **Registry 6 Nhà cung cấp Đã Kiểm chứng (`packages/ai/src/llm/providerRegistry.ts`):**
   - Nhận diện tự động qua tiền tố khóa (`sk-ant-`, `sk-proj-`, `sk-or-v1-`, `gsk_`, `AIza`, `sk-`).
   - Tự động gán giao thức phù hợp (`anthropic`, `responses`, `completions`) và proxyBaseURL tương ứng.
3. **Module Dò tìm & Lọc mô hình thông minh (`packages/ai/src/llm/discovery.ts`):**
   - Gọi endpoint lấy danh sách mô hình từ chính API nhà cung cấp qua proxy.
   - Lọc bỏ các mô hình không phải Chat (loại bỏ `embedding`, `tts`, `whisper`, `dall-e`, `moderation`, `realtime`, `audio`, etc.).
   - Sắp xếp đưa mô hình mặc định/mạnh nhất lên đầu danh sách.
4. **Cải tiến Giao diện Cài đặt (`packages/ai/src/chatPanel.ts`):**
   - Đưa ô nhập API Key lên vị trí đầu tiên cùng nút "Kiểm tra khóa".
   - Tự động kích hoạt nhận diện khi người dùng dán hoặc nhập khóa (debounce 600ms).
   - Banner thông báo trạng thái trực quan: Đang nhận diện -> Đã kết nối thành công / Lỗi khóa.
   - Dropdown chọn mô hình trực quan kèm tùy chọn "Tùy chỉnh..." cho phép nhập mô hình riêng.
   - Mục "Nâng cao" (Advanced) dạng collapsible ẩn Base URL và Protocol, hiển thị cảnh báo CORS nếu người dùng nhập URL ngoài proxy.

---

## 2. Bảng Ma trận CORS & Các Nhà cung cấp Đã Kiểm chứng

| Nhà cung cấp | ID | Giao thức | Tiền tố Key | Base URL Trực tiếp | Proxy URL trên VPS | Gọi trực tiếp từ Web? | Trạng thái qua Proxy |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **Anthropic** | `anthropic` | `anthropic` | `sk-ant-` | `https://api.anthropic.com` | `/api/llm-proxy/anthropic` | ❌ Bị CORS chặn | ✅ Hoạt động 100% |
| **OpenAI** | `openai` | `responses` | `sk-proj-`, `sk-` | `https://api.openai.com/v1` | `/api/llm-proxy/openai/v1` | ❌ Bị CORS chặn | ✅ Hoạt động 100% |
| **DeepSeek** | `deepseek` | `completions` | `sk-` | `https://api.deepseek.com/v1` | `/api/llm-proxy/deepseek/v1` | ❌ Bị CORS chặn | ✅ Hoạt động 100% |
| **Google Gemini** | `google` | `completions` | `AIza` | `https://generativelanguage.googleapis.com/v1beta/openai` | `/api/llm-proxy/google` | ❌ Bị CORS chặn | ✅ Hoạt động 100% |
| **Groq** | `groq` | `completions` | `gsk_` | `https://api.groq.com/openai/v1` | `/api/llm-proxy/groq/v1` | ❌ Bị CORS chặn | ✅ Hoạt động 100% |
| **OpenRouter** | `openrouter` | `completions` | `sk-or-v1-` | `https://openrouter.ai/api/v1` | `/api/llm-proxy/openrouter/v1` | ✅ Cho phép CORS | ✅ Hoạt động 100% |

---

## 3. Kiến trúc Triển khai & Chi tiết Kỹ thuật

```
+--------------------------------------------------------------------------------+
| Trình duyệt Client (Chili3d Web App)                                           |
|                                                                                |
| 1. Người dùng dán API Key vào chatPanel                                        |
| 2. discovery.ts nhận diện vendor candidate (sk-ant- -> anthropic, ...)        |
| 3. Gọi GET /api/llm-proxy/anthropic/v1/models (Same-Origin, không bị CORS)    |
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
   - Server chỉ log metadata dạng: `[LLM-PROXY] vendor=anthropic path=/v1/models status=200 duration=45ms size=1024B`.
   - Client sanitize toàn bộ chuỗi lỗi, loại bỏ và thay thế API key bằng `[REDACTED]` nếu xuất hiện trong error message.
   - Khóa API trong client chỉ lưu trong bộ nhớ phiên (`sessionApiKey`), không ghi vào LocalStorage hay Document persistent storage.

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày thực hiện:** 02/11/2026
- **Mã Commit:** `e22aabd1` (và commit hoàn thiện tài liệu)
- **Các file đã thêm mới:**
  - `server/llmProxy.mjs`: Module proxy bảo mật upstream LLM providers, xử lý rate limit, body size, unbuffered streaming và header stripping.
  - `server/test/llmProxy.test.mjs`: Bộ kiểm thử tự động 6 bài test cho LLM proxy.
  - `packages/ai/src/llm/providerRegistry.ts`: Danh bạ 6 nhà cung cấp đã kiểm chứng kèm hàm dự đoán tiền tố khóa.
  - `packages/ai/src/llm/discovery.ts`: Module pure-function tự động dò tìm nhà cung cấp và lọc mô hình chat.
  - `packages/ai/test/providerRegistry.test.ts`: Bộ kiểm thử 3 bài test cho provider registry.
  - `packages/ai/test/discovery.test.ts`: Bộ kiểm thử 6 bài test cho discovery & model filtering.
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
- **Kết quả Kiểm thử & Biên dịch:**
  - `npm run check`: Pass 100% (Biome check cleanly).
  - `npm run test`: Pass 100% toàn bộ **9,994 tests** trên 588 file test của rstest + **14 backend tests** của storageServer & llmProxy.
  - `npm run build`: Pass 100% (Rspack production build + plugins build thành công).
