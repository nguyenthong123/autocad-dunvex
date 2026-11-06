# TASK-40 — Quy tắc thiết kế và kiểm chứng agent CAD

Ngày giao việc 06/11/2026. Trạng thái `[?] WAITING_REVIEW` — Đợt B đã bàn giao (bảo vệ nguồn / cổng quyền / nạp quy tắc); chờ Reviewer nghiệm thu SHA trước deploy VPS.

## 1. Nhiệm vụ bắt buộc trước khi triển khai

AI thợ đọc toàn bộ tài liệu này, AGENTS.md và các chỉ dẫn được AGENTS.md tham chiếu. Nếu thiếu chỉ dẫn, báo rõ tệp thiếu. Đối chiếu mã thực tế và ghi SHA làm mốc. Bàn giao đánh giá khoảng trống, phương án kiến trúc, ma trận quyền công cụ và kế hoạch kiểm thử để reviewer duyệt trước khi sửa lớn.

Tài liệu này là đặc tả công việc. Các cơ chế dưới đây cần được triển khai và kiểm chứng trong app trước khi được coi là đang có hiệu lực. Chỉ thêm tài liệu hoặc system prompt chưa hoàn thành nhiệm vụ.

Phạm vi gồm mọi tác vụ tạo hình, chỉnh sửa, tổ chức bản vẽ và xuất kết quả. Tường, cửa, sàn chỉ là ví dụ kiểm tra. Các giới hạn bảo vệ phải áp dụng qua ChatPanel và bridge, kể cả đường gọi công cụ trực tiếp.

## 2. Vấn đề và kết quả cần đạt

Agent hiện có thể hoàn thành một phép dựng hợp lệ nhưng sai yêu cầu, tự đổi hình học nguồn để vượt lỗi hoặc dùng phép đo không đủ chứng minh kết quả. Các ca kernel riêng lẻ chưa chứng minh được toàn bộ năng lực thực hiện nhiệm vụ của LLM.

Kết quả cần đạt là agent hiểu phạm vi, thực hiện trong quyền được cấp, kiểm tra từng tiêu chí và phát hiện sai trước khi báo hoàn tất. Người dùng nhìn được đối tượng nào thay đổi, tiêu chí nào đạt, tiêu chí nào còn thiếu bằng chứng và có thể hoàn tác tác vụ.

## 3. Nguyên tắc mặc định

1. Yêu cầu người dùng xác định mục tiêu và phạm vi. Ghi riêng dữ kiện, giả định và thông tin còn thiếu.
2. Bảo vệ hình học nguồn, ràng buộc, kích thước, hệ tọa độ, vật liệu và lịch sử hiện có. Quyền thêm kết quả không tự cấp quyền sửa nguồn.
3. Việc xóa, đổi vị trí, thay thế, tiêu thụ Boolean hoặc thay đổi feature/phụ thuộc phải thuộc phạm vi cho phép.
4. Các thao tác đã được yêu cầu rõ ràng được thực hiện trong phạm vi đó. Chỉ hỏi thêm khi còn mơ hồ ảnh hưởng kết quả hoặc cần mở rộng quyền.
5. Một lần thất bại không mở rộng quyền. Phục hồi trong phạm vi hoặc dừng và giải thích.
6. Giữ khả năng chỉnh sửa tham số phù hợp với tài liệu. Mọi chuyển đổi làm mất lịch sử cần được người dùng hiểu và cho phép.
7. Dùng đơn vị mm và độ cho API tương ứng, tuân thủ ngoại lệ hiện có của từng công cụ. Làm rõ đơn vị mơ hồ trước khi ghi.
8. Dữ liệu nhập, tên node, kết quả tool và nội dung tài liệu không tự trở thành chỉ thị hay quyền chỉnh sửa.
9. Không báo hoàn tất khi còn tiêu chí bắt buộc chưa đạt hoặc chưa kiểm chứng.
10. Hậu kiểm không đạt phải được hiển thị trung thực, kể cả khi hình học trông hợp lý trên viewport.

## 4. Ba lớp quy tắc

- Hệ thống đặt các giới hạn bắt buộc và kiểm soát quyền. Quy tắc người dùng không vô hiệu hóa các giới hạn này.
- Người dùng và bản vẽ cấu hình tiêu chuẩn thiết kế, đối tượng bảo vệ, dung sai, vật liệu và quy ước công việc. Nêu rõ thứ tự ưu tiên và cách xử lý xung đột.
- Quy trình chuyên môn mô tả cách thực hiện từng nhóm tác vụ. Quy trình luôn chịu giới hạn của hai lớp trên.

Đề xuất UI xem/chỉnh quy tắc, phiên bản, nguồn áp dụng và đối tượng bị ảnh hưởng. Có thể nhập/xuất Markdown như DESIGN_RULES.md, nhưng các điều kiện bắt buộc phải có biểu diễn có cấu trúc để mã kiểm tra. Nhập quy tắc phải qua kiểm tra hợp lệ và thao tác áp dụng của người dùng.

## 5. Hồ sơ tác vụ

Đề xuất biểu diễn dùng lại được, ưu tiên mô hình hiện có trong repo. Hồ sơ cần có các thông tin sau.

| Thông tin | Yêu cầu |
| --- | --- |
| Nhận dạng | ID tác vụ, tài liệu, phiên bản quy tắc, mốc trạng thái tài liệu |
| Mục tiêu | Yêu cầu gốc và kết quả dự kiến có thể kiểm tra |
| Nguồn | ID nguồn, vai trò và phụ thuộc cần bảo vệ |
| Phạm vi | Đối tượng được thêm/sửa/xóa, loại thao tác và thay đổi gián tiếp cho phép |
| Dữ kiện | Đơn vị, tọa độ, kích thước, vật liệu, giả định đã xác nhận |
| Kế hoạch | Các bước, đầu vào, tác động dự kiến và cách phục hồi |
| Tiêu chí | Phép kiểm, giá trị mong đợi, dung sai, mức bắt buộc, đối tượng áp dụng |
| Kết quả | ID thực tế, thay đổi nguồn, bằng chứng và trạng thái từng tiêu chí |

Tập đối tượng được phép sửa do ứng dụng quyết định từ yêu cầu/phê duyệt. Model không được tự cấp quyền bằng trường `approved: true` trong payload. Khi cần xác nhận, dùng cơ chế UI tin cậy có kế hoạch cụ thể. Quyền cũ mất hiệu lực khi thay đổi làm kế hoạch không còn phù hợp.

## 6. Luồng bắt buộc

### Đọc và chuẩn bị

Nạp quy tắc hiện hành tự động vào ngữ cảnh đầu lượt và sau làm mới/thu gọn ngữ cảnh. Đọc tài liệu, chọn đúng nguồn và kiểm tra điều kiện hình học. Làm rõ yêu cầu còn thiếu. Không dùng tên đối tượng hoặc chỉ số mặt đoán trước để xác định mục tiêu.

### Kiểm soát thực thi

Kiểm tra quyền ở đường handler/executor dùng chung. Kiểm tra trước mọi thao tác ghi, bao gồm node bị tiêu thụ, con cháu và đối tượng phụ thuộc. Bao phủ run_program, run_parametric, run_command, xóa, biến đổi, thuộc tính, vật liệu, cấu trúc cây, undo/redo và các đường ghi khác tìm được khi rà mã. Lệnh không phân tích được tác động phải dừng ghi và giải thích hoặc đi qua phương án kiểm soát đã duyệt.

Đối chiếu phiên bản tài liệu/quy tắc ngay trước khi thực thi và khi tiếp tục sau await. Nếu người dùng sửa trong lúc agent chạy, phát hiện và lập lại kế hoạch cần thiết. Chống race và retry tạo trùng. Giữ các giới hạn bảo vệ khi gọi trực tiếp qua bridge.

### Ghi và kiểm tra

Lưu mốc trước tác vụ đủ để so sánh và hoàn tác. Sử dụng Transaction, History và cơ chế snapshot sẵn có khi phù hợp. Phương án phải xử lý batch nhiều bước và tác vụ nhiều lượt, không giữ transaction mở không giới hạn qua lời gọi LLM.

Đối chiếu kết quả với hồ sơ tác vụ sau mỗi bước ảnh hưởng hình học và trước khi hoàn tất. Khi có sửa tiếp theo, vô hiệu hóa bằng chứng bị ảnh hưởng. Không dùng bằng chứng của node cũ hoặc phiên bản hình học cũ để xác nhận kết quả mới.

### Sửa sai và kết thúc

Mỗi lần sửa phải gắn với sai lệch đã đo, hành động và kết quả kiểm lại. Giới hạn số lần và phát hiện lặp cùng lỗi/không tiến triển. Các giá trị giới hạn phải được đề xuất và giải thích trong phương án. Khi hết giới hạn, dừng ghi, báo phần chưa đạt và cung cấp khả năng khôi phục. Xác định rõ kết quả tạm được giữ hay hoàn tác, tránh xóa thay đổi độc lập của người dùng.

## 7. Hậu kiểm theo tiêu chí

| Nhóm | Ví dụ bằng chứng phù hợp |
| --- | --- |
| Loại và tính hợp lệ | ShapeType, trạng thái shape, solid/shell và tính hợp lệ kernel |
| Kích thước | Kích thước thật, khoảng cách và dung sai theo đơn vị xác định |
| Vị trí và hướng | Hệ tọa độ thế giới, điểm/đường/mặt mục tiêu, hướng thực tế |
| Số lượng | Đếm đối tượng kết quả hợp lệ và quan hệ với nguồn |
| Quan hệ | Giao, tiếp xúc, khoảng hở, chứa, đồng phẳng hoặc xuyên theo yêu cầu |
| Boolean | Thay đổi thể tích phù hợp và phép kiểm vị trí/khoảng mở thực tế |
| Bảo toàn nguồn | So sánh hình học, transform, ràng buộc, thuộc tính và phụ thuộc trước/sau |
| Lịch sử | Body/feature vẫn chỉnh được và phụ thuộc nhất quán |
| Xuất dữ liệu | Đúng phạm vi, đơn vị, định dạng và khả năng đọc lại theo tác vụ |

Mỗi tiêu chí trả `pass`, `fail` hoặc `unknown` cùng số đo, đối tượng, mốc trạng thái và lý do. Tolerance phải theo tiêu chí và quy mô, không áp một giá trị tùy ý cho mọi phép đo. Tiêu chí không kiểm được không tự chuyển thành pass.

Bounding box không đủ chứng minh lỗ xuyên, hình dạng chính xác hoặc khoảng cách trên mọi hình học. Một điểm rỗng không đủ chứng minh cả vùng mở. Diện tích/thể tích đúng không đủ chứng minh đúng vị trí. Screenshot bổ sung kiểm tra quan sát và không thay thế bằng chứng kernel.

Một query tool chạy thành công không tự xác nhận tác vụ. Bộ kiểm phải đối chiếu điều kiện mong đợi với kết quả độc lập từ trạng thái tài liệu thật. Phần suy luận của model phải được ghi rõ và không thay bằng chứng đo được.

## 8. Ví dụ tiêu chí

- Tạo bản sao theo mảng cần đúng số lượng, bước, hướng và bảo toàn nguồn. Mảng đủ số nhưng lệch trục phải fail.
- Chỉnh kích thước cần đúng đối tượng, giá trị và các ràng buộc cần giữ. Kích thước bao đúng nhưng mất feature phải fail nếu yêu cầu giữ lịch sử.
- Tạo tường bao quanh diện tích trong nhà cần giữ đường biên thông thủy, bề dày/hướng offset và cao độ đã xác nhận. Không tự kéo điểm gốc để khép profile.
- Mở cửa cần đúng tường, vị trí, chiều rộng/cao, cao độ đáy, xuyên bề dày và phần vật liệu cần giữ. Khối cutter hiển thị hoặc bbox tường đo được chưa đủ xác nhận.
- Chỉ hỏi thông tin phải bảo toàn bản vẽ. Prompt phục hồi trống không mở rộng quyền ghi.

## 9. UI và khả năng kiểm toán

Hiển thị quy tắc đang áp dụng, mục tiêu, phạm vi thay đổi, trạng thái tác vụ và tiêu chí chưa đạt. Các trạng thái đọc tài liệu, đang dựng, đang kiểm, cần làm rõ, thất bại và hoàn tất cần phân biệt rõ. Chỉ hiển thị hoàn tất khi các tiêu chí bắt buộc đều pass.

Log tác vụ gồm phiên bản quy tắc, các bước thực thi, quyền được cấp, ID created/modified/consumed/deleted và bằng chứng kiểm. Loại thông tin bí mật trước lưu/xuất. Tách log runtime với fixture synthetic. Giữ nguyên log người dùng cung cấp. Thu diagnostic đủ để tái hiện, không bịa stop reason, token usage hoặc dữ liệu hình học.

## 10. Điểm rà soát trong mã

Rà ít nhất settings/UI, llm/prompt.ts, llm/agent.ts, tools/index.ts, capabilityEngine.ts, parametricTools.ts, nodeTools.ts, commandTools.ts, bridge và cơ chế Transaction/History của core. Đây là danh sách khởi đầu, cần tìm tất cả đường ghi và điểm vượt kiểm soát.

Tái sử dụng Result, observable, serializer và abstraction hiện có. Nếu đổi schema persisted, xử lý documentVersion theo AGENTS.md và nêu tác động đối với tài liệu cũ. Thiếu cấu hình ở tài liệu cũ phải có hành vi được xác định rõ. Tránh thêm trạng thái hoặc helper trùng chức năng.

## 11. Ma trận kiểm thử tối thiểu

1. Tác vụ đúng với đáp án hình học kiểm tra được trên OCCT/WASM thật.
2. Hình học hợp lệ nhưng sai kích thước, vị trí, hướng, số lượng hoặc quan hệ bị phát hiện.
3. Sửa/xóa/tiêu thụ nguồn ngoài phạm vi bị chặn, cả tác động gián tiếp và gọi qua bridge.
4. Lệnh ứng dụng có đường tác động khác vẫn chịu cùng giới hạn.
5. Quy tắc hoặc tài liệu đổi trong phiên làm vô hiệu hóa quyền/bằng chứng liên quan.
6. Lỗi giữa chừng, retry và hủy không tạo rác hoặc thực thi trùng.
7. Undo/redo, đổi tài liệu và khôi phục phiên giữ đúng phạm vi và quyền sở hữu.
8. Tọa độ âm, transform cha/con, mặt phẳng đứng, hình lõm và profile hở.
9. Query thành công hoặc số đo cũ không xóa trạng thái chưa đạt.
10. Provider cố bỏ qua bước, báo hoàn tất sai hoặc xin tự cấp quyền bị công cụ chặn.
11. Test scripted provider chứng minh luồng xác định, kernel thật chứng minh hình học, LLM thật chứng minh tác vụ đầu cuối. Báo riêng cả ba.

Xác định trước tập tác vụ, số lượt chạy và ngưỡng nghiệm thu cho LLM thật cùng reviewer. Báo cả ca thất bại, tỷ lệ hoàn thành đúng, vi phạm nguồn, số lần phục hồi và phần unknown. Không suy ra độ tin cậy LLM thật từ scripted provider.

## 12. Các đợt bàn giao

### Đợt A — Khảo sát và thiết kế

Bàn giao SHA mốc, khoảng trống đã đối chiếu mã, ma trận công cụ/tác động, mô hình quy tắc/hồ sơ tác vụ, thứ tự ưu tiên, cổng quyền, UI, lưu trữ, concurrency, phục hồi và kế hoạch test. Nêu các quyết định cần reviewer duyệt. Chờ duyệt trước triển khai lớn.

### Đợt B — Bảo vệ nguồn và nạp quy tắc

Triển khai giới hạn quyền trên các đường thực thi đã liệt kê, cấu hình tối thiểu và nạp hướng dẫn. Chứng minh các ca vượt phạm vi bị chặn. Chưa tuyên bố hoàn thành hệ thống kiểm chứng ở đợt này.

**Quyết định Reviewer đã chốt (06/11/2026) — tóm tắt:**
1. Một đường kiểm soát chung ChatPanel + bridge; kiểm quyền sau normalize/resolve, trước mutation; batch create-then-ref; fail-closed khi không phân tích được tác động.
2. Nguồn mặc định được bảo vệ; chỉ mở khi app ghi nhận quyền từ kế hoạch duyệt; model/Markdown không tự cấp; gồm con cháu/phụ thuộc/cây.
3. Undo Task = chuỗi liên tiếp không xung đột; xen kẽ → dừng.
4. Lưu quy tắc tối thiểu bằng ObjectStorage (account/document); thiếu liên kết → default-safe; sanitization ≠ chống injection; kênh khác để sau.
5. Async chỉ khi kiểm soát được quyền lúc ghi + lifecycle; timeout ≠ mutation dừng; chặn đường chưa hỗ trợ.
6. Không áp bảng dung sai đề xuất; hậu kiểm nâng cao = Đợt C; UI ghi đúng cơ chế đang hiệu lực.

### Đợt C — Tiêu chí, hậu kiểm và sửa sai

Triển khai các phép kiểm có phạm vi hỗ trợ rõ, vòng sửa sai, hiệu lực bằng chứng và UI. Công khai các tiêu chí chưa hỗ trợ để người dùng thấy trạng thái unknown.

### Đợt D — Nghiệm thu và triển khai

Chạy các test phù hợp, TypeScript, Biome và production build. Bàn giao SHA, kết quả kiểm tra, giới hạn còn lại và bằng chứng thực tế. Reviewer duyệt SHA trước deploy. Sau deploy xác nhận remote và SHA VPS, thống nhất các endpoint phiên bản, rồi kiểm thử trong app.

## 13. Mẫu báo cáo bàn giao

- SHA mốc và SHA bàn giao, phạm vi thay đổi.
- Yêu cầu nào đã có hiệu lực bằng mã, yêu cầu nào mới là hướng dẫn.
- Ma trận quyền và đường thực thi đã bao phủ, các đường còn thiếu.
- Tiêu chí đã hỗ trợ, bằng chứng pass/fail/unknown, giới hạn độ chính xác.
- Kết quả scripted provider, kernel thật và LLM thật, kèm các ca thất bại.
- Typecheck, lint, test và build với lệnh, SHA, thời điểm, mã thoát.
- Thay đổi schema, cách xử lý tài liệu cũ, ảnh hưởng undo/concurrency.
- Điểm cần reviewer quyết định và kế hoạch bước tiếp theo.

## 14. Nguồn tham khảo

- Autodesk Assistant in Fusion mô tả quy trình yêu cầu, xác nhận và thực thi hành động sửa mô hình. https://www.autodesk.com/products/fusion-360/blog/autodesk-assistant-in-fusion-a-step-by-step-guide/
- Cursor Rules mô tả quy tắc theo dự án và cách áp dụng thường trực. https://prod.cursor.com/docs/rules
- Anthropic phân biệt instructions, skills và enforcement bằng hooks/permissions. https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more

Các nguồn trên dùng để tham khảo cơ chế. Bộ nguyên tắc và kiến trúc trong tài liệu này là yêu cầu riêng cho Chili3D/Dunvex và cần được nghiệm thu trong dự án.

## 5. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)

- **Thời điểm:** 06/11/2026 (GMT+7). **SHA bàn giao:** điền sau commit (`git rev-parse --short HEAD`). **Mốc Đợt A:** `1a527bacdcee`.
- **Phạm vi Đợt B có hiệu lực bằng mã:**
  - `packages/ai/src/governance/` — `governTools`, permission gate, source protection, task profile (`approveTaskPlan`), ObjectStorage rules, contiguous undo task, tool matrix, status UI.
  - `packages/ai/src/tools/index.ts` — ChatPanel + bridge cùng một registry đã bọc governance.
  - `capabilityEngine` exports `normalizeOpArgs` / `lookupSessionRefNodeId`; `commandTools` timeout trung thực; prompt + ChatPanel status Đợt B.
- **Chưa có hiệu lực (Đợt C):** hậu kiểm tiêu chí, bảng dung sai Mục 5.2 đề xuất, selective inversion.
- **Test:** `packages/ai/test/governance/batchBGovernance.test.ts` (+ regression host/command/prompt/agentLoop/runtimeErrorReporter).
- **Deploy VPS:** chưa — chờ Reviewer duyệt SHA.
