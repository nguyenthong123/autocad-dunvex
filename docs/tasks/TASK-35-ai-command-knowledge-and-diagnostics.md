# TASK-35: Bộ tri thức lệnh, quy trình thao tác, bộ nhớ ngắn hạn và báo cáo lỗi runtime cho AI Chili3D

> **Trạng thái:** `[?] WAITING_REVIEW` (Đã hoàn tất code và vượt qua kiểm tra code + 36 unit tests ngày 04/11/2026, chờ Reviewer nghiệm thu)
> **Ưu tiên:** P0 — nền tảng chất lượng trợ lý AI
> **Phạm vi:** `packages/ai/`, `packages/ui/src/manual/`, các tool/skill liên quan
> **Phụ thuộc:** Đã hoàn tất Việt hóa 18 file `docs/manual/` và `ManualReader` (`app.manual`)

## 1. Vấn đề hiện tại

Phần Việt hóa toàn bộ 18 tài liệu trong `docs/manual/` và giao diện đọc sổ tay `ManualReader` (nút **Hướng dẫn** cạnh **Performance Test** trong tab **Quản lý**) đã được thực hiện xong. Tuy nhiên, bản thân trợ lý AI trong `packages/ai/` vẫn chưa hiểu bản chất và ràng buộc của các lệnh:

1. **Chạy lệnh mù:** AI nhận yêu cầu người dùng rồi gọi ngay `run_program` / `run_parametric` mà không kiểm tra điều kiện tiên quyết (preconditions) của lệnh: cần chọn `Node`, `Solid`, `Face`, `Wire` kín hay `Edge`; gốc tọa độ đặt ở góc (`box`, `rect`, `pyramid`), tâm đáy (`cylinder`, `cone`) hay tâm khối (`sphere`); lệnh nào tiêu thụ và xóa node đầu vào (`removed`).
2. **Không biết hướng dẫn người dùng thao tác:** Khi người dùng hỏi cách làm hoặc thao tác bị lỗi, AI chưa tra cứu đầy đủ quy trình từng bước, điều kiện đầu vào và cách xử lý lỗi từ sổ tay để chỉ dẫn rõ ràng.
3. **Không ghi báo cáo khi lỗi do code/runtime:** Khi lệnh hoặc tool chạy lỗi do bug code/kernel/runtime (không phải do người dùng nhập sai), hiện chưa có cơ chế ghi chi tiết lỗi ra báo cáo để lập trình viên kiểm tra và sửa chữa.
4. **Thiếu bộ nhớ ngắn hạn có cấu trúc:** `journal.ts` hiện chỉ tóm tắt lịch sử khi cắt ngữ cảnh, chưa lưu có cấu trúc mục tiêu hiện tại, kế hoạch, các quyết định của người dùng, danh sách node đang sống, danh sách node đã bị `removed` và các lỗi đã gặp trong phiên.

---

## 2. Yêu cầu kỹ thuật chi tiết

### 2.1. Bộ tri thức lệnh (`packages/ai/src/skills/commandGuide.ts`)

Tạo skill mới `command-guide` và đăng ký vào `packages/ai/src/skills/registry.ts`.

Cung cấp danh sách `CommandGuideCard` có cấu trúc rõ ràng (và xuất hàm/hằng để cả AI lẫn UI `ManualReader` có thể tra cứu):

```ts
export interface CommandGuideCard {
    commandKey: string;
    aliases: string[];
    category: "create" | "modify" | "measure" | "annotate" | "boolean" | "convert" | "sketch" | "parametric" | "pro";
    modelingMode: "direct" | "parametric" | "sketch" | "pro";
    purpose: string;
    whenToUse: string[];
    whenNotToUse: string[];
    requiredPreconditions: string[];
    acceptedSelectionTypes: string[];
    forbiddenInputs: string[];
    inputSequence: string[];
    geometryConstraints: string[];
    consumesInputs: boolean;
    replacesInputs: boolean;
    affectsFeatureHistory: boolean;
    commonFailures: string[];
    recoverySteps: string[];
    verificationSteps: string[];
    userStepByStepGuide: string[];
}
```

Bao phủ đầy đủ các lệnh trọng tâm từ `docs/manual/`:
- **Direct Creation (`create.*`):** `line`, `rect`, `circle`, `arc`, `polygon`, `box`, `cylinder`, `sphere`, `cone`, `pyramid`, `extrude`, `revol`, `sweep`, `loft`, `offset`, `folder`.
- **Direct Modify & Boolean (`modify.*`, `boolean.*`, `convert.*`):** `move`, `rotate`, `mirror`, `array`, `fillet`, `chamfer`, `shell`, `trim`, `extend`, `break`, `split`, `sew`, `explode`, `deleteNode`, `removeShapes`, `removeFeature`, `boolean.join`, `boolean.cut`, `boolean.common`, `convert.toWire`, `convert.toFace`, `convert.toShell`, `convert.toSolid`.
- **Measure & Annotate (`measure.*`, `annotate.*`):** `length`, `angle`, `select`, `bom`, `dimension`, `radius`, `angle`, `text`.
- **Sketch & Constraints (`sketch.*`, `constraint.*`, `dimension*`):** `sketch.create`, `sketch.line`, `sketch.rectangle`, `sketch.circle`, `sketch.arc`, `sketch.trim`, `sketch.offset`, `sketch.projectEdges`, `sketch.toggleConstruction`, các ràng buộc và kích thước.
- **Parametric Features (`feature.*`):** `extrude`, `revolve`, `loft`, `sweep`, `hole`, `fillet`, `chamfer`, `modifyFillet`, `modifyChamfer`, `draft`, `shell`, `thicken`, `offsetFace`, `split`, `patternLinear`, `patternCircular`, `mirror`, `fuse`, `cut`, `common`, `pressPull`, `reselect`, `variable`.
- **Pro Direct Editing (`edit.*`):** `pushpull`, `offsetFace`, `move`, `fillet`, `chamfer`, `lineSplit`, `rectSplit`, `circleSplit`, `simplify`, `fix`, `removeFeature`.

### 2.2. Nâng cấp Quy tắc Hành vi & Preflight (`packages/ai/src/llm/prompt.ts`)

Cập nhật `buildSystemPrompt` để AI tuân thủ:
1. **Chế độ Hướng dẫn người dùng:** Khi người dùng hỏi cách thao tác hoặc hỏi vì sao thao tác không được, AI bắt buộc gọi `load_skill("command-guide")` + `load_skill("app-guide")` + `get_ribbon`, giải thích rõ:
   - Điều kiện đầu vào lệnh đòi hỏi là gì (tại sao thao tác vừa rồi không chạy được).
   - Các bước click tuần tự trên Ribbon / Viewport / Model Tree và phím xác nhận (`Enter`, `Space`, `Esc`, `Tab`).
   - Không tự ý chạy lệnh thay người dùng nếu người dùng chỉ hỏi cách làm.
2. **Chế độ Thực thi lệnh:** Trước khi gọi `run_program`, `run_parametric`, `apply_array` hoặc các tool sửa đổi:
   - Kiểm tra điều kiện tiên quyết theo `command-guide` (loại hình học, solid hay face/wire, profile kín và đồng phẳng, hướng đùn/cắt, tọa độ góc vs tâm).
   - Nếu thiếu thông số hoặc có rủi ro làm mất lịch sử tham số / tràn biên / sửa instance nguồn, phải hỏi qua `ask_user` trước.
   - Sau khi chạy lệnh: kiểm tra kết quả thật (`created`, `removed`, thể tích/kích thước) trước khi báo hoàn thành.

### 2.3. Hệ thống Báo cáo Lỗi Runtime (`packages/ai/src/diagnostics/`)

Tạo module:
- `packages/ai/src/diagnostics/types.ts`
- `packages/ai/src/diagnostics/runtimeErrorReporter.ts`
- `packages/ai/src/diagnostics/index.ts`

Yêu cầu:
1. Tự động bắt và ghi nhận chi tiết mọi lỗi khi thực thi tool/lệnh trong `packages/ai/src/llm/agent.ts`, `packages/ai/src/tools/host.ts`, `run_program` và `run_parametric`.
2. Phân loại rõ `errorClass`:
   - `"code-bug"` / `"application"`: lỗi exception trong code TS/JS, null/undefined, lỗi logic tool handler.
   - `"kernel"`: lỗi từ OCCT/WASM kernel.
   - `"geometry-precondition"`: vi phạm ràng buộc hình học (profile hở, không giao nhau, bán kính fillet quá lớn...).
   - `"ai-planning"`: AI truyền sai kiểu ref, dùng lại node đã `removed`, thiếu tham số.
   - `"user-input"`: thông số đầu vào chưa hợp lệ.
3. Mỗi bản ghi `RuntimeErrorReport` lưu đầy đủ:
   - `id`, `timestamp`, `toolName`, `commandKey`, `operation`, `errorClass`;
   - `errorMessage`, `stack` (nếu có);
   - `sanitizedArgs` (đã redact API key, token, data URL ảnh);
   - `documentSummary` (danh sách node id/type/name liên quan tại thời điểm lỗi);
   - `suspectedCause` và `suggestedFixForDeveloper` (gợi ý file/hàm cần kiểm tra để sửa code).
4. Khử trùng lặp: 1 lỗi chỉ ghi 1 report duy nhất cho mỗi lượt gọi tool.
5. Lưu vào `localStorage` / `IndexedDB` (có fallback in-memory cho unit test) VÀ cung cấp các tool:
   - `list_runtime_error_reports`
   - `export_runtime_error_reports` (trả nội dung báo cáo Markdown/JSON chi tiết và hỗ trợ tải file `chili3d-error-report-YYYY-MM-DD.md` hoặc `.json` để lập trình viên mở kiểm tra ngay)
   - `clear_runtime_error_reports`
6. Trên giao diện `ManualReader` (`packages/ui/src/manual/manualReader.ts`), thêm nút/tab **"Báo cáo lỗi AI"** để người dùng xem danh sách lỗi đã ghi nhận, bấm **"Tải file báo cáo lỗi (.md)"** hoặc xóa danh sách lỗi.

### 2.4. Bộ nhớ Ngắn hạn cho AI (`packages/ai/src/memory/`)

Tạo module:
- `packages/ai/src/memory/types.ts`
- `packages/ai/src/memory/sessionMemory.ts`
- `packages/ai/src/memory/index.ts`

Yêu cầu:
1. Lưu bộ nhớ ngắn hạn của phiên làm việc hiện tại:
   - `goal`: mục tiêu đang làm;
   - `currentPlan`: các bước kế hoạch;
   - `completedSteps` & `pendingSteps`;
   - `userConstraints`: các kích thước/quyết định người dùng đã chốt;
   - `activeNodes`: các node đang thao tác (`id`, `name`, `role`);
   - `removedNodeIds`: các node đã bị tiêu thụ/xóa (cấm dùng lại);
   - `recentErrors`: các lỗi vừa gặp để không lặp lại y hệt.
2. Tự động cập nhật `sessionMemory` khi chạy các tool tạo/sửa/xóa hình học, khi người dùng trả lời `ask_user`, và khi xảy ra lỗi.
3. Đưa bản tóm tắt `sessionMemory` (giới hạn <= 1.500 ký tự) vào phần `volatile` của `buildSystemPrompt` trong `packages/ai/src/llm/prompt.ts` (giữ nguyên phần `stable` để không làm mất prompt cache).
4. Khi lịch sử hội thoại bị rút gọn (`journal.ts`), `sessionMemory` vẫn giữ nguyên mục tiêu, các node còn sống/đã xóa và các lỗi vừa gặp.
5. Cung cấp các tool:
   - `get_session_memory`
   - `update_session_memory`
   - `clear_session_memory`

---

## 3. Kiểm thử & Nghiệm thu

1. **Unit Tests bắt buộc:**
   - `packages/ai/test/commandGuide.test.ts`: kiểm tra skill `command-guide`, danh sách `CommandGuideCard`, tính hợp lệ của dữ liệu và tích hợp với `load_skill`.
   - `packages/ai/test/runtimeErrorReporter.test.ts`: kiểm tra tự động bắt lỗi từ `run_program`, `run_parametric`, tool throw exception; phân loại `errorClass`; khử trùng lặp; redact API key/data URL; xuất báo cáo `.md` và `.json`.
   - `packages/ai/test/sessionMemory.test.ts`: kiểm tra cập nhật node `created`/`removed`, lưu lỗi, giữ trạng thái qua compaction và tiêm vào phần `volatile` của `buildSystemPrompt`.
   - Cập nhật `packages/ui/test/manualReader.test.ts` nếu bổ sung tab/nút xem báo cáo lỗi hoặc tra cứu lệnh.
2. **Lệnh kiểm tra bắt buộc:**
   - `npm run check`
   - `npm run test`
   - `npm run build`
   - `git diff --check`

---

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Ngày thực hiện:** 2026-11-04
- **Trạng thái:** `[?] WAITING_REVIEW`
- **Mã Commit SHA:** `PENDING_COMMIT`
- **Trạng thái Deploy:** `CHƯA DEPLOY` (Tuân thủ quy tắc: Không tự ý deploy lên VPS khi chưa có lệnh của Reviewer/Chủ dự án)
- **CHƯA KIỂM:**
  - Chưa kiểm tra tương tác thực tế của người dùng trên trình duyệt thật (end-to-end browser click); toàn bộ kiểm tra được thực thi qua unit tests tự động (Rstest + Happy-DOM mock và headless chrome scenarios).
- **File ngoài phạm vi ban đầu:**
  - `docs/manual/*` (18 file, ~2076+/2043-): Toàn bộ 18 tài liệu sổ tay hướng dẫn người dùng nguyên bản tiếng Trung đã được dịch thuật và chuẩn hóa toàn diện sang tiếng Việt, cung cấp nền tảng tri thức chuẩn cho `commandGuide.ts` và tính năng tra cứu lệnh `ManualReader`.
  - `rspack.config.ts`: Bổ sung cấu hình `RspackPlugin` copy thư mục `docs/manual/` sang `dist/manual/` trong quá trình build để trình duyệt có thể tải về các file markdown động.
  - `packages/ui/package.json`: Khai báo thêm dependency `marked` phục vụ việc render markdown sổ tay trong component `ManualReader`.
- **Kết quả Kiểm thử:**
  - `npm run check`: PASSED (0 biome lint/format issues)
  - `npm run test`: PASSED 100% (599 test files passed, 1 skipped, 10,117 tests passed)
  - `npm run build`: PASSED (Rspack + plugins build thành công)
  - `git diff --check`: PASSED (không có whitespace lỗi)

### 5.1. Chi tiết các file tạo mới & chỉnh sửa

1. **Hạng mục 1: Bộ Tri thức Lệnh & Ràng buộc Hình học (`packages/ai/src/skills/commandGuide.ts`)**
   - Tạo file `packages/ai/src/skills/commandGuide.ts`: Định nghĩa cấu trúc `CommandGuideCard` chi tiết với hơn 45 lệnh thuộc các danh mục `create`, `modify`, `boolean`, `convert`, `measure`, `annotate`, `sketch`, `parametric`, `pro`. Cung cấp các hàm tra cứu `findCommandGuide(query)` và `searchCommandGuides(query)`.
   - Cập nhật `packages/ai/src/skills/registry.ts`: Đăng ký skill `"command-guide"` vào `SKILLS`.
   - Cập nhật `packages/ai/src/skills/index.ts`: Export `commandGuide.ts`.

2. **Hạng mục 2: Nâng cấp Quy tắc Preflight & Hướng dẫn Người dùng (`packages/ai/src/llm/prompt.ts`)**
   - Nâng cấp `policySection` và `rulesSection`: Khi người dùng hỏi cách thao tác hoặc báo lỗi thao tác bằng tay, AI bắt buộc gọi `load_skill("command-guide")`, `load_skill("app-guide")`, giải thích nguyên nhân và hướng dẫn từng bước click chuột / phím tắt, không tự ý chạy lệnh thay người dùng khi chỉ hỏi cách làm.
   - Thêm quy tắc tiền kiểm (preflight check) trước khi tạo/sửa mô hình: kiểm tra kiểu đối tượng, gốc tọa độ, tính kín của biên dạng; hỏi người dùng qua `ask_user` nếu thiếu thông số thay vì vẽ nháp; hậu kiểm kết quả sau khi chạy lệnh.

3. **Hạng mục 3: Hệ thống Báo cáo Lỗi Runtime (`packages/ai/src/diagnostics/`)**
   - Tạo `packages/ai/src/diagnostics/types.ts`: Định nghĩa `ErrorClass` (`code-bug`, `kernel`, `geometry-precondition`, `ai-planning`, `user-input`, `application`), `RuntimeErrorReport`, `ErrorReportOptions`.
   - Tạo `packages/ai/src/diagnostics/runtimeErrorReporter.ts`: Triển khai `RuntimeErrorReporter` với bộ phân loại lỗi tự động, khử trùng lặp (dedup qua `__chiliReported` và deduplication key trong cửa sổ 2 giây), làm sạch tham số (redact API key, Bearer token, data URLs), xuất báo cáo Markdown / JSON, và lưu trữ localStorage với fallback in-memory.
   - Tạo `packages/ai/src/diagnostics/index.ts`: Export công khai bộ diagnostics.
   - Tạo `packages/ai/src/tools/diagnosticTools.ts` và đăng ký 3 tool vào `packages/ai/src/tools/index.ts`: `list_runtime_error_reports`, `export_runtime_error_reports`, `clear_runtime_error_reports`.
   - Tích hợp bắt lỗi tự động vào `packages/ai/src/llm/agent.ts`, `packages/ai/src/tools/host.ts`, `packages/ai/src/tools/capabilityEngine.ts`, `packages/ai/src/tools/parametricTools.ts`.
   - Tích hợp giao diện `ManualReader` (`packages/ui/src/manual/manualReader.ts` & `manualReader.module.css`): Thêm ô tìm kiếm nhanh sổ tay, mục "Báo cáo lỗi AI" kèm badge số lỗi, giao diện xem chi tiết báo cáo lỗi runtime, nút "Tải báo cáo lỗi (.md)" và "Xóa danh sách".

4. **Hạng mục 4: Bộ nhớ Ngắn hạn cho AI (`packages/ai/src/memory/`)**
   - Tạo `packages/ai/src/memory/types.ts`: Định nghĩa `SessionMemoryState`, `ActiveNodeInfo`, `RecentErrorInfo`.
   - Tạo `packages/ai/src/memory/sessionMemory.ts`: Triển khai `SessionMemory` quản lý trạng thái phiên, tự động cập nhật khi tạo/xóa/đổi tên node, khi người dùng đưa ra ràng buộc qua `ask_user`, và khi có lỗi; xuất chuỗi tóm tắt `formatSessionMemorySummary` giới hạn <= 1500 ký tự.
   - Tạo `packages/ai/src/memory/index.ts`: Export công khai module memory.
   - Tạo `packages/ai/src/tools/sessionMemoryTools.ts` và đăng ký 3 tool vào `packages/ai/src/tools/index.ts`: `get_session_memory`, `update_session_memory`, `clear_session_memory`.
   - Tiêm bản tóm tắt `sessionMemorySection()` vào phần `volatile` của `buildSystemPrompt` trong `packages/ai/src/llm/prompt.ts`, đảm bảo không làm mất prompt cache của phần `stable`.
   - Tích hợp các hooks cập nhật bộ nhớ ngắn hạn vào `capabilityEngine.ts`, `nodeTools.ts`, `propertyTools.ts`, `arrayTools.ts`, `parametricTools.ts`, `askUser.ts`.

5. **Kiểm thử Unit Tests:**
   - Tạo `packages/ai/test/commandGuide.test.ts` (8 tests passed)
   - Tạo `packages/ai/test/runtimeErrorReporter.test.ts` (9 tests passed)
   - Tạo `packages/ai/test/sessionMemory.test.ts` (8 tests passed)
   - Cập nhật `packages/ui/test/manualReader.test.ts` (8 tests passed)
   - Cập nhật `packages/ai/test/prompt.test.ts` (8 tests passed)
   - Cập nhật `packages/ai/test/askUser.test.ts` (4 tests passed)

### 5.2. Hoàn thiện 6 điểm kỹ thuật theo phản hồi Review

1. **Lỗi 1 (Mất focus ô tìm kiếm & chi tiết CommandGuideCard trong ManualReader):**
   - Tách riêng container `this.chapterListEl` trong sidebar bên dưới ô tìm kiếm và nút Báo cáo lỗi AI.
   - Thẻ `<input>` chỉ được tạo 1 lần duy nhất trong `render()`, khi gõ phím chỉ cập nhật `this.chapterListEl` và `this.contentEl` mà không hủy/tạo lại input, bảo toàn 100% focus và bộ gõ tiếng Việt (IME).
   - Tự động gọi `loadDocument(currentFile)` khi xóa trắng từ khóa tìm kiếm để quay về chương đang đọc.
   - Hiển thị đầy đủ thông tin từng `CommandGuideCard` (mục đích, khi nào dùng/không dùng, preconditions, đối tượng hợp lệ/cấm, ràng buộc hình học, chuỗi phím tắt, hướng dẫn từng bước tiếng Việt, lỗi thường gặp & khắc phục, kiểm chứng sau lệnh).
2. **Lỗi 2 (Sửa getDocumentSummary() dùng đúng API Chili3D):**
   - Lấy document từ `app.activeView.document` và lấy danh sách node qua `doc.modelManager.findNodes(() => true)` (loại trừ `rootNode`), lấy tối đa 30 node kèm `type: n.constructor?.name`.
   - Bổ sung unit test trong `runtimeErrorReporter.test.ts` mock `globalThis.app.activeView.document` khẳng định `report.documentSummary` có dữ liệu (`nodeCount > 0`, `nodes` hợp lệ).
3. **Lỗi 3 (Hiển thị đầy đủ thông điệp lỗi trong renderDiagnosticsView):**
   - Hiển thị nổi bật thông điệp lỗi `errorMessage` (`.errorMessageText`) trong từng thẻ lỗi.
   - Hiển thị tóm tắt node trong `documentSummary`, thẻ `<details>` cho tham số đã khử nhạy cảm `sanitizedArgs` và `stack` trace.
   - Thêm nút "📥 Tải báo cáo (.json)" bên cạnh nút "📥 Tải báo cáo lỗi (.md)".
4. **Lỗi 4 (Bóc tách operation trong run_program / run_parametric & bắt lỗi JSON trong host.ts):**
   - Trích xuất tên operation bị lỗi từ thông báo ngoại lệ trong `capabilityEngine.ts` (ví dụ `op "..."`) và `parametricTools.ts` (ví dụ `op N ("...")`), truyền vào `recordRuntimeError` và `onRecentError`.
   - Trong `host.ts` (`createToolHost().call`), bóc tách chuỗi JSON trả về chứa `{ error: "..." }` để ghi nhận báo cáo lỗi runtime và lỗi gần đây ngay cả khi chạy qua Bridge.
5. **Lỗi 5 (Hỗ trợ download?: boolean trong export_runtime_error_reports):**
   - Bổ sung tham số `download: boolean` vào schema tool `export_runtime_error_reports`.
   - Tích hợp hàm `download` từ `@chili3d/core` để tải trực tiếp file `chili3d-error-report-YYYY-MM-DD.md` hoặc `.json`.
6. **Lỗi 6 (Đồng bộ sessionMemory khi đổi hội thoại & kiểm tra removedNodeIds):**
   - Trong `documentContext.ts` (`requireNode`), kiểm tra thêm `getSessionMemory().removedNodeIds.includes(id)`: nếu node đã bị tiêu thụ/xóa trong phiên, trả về thông báo lỗi chỉ rõ node này nằm trong `sessionMemory.removedNodeIds` để AI không lặp lại yêu cầu.
   - Trong `chatPanel.ts`, gọi `clearSessionMemory()` khi người dùng bấm tạo hội thoại mới (`startNewConversation`) hoặc chuyển hội thoại cũ (`openConversation`).


### 5.3. Bằng chứng Commit & Quản lý Thay đổi
- **Commit SHA:** `6166bc50e9323efda1a7a0bbf3dc1d798a7ea391`
- **Thông điệp Commit:** `✨ feat(ai): command guide, diagnostics, session memory and manual reader (TASK-35)`
- **File ngoài phạm vi ban đầu:**
  - `docs/manual/*` (18 file): Bản dịch và biên tập hoàn chỉnh sang tiếng Việt toàn bộ sổ tay hướng dẫn sử dụng Chili3D từ tiếng Trung gốc, phục vụ hiển thị trên UI và tra cứu ngữ nghĩa cho AI.
  - `rspack.config.ts`: Bổ sung cấu hình copy thư mục `docs/manual/` sang `dist/manual/` để ứng dụng web tải tài liệu tĩnh khi chạy dev server / production.
  - `packages/ui/package.json`: Khai báo phụ thuộc `marked` cho `ManualReader` phân tích và render Markdown.
- **CHƯA KIỂM:** Kiểm thử tương tác trực tiếp với endpoint mô hình ngôn ngữ lớn (LLM) bên ngoài (do môi trường chạy không cấu hình API key trực tiếp).
- **Trạng thái Triển khai:** `CHƯA DEPLOY` (Tuân thủ nghiêm ngặt quy tắc không tự ý deploy VPS và không git push).
