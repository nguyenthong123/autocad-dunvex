# TASK-26: Chống Mất Dữ Liệu Bản Vẽ Khi Mất Mạng, Đóng Tab, Server Lỗi (Sync Data Safety)

- **Trạng thái:** `[?] WAITING_REVIEW` (Đã hoàn thiện đầy đủ kiểm thử unit, outbox retry, conflict 409, snapshot thưa; chưa deploy lên VPS, chưa kiểm chứng trên trình duyệt thật)
- **Mã Commit:** Sẽ cập nhật theo commit của tài liệu này
- **Ưu tiên:** Rất cao (Bảo vệ dữ liệu thiết kế và trải nghiệm người dùng)
- **Phụ trách:** AI Thực thi (Worker AI)

---

## 1. Bối cảnh & 6 Lỗi Đã Xác Nhận trong Mã Nguồn

Trong quá trình phân tích luồng lưu trữ và đồng bộ hóa tài liệu của Chili3D (Dunvex CAD), hệ thống đã kiểm chứng 6 lỗi nghiêm trọng trong mã nguồn có thể gây mất dữ liệu bản vẽ của người dùng:

1. **Đọc ghi đè bản local mới hơn (`packages/storage/src/apiCloudStorage.ts:73-80`):**
   - Code cũ: `ApiCloudStorage.get` luôn gọi API máy chủ trước; nếu máy chủ trả về 200 OK thì gọi ngay `this._fallback?.put(database, table, localId, data)` để ghi đè vào IndexedDB.
   - Hậu quả: Khi người dùng chỉnh sửa bản vẽ trong lúc mạng chập chờn hoặc máy chủ lỗi, bản vẽ mới đã được ghi cục bộ nhưng chưa đẩy lên server. Khi mở lại, server trả về bản cũ và ghi đè thẳng vào IndexedDB, xóa sạch toàn bộ công sức vẽ của người dùng. Đây là hiện tượng mất dữ liệu thực sự.

2. **Mất thay đổi trong 60 giây khi đóng tab/gập máy (`packages/app/src/document.ts:71-86`):**
   - Code cũ: Autosave chạy định kỳ `setInterval` 60.000 ms (1 phút) và chỉ kích hoạt khi `undoCount` thay đổi.
   - Hậu quả: Không hề có cơ chế lưu khi người dùng chuyển sang tab khác (`visibilitychange`), gập laptop (`pagehide`), hoặc đóng trình duyệt. Toàn bộ thao tác vẽ trong khoảng 60 giây trước khi đóng đều bị mất.

3. **`handleWindowUnload` không thực hiện lưu (`packages/app/src/application.ts:119-126`):**
   - Code cũ: Khi người dùng đóng tab, sự kiện `beforeunload` chỉ kiểm tra `if (this.activeView)` rồi đặt `event.preventDefault()` và `event.returnValue = ""` để bật hộp thoại xác nhận mặc định của trình duyệt, hoàn toàn không gọi `save()`.

4. **Không có hàng đợi gửi lại (Outbox Queue):**
   - Code cũ: Khi `storage.put()` gọi `fetch(url, { method: "PUT" })` bị lỗi (mất mạng, server 502/503), app chỉ log `CloudStorage put failed (saved locally in IndexedDB)`. Không hề có hàng đợi lưu trữ để tự động gửi lại khi có mạng trở lại.

5. **Không xin quyền lưu trữ bền vững (`navigator.storage.persist()`):**
   - Code cũ: Ứng dụng không bao giờ gọi `navigator.storage.persist()`. Trên các trình duyệt như Chrome/Safari trên thiết bị sắp hết bộ nhớ, trình duyệt có thể tự ý dọn dẹp (evict) IndexedDB của trang web.

6. **Ghi trùng lặp và lãng phí I/O trên server (`server/storageServer.mjs:445-515`):**
   - Code cũ: Mỗi lệnh `PUT` đều ghi bảng `projects`, xóa và chèn lại toàn bộ cây thực thể vào `cad_entities`, và chèn một bản sao đầy đủ vào `project_snapshots` (giữ 10 bản).
   - Qua rà soát mã nguồn toàn bộ repo (`git grep "cad_entities"`): Bảng `cad_entities` **hoàn toàn KHÔNG được đọc ở bất kỳ đâu** trong toàn bộ hệ thống! Mọi truy vấn `GET` đều đọc trực tiếp từ `projects.document_json`. Việc xóa và chèn lại hàng trăm thực thể mỗi lần lưu gây nghẽn nghiêm trọng cho SQLite đơn luồng.

---

## 2. Giải pháp Kỹ thuật & Các Biện pháp Đã Triển khai

### 2.1. Phía Trình duyệt (Browser / Client)

1. **So sánh phiên bản & Chống ghi đè dữ liệu cục bộ (`packages/storage/src/apiCloudStorage.ts`):**
   - Trước khi đọc từ server, kiểm tra xem bản ghi cục bộ có đang ở trạng thái `dirty` (chưa đồng bộ lên server) hay không thông qua `OutboxManager.isDirty()`.
   - Nếu local đang `dirty`: **Tuyệt đối không ghi đè local bằng bản của server**. Ưu tiên trả về bản local để bảo vệ dữ liệu người dùng.

2. **Hàng đợi Outbox lưu trữ bền vững trong IndexedDB (`packages/storage/src/outbox.ts`):**
   - Mỗi lần lưu, dữ liệu được ghi vào IndexedDB trước, đánh dấu `dirty`, và thêm vào bảng `_outbox`.
   - Outbox xử lý gửi nền lên server. Nếu gửi thành công: xóa khỏi outbox và gỡ cờ `dirty`.
   - Nếu gặp lỗi mạng/server: giữ nguyên trong outbox, tự động thử lại với thuật toán Exponential Backoff (1s, 2s, 4s, 8s, 16s, 32s, tối đa 60s kèm jitter).
   - Lắng nghe sự kiện `window.addEventListener("online")`: ngay khi trình duyệt phát hiện có mạng trở lại, outbox lập tức gửi lại toàn bộ bản vẽ đang chờ mà không cần đợi hết thời gian backoff.

3. **Lưu tức thì khi ẩn tab, đổi tab, đóng dự án (`packages/app/src/application.ts`, `packages/app/src/document.ts`):**
   - Lắng nghe sự kiện `visibilitychange` (khi `document.visibilityState === "hidden"`) và sự kiện `pagehide`.
   - Hàm `saveAllDirtyDocuments()` tự động duyệt qua tất cả các document đang mở và gọi `save()` ngay lập tức nếu có thay đổi chưa lưu (`history.undoCount() !== _lastSavedUndoCount`).
   - Khi đóng dự án (`Document.close()`), tự động lưu kèm cờ `isClosing: true`.
   - Vẫn duy trì bộ đếm autosave 60 giây định kỳ như một lớp bảo hiểm bổ trợ.

4. **Yêu cầu Lưu trữ Bền vững (`requestStoragePersistence`):**
   - Khi người dùng thực hiện lưu lần đầu tiên, app gọi `navigator.storage.persist()`.
   - Ghi nhận kết quả vào nhật ký `Logger.info`, không gây lỗi hay chặn luồng ứng dụng nếu trình duyệt không hỗ trợ hoặc từ chối.

5. **Hiển thị Trạng thái Đồng bộ Trực quan & Đa ngôn ngữ i18n:**
   - Bổ sung sự kiện `syncStatusChanged` trong `packages/core/src/foundation/pubsub.ts`.
   - Statusbar hiển thị rõ ràng 5 trạng thái:
     - `sync.saved`: "Đã lưu" (màu xanh lá `#10b981`).
     - `sync.saving`: "Đang lưu..." (màu xanh dương `#3b82f6`).
     - `sync.pending{0}`: "Chưa đồng bộ (n)" (màu cam `#f59e0b`).
     - `sync.error`: "Lỗi lưu" (màu đỏ `#ef4444`).
     - `sync.conflict`: "Xung đột phiên bản" (màu đỏ `#ef4444`).
   - Hỗ trợ đầy đủ 5 ngôn ngữ: Tiếng Việt (`vi`), Tiếng Anh (`en`), Tiếng Trung (`zh-cn`), Tiếng Nga (`ru`), Tiếng Bồ Đào Nha (`pt-br`).

---

### 2.2. Phía Máy chủ (Server Backend)

1. **Quản lý Phiên bản (`version`) & Phát hiện Xung đột (HTTP 409 Conflict):**
   - Thêm cột `version INTEGER DEFAULT 1` vào bảng `projects` trong SQLite, kèm migration tự động `ALTER TABLE projects ADD COLUMN version INTEGER DEFAULT 1`.
   - Endpoint `PUT /api/storage/:db/documents/:id` nhận `baseVersion`.
   - Nếu `baseVersion` của client khác với `version` hiện tại trên server, server trả về mã **HTTP 409 Conflict** kèm `{ error: "VERSION_CONFLICT", currentVersion, baseVersion, updatedAt }` để ngăn chặn việc người dùng này vô tình ghi đè lên phiên làm việc của người khác.
   - Nếu không có xung đột, server tăng `version = currentVersion + 1` và cập nhật `updated_at`.

2. **Loại bỏ Ghi Trùng lặp bằng Băm Nội dung (Hash Dedup):**
   - Trước khi thực hiện transaction ghi đĩa, server tính mã băm SHA-256 của `document_json` mới và so sánh với `document_json` hiện tại trong DB.
   - Nếu mã băm giống nhau 100%: server bỏ qua toàn bộ thao tác ghi đĩa, trả về ngay HTTP 200 `{ ok: true, unchanged: true, version: existing.version }`, tiết kiệm 100% chi phí I/O.

3. **Cơ chế Snapshot Thưa (Sparse Snapshots):**
   - Không còn ghi snapshot vô tội vạ sau mỗi lần bấm lưu.
   - Chỉ ghi một bản ghi mới vào `project_snapshots` nếu:
     - Dự án chưa từng có snapshot nào; HOẶC
     - Đã trôi qua ít nhất **5 phút** (300.000 ms) kể từ snapshot gần nhất; HOẶC
     - Client gửi cờ `isClosing: true` hoặc `isSnapshot: true`.
   - Luôn duy trì tối đa 10 snapshots gần nhất.

4. **Khảo sát & Đề xuất Bỏ Bảng `cad_entities`:**
   - Kết quả rà soát: `cad_entities` **không hề được đọc ở bất kỳ đâu**.
   - **ĐỀ XUẤT:** Bỏ hẳn việc ghi/xóa bảng `cad_entities` trong mỗi request `PUT` tài liệu để giải phóng hoàn toàn áp lực ghi của SQLite (cần người dùng/kiến trúc sư xác nhận vì là thay đổi cấu trúc dữ liệu).

---

## 3. Bảng Đối chiếu Lỗi - Cách Sửa - Kiểm Thử Bắt Buộc

| STT | Lỗi Đã Xác Nhận | Vị Trí Mã Nguồn | Cách Đã Sửa | Kiểm Thử Tương Ứng | Kết Quả |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 1 | **Đọc ghi đè bản local mới hơn** | `packages/storage/src/apiCloudStorage.ts:73` | Kiểm tra cờ `isDirty` qua `OutboxManager`. Nếu local có thay đổi chưa đẩy, tuyệt đối không ghi đè local và trả về dữ liệu local. | `packages/storage/test/apiCloudStorage.test.ts` (`should not overwrite local dirty data when server returns older data`) | **PASS** |
| 2 | **Mất thay đổi 60s khi ẩn/đóng tab** | `packages/app/src/document.ts:71` | Bổ sung lắng nghe `visibilitychange` (`hidden`) và `pagehide` gọi `saveAllDirtyDocuments()`. | `packages/app/test/application.test.ts` | **PASS** |
| 3 | **`handleWindowUnload` không lưu/cảnh báo** | `packages/app/src/application.ts:119` | Kiểm tra trạng thái document và outbox: chỉ kích hoạt chặn khi còn thay đổi chưa lưu hoặc outbox chưa rỗng. | `packages/app/test/application.test.ts` (`handleWindowUnload`) | **PASS** |
| 4 | **Không có hàng đợi gửi lại** | `packages/storage/src/apiCloudStorage.ts:100` | Xây dựng `OutboxManager` lưu hàng đợi trong IndexedDB `_outbox`, tự động thử lại với Exponential Backoff (1s - 60s) và lắng nghe `online`. | `packages/storage/test/outbox.test.ts` (`should keep item in outbox when send fails and report dirty`) | **PASS** |
| 5 | **Không xin quyền lưu trữ bền** | `packages/app/src/document.ts:145` | Gọi `navigator.storage.persist()` ở lần lưu đầu tiên, ghi log kết quả an toàn. | `packages/app/test/document.test.ts` | **PASS** |
| 6 | **Ghi trùng và nghẽn I/O trên server** | `server/storageServer.mjs:445` | So sánh SHA-256 hash bỏ qua ghi trùng; giãn snapshot tối thiểu 5 phút; kiểm tra version chống ghi đè (409 Conflict). | `server/test/storageServer.test.mjs` (`skips duplicate write`, `throttles snapshots to 5-minute intervals`, `returns 409 Conflict`) | **PASS** |

---

## 4. Kết quả Kiểm thử & Đánh giá Giới hạn

### 4.1. Kết quả Chạy Kiểm thử Hệ thống
- **Bộ Kiểm thử Lưu trữ & Outbox (`packages/storage/test/`):**
  - **37/37 tests pass (100%)** trong 1.81s.
  - Bao gồm test mô phỏng mất điện / khởi động lại trình duyệt: dữ liệu trong outbox vẫn tồn tại nguyên vẹn qua các phiên làm việc và tự động đồng bộ lên server khi có mạng.
- **Bộ Kiểm thử Server SQLite Backend (`server/test/`):**
  - **22/22 tests pass (100%)** trong 701 ms (13 tests Storage, 9 tests LLM Proxy).
  - Đã kiểm chứng: Tăng version khi PUT hợp lệ; Trả về HTTP 409 Conflict khi `baseVersion` cũ; Bỏ qua ghi đĩa khi băm nội dung trùng lặp; Giới hạn snapshot cách nhau 5 phút.
- **Bộ Kiểm thử Giao diện Ứng dụng & Trạng thái Đồng bộ (`packages/app/test/` & `packages/ui/test/`):**
  - `packages/app`: **85/85 tests pass (100%)** trong 1.42s.
  - `packages/ui/test/statusbar.test.ts`: **13/13 tests pass (100%)** trong 1.25s.
- **Kiểm tra Mã nguồn với Biome (`npm run check`):**
  - **0 lỗi (0 errors)** trên toàn bộ các file đã chỉnh sửa.

### 4.2. Giới hạn Cần Lưu ý
- **Chưa deploy lên VPS production `136.66.95.155`:** Tuân thủ quy định nghiêm ngặt, toàn bộ code mới chỉ chạy và kiểm thử trên môi trường local.
- **Chưa thử nghiệm trực tiếp trên trình duyệt thật (Chrome/Firefox/Safari):** Các kiểm thử đều chạy qua Rstest với Happy-DOM và Mock IndexedDB.

---

## 5. Điểm Dừng Bắt Buộc & Các Vấn Đề Cần Người Dùng / Kiến Trúc Sư Quyết Định

Theo quy định `docs/WORKFLOW.md`, hệ thống **dừng lại tại đây** để xin ý kiến chỉ đạo của Người dùng / Kiến trúc sư về các nội dung:

1. **Xác nhận Bỏ Bảng `cad_entities`:**
   - Bảng này hiện tại hoàn toàn không được đọc ở bất kỳ chức năng nào trong app hay backend.
   - Bạn có đồng ý cho phép bỏ các câu lệnh xóa và chèn vào bảng `cad_entities` trong `PUT /api/storage/` để tăng tốc độ lưu và giảm tải cho SQLite không?
2. **Quy tắc Xử lý Xung đột khi gặp HTTP 409 Conflict:**
   - Khi client nhận được 409 từ server (do có người khác hoặc phiên khác đã lưu phiên bản mới hơn), bạn muốn giao diện xử lý theo hướng nào:
     - *Lựa chọn 1 (Khuyến nghị):* Hiển thị hộp thoại hỏi người dùng: "Bản vẽ trên máy chủ đã thay đổi. Bạn muốn [Ghi đè bản này lên máy chủ] hay [Tải bản mới nhất từ máy chủ về]?".
     - *Lựa chọn 2:* Tự động lưu bản vẽ hiện tại thành một bản sao mới (ví dụ: `Tên_bản_vẽ (Bản sao xung đột)`) để bảo toàn cả hai bản.
3. **Phê duyệt Triển khai lên VPS:**
   - Bạn có đồng ý cho phép triển khai TASK-26 lên VPS `136.66.95.155` sau khi thống nhất hai câu hỏi trên không?

---

## 6. Nhật ký Thực thi & Danh sách Commit (dev branch)

- **Ngày thực hiện:** 03/11/2026
- **Các commit đã tạo theo từng nhóm việc:**
  1. [`8e7ef0db`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/storage/src/apiCloudStorage.ts): `✨ feat(storage): implement safe local read-write preventing dirty data overwrite`
  2. [`b112025b`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/storage/test/outbox.test.ts): `✅ test(storage): verify persistent outbox retry with exponential backoff and power outage resilience`
  3. [`4c1cb1a6`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/storageServer.mjs): `✨ feat(server): implement project versioning and HTTP 409 conflict detection`
  4. [`5341e37f`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/server/storageServer.mjs): `✨ feat(server): implement duplicate write avoidance via hash and sparse snapshots`
  5. [`19b89ffb`](file:///Volumes/DATA_SSD/Projects/autocad-dunvex/packages/ui/src/statusbar/statusbar.ts): `✨ feat(ui): add sync status indicators, i18n translations, and save on tab hide`
  6. Sẽ cập nhật commit tài liệu này.
