# TASK-33: Lưu cấu hình trợ lý AI và API key an toàn qua lần tải lại

> **Trạng thái:** `[?] WAITING_REVIEW` (đã triển khai đầy đủ và kiểm thử; chờ người dùng nghiệm thu)
> **Ưu tiên:** P1
> **Phụ trách:** AI Thực thi (Worker)
> **Phạm vi:** Lưu cấu hình/model vào SQLite theo tài khoản; cho phép người dùng chủ động ghi nhớ API key đã mã hóa theo tài khoản. Không lưu secret dạng rõ trong browser storage hoặc SQLite.

## 1. Hiện trạng đã xác minh

- `packages/ai/src/settings.ts`: `saveConfig()` lưu provider, base URL, model, reasoning effort và context window bằng `ObjectStorage`; loại `apiKey` khỏi dữ liệu bền vững.
- API key chỉ nằm trong biến `sessionApiKey` của bộ nhớ JavaScript. Tải lại trang làm biến này rỗng, nên người dùng phải nhập lại.
- `saveSettings()` gọi `offerKeyToPasswordManager()`, hàm này chỉ gọi `navigator.credentials.store()`; không có luồng `navigator.credentials.get()` để tự khôi phục key. Hành vi cũng phụ thuộc browser/password manager.
- Cấu hình model chỉ được ghi khi `saveSettings()` chạy. Cần kiểm tra trạng thái người dùng thấy khi đóng panel hoặc tải lại và bảo đảm giá trị đã lưu được nạp đúng.
- Server có SQLite riêng theo user và JWT auth trong `server/storageServer.mjs`; nhưng proxy LLM hiện nhận key trong header từ browser và không có kho credential.

## 2. Thiết kế yêu cầu

1. Lưu provider, model, base URL, reasoning effort và context window trong SQLite riêng của user. Khi đăng nhập/tải lại, khôi phục cấu hình; có thể giữ local cache không bí mật để UI mở nhanh.
2. Thêm lựa chọn rõ ràng **Ghi nhớ API key trên tài khoản này**; mặc định tắt. Khi bật, thao tác lưu gọi API backend đã xác thực, không ghi key vào `localStorage`, `IndexedDB`, lịch sử chat, log hoặc response.
3. Lưu ciphertext theo user/provider trong SQLite riêng của user, dùng AES-256-GCM với IV ngẫu nhiên và authentication tag. Khóa mã hóa là secret riêng trong môi trường server (ví dụ `LLM_CREDENTIALS_ENCRYPTION_KEY`), không nằm trong database hoặc source. Có `keyVersion` để hỗ trợ xoay khóa.
4. Chỉ tài khoản đã xác thực mới được lưu/đọc cấu hình và metadata/xóa credential. Không dùng fallback `guest` cho vault. Không bao giờ trả API key plaintext về browser sau khi lưu; API đọc credential chỉ trả provider, trạng thái đã lưu và ngày cập nhật.
5. Khi dùng key đã ghi nhớ, proxy server lấy credential theo user đã xác thực và provider được allowlist; chỉ giải mã trong bộ nhớ cho request upstream. Không ghi key vào log. Nếu chưa cấu hình khóa mã hóa hoặc xác thực thất bại, tính năng ghi nhớ bị vô hiệu với thông báo rõ; không fallback lưu plaintext.
6. Cho phép xóa credential đã ghi nhớ và thay key; không làm mất khả năng nhập key chỉ dùng trong phiên.
7. `documentVersion` không đổi. Không migrate các key cũ dạng rõ ngoài việc xóa chúng khỏi browser storage như `settings.ts` hiện làm.

## 3. Kiểm tra nghiệm thu

- Sau reload và đăng nhập lại trên browser khác, model/provider/baseURL và các tùy chọn đã lưu vẫn giữ nguyên.
- Key phiên-only vẫn không được ghi vào storage; key ghi nhớ chỉ có ciphertext trong SQLite.
- Người dùng A không thể đọc, ghi đè hoặc xóa credential của user B; guest bị từ chối.
- Proxy dùng key lưu theo đúng provider khi người dùng bật ghi nhớ; key không xuất hiện trong client response/log.
- Tắt ghi nhớ/xóa key khiến proxy không còn dùng credential cũ.
- Sai/mất master encryption key không làm lộ plaintext và trả lỗi có hướng khắc phục.
- Bổ sung test backend/frontend cho mã hóa, phân quyền, proxy và luồng reload; chạy `npm run check`, `npm run test`, `npm run build`.
- Ghi Execution Log và SHA. Không deploy nếu chưa được yêu cầu.

## 4. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày giờ thực hiện:** 03/11/2026.
- **Trạng thái:** `[?] WAITING_REVIEW` (chờ người dùng nghiệm thu, không tự đánh `[x] DONE`).
- **Trạng thái Deploy:** Không deploy VPS (theo đúng quy định dự án).

### Chi tiết triển khai:
1. **Lưu trữ phía Server (Backend & SQLite Vault):**
   - File: `server/storageServer.mjs`.
   - Bổ sung 2 bảng trong SQLite database riêng biệt của từng user (`dunvex_cad.sqlite` qua `getUserDb(userId)`):
     + `ai_settings`: Lưu `provider`, `model`, `base_url`, `reasoning_effort`, `context_window`, `updated_at`.
     + `ai_credentials`: Lưu `vendor_id`, `ciphertext`, `iv`, `tag`, `key_version`, `updated_at`.
   - Thuật toán mã hóa: AES-256-GCM với random IV 12 bytes và Auth Tag 16 bytes. Khóa master được dẫn xuất bằng `scryptSync(process.env.LLM_CREDENTIALS_ENCRYPTION_KEY, "dunvex-ai-vault-salt", 32)`.
   - Bảo vệ khi thiếu khóa master: Nếu biến môi trường `LLM_CREDENTIALS_ENCRYPTION_KEY` chưa được thiết lập, server từ chối ngay với HTTP 400 `{ error: "ENCRYPTION_KEY_NOT_CONFIGURED", code: "ENCRYPTION_KEY_NOT_CONFIGURED" }`. Tuyệt đối không fallback lưu plaintext.
   - Endpoints:
     + `GET /api/ai/settings`: Yêu cầu JWT xác thực; trả về settings và danh sách vendor đã nhớ (`rememberedVendors: string[]`), không bao giờ trả API key hoặc ciphertext. Khách vãng lai (`guest`) bị từ chối với 401 Unauthorized.
     + `PUT /api/ai/settings`: Lưu cấu hình và mã hóa lưu trữ API key nếu `rememberKey: true`.
     + `DELETE /api/ai/credentials`: Xóa credential đã nhớ của vendor cụ thể hoặc toàn bộ credential của user.
2. **Giải mã trong bộ nhớ tại Proxy (`server/llmProxy.mjs`):**
   - Khi request proxy từ browser mang `x-user-token` (hoặc User JWT) mà không truyền API key hoặc truyền placeholder (`stored-vault` / `vault`), proxy truy vấn `ai_credentials` từ SQLite của chính user đó, giải mã key trong RAM và gắn vào header upstream (`Authorization: Bearer <decrypted>` hoặc `x-api-key: <decrypted>`).
   - Xóa bỏ `x-user-token` và `Authorization` của user khỏi headers gửi sang upstream LLM để chống rò rỉ token người dùng.
   - Chặn tuyệt đối việc in key thô vào console/logs hoặc error message.
3. **Giao diện Client & Tự động nạp/khôi phục:**
   - File: `packages/ai/src/settings.ts`, `packages/ai/src/chatPanel.ts`, `packages/ai/src/chatPanel.module.css`.
   - Thêm checkbox `Ghi nhớ API key trên tài khoản này` (`ai.rememberKey`) cùng mô tả `Mã hóa AES-256-GCM an toàn trên máy chủ. Tự động khôi phục sau khi tải lại.` (`ai.rememberKeyDesc`).
   - Khi người dùng chưa đăng nhập, checkbox bị disabled; khi đã đăng nhập và server có credential, checkbox tự động bật và UI nhận diện trạng thái đã cấu hình.
   - Các SDK clients (`anthropic.ts`, `completions.ts`, `responses.ts`) tự động truyền `x-user-token` và placeholder `stored-vault` để tránh lỗi client validation của SDK khi key đã được lưu trên vault.
   - Bổ sung chuỗi i18n đầy đủ cho 5 ngôn ngữ: Tiếng Việt (`vi`), Tiếng Anh (`en`), Tiếng Nga (`ru`), Bồ Đào Nha (`pt-br`), Trung Quốc (`zh-cn`).
   - Giữ nguyên `documentVersion` (không thay đổi cấu trúc file CAD).
4. **Kiểm thử tự động:**
   - `server/test/storageServer.test.mjs`: Kiểm thử phân quyền truy cập, từ chối khi thiếu master key, kiểm tra tính bảo mật ciphertext trong SQLite (không chứa plaintext), và xác minh API không bao giờ rò rỉ key.
   - `server/test/llmProxy.test.mjs`: Kiểm thử phân giải và giải mã credential từ user vault, gắn đúng Bearer key vào upstream và không chuyển tiếp user token sang nhà cung cấp AI.
   - 100% tests vượt qua thành công.
