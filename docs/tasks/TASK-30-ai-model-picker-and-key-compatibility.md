# TASK-30: Cải thiện danh sách chọn model AI và trạng thái tương thích với API key

> **Trạng thái:** `[?] WAITING_REVIEW`
> **Ưu tiên:** P1 (cấu hình AI khó dùng, danh sách model quá dài và gây hiểu nhầm)
> **Phụ trách:** AI Thực thi (Worker)
> **Deploy:** Không deploy VPS trong task này.

## 1. Hiện tượng người dùng báo

Sau khi nhập API key và discovery thành công, danh sách Model mở thành một popup dài hàng trăm mục (ảnh người dùng gửi cho thấy nhiều model/vendor và các biến thể `:batch`, alias `~...`). Người dùng kỳ vọng app giúp nhận biết model nào phù hợp/dùng được với key, thay vì đổ toàn bộ danh sách vào một dropdown khó thao tác.

## 2. Đối chiếu mã hiện tại

- `packages/ai/src/llm/discovery.ts`: `discoverProvider()` gọi endpoint `modelsPath` của vendor; `filterAndSortModels()` hiện chủ yếu loại một số model theo từ khóa như embedding, audio, moderation. Hàm chưa giới hạn theo tool calling hoặc các năng lực mà agent của ứng dụng cần.
- `packages/ai/src/chatPanel.ts`: `runDiscovery()` thêm toàn bộ `result.models` thành `<option>` của native `<select>`. Vì thế catalog lớn biến thành menu dài, không có tìm kiếm, lọc hoặc phân nhóm.
- Với OpenRouter, `/api/v1/models` là catalog “all models”; key dùng trong request xác thực không có nghĩa endpoint chỉ trả những model mà tài khoản chắc chắn gọi được. `/models/user` được mô tả là lọc theo user provider preferences, privacy settings và guardrails; không khẳng định đó là danh sách entitlement/credits theo API key. Không được quảng bá kết quả `/models` hay `/models/user` là “đã kiểm tra chắc chắn chạy được với key”.
- Lệnh agent sử dụng tool calls, nên ngoài có mặt trong catalog, model còn cần hỗ trợ các tham số/tool use mà provider adapter gửi. Khả năng chạy thực tế còn tùy model, routing, credits/quota và endpoint.

## 3. Yêu cầu

1. Thay dropdown dài bằng bộ chọn có thể tìm kiếm (tên và model ID), bàn phím điều hướng được, có trạng thái loading/empty/error và vẫn dùng tốt ở sidebar hẹp.
2. Phân nhóm hoặc lọc tối thiểu:
   - “Gợi ý cho trợ lý” — model được đánh giá tương thích với protocol hiện chọn và tool calling.
   - “Tất cả model trong catalog” — có thể mở rộng/tìm kiếm khi người dùng muốn chọn model khác.
   - “Model tùy chỉnh” — giữ chức năng nhập model ID thủ công.
3. Dùng metadata API thật (ví dụ `supported_parameters`, modality và protocol nếu endpoint cung cấp) để lọc/đánh dấu năng lực. Nếu metadata thiếu hoặc không đủ chắc chắn, hiện “Chưa xác minh” thay vì khẳng định model dùng được.
4. Nếu API key/provider có endpoint danh sách theo người dùng, khảo sát endpoint và ý nghĩa chính xác. Chỉ dùng khi có bằng chứng nó phản ánh phạm vi key; không coi preferences/guardrails là entitlement.
5. Discovery hiện chỉ xác nhận truy cập catalog/model listing. Đổi thông báo UI để diễn đạt chính xác (ví dụ “Đã xác thực nhà cung cấp; chọn model để tiếp tục”), không gây hiểu nhầm rằng mọi model trong list đã được test bằng key.
6. Không tự gửi request chat thử cho hàng trăm model. Nếu thêm “Thử model này”, phải là hành động rõ ràng trên model đã chọn, thông báo có thể tiêu thụ quota/chi phí, và không ghi key vào log.
7. Giữ model đã lưu hiện tại ngay cả khi discovery list không có model đó; không tự thay cấu hình hoặc gửi request tới model khác.
8. Thêm kiểm thử hành vi: catalog lớn có thể tìm theo ID/tên; lọc tool-capable đúng theo metadata; thiếu metadata ra trạng thái chưa xác minh; model tùy chỉnh vẫn chọn được; danh sách rỗng/lỗi API được xử lý rõ.
9. Chạy test liên quan, `npm run test`, `npm run build`; ghi số cảnh báo build và kết quả. Không deploy VPS.

## 4. Quy trình Worker

- Đọc `AGENTS.md`, mục 4 của `ROADMAP.md`, và `RTK.md` nếu có.
- Đọc TASK-22, TASK-24, TASK-29 và các adapter/discovery tests trước khi sửa.
- Không đưa API key thật vào test, log, screenshot hay execution log.
- Ghi Execution Log ở cuối task; chuyển sang `[?] WAITING_REVIEW` khi hoàn tất; không tự đánh `[x] DONE`.

## 5. Nhật ký Thực thi (Worker cập nhật khi hoàn thành)

- **Ngày hoàn thành:** 03/11/2026.
- **Mã Commit thực thi:** `ac06da9c` (commit cơ sở) và `5ab80d37` (commit tinh chỉnh phân loại & i18n) trên nhánh `dev`.
- **Các thay đổi đã triển khai:**
  1. **Component `ModelPicker` (`packages/ai/src/modelPicker.ts`, `packages/ai/src/modelPicker.module.css`):**
     - Thay thế dropdown native `<select>` dài hàng trăm phần tử bằng giao diện tìm kiếm popup thông minh, có thể cuộn và tối ưu hiển thị cho sidebar hẹp.
     - Tìm kiếm tức thì theo model ID, display name và description.
     - Hỗ trợ phân nhóm tab:
       - `Recommended` ("Gợi ý cho trợ lý"): Chỉ lọc các model được xác nhận hỗ trợ tool calling (`toolCapability === "supported"`). Tuyệt đối không tự động đưa model mặc định hoặc các model đầu danh sách vào tab Gợi ý khi thiếu metadata xác nhận. Nếu catalog không có model nào hỗ trợ tools (`recCount === 0`), ModelPicker tự động chuyển sang tab "Tất cả" và tab Gợi ý hiển thị thông báo trống `ai.noRecommendedModels`.
       - `All` ("Tất cả"): Hiển thị toàn bộ catalog trả về từ endpoint với các badge trực quan: "Tools", "Không tools", "Chưa xác minh", "Vision", "Mặc định".
       - `Custom` ("Tùy chỉnh"): Cho phép người dùng nhập trực tiếp bất kỳ model ID tùy biến nào.
     - Hỗ trợ đầy đủ phím điều hướng: `ArrowDown`/`ArrowUp` để di chuyển focus, `Enter` để chọn, `Escape` và click bên ngoài để đóng popover.
     - Tự động ghim model hiện tại/được lưu nếu không xuất hiện trong catalog tìm thấy (chỉ ở tab "Tất cả"), không bao giờ tự ý ghi đè model của người dùng.
  2. **Nhận diện năng lực và Metadata (`packages/ai/src/llm/discovery.ts`):**
     - Bổ sung `detectToolCapability()`: kiểm tra `supported_parameters` (`tools`, `tool_choice`, `functions`) và `capabilities.tools`.
     - Phân loại nghiêm ngặt: `"supported"`, `"unsupported"`, hoặc `"unverified"` (nghiêm ngặt không đoán mò; thiếu metadata thì gán nhãn `Chưa xác minh`, kể cả model mặc định).
     - Bổ sung `detectVisionCapability()` và `detectContextLength()`.
     - Bổ sung hàm thử nghiệm đơn lẻ theo yêu cầu `testSingleModel()`: gửi 1 prompt kiểm tra tối thiểu, tính toán độ trễ phản hồi (latency), cảnh báo rõ ràng rằng kết quả chỉ xác nhận khả năng phản hồi chat text chứ không chứng minh tool calling hoạt động; khử mọi API key khỏi thông báo lỗi và không bao giờ log key.
  3. **Tích hợp vào Chat Panel và Bản địa hóa Đầy đủ (`packages/ai/src/chatPanel.ts`, `packages/i18n/src/`):**
     - Tích hợp `ModelPicker` vào form cài đặt thay thế `modelSelect` và `modelInput`.
     - Thêm nút "Thử model này" bên cạnh bộ chọn model với thông báo cảnh báo rõ ràng: "Lưu ý: Thử nghiệm này chỉ gửi 1 prompt văn bản tối thiểu (có thể tiêu thụ quota/chi phí) để xác nhận model phản hồi được; không chứng minh agent tool calling hoạt động."
     - Cập nhật thông báo discovery (`ai.discoveryCatalogSuccess`): nói rõ kết quả chỉ phản ánh catalog được trả về từ endpoint, không khẳng định key đã được cấp quyền cho mọi model.
     - Cập nhật từ điển đa ngôn ngữ cho toàn bộ các locale: `vi.ts`, `en.ts`, `zh-cn.ts`, `pt-br.ts`, `ru.ts` và `packages/core/src/i18n/keys.ts`.
  4. **Kiểm thử tự động:**
     - `packages/ai/test/modelPicker.test.ts` (8 bài test): kiểm tra tìm kiếm theo ID/tên, chuyển tab, điều hướng phím, giữ model đã lưu, đóng mở popover, và xử lý catalog không có model hỗ trợ tool calling (không gán bừa model).
     - `packages/ai/test/discovery.test.ts` (13 bài test): kiểm tra nhận diện metadata capability, defaultModel thiếu metadata gán `unverified`, và `testSingleModel`.
     - `packages/i18n/test/locale.test.ts` (20 bài test): kiểm tra tính nhất quán và khớp tham số định dạng trên các locale.
     - Toàn bộ gói AI: 37 test files, 570 tests pass 100%.
     - Kiểm thử toàn monorepo (`npm run test`): 593 test files pass, 1 skipped (10,039 tests pass + 27 server node tests pass: 14 LLM proxy tests + 13 SQLite storage tests).
  5. **Kiểm tra linter và production build:**
     - `npm run check`: Biome check hoàn thành 0 lỗi (Checked 1564 files).
     - `npm run build`: Hoàn tất production build thành công (Rspack + plugins build exit 0).
       - Cảnh báo kích thước tài nguyên (asset size limit > 300 KiB): `dbdfd306f73db9ae.wasm` (10.184 MiB), `67.js` (886.888 KiB), `865411b872d20239.wasm` (851.732 KiB), `vendor-three.js` (593.541 KiB), `main.js` (592.878 KiB), `575.js` (535.366 KiB).
       - Cảnh báo entrypoint size limit (> 500 KiB): `main` (599.001 KiB).
       - Cảnh báo plugin bundle size: `dist/plugins/visual-programming/main.js` (3.039 MiB).
- **Trạng thái chuyển giao:** `[?] WAITING_REVIEW` (Không deploy VPS, không log API key).
