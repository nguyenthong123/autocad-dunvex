# TASK-36: Cổng Hậu kiểm Bắt buộc (`Verification Gate`), Bộ Tool `bom_report` / `classify_material` / `run_command` (có Precheck) & Thanh Trạng thái Bộ nhớ / Lỗi trên `ChatPanel`

> **Trạng thái:** `[?] WAITING_REVIEW` (Đã hoàn tất toàn bộ 4 hạng mục, bổ sung evidence logs EXIT=0, chờ Reviewer nghiệm thu)
> **Ưu tiên:** P0 — Nâng cấp năng lực thực thi & kiểm chứng thực tế cho AI
> **Phạm vi:** `packages/ai/`, `packages/ui/`
> **Phụ thuộc:** `TASK-17`, `TASK-21`, `TASK-23`, `TASK-34`, `TASK-35`

---

## 1. Bối cảnh & Vấn đề cần giải quyết

Sau khi hoàn thành `TASK-35`, AI đã có Sổ tay tiếng Việt, `command-guide` (45+ thẻ lệnh), `runtimeErrorReporter` và `sessionMemory`. Tuy nhiên, để AI thực sự vận hành thông minh, không làm ẩu và phối hợp mượt với người dùng trên bản vẽ thực tế, còn 4 mảnh ghép kỹ thuật cần đóng chốt:

1. **Chưa có Cổng Hậu kiểm Bắt buộc bằng Code (`Verification Gate` trong `agent.ts`):**
   - Hiện tại quy tắc "kiểm chứng sau khi ghi" mới chỉ nằm trong lời dặn của `prompt.ts`. Nếu mô hình LLM gọi `run_program`, `run_parametric`, `apply_array`, `delete_node`, `transform_node` hoặc `set_node_properties` rồi trả lời ngay *"Tôi đã vẽ xong"* mà không gọi công cụ đo/kiểm chứng (`measure_nodes`, `get_document_state`, `get_node_properties`), vòng lặp `runAgent` trong `packages/ai/src/llm/agent.ts` vẫn cho phép kết thúc lượt!
   - Cần chặn bằng code trong `agent.ts`: theo dõi các lượt gọi tool ghi (`WRITE_TOOLS`); nếu trong lượt chạy đã có lệnh ghi thành công mà sau lệnh ghi cuối cùng chưa có lệnh kiểm chứng (`VERIFY_TOOLS`), tự động gửi synthetic nudge bắt buộc AI phải đo/kiểm chứng kết quả thật và cập nhật `sessionMemory` trước khi kết thúc (tối đa 2 lần nhắc để không lặp vô hạn).
2. **AI chưa có Tool tính BOM (`bom_report`) và Phân loại Vật liệu (`classify_material`):**
   - Người dùng có thể gõ `BOM` / `TK` trên thanh lệnh, nhưng khi chat với AI (*"Tính bảng thống kê vật tư BOM cho bức tường này"*, *"Chi tiết này là tấm, thanh hay khối?"*), AI chưa có tool native để lấy bảng thống kê quy cách $Dài \times Rộng \times Dày$, số lượng, mét dài, $\text{m}^2$ và phân loại hình dáng vật tư (`sheet` / `bar` / `block`).
3. **AI chưa có Tool `run_command` an toàn kèm Precheck từ `command-guide`:**
   - Nhiều lệnh hệ thống/quản lý cây/hiển thị không cần chờ người dùng rê chuột chọn điểm trên viewport (ví dụ: `modify.autoOrganizeTree`, `modify.hideSelected`, `modify.showAll`, `modify.isolateSelected`, `create.folder`, `measure.bom`, `app.manual`, `edit.undo`, `edit.redo`, `doc.save`, `workingPlane.toggleDynamic`).
   - Ngược lại, nếu AI cố gọi một lệnh tương tác đòi hỏi người dùng click chọn điểm trên màn hình (như `create.line`, `create.box`, `modify.trim`), tool `run_command` phải **tự động tra cứu `findCommandGuide(command)`**, từ chối làm treo phiên, trả về ngay thông tin `requiredPreconditions`, `geometryConstraints`, `userStepByStepGuide` và hướng dẫn AI dùng `run_program` / `run_parametric` hoặc chỉ dẫn từng bước cho người dùng!
4. **Người dùng chưa nhìn thấy Bộ nhớ Ngắn hạn (`SessionMemory`) & Nút mở nhanh Báo cáo Lỗi ngay trên `ChatPanel`:**
   - Trong `packages/ai/src/chatPanel.ts`, cần có một thanh trạng thái thu gọn (collapsible bar) hiển thị: Mục tiêu hiện tại (`goal`), tiến độ bước (`completedSteps.length / currentPlan.length`), số node đang theo dõi, và nút cảnh báo số lỗi runtime (`⚠️ X lỗi`) để bấm vào mở ngay tab **"Báo cáo lỗi AI"** trong `ManualReader`!

---

## 2. Yêu cầu kỹ thuật chi tiết

### 2.1. Cổng Hậu kiểm Bắt buộc sau khi Ghi (`packages/ai/src/llm/agent.ts` & `packages/ai/src/memory/sessionMemory.ts`)

1. Trong `packages/ai/src/memory/types.ts` và `sessionMemory.ts`:
   - Bổ sung trường `lastVerification?: { timestamp: number; toolName: string; summary: string; verified: boolean }` vào `SessionMemory`.
   - Thêm hàm `onVerificationCompleted(toolName: string, summary: string): void` và hiển thị `- Last verification: ...` trong `formatSessionMemorySummary()`.
2. Trong `packages/ai/src/llm/agent.ts`:
   - Định nghĩa tập `WRITE_TOOLS = new Set(["run_program", "run_parametric", "apply_array", "delete_node", "transform_node", "set_node_properties"])` (lưu ý: `run_program` chỉ tính là write nếu trong `ops` có op không phải là query `shape.*`/`edge.*`/`face.*`/`curve.*`/`surface.*` hoặc kết quả có `created.length > 0 || removed.length > 0`).
   - Định nghĩa tập `VERIFY_TOOLS = new Set(["measure_nodes", "get_document_state", "get_node_properties", "bom_report", "capture_screenshot", "capture_views"])` (hoặc `run_program` chỉ chứa các query ops kiểm tra `shape.boundingBox`, `shape.volume`, `shape.findSubShapes`).
   - Trong vòng lặp `runAgent`: theo dõi cờ `needsVerification: boolean` và bộ đếm `state.verifyNudges` (tối đa `MAX_VERIFY_NUDGES = 2`).
   - Khi một `WRITE_TOOLS` thực thi thành công (không có `error`): bật `needsVerification = true`.
   - Khi một `VERIFY_TOOLS` thực thi thành công sau đó: đặt `needsVerification = false` và gọi `onVerificationCompleted(...)`.
   - Khi `turn.toolCalls.length === 0` (mô hình định kết thúc lượt trả lời) mà `needsVerification === true` và `state.verifyNudges < MAX_VERIFY_NUDGES`:
     + Tăng `state.verifyNudges++`, đặt `needsVerification = false` (để nếu lần nhắc tiếp theo không gọi thêm write tool thì không kẹt vòng lặp), và đẩy một message synthetic:
       `"You modified geometry in this turn but have not verified the result yet. Call measure_nodes (or a geometry query / get_document_state) to verify the actual dimensions, count, and placement before reporting completion to the user."`

### 2.2. Bổ sung Tool `bom_report` và `classify_material` (`packages/ai/src/tools/bomTools.ts`)

Tạo file `packages/ai/src/tools/bomTools.ts` và đăng ký vào cuối `buildTools()` trong `packages/ai/src/tools/index.ts`:

1. **`classify_material`:**
   - Nhận `nodeIds?: string[]` (nếu bỏ trống thì lấy toàn bộ các node hình học nhìn thấy trong bản vẽ).
   - Đo kích thước 3 chiều từ bounding box (đã nhân `worldTransform`), sắp xếp giảm dần $L \ge W \ge T$ ($\text{mm}$).
   - Phân loại hình dáng vật tư (`form`) theo tỷ lệ kích thước chuẩn:
     + `"sheet"` (Tấm / Ván / Mặt đá): khi $T > 0$, $T / L \le 0.12$ và $W / T \ge 3$.
     + `"bar"` (Thanh / Lam / Cột / Đố): khi $L / W \ge 3$ và $W / T < 3$.
     + `"block"` (Khối / Viên / Cục): khi cả 3 chiều gần tương đương ($L / W < 3$ và không phải tấm mỏng).
     + `"flat-2d"` hoặc `"wire-1d"`: khi $T \le 0.05\text{ mm}$.
   - Trả về danh sách từng node kèm `{ nodeId, name, materialName, materialColor, dimensions: { lengthMm: L, widthMm: W, thicknessMm: T }, form, ratios, evidence }`.
2. **`bom_report`:**
   - Nhận `nodeIds?: string[]` (hỗ trợ đệ quy lấy các node con nếu `nodeId` là `FolderNode`, bỏ qua `Annotation` và `rootNode`, đồng nhất 100% với logic `computeBomReport`).
   - Gom nhóm theo `[materialName + materialColor + quy cách L × W × T mm]`, tính tổng `count`, `totalLengthM` ($\text{m}$), `totalAreaM2` ($\text{m}^2$), `form` (`sheet` / `bar` / `block`), và trả về cả bảng tổng hợp JSON lẫn chuỗi bảng Markdown để AI trình bày ngay cho người dùng.

### 2.3. Bổ sung Tool `run_command` An toàn có Precheck (`packages/ai/src/tools/commandTools.ts`)

Tạo file `packages/ai/src/tools/commandTools.ts` và đăng ký vào cuối `buildTools()` trong `packages/ai/src/tools/index.ts`:

1. Hỗ trợ nhập `command: string` (có thể là `CommandKeys` như `"measure.bom"`, `"modify.autoOrganizeTree"` hoặc alias AutoCAD như `"BOM"`, `"TK"`, `"G"`, `"HIDE"`, `"SHOWALL"`, `"ISOLATE"`, `"U"`, `"REDO"` — tự động phân giải qua `AutoCADCommandAliases`).
2. **Danh sách lệnh cho phép chạy trực tiếp (`SAFE_DIRECT_COMMANDS`):**
   - `"create.folder"`, `"modify.hideSelected"`, `"modify.showAll"`, `"modify.isolateSelected"`, `"modify.autoOrganizeTree"`, `"modify.deleteNode"`, `"measure.bom"`, `"app.manual"`, `"edit.undo"`, `"edit.redo"`, `"doc.save"`, `"workingPlane.toggleDynamic"`.
   - Kiểm tra điều kiện tiên quyết trước khi chạy (ví dụ: `"modify.hideSelected"`, `"modify.isolateSelected"`, `"modify.deleteNode"` yêu cầu phải đang có ít nhất 1 đối tượng được chọn trong `document.selection`; nếu chưa chọn đối tượng nào, trả về lỗi precheck rõ ràng kèm hướng dẫn từ `findCommandGuide`).
   - Khi đủ điều kiện: thực thi lệnh qua `CommandStore.getCommand(resolvedKey)` hoặc `PubSub.default.pub("executeCommand", resolvedKey)` và trả về `{ executed: true, commandKey: resolvedKey }`.
3. **Chặn an toàn các lệnh tương tác cần người dùng chọn điểm/hộp thoại:**
   - Nếu `resolvedKey` là lệnh vẽ/chỉnh sửa tương tác (như `create.line`, `create.box`, `create.extrude`, `modify.move`, `modify.fillet`, `boolean.cut`...):
   - **Không gọi `executeCommand`** (để tránh treo trạng thái chờ click chuột trên viewport).
   - Tự động tra cứu `const guide = findCommandGuide(resolvedKey)` và trả về JSON có cấu trúc:
     ```json
     {
       "executed": false,
       "interactiveCommandBlocked": true,
       "commandKey": "create.extrude",
       "reason": "Command 'create.extrude' requires interactive viewport picking. Use 'run_program' / 'run_parametric' to execute geometry changes programmatically, or teach the user with 'guide'.",
       "guide": {
         "purpose": "...",
         "requiredPreconditions": ["..."],
         "geometryConstraints": ["..."],
         "userStepByStepGuide": ["..."]
       }
     }
     ```

### 2.4. Thanh Trạng thái Bộ nhớ Ngắn hạn & Nút mở Báo cáo Lỗi trên `ChatPanel` (`packages/ai/src/chatPanel.ts`)

1. Trong `packages/ai/src/chatPanel.ts` (và `chatPanel.module.css`):
   - Thêm một thanh trạng thái nhỏ gọn (`memoryStatusBar`) nằm ngay phía trên ô nhập chat (hoặc dưới header của `ChatPanel`):
     + Hiển thị tóm tắt ngắn từ `getSessionMemory()`: nếu có `goal` hoặc `activeNodes` hoặc `removedNodeIds`, hiển thị trạng thái (ví dụ: `🧠 Đang nhớ: <goal> | Node: <activeNodes.length> | Đã xóa: <removedNodeIds.length>`).
     + Hiển thị nút nhỏ **`⚠️ Lỗi AI (<count>)`** (lấy số lượng từ `listRuntimeErrorReports().length`): khi bấm vào sẽ phát sự kiện `PubSub.default.pub("showManual")` (hoặc mở `ManualReader` chuyển thẳng sang tab **Báo cáo lỗi AI**).
   - Cập nhật lại `memoryStatusBar` sau mỗi lượt chạy agent hoàn tất hoặc khi đổi cuộc hội thoại.
2. Sửa luôn 2 cảnh báo Biome `useLiteralKeys` tại `packages/ai/src/diagnostics/runtimeErrorReporter.ts` (dòng 236 và 239: đổi `["__chiliReported"]` thành `.__chiliReported` hoặc dùng `Reflect.get` / `Reflect.set`).

---

## 3. Kiểm thử & Nghiệm thu

1. **Unit Tests bắt buộc:**
   - `packages/ai/test/bomTools.test.ts`: kiểm tra `classify_material` (phân loại đúng `sheet`, `bar`, `block`) và `bom_report` (tính đúng quy cách $L \times W \times T$, số lượng, mét dài, $\text{m}^2$, đệ quy qua `FolderNode`).
   - `packages/ai/test/commandTools.test.ts`: kiểm tra `run_command` phân giải alias AutoCAD (`BOM`, `HIDE`, `SHOWALL`), chặn khi thiếu selection cho `modify.hideSelected`, và trả về `interactiveCommandBlocked: true` kèm `guide` từ `commandGuide` khi gọi lệnh tương tác như `create.extrude` hay `L`.
   - Cập nhật `packages/ai/test/agent.test.ts`: kiểm tra `Verification Gate` — khi mô hình gọi write tool (`delete_node` hoặc `run_program` tạo node) rồi kết thúc ngay mà chưa gọi verify tool, `runAgent` tự động gửi nudge nhắc kiểm chứng và dừng nhắc sau khi mô hình gọi `measure_nodes` / `get_document_state` (hoặc đạt `MAX_VERIFY_NUDGES`).
   - Cập nhật `packages/ai/test/chatPanel.test.ts`: kiểm tra thanh trạng thái bộ nhớ / nút báo lỗi hiển thị trên `ChatPanel`.
2. **Lệnh kiểm tra bắt buộc:**
   - `npm run check`
   - `npm run test`
   - `npm run build`
   - `git diff --check`

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày thực hiện:** 2026-11-04
- **Trạng thái:** `[?] WAITING_REVIEW`
- **Mã Commit SHA:** `511de32046c7c61d4d19a664e1cbfe108415a400`
- **Trạng thái Deploy:** `CHƯA DEPLOY` (Tuân thủ quy tắc: Không tự ý deploy lên VPS khi chưa có lệnh của Reviewer/Chủ dự án)
- **CHƯA KIỂM:**
  - Chưa kiểm tra trên môi trường VPS production.

### 5.1. Khắc phục cảnh báo Biome Linter
- Đã khắc phục 2 cảnh báo `lint/complexity/useLiteralKeys` tại `packages/ai/src/diagnostics/runtimeErrorReporter.ts` bằng `Reflect.get(opts.error, "__chiliReported")` và `Reflect.set(opts.error, "__chiliReported", true)`.

### 5.2. Hạng mục 1: Cổng Hậu kiểm Bắt buộc (`Verification Gate`)
- **`packages/ai/src/memory/types.ts` & `sessionMemory.ts`:**
  - Bổ sung `SessionVerificationInfo` và trường `lastVerification?: SessionVerificationInfo` vào `SessionMemory`.
  - Cung cấp hàm `onVerificationCompleted(toolName: string, summary: string): void` và hiển thị `- Last verification: ...` trong `formatSessionMemorySummary()`.
- **`packages/ai/src/llm/agent.ts`:**
  - Định nghĩa tập `WRITE_TOOLS` (`run_program`, `run_parametric`, `apply_array`, `delete_node`, `transform_node`, `set_node_properties`).
  - Định nghĩa tập `VERIFY_TOOLS` (`measure_nodes`, `get_document_state`, `get_node_properties`, `bom_report`, `classify_material`, `capture_screenshot`, `capture_views`).
  - Quản lý cờ `needsVerification` và `state.verifyNudges` (giới hạn `MAX_VERIFY_NUDGES = 2`).
  - Khi lệnh ghi hình học thành công: bật `needsVerification = true`.
  - Khi lệnh kiểm chứng thành công: đặt `needsVerification = false` và gọi `onVerificationCompleted(toolName, ...)`.
  - Khi mô hình chuẩn bị kết thúc lượt mà `needsVerification === true`: tự động chèn tin nhắn synthetic nhắc mô hình phải đo/kiểm chứng kết quả bằng `measure_nodes` hoặc công cụ tương đương trước khi báo hoàn thành cho người dùng.

### 5.3. Hạng mục 2: Bộ Tool `bom_report` & `classify_material`
- **`packages/ai/src/tools/bomTools.ts`:**
  - Hàm `classifyForm(dims)`: phân loại chính xác theo tỷ lệ hình học $L \ge W \ge T$:
    + `sheet`: $T/L \le 0.12$ và $W/T \ge 3$.
    + `bar`: $L/W \ge 3$ và $W/T < 3$.
    + `block`: các tỷ lệ còn lại.
    + `flat-2d` / `wire-1d`: cho các hình dạng 2D/1D mỏng dưới ngưỡng dung sai.
  - Tool `classify_material`: duyệt đệ quy cây đối tượng qua `FolderNode`, đo kích thước theo bounding box nhân ma trận `worldTransform`, gắn tên và màu vật liệu.
  - Tool `bom_report`: gom nhóm theo vật liệu và quy cách, tính tổng số lượng, mét dài, mét vuông và xuất bảng Markdown trực quan.
  - Đăng ký `...buildBomTools()` vào cuối `buildTools()` trong `packages/ai/src/tools/index.ts`.

### 5.4. Hạng mục 3: Tool `run_command` An toàn Kèm Precheck
- **`packages/ai/src/tools/commandTools.ts`:**
  - Tra cứu và phân giải đầy đủ bí danh AutoCAD (`AutoCADCommandAliases`: `BOM`, `TK`, `HIDE`, `SHOWALL`, `ISOLATE`, `G`, `U`, `REDO`...).
  - Kiểm tra `SAFE_DIRECT_COMMANDS`: đối với các lệnh cần chọn trước (`modify.hideSelected`, `modify.isolateSelected`, `modify.deleteNode`), thực hiện preflight check danh sách chọn qua `doc.selection.getSelectedNodes()`. Nếu danh sách rỗng, chặn gửi lệnh và trả về thông báo lỗi chi tiết kèm thẻ hướng dẫn `guide`.
  - Đối với các lệnh vẽ tương tác trên viewport: trả về `{ interactiveCommandBlocked: true, commandKey, aliasMatched, message, guide }` tra cứu từ `findCommandGuide`.
  - Đăng ký `...buildCommandTools()` vào cuối `buildTools()` trong `packages/ai/src/tools/index.ts`.

### 5.5. Hạng mục 4: Thanh Trạng thái Bộ nhớ & Nút Báo Lỗi trên `ChatPanel`
- **`packages/core/src/foundation/pubsub.ts`, `packages/ui/src/mainWindow.ts`, `packages/ui/src/manual/manualReader.ts`:**
  - Nâng cấp sự kiện `showManual` nhận tham số `view?: string`.
  - Bổ sung `openDiagnosticsView()` trong `ManualReader`.
- **`packages/ai/src/chatPanel.ts` & `chatPanel.module.css`:**
  - Thêm container `memoryStatusBar` chứa `memoryText` và `memoryErrorBtn` nằm ngay phía trên composer.
  - Hiển thị mục tiêu hiện tại, số lượng node đang theo dõi, số node đã xóa, thông tin lượt kiểm chứng cuối.
  - Nút `⚠️ Lỗi AI (<count>)` tự động hiển thị số lỗi runtime từ `listRuntimeErrorReports()`, khi bấm sẽ kích hoạt `PubSub.default.pub("showManual", "diagnostics")` mở thẳng giao diện Chẩn đoán lỗi AI.

### 5.6. Kết quả Kiểm thử & Biên dịch (Quality Gates)
- **Unit Tests:**
  - `packages/ai/test/bomTools.test.ts`: 2/2 tests pass.
  - `packages/ai/test/commandTools.test.ts`: 5/5 tests pass.
  - `packages/ai/test/agent.test.ts`: 72/72 tests pass (bao gồm 2 test case cho Verification Gate).
  - `packages/ai/test/chatPanel.test.ts`: 113/113 tests pass (bao gồm test case cho memory status bar & nút báo lỗi).
  - `npm run test`: Toàn bộ 601 test files (10,133 tests) + 2 server test suites (34 tests) pass 100%.
- **Linter & Code Style:**
  - `npm run check`: 0 errors.
  - `git diff --check`: 0 whitespace errors.
- **Production Build:**
  - `npm run build`: Rspack build + plugins build thành công 100% (exit code 0).
- **Nguyên vẹn Working Tree:**
  - Giữ nguyên toàn bộ mã của `TASK-35`.
  - Không thay đổi `documentVersion` trong `package.json`.


### 5.7. Bằng chứng Thực thi, Commit & Nhật ký Thay đổi
- **Commit SHA:** `511de32046c7c61d4d19a664e1cbfe108415a400`
- **Thông điệp Commit:** `✨ feat(ai): verification gate, bom tools, command tools and diagnostics button (TASK-36)`
- **Danh mục Bằng chứng (Evidence Logs):**
  - `docs/tasks/TASK-36-evidence/rstest-ai.log`: `npx rstest packages/ai` (43 test files pass, 649 tests pass, `EXIT=0`).
  - `docs/tasks/TASK-36-evidence/test-all.log`: `npm run test` (601 test files pass, 10,133 tests pass + 2 server suites pass, `EXIT=0`).
  - `docs/tasks/TASK-36-evidence/build.log`: `npm run build` (Rspack + plugins build thành công, `EXIT=0`).
  - `docs/tasks/TASK-36-evidence/diff-check.log`: `git diff --check` (`EXIT=0`).
  - `docs/tasks/TASK-36-evidence/check.log`: `npm run check` (0 errors, `EXIT=0`).
- **CHƯA KIỂM:** Kiểm thử tương tác trực tiếp với live LLM endpoint bên ngoài (do môi trường chưa có API key trực tiếp).

### 5.8. Cập nhật Bằng chứng Round 3 (Cổng Hậu kiểm Theo Đối tượng Cụ thể)
- **Commit SHA đối chiếu:** `4facbdb08cdc5f09a8aa977e4dfb4907ee4a1583`
- **Thay đổi kỹ thuật:** Nâng cấp cổng hậu kiểm `agent.ts` theo dõi chính xác tập danh sách target (`pendingVerificationTargets`) sinh ra từ các tool ghi hình học. Phép đo trên đối tượng khác (ví dụ: tạo Box A rồi đo Box B) không thể giải phóng cờ kiểm chứng (`needsVerification` vẫn `true`). Chỉ khi đo đúng đối tượng mục tiêu với kết quả hợp lệ mới được xác nhận (`needsVerification = false`, `lastVerification.verified = true`).
- **Danh mục Bằng chứng Round 3:**
  - `docs/tasks/TASK-36-evidence/round3/rstest-ai.log`: `npx rstest packages/ai` (44 files pass, 656 tests pass, `EXIT=0`).
  - `docs/tasks/TASK-36-evidence/round3/test-all.log`: `npm run test` (602 files pass, 10,139 tests pass + 2 server suites pass, `EXIT=0`).
  - `docs/tasks/TASK-36-evidence/round3/tsc.log`: `npx tsc --noEmit -p .` (`EXIT=0`).
  - `docs/tasks/TASK-36-evidence/round3/check.log`: `npm run check` (0 errors, `EXIT=0`).
  - `docs/tasks/TASK-36-evidence/round3/build.log`: `npm run build` (Rspack + plugins build thành công, `EXIT=0`).
  - `docs/tasks/TASK-38-evidence/agent-loop-offline-harness.log`: 6/6 tests pass (kèm 2 test hồi quy đối tượng).
- **Trạng thái Triển khai:** `CHƯA DEPLOY` (Tuân thủ nghiêm ngặt quy tắc không tự ý deploy VPS và không git push).
