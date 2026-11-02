# TASK-22: Củng cố đa mô hình cho agent trong app (Multi-provider hardening)

> **Trạng thái:** `[ ] TODO`
> **Mức độ ưu tiên:** P1
> **Phụ thuộc:** `TASK-23` (bộ đánh giá là chuẩn đo — làm sau khi có bộ đánh giá)
> **Hướng dẫn chung:** [docs/AGENT-DEVELOPMENT-GUIDE.md](../AGENT-DEVELOPMENT-GUIDE.md)

---

## 1. Mục tiêu

Agent trong app chạy được với nhiều nhà cung cấp mô hình, không bị gắn cứng vào một hãng. Hiện tại đã đúng ở tầng giao thức (ba giao thức, xem §2), nhưng còn năm điểm gắn cứng cần sửa để việc đổi mô hình **an toàn và có thể đo được**.

## 2. Hiện trạng đã kiểm chứng

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Ba giao thức: Anthropic Messages, Chat Completions, Responses | Có | `packages/ai/src/llm/provider.ts`, `anthropic.ts`, `completions.ts`, `responses.ts` |
| Tương thích qua `baseURL` (DeepSeek, Kimi, Mistral, Ollama, vLLM...) | Có, qua Chat Completions | `settings.ts` `PROVIDER_PRESETS`, `chatPanel.ts` (ô "base URL (OpenAI-compatible)") |
| API key chỉ giữ trong phiên | Có | `settings.ts`: `sessionApiKey`, không ghi vào bộ nhớ trình duyệt |
| Test cho từng giao thức | Có, dữ liệu giả lập | `packages/ai/test/anthropicProvider.test.ts`, `openaiCompatProvider.test.ts`, `responsesProvider.test.ts` |
| Test trên API thật của từng hãng | **Không có** | Chưa có kiểm thử nào gọi API thật |
| Nhận diện lỗi vượt ngữ cảnh | **Chỉ hai mẫu** (Anthropic, OpenAI) | `agent.ts` `contextLimitFromError`, và hàm kiểm tra lỗi ngữ cảnh ngay phía trên |
| Khối thinking đặc thù Anthropic | **Gắn cứng**, không gắn nhà cung cấp | `types.ts`: `ThinkingBlock` "Anthropic requires thinking blocks to be passed back"; lịch sử (`history.ts`) không ghi nhà cung cấp |
| Ánh xạ mức suy luận | **Gắn cứng** | `types.ts` `openAIReasoningEffort`: chỉ `low/medium/high`, còn `xhigh/max` là của Anthropic |
| Gửi ảnh chụp khung nhìn | **Không kiểm tra khả năng** của mô hình | Ảnh được gửi cho mọi mô hình |
| Bảng năng lực mô hình | **Không có** | Chỉ có danh sách cửa sổ ngữ cảnh cố định `CONTEXT_WINDOW_OPTIONS` trong `settings.ts` |
| Mô hình mặc định | Gắn cứng theo hãng | `DEFAULT_ANTHROPIC_MODEL = "claude-opus-5"`, `DEFAULT_OPENAI_MODEL = "gpt-5.5"` |

## 3. Phạm vi

### 3.1. Bảng năng lực mô hình (`packages/ai/src/llm/capabilities.ts`, mới)
Mỗi mô hình khai báo:
- `contextWindow` (số token);
- `acceptsImages` (có nhận ảnh không);
- `reasoning`: `none` | `levels` (danh sách mức được hỗ trợ);
- `toolCalling`: `reliable` | `unknown` | `weak` (đánh giá từ bộ đánh giá TASK-23, không từ quảng cáo);
- `source`: `builtin` | `user` (người dùng tự thêm).

Quy tắc: mô hình không có trong bảng thì dùng giá trị **an toàn** (không nhận ảnh, không suy luận, cửa sổ ngữ cảnh nhỏ nhất đã cấu hình) và hiển thị cảnh báo "chưa xác minh năng lực mô hình này".

### 3.2. Phân loại lỗi trung lập (`packages/ai/src/llm/errors.ts`, mới)
- Gom các mẫu lỗi vào một hàm `classifyProviderError(err)` trả về: `contextTooLong` (kèm giới hạn nếu đọc được), `rateLimited`, `authFailed`, `modelNotFound`, `imageUnsupported`, `unknown`.
- Chuyển `contextLimitFromError` và hàm kiểm tra lỗi ngữ cảnh trong `agent.ts` sang module này. Thêm mẫu cho các hãng khác khi có mẫu thật từ TASK-23 (không đoán mẫu).
- Mỗi mẫu có test riêng, ghi rõ nguồn (câu lỗi mẫu của hãng nào, phiên bản nào).

### 3.3. Gắn nhà cung cấp vào lịch sử
- Mỗi khối thinking lưu kèm `provider` và `model` đã tạo ra nó.
- Khi gửi lịch sử sang mô hình khác nhà cung cấp, loại bỏ khối thinking không tương thích; giữ phần văn bản.
- Test: đổi mô hình giữa cuộc trò chuyện không làm lỗi yêu cầu tiếp theo.

### 3.4. Mức suy luận theo năng lực
- Ánh xạ mức người dùng chọn sang mức thật của mô hình qua `capabilities.ts`, không qua `if` theo hãng.
- Nếu mô hình không hỗ trợ suy luận, ẩn lựa chọn đó, không gửi tham số.

### 3.5. Kiểm tra khả năng trước khi gửi
- Nếu mô hình không nhận ảnh, không gửi ảnh chụp; thay bằng mô tả văn bản của `get_document_state`, và ghi chú vào nhật ký.

### 3.6. Kiểm thử hợp đồng với API thật (tùy chọn, không chạy mặc định)
- Bật bằng biến môi trường (ví dụ `AI_LIVE_TESTS=1` và khóa riêng cho từng hãng). Không chạy trong CI mặc định.
- Mỗi giao thức có năm kiểm tra: văn bản đơn giản, gọi công cụ, nhận ảnh, lỗi xác thực, lỗi vượt ngữ cảnh.
- Kết quả ghi vào bảng năng lực (`toolCalling`, `acceptsImages`...).

## 4. Ngoài phạm vi

- Không thêm hãng mới vào `PROVIDER_PRESETS` trước khi có kiểm thử hợp đồng cho hãng đó.
- Không lưu API key vào bộ nhớ bền vững.
- Không thay đổi định dạng tài liệu (`documentVersion`) trong task này.

## 5. Tiêu chí nghiệm thu

- [ ] `capabilities.ts` có bảng cho ít nhất một mô hình của mỗi giao thức, và có giá trị an toàn cho mô hình lạ.
- [ ] `classifyProviderError` có test cho từng loại lỗi, mỗi mẫu ghi nguồn.
- [ ] Đổi mô hình giữa cuộc trò chuyện không gây lỗi yêu cầu tiếp theo (test cụ thể).
- [ ] Mô hình không nhận ảnh không nhận ảnh trong yêu cầu (test cụ thể).
- [ ] Không còn `if` theo tên hãng ngoài `provider.ts` và các file giao thức.
- [ ] Bộ đánh giá TASK-23 chạy được trên ít nhất hai hãng, kết quả ghi lại.
- [ ] `npm run check`, `npm run test`, `npm run build` đều pass.
- [ ] Execution Log ghi rõ mô hình nào đã kiểm chứng trên API thật, mô hình nào chỉ có test giả lập.

## 6. Câu hỏi cần người dùng quyết định

1. Những hãng nào cần hỗ trợ đầu tiên? Mình đề xuất: Anthropic, OpenAI (đã có), và một hãng tương thích OpenAI có giá rẻ để kiểm chứng.
2. Có chấp nhận chạy kiểm thử trên API thật với khóa của bạn không? Chi phí phát sinh do bạn chịu.
