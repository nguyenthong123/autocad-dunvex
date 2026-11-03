# TASK-27: Nối dây đồng bộ phiên bản & xử lý xung đột (sequel TASK-26)

- **Trạng thái:** `[~] IN_PROGRESS`
- **Ưu tiên:** Rất cao (TASK-26 bị Reviewer trả vì 409 không chạy thật)
- **Phụ trách:** AI Thực thi (Worker)
- **Điều kiện:** KHÔNG deploy VPS. Chỉ local.

## 1. Bối cảnh (đã xác minh bằng đọc code, xem TASK-26 mục 7)
- `apiCloudStorage.ts:195` lấy `baseVersion` từ `value.docVersion` — không nơi nào gán `docVersion`.
- `sendToServer` gửi `JSON.stringify(item.value)`; `item.baseVersion` không vào body → server (`storageServer.mjs:454`) nhận `null` → bỏ qua kiểm tra → **không bao giờ 409**.
- Client không đọc `version` (PUT trả) / `serverVersion` (GET chèn).
- Conflict hiện chỉ là chữ trên Statusbar, không có lối thoát.

## 2. Yêu cầu

### A. Theo dõi version ở client
1. Lưu `version` server cho mỗi bản ghi (đề xuất: bảng IndexedDB `_versions` hoặc field trong outbox/meta, KHÔNG nhét vào document JSON để khỏi làm lệch hash dedup).
2. `get()` thành công từ server → ghi version (từ `serverVersion`) và **loại bỏ `serverVersion`/`serverUpdatedAt` khỏi data** trước khi cache/trả cho Document.
3. PUT thành công → cập nhật version mới từ response (`version`). Bản ghi mới (chưa có version) → không gửi `baseVersion`.
4. Gửi `baseVersion` **đúng cách**: đưa vào header `If-Match`/query hoặc field body riêng, nhưng server phải đọc đúng và hash dedup phải tính trên document đã bỏ field điều khiển. Chọn 1 cách, ghi rõ trong log.
5. Bỏ mặc định `?? 1` và công thức `docVersion - 1`.

### B. Xử lý 409 (Chủ dự án chọn Lựa chọn 1 ở TASK-26)
1. Khi outbox có item `conflict`, hiện hộp thoại: **[Ghi đè lên máy chủ]** (gửi lại với baseVersion = currentVersion server trả về trong 409) · **[Tải bản máy chủ về]** (bỏ item outbox, ghi đè local, nạp lại doc) · **[Lưu thành bản sao]** (đổi id/tên `Tên (Bản sao xung đột)`, enqueue như bản mới, rồi tải bản server).
2. Chuỗi i18n đủ 5 ngôn ngữ (vi, en, zh-cn, ru, pt-br).
3. Statusbar `sync.conflict` bấm vào được mở hộp thoại.
4. Không được mất dữ liệu ở bất kỳ nhánh nào: bản local bị bỏ phải còn ít nhất trong snapshot/bản sao cho tới khi người dùng chọn.

### C. Server
1. Bỏ `DELETE/INSERT cad_entities` trong PUT (đã được Reviewer đồng ý). Giữ bảng, không DROP, không migration phá.
2. Hash dedup tính trên document đã chuẩn hoá (bỏ field điều khiển).
3. Response 409 giữ nguyên `{error, currentVersion, baseVersion, updatedAt}`.

### D. Test (bắt buộc, assert hành vi)
1. **Test tích hợp client↔server thật:** khởi `storageServer` trên cổng ngẫu nhiên + `ApiCloudStorage` với `fetch` thật (không tự nhét baseVersion). Kịch bản: lưu A lần 1 → lần 2 → lần 3 đều 200 (không 409 giả); thiết bị B lưu xen vào → A lưu tiếp nhận 409 → outbox `conflict` → 3 nhánh hộp thoại đều đúng dữ liệu.
2. Test: GET không để lọt `serverVersion` vào data/ cache; dedup vẫn `unchanged:true` khi lưu lại y hệt.
3. Test unit hộp thoại conflict (3 nút) + i18n key đủ 5 ngôn ngữ.
4. Chạy: `npm run test`, `npm run build`, `npx biome check` trên file đã sửa (nêu rõ số warning, không được tăng so với trước).

### E. Kiểm chứng trình duyệt thật (làm SAU A–D)
1. Cho phép thêm `devServer.proxy` `/api` → `http://127.0.0.1:3000` trong `rspack.config.ts` (chỉ dev; không đụng build production/nginx).
2. Viết `scripts/verifySyncBrowser.mjs` thuần CDP (tái dùng class `Cdp`/`withChrome` trong `scripts/scenario.mjs`, 0 dependency mới) chạy kịch bản K1–K8 (offline, khôi phục mạng, ẩn/đóng tab, 2 tab xung đột, mất điện...).
3. **Bảng định nghĩa kịch bản kiểm chứng K1–K8:**

| Mã | Tên kịch bản | Các bước thực hiện | Kết quả mong đợi | Cách đo đạc & kiểm chứng |
| :--- | :--- | :--- | :--- | :--- |
| **K1** | Đóng tab khi đang "Chưa đồng bộ" | Mở tab Chrome, load doc, chặn route API storage, sửa doc (status `pending`), đóng tab ngay lập tức. Mở lại tab mới. | Nội dung sửa đổi trước khi đóng tab còn nguyên trong IndexedDB và hiển thị lại. | So sánh tên/hash doc sau khi mở lại; kiểm tra outbox giữ nguyên item chưa gửi. |
| **K2** | Offline rồi khôi phục mạng | Chặn route `/api/storage/` qua CDP. Sửa và lưu doc (vào outbox `pending`). Bật lại mạng + dispatch `online`. | Outbox tự động flush lên server, `pendingCount === 0`, server có nội dung mới, version tăng. | Kiểm tra `getPendingSyncCount() === 0`, fetch server kiểm tra nội dung và version. |
| **K3** | Offline, đóng tab, mở lại vẫn offline | Offline, sửa doc, đóng tab. Vẫn offline, mở tab mới truy cập lại project. | Tải bản local từ IndexedDB, không bị lỗi mạng làm sập app, không bị server cũ đè. | Đọc nội dung document trong tab mới, đối chiếu với bản sửa trước khi đóng. |
| **K4** | 2 tab mở cùng project, Tab A lưu, Tab B reload | Tab A và B cùng mở 1 project. Tab A sửa và lưu lên server. Tab B (chưa sửa) được reload. | Tab B tải bản mới nhất của Tab A từ server về, không bị cache cũ đè mất bản A. | Kiểm tra tên/nội dung document trên Tab B sau reload khớp với bản Tab A vừa lưu. |
| **K5** | 2 tab sửa đồng thời, Tab B nhận 409 & tạo bản sao | Tab A và B mở doc ở v1. Tab A sửa và lưu -> v2. Tab B sửa và lưu với baseVersion 1 -> nhận 409. Chọn [Lưu thành bản sao]. | Tab B nhận 409, tạo bản sao mới `... (Bản sao xung đột)` trên server; bản A trên server giữ nguyên v2. | Kiểm tra mã HTTP 409, kiểm tra bản sao mới tồn tại trên server, bản gốc giữ nguyên bản A. |
| **K6** | Xóa IndexedDB, mở lại tab | Lưu doc lên server thành công. Đóng tab. Xóa sạch IndexedDB qua CDP. Mở lại tab. | App tự động nạp từ server về, tái tạo lại cache IndexedDB, không mất dữ liệu. | Đọc document sau khi mở lại, so sánh dữ liệu với server. |
| **K7** | Đóng trình duyệt đột ngột (`pagehide` async) | Sửa document (dirty state), không bấm lưu thủ công, đóng ngay tiến trình trình duyệt. | Đo giới hạn thật: kiểm tra `pagehide` có kịp ghi IndexedDB trước khi process bị kill không. | Mở lại browser, đọc IndexedDB kiểm tra dữ liệu; ghi nhận số liệu và giải thích giới hạn. |
| **K8** | 20 lần lưu liên tiếp trong 10 giây | Vòng lặp 20 lần sửa và gọi `put()` liên tiếp trong 10 giây trên cùng 1 document. | Không có partial write, version tăng đúng thứ tự, không có false 409, bản cuối cùng khớp lần sửa 20. | Kiểm tra tính toàn vẹn JSON server, version cuối cùng, kiểm tra không có false 409. |

4. Số liệu/log lưu `docs/tasks/TASK-26-evidence/`. Kịch bản nào FAIL thì ghi FAIL trung thực, không chỉnh ngưỡng cho pass. K7 (pagehide async) đo giới hạn thật, không hứa 100%.
5. KHÔNG để server tự tạo bản ghi `${id}_conflict_*` trong bảng `projects` (làm bẩn danh sách dự án). Bản sao xung đột do CLIENT tạo theo nhánh B3.

### F. Ghi nhận không làm
- Không deploy. Không DROP bảng. Không sửa acceptance/test cũ để che lỗi (nếu test cũ sai vì bug này thì sửa test và giải thích).

## 3. Báo cáo bàn giao (bắt buộc)
Cuối file này thêm `## 5. Nhật ký Thực thi` theo ROADMAP 4.2: SHA thật (`git rev-parse --short HEAD`), danh sách file/hàm đã sửa, test thêm + kết quả, mục **CHƯA KIỂM** (trình duyệt thật, VPS). Chuyển `[?] WAITING_REVIEW` ở cả ROADMAP.md và file này. KHÔNG tự đánh DONE.

## 4. Tiêu chí Reviewer sẽ kiểm
Tự chạy lại test tích hợp; tự `grep` xác nhận không còn `docVersion`/`?? 1`; đọc diff xác nhận body PUT thật có version; thử luồng 2 thiết bị bằng script.
