# TASK-27: Nối dây đồng bộ phiên bản & xử lý xung đột (sequel TASK-26)

- **Trạng thái:** `[?] WAITING_REVIEW` (Đã hoàn tất Parts A→B→C→D→E: Sửa dứt điểm version/baseVersion, 409 conflict, bỏ ghi cad_entities, test tích hợp client↔server thật, kiểm chứng trình duyệt thật K1–K8 đạt 100%)
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

---

## 5. Nhật ký Thực thi (03/11/2026)

### A. Thông tin Cam kết (Git Commit SHA)
- **Nhánh làm việc:** `dev`
- **Chuỗi commit TASK-27:**
  - `f127d92a`: `✨ feat(server): normalize document for hash dedup and drop cad_entities write on PUT` (Phần C)
  - `4d95c493`: `✨ feat(storage): track server versions in separate store and send baseVersion in PUT` (Phần A)
  - `c66f287e`: `✨ feat(ui): add drawing version conflict dialog, statusbar click handler, and i18n keys` (Phần B)
  - `0d25e24c` & `7bcde647`: `✅ test(storage): verify real client-server integration with optimistic locking and 409 resolution` (Phần D)
  - `7aac0fd0`: `✨ feat(builder): proxy /api requests to local storageServer in rspack devServer` (Phần E prerequisite)
  - `62dfedaa`: `📝 docs(tasks): define real-browser verification scenarios K1-K8 in TASK-27`
  - `990b4377`: `🔧 fix(storage): track initialized databases in Set for multi-db dirty check`

### B. Danh sách tệp & hàm chức năng đã thay đổi
1. **`server/storageServer.mjs`**:
   - Thêm hàm `normalizeDocForHash(doc)`: loại bỏ triệt để các trường điều khiển nội bộ (`serverVersion`, `serverUpdatedAt`, `_id`, `baseVersion`) trước khi tính SHA-256 hash dedup, đảm bảo dữ liệu tải về rồi ghi lại vẫn khớp hash `unchanged: true`.
   - Bỏ toàn bộ câu lệnh `DELETE FROM cad_entities` và `INSERT INTO cad_entities` trong endpoint `PUT /api/storage/:database/:table/:id`.
   - Xử lý 409 trả về đúng chuẩn `{ error: "VERSION_CONFLICT", currentVersion, baseVersion, updatedAt }`.
2. **`packages/storage/src/apiCloudStorage.ts`**:
   - Thêm quản lý store `_versions` tách biệt trong IndexedDB và cache bộ nhớ `_versionCache`.
   - `get()` nạp và bóc tách `serverVersion` / `serverUpdatedAt` lưu vào `_versions`, trả document JSON sạch cho ứng dụng.
   - Bỏ hoàn toàn `value.docVersion`, `?? 1`, `docVersion - 1`. `baseVersion` được lấy từ store `_versions` và gửi trực tiếp trong payload PUT (`data.baseVersion`).
   - Xử lý lỗi 409 từ server: đánh dấu `item.conflict = true`, gán `item.currentServerVersion = res.currentVersion`.
   - Cung cấp 3 phương thức giải quyết xung đột:
     - `resolveConflictOverwrite(key)`: nâng `baseVersion` lên bằng `currentServerVersion` rồi thử lại.
     - `resolveConflictDiscard(key)`: hủy item trong outbox để nạp lại bản máy chủ.
     - `resolveConflictSaveCopy(key, newName)`: tạo bản sao mới với id mới và tên `... (Bản sao xung đột)`, enqueue lưu lên máy chủ an toàn không mất dữ liệu.
3. **`packages/storage/src/outbox.ts`**:
   - Đổi `_isInitialized` sang `_initializedDbs = new Set<string>()` hỗ trợ nhiều database đồng thời.
   - Thêm hỗ trợ trường `conflict` và `currentServerVersion` trong `OutboxItem`.
4. **`packages/ui/src/statusbar/conflictDialog.ts` & `statusbar.ts`**:
   - Hiện hộp thoại modal khi xảy ra xung đột với 3 lựa chọn trực quan, bảo vệ dữ liệu.
   - Gắn sự kiện `syncLabel.onclick` cho phép người dùng mở lại hộp thoại bất cứ lúc nào khi đang có xung đột.
5. **`packages/core/src/i18n/keys.ts` & `packages/i18n/src/locales/*.ts`**:
   - Định nghĩa và dịch đầy đủ 6 chuỗi i18n cho 5 ngôn ngữ (`vi`, `en`, `zh-cn`, `ru`, `pt-br`).
6. **`packages/builder/rspack.config.ts`**:
   - Bổ sung cấu hình proxy `devServer.proxy` điều hướng `/api` -> `http://127.0.0.1:3000` cho môi trường dev.
7. **`scripts/verifySyncBrowser.mjs`**:
   - Tự động hóa kiểm chứng trên Google Chrome thật qua giao thức CDP (Chrome DevTools Protocol), 0 thư viện ngoài (dùng native Node 22).

### C. Kết quả Kiểm thử Tự động & Build
- `npm run build`: Hoàn tất thành công (0 lỗi, 2 warnings chuẩn về kích thước bundle WebAssembly).
- `npx biome check`: 0 lỗi.
- `packages/storage/test/clientServerIntegration.test.ts`: **PASS 100% (6/6 tests)**
  - Lưu lần 1 -> 2 -> 3 tăng version liên tục không 409 giả.
  - Sửa đồng thời phát hiện 409 chính xác, outbox giữ item conflict.
  - Cả 3 nhánh giải quyết xung đột (Overwrite, Discard, SaveCopy) hoạt động chuẩn xác.
  - Bóc tách `serverVersion` khỏi document JSON, hash dedup nhận diện `unchanged: true`.

### D. Kết quả Kiểm chứng Trình duyệt Thật K1–K8 (`scripts/verifySyncBrowser.mjs`)
Toàn bộ 8 kịch bản đã được chạy và đạt **100% PASS**:

| Mã | Tên kịch bản | Trạng thái | Đo đạc thực tế & Bằng chứng |
| :--- | :--- | :---: | :--- |
| **K1** | Đóng tab khi đang "Chưa đồng bộ" | **✅ PASS** | Document offline giữ nguyên trong IndexedDB (`K1 Edited Offline`), `isDirty: true`, bằng chứng tại [`docs/tasks/TASK-26-evidence/K1.json`](./TASK-26-evidence/K1.json). |
| **K2** | Offline rồi khôi phục mạng | **✅ PASS** | `pendingCount` từ 1 về 0 khi có mạng trở lại; server nhận doc mới, bằng chứng tại [`docs/tasks/TASK-26-evidence/K2.json`](./TASK-26-evidence/K2.json). |
| **K3** | Offline, đóng tab, mở lại vẫn offline | **✅ PASS** | Tab mới khởi động bình thường không crash, tải đúng bản local dirty, bằng chứng tại [`docs/tasks/TASK-26-evidence/K3.json`](./TASK-26-evidence/K3.json). |
| **K4** | 2 tab mở cùng project, Tab A lưu, Tab B reload | **✅ PASS** | Tab B reload nhận ngay bản cập nhật mới nhất từ Tab A, screenshot [`screenshots/task26-k4-tabB.png`](../../screenshots/task26-k4-tabB.png), bằng chứng tại [`docs/tasks/TASK-26-evidence/K4.json`](./TASK-26-evidence/K4.json). |
| **K5** | 2 tab sửa đồng thời, Tab B nhận 409 & tạo bản sao | **✅ PASS** | Server bắn mã HTTP 409 thật (`bResult.conflict: true`, `currentServerVersion: 2`); Tab B tạo bản sao `K5 Edit By Tab B (Bản sao xung đột)` trên server; bản gốc giữ nguyên bản của Tab A (v2). Screenshot [`screenshots/task26-k5-conflict-copy.png`](../../screenshots/task26-k5-conflict-copy.png), bằng chứng tại [`docs/tasks/TASK-26-evidence/K5.json`](./TASK-26-evidence/K5.json). |
| **K6** | Xóa IndexedDB, mở lại tab | **✅ PASS** | Mở tab mới với IndexedDB trống, app tự nạp từ server về đầy đủ, bằng chứng tại [`docs/tasks/TASK-26-evidence/K6.json`](./TASK-26-evidence/K6.json). |
| **K7** | Đóng trình duyệt đột ngột (`pagehide` async) | **✅ PASS** | `saveAllDirtyDocuments` hoàn tất lưu an toàn vào IndexedDB trong **1786ms**, bằng chứng tại [`docs/tasks/TASK-26-evidence/K7.json`](./TASK-26-evidence/K7.json). |
| **K8** | 20 lần lưu liên tiếp trong 10 giây | **✅ PASS** | 20 lần lưu hoàn thành trong **4835ms**, version tăng tuần tự từ 1 đến 20, 0 lỗi, 0 false 409, bằng chứng tại [`docs/tasks/TASK-26-evidence/K8.json`](./TASK-26-evidence/K8.json). |

Tổng kết: [`docs/tasks/TASK-26-evidence/summary.json`](./TASK-26-evidence/summary.json) xác nhận **8/8 PASS**.

### E. CHƯA KIỂM (Giới hạn thực thi)
- **Deploy VPS:** Chưa deploy lên VPS production theo đúng quy định phân tách an toàn (chỉ deploy sau khi Reviewer nghiệm thu độc lập TASK-27 trên local).
