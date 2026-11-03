# TASK-29: Khắc phục lỗi chat AI với Base URL proxy tương đối

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Ưu tiên:** P0 (AI assistant không gửi/nhận được chat với cấu hình proxy cùng origin)
> **Phụ trách:** AI Thực thi (Worker)
> **Deploy:** Không deploy VPS trong task này.

---

## 1. Hiện tượng đã báo cáo

Người dùng nhập API key, dùng nút “Kiểm tra khóa” và nhận thông báo “Đã kết nối: OpenRouter”. Sau đó gửi tin nhắn trong chat thì app hiện:

`Error: Failed to construct 'URL': Invalid URL`

Cấu hình:
- Provider API: `Responses API` hoặc `Completions API`.
- Base URL: `/api/llm-proxy/openrouter/v1`.
- Model: `anthropic/claude-3.7-sonnet`.

---

## 2. Xác minh và Tái hiện Nguyên nhân Gốc

1. **Discovery thành công vì sao:**
   - Trong `packages/ai/src/llm/discovery.ts`, hàm `discoverProvider` sử dụng trình duyệt `fetch()` với đường dẫn tương đối `/api/llm-proxy/openrouter/v1/models`.
   - Hàm `fetch()` của trình duyệt tự động giải quyết (resolve) đường dẫn tương đối với `window.location.origin` hiện tại, nên việc kiểm tra khóa thành công.
   - Sau khi thành công, `chatPanel.ts` tự động điền `result.vendor.proxyBaseURL` (`/api/llm-proxy/openrouter/v1`) vào ô Base URL.

2. **Lỗi `Invalid URL` khi gửi chat:**
   - Khi người dùng gửi tin nhắn, `CompletionsProvider`, `ResponsesProvider`, và `AnthropicProvider` khởi tạo SDK chính thức của OpenAI / Anthropic với tham số `baseURL: config.baseURL`.
   - Trong môi trường trình duyệt, OpenAI SDK và Anthropic SDK sử dụng `new URL(this.baseURL)` hoặc `new URL(path, this.baseURL)`.
   - Thử nghiệm trên Node/Browser:
     `new URL("/api/llm-proxy/openrouter/v1")`
     Lập tức ném ngoại lệ:
     `TypeError: Failed to construct 'URL': Invalid URL` (Browser) hoặc `TypeError: Invalid URL` (Node).
   - Đây chính là nguyên nhân gây ra lỗi `Failed to construct 'URL': Invalid URL` mà người dùng gặp phải!

---

## 3. Giải pháp Khắc phục

1. **Tạo mô-đun chuẩn hóa URL [`packages/ai/src/llm/urlUtils.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/llm/urlUtils.ts):**
   - Hàm `resolveBaseURL(baseURL?, defaultURL?, baseOrigin?)`:
     - Nếu URL đã là tuyệt đối (`http://` hoặc `https://`), loại bỏ dấu gạch chéo cuối (`/`) và giữ nguyên.
     - Nếu URL là đường dẫn tương đối cùng origin (ví dụ `/api/llm-proxy/openrouter/v1`), giải quyết nó dựa trên `window.location.origin` (hoặc `globalThis.location.origin`), chuyển thành `http://localhost:8080/api/llm-proxy/openrouter/v1` hoặc `http://136.66.95.155/api/llm-proxy/openrouter/v1`.
     - **Không hard-code hostname production** (hoạt động tự động cả ở localhost, preview, lẫn production).
     - Loại bỏ các dấu `/` thừa ở cuối để khi OpenAI SDK ghép thêm `/chat/completions` hay `/responses`, đường dẫn được tạo đúng chuẩn, **không bị double slash**.
     - Giữ request đi qua proxy cùng origin, không phụ thuộc CORS bên thứ ba.
   - Hàm `sanitizeErrorMessage(msg, keyToRedact)`:
     - Tẩy rửa API key người dùng và các mẫu token phổ biến (`sk-ant-`, `sk-proj-`, `sk-`, `gsk_`, `AIza`) khỏi thông báo lỗi trước khi hiển thị ra giao diện chat.

2. **Cập nhật các Provider:**
   - [`packages/ai/src/llm/completions.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/llm/completions.ts): Khởi tạo `OpenAI` client với `baseURL: resolveBaseURL(config.baseURL, "https://api.openai.com/v1")`.
   - [`packages/ai/src/llm/responses.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/llm/responses.ts): Khởi tạo `OpenAI` client với `baseURL: resolveBaseURL(config.baseURL, "https://api.openai.com/v1")`.
   - [`packages/ai/src/llm/anthropic.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/llm/anthropic.ts): Khởi tạo `Anthropic` client với `baseURL: resolveBaseURL(config.baseURL, "https://api.anthropic.com")`.
   - [`packages/ai/src/chatPanel.ts`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ai/src/chatPanel.ts): Trong `handleSendError`, khử API key bằng `sanitizeErrorMessage`.

---

## 4. Kiểm thử và Xác nhận

1. **Unit Tests cho URL & Error Sanitization (`packages/ai/test/urlUtils.test.ts`):**
   - 12 ca kiểm thử mới:
     - Giữ nguyên URL tuyệt đối HTTPS/HTTP bên ngoài.
     - Chuẩn hóa đường dẫn tương đối với `window.location.origin`.
     - Loại bỏ trailing slash và chống double slash.
     - Fallback an toàn khi `baseURL` trống hoặc `undefined`.
     - Khử API key và các định dạng key đặc thù khỏi thông báo lỗi.
     - Khởi tạo `CompletionsProvider`, `ResponsesProvider`, `AnthropicProvider` với relative proxy URL **không còn ném lỗi Invalid URL**.
   - Kết quả: **12/12 tests PASS**.

2. **Integration Test Upstream cho Proxy Chat (`server/test/llmProxy.test.mjs`):**
   - Bổ sung ca kiểm thử `routes openrouter chat completions /api/llm-proxy/openrouter/v1/chat/completions to upstream correctly`:
     - Gửi request chat stream tới proxy server cục bộ.
     - Xác nhận proxy chuyển đúng path `/v1/chat/completions` tới upstream mock server.
     - Xác nhận proxy nhận stream phản hồi và trả về mã 200.
   - Kết quả: **10/10 tests PASS**.

3. **Toàn bộ test suite AI (`packages/ai/test/`):**
   - **36 test files, 555 tests PASS 100%**.

---

## 5. Nhật ký Thực thi

- **Thời gian:** 03/11/2026
- **Nhánh:** `dev`
- **Các file thay đổi:**
  - `packages/ai/src/llm/urlUtils.ts`: Tạo mới helper `resolveBaseURL` và `sanitizeErrorMessage`.
  - `packages/ai/src/llm/completions.ts`: Tích hợp `resolveBaseURL`.
  - `packages/ai/src/llm/responses.ts`: Tích hợp `resolveBaseURL`.
  - `packages/ai/src/llm/anthropic.ts`: Tích hợp `resolveBaseURL`.
  - `packages/ai/src/chatPanel.ts`: Tẩy rửa API key trong `handleSendError`.
  - `packages/ai/test/urlUtils.test.ts`: 12 unit tests cho URL và Provider.
  - `server/test/llmProxy.test.mjs`: Thêm test tích hợp route chat openrouter qua proxy.
  - `ROADMAP.md` & `docs/tasks/TASK-29-ai-chat-relative-proxy-url.md`: Cập nhật trạng thái và hồ sơ.
- **Build & Tests:**
  - `npm run check`: Biome check sạch, không lỗi cú pháp.
  - `npm run test`: Toàn bộ 10,024 tests trong repo PASS.
- **Deploy:** KHÔNG deploy VPS.
