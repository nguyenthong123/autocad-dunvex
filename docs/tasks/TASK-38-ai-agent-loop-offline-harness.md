# TASK-38: Kiểm thử Offline Agent Loop & Cổng Hậu kiểm (Harness & Scripted Provider)

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Người thực hiện:** AI Thợ (Executor)
> **Phạm vi mã nguồn:**
> - `packages/ai/test/_helpers/scriptedProvider.ts`: Triển khai `ScriptedProvider` hiện thực hóa `LLMProvider` với kịch bản trả về xác định.
> - `packages/ai/test/agentLoopOfflineHarness.test.ts`: 4 kịch bản kiểm thử tích hợp vòng lặp agent và cổng hậu kiểm.
> **Bằng chứng thực thi:** `docs/tasks/TASK-38-evidence/agent-loop-offline-harness.log`.

---

## 1. Mục tiêu & Bối cảnh Kỹ thuật
Khi không có API key trực tiếp từ các nhà cung cấp mô hình ngôn ngữ (`OpenAI`, `Anthropic`, `Gemini`), việc kiểm thử tính toàn vẹn của luồng lặp `runAgent` (Agent Loop), cơ chế ép buộc kiểm chứng (`Verification Gate`), và số lần nhắc nhở (`verifyNudges`) cần một môi trường kiểm thử độc lập, có thể tái lặp 100% và chạy tự động không cần kết nối mạng.

TASK-38 cung cấp một `ScriptedProvider` tuân thủ đầy đủ giao diện `LLMProvider`, cho phép lập trình từng lượt phản hồi của mô hình (lời thoại, tool calls, kết thúc lượt) và kiểm chứng hành vi của hệ thống AI khi thao tác với các tool thật trên tài liệu CAD thật.

---

## 2. Kiến trúc Test Harness (`ScriptedProvider`)

### 2.1. Thành phần `ScriptedProvider` (`packages/ai/test/_helpers/scriptedProvider.ts`)
- Triển khai interface `LLMProvider` từ `packages/ai/src/llm/types.ts`.
- Cho phép nạp trước một hàng đợi các bước phản hồi (`ScriptedStep`):
  + Gọi tool (`toolCalls: [{ id, name, arguments }]`).
  + Trả lời văn bản (`text: string`).
  + Gắn cờ kết thúc lượt (`finishReason: "tool_use" | "end_turn"`).
- Ghi nhận lịch sử toàn bộ các tin nhắn `LLMMessage` mà Agent đã gửi đến mô hình (`sentMessages`), cho phép assert nội dung tin nhắn nhắc nhở (synthetic nudge messages).

### 2.2. Điểm nối vào `runAgent`
Hàm `runAgent(opts)` trong `packages/ai/src/llm/agent.ts` hỗ trợ nhận provider trực tiếp qua `opts.provider ?? createProvider(opts.config)`. Việc truyền trực tiếp `ScriptedProvider` qua `opts.provider` giúp bỏ qua hoàn toàn bước kiểm tra API key và kết nối HTTP, chạy thuần túy trong bộ nhớ với tốc độ micro-giây.

---

## 3. 8 Kịch bản Kiểm thử Tích hợp (4 Cơ bản + 4 Hồi quy Đối tượng & Bằng chứng Thực)

| Kịch bản | Mô tả Luồng Thực thi | Kết quả Kiểm chứng | Đánh giá |
|:---|:---|:---|:---:|
| **Kịch bản 1: Cưỡng chế Hậu kiểm (Unverified Write)** | 1. Model gọi `run_program` tạo khối hộp `Box 100x50x20`.<br>2. Model cố tình kết thúc lượt (`finishReason: "end_turn"`).<br>3. Agent phát hiện `needsVerification = true`, chặn dừng và gửi nudge lần 1.<br>4. Model tiếp tục cố tình dừng.<br>5. Agent gửi nudge lần 2 (đạt ngưỡng `MAX_VERIFY_NUDGES = 2`).<br>6. Agent cho phép kết thúc nhưng đánh dấu trạng thái chưa kiểm chứng. | - Bị nhắc nhở chính xác 2 lần.<br>- `lastVerification.verified === false`.<br>- `lastVerification.summary === "UNVERIFIED"`. | **PASSED** |
| **Kịch bản 2: Hậu kiểm Thành công (Verified Write)** | 1. Model gọi `run_program` tạo khối hộp.<br>2. Ở lượt tiếp theo, Model gọi `measure_nodes` đo kích thước chi tiết.<br>3. Agent ghi nhận tool thuộc `VERIFY_TOOLS`, xóa cờ `needsVerification`.<br>4. Model kết thúc lượt bình thường. | - Số lần nhắc nhở = 0.<br>- `lastVerification.verified === true`.<br>- `lastVerification.toolName === "measure_nodes"`. | **PASSED** |
| **Kịch bản 3: Tool Không Đủ Điều kiện (Excluded Tool)** | 1. Model gọi `run_program` tạo khối hộp.<br>2. Model gọi `get_document_state` (đọc trạng thái cây thư mục, không đo đạc hình học).<br>3. Cờ `needsVerification` KHÔNG được xóa.<br>4. Model cố tình dừng -> Agent vẫn chèn nudge nhắc nhở. | - Khẳng định `get_document_state` không thể giải phóng cờ kiểm chứng.<br>- Model vẫn bị nhắc nhở đúng quy tắc. | **PASSED** |
| **Kịch bản 4: Lệnh Ghi Thất bại (Write Error)** | 1. Model gọi `run_program` với câu lệnh lỗi cú pháp hoặc vi phạm ràng buộc.<br>2. Tool trả về lỗi (`error !== undefined`).<br>3. Không có đối tượng hình học nào được tạo thành công. | - Cờ `needsVerification` giữ nguyên `false`.<br>- Không kích hoạt bộ đếm nudge.<br>- Model kết thúc mà không bị chèn tin nhắn giả lập. | **PASSED** |
| **Regression Case 1: Tạo A rồi đo B (Khác đối tượng)** | 1. Model gọi `run_program` tạo khối `Box A`.<br>2. Ở lượt tiếp theo, Model gọi `measure_nodes` đo `Box B` (đối tượng khác, không phải đối tượng vừa tạo).<br>3. Cổng hậu kiểm kiểm tra tập targets đang chờ: `pendingVerificationTargets` vẫn còn `Box A`.<br>4. Model cố tình kết thúc lượt -> Agent vẫn chèn 2 tin nhắn nudge và phiên kết thúc ở trạng thái `UNVERIFIED`. | - Phép đo trên đối tượng khác không thể giải phóng cờ kiểm chứng.<br>- Model bị nhắc nhở 2 lần.<br>- `lastVerification.verified === false`. | **PASSED** |
| **Regression Case 2: Tạo A rồi đo A (Đúng đối tượng)** | 1. Model gọi `run_program` tạo khối `Box A`.<br>2. Ở lượt tiếp theo, Model gọi `measure_nodes` đo chính xác `Box A` với kết quả đo hợp lệ.<br>3. Cổng hậu kiểm đối chiếu target: `Box A` đã được đo hợp lệ -> xóa sạch `pendingVerificationTargets`.<br>4. Cờ `needsVerification` được hạ xuống `false`.<br>5. Model kết thúc lượt bình thường mà không bị nhắc nhở. | - Số lần nhắc nhở = 0.<br>- `lastVerification.verified === true`.<br>- `lastVerification.toolName === "measure_nodes"`. | **PASSED** |
| **Regression Case 3: Yêu cầu BOM cho A và B nhưng kết quả chỉ có B** | 1. Model gọi `run_program` tạo `nodeA` và `nodeB`.<br>2. Model gọi `bom_report({ nodeIds: ["nodeA", "nodeB"] })`.<br>3. Kết quả trả về của tool BOM chỉ chứa bằng chứng cho `nodeB` (`nodeA` bị thiếu hoặc loại khỏi bảng).<br>4. Cổng hậu kiểm chỉ xác nhận `nodeB`, giữ lại `nodeA` trong `pendingVerificationTargets`.<br>5. Model cố tình kết thúc -> Agent chèn đủ 2 nudge và phiên kết thúc chưa kiểm chứng. | - `nodeA` phải tiếp tục chờ hậu kiểm.<br>- Bị nhắc nhở 2 lần.<br>- `lastVerification.verified === false`. | **PASSED** |
| **Regression Case 4: Mục tiêu ghi chưa xác định rồi kiểm tra đối tượng bất kỳ** | 1. Model thực thi lệnh ghi thuộc `WRITE_TOOLS` nhưng không xác định được target cụ thể -> `pendingVerificationTargets` ghi nhận mục tiêu chưa xác định (`*`).<br>2. Model gọi `measure_nodes` đo một đối tượng bất kỳ có sẵn trong bản vẽ.<br>3. Cổng hậu kiểm từ chối đối soát đối tượng bất kỳ cho mục tiêu chưa xác định (`matchesTarget` trả về `false`).<br>4. Trạng thái giữ nguyên chưa kiểm chứng -> Agent gửi 2 nudge và kết thúc unverified. | - Đo đối tượng bất kỳ không thể xác nhận thao tác ghi chưa xác định.<br>- Bị nhắc nhở 2 lần.<br>- `lastVerification.verified === false`. | **PASSED** |

---

## 4. Giới hạn Kỹ thuật & Báo cáo Môi trường Thật (Limitations)

### 4.1. Khả năng Kiểm thử trên Giao diện `ChatPanel` Thật
- **Hiện trạng:** Trong mã nguồn `packages/ai/src/chatPanel.ts`, phương thức `runTurn` khởi tạo cấu hình `config` trực tiếp từ các trường nhập liệu trên giao diện (`buildSettingsForm`) và gọi thẳng `runAgent`.
- **Giới hạn:** `ChatPanel` hiện tại **chưa có cơ chế Dependency Injection (DI) hoặc cổng cấu hình runtime** để tiếp nhận một `LLMProvider` tùy biến từ JavaScript bên ngoài mà không sửa mã nguồn của component này.
- **Phạm vi kiểm thử thực tế:**
  - Logic nghiệp vụ của Agent loop và 8 ca kiểm thử Verification Gate được kiểm chứng 100% tự động qua file test harness độc lập `agentLoopOfflineHarness.test.ts`.
  - Trên app thật, trạng thái của session memory từ kết quả agent được cập nhật qua API `getSessionMemoryApi()`, và script kiểm thử thực tế `verifyTask37Round3.mjs` kiểm tra trực tiếp nội dung văn bản DOM của thanh trạng thái (`memoryStatusBar`) trước khi tiến hành chụp từng ảnh CDP.

### 4.2. Khóa LLM Môi trường Thực tế
- **Trạng thái:** `CHƯA KIỂM — thiếu khóa LLM`.
- Hệ thống sẵn sàng hoạt động với các endpoint thực tế ngay khi người dùng cấu hình API key hợp lệ trong cài đặt hoặc biến môi trường.

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

### 5.1. Bằng chứng Thực thi
- **Lệnh thực thi:** `npx rstest packages/ai/test/agentLoopOfflineHarness.test.ts`
- **File nhật ký gốc:** `docs/tasks/TASK-38-evidence/agent-loop-offline-harness.log`
- **Thời gian chạy:** `2026-11-04T07:44:29Z`
- **Commit SHA đối chiếu:** `41999efd9be933c37420842468cf6ba83e66f180`
- **Mã thoát (Exit Code):** `EXIT=0` (8/8 tests passed: 4 kịch bản cơ bản + 4 kịch bản hồi quy đối tượng)

### 5.2. Danh mục Bằng chứng Lưu trữ
- `packages/ai/test/_helpers/scriptedProvider.ts`: Module trợ giúp giả lập LLM có kịch bản.
- `packages/ai/test/agentLoopOfflineHarness.test.ts`: Bộ kiểm thử 8 kịch bản Verification Gate (kèm 4 kịch bản hồi quy).
- `docs/tasks/TASK-38-evidence/agent-loop-offline-harness.log`: Nhật ký chạy test harness với mã thoát `EXIT=0`.

### 5.3. Trạng thái Triển khai
- **CHƯA DEPLOY** (Tuân thủ nghiêm ngặt quy tắc không tự ý deploy VPS và không git push).
