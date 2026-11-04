# TASK-39: Đổi thương hiệu hiển thị Chili3D → ZBuild và logo quả ớt đỏ → chữ Z màu vàng

> **Trạng thái:** `[ ] TODO`
> **Ưu tiên:** P1 — nhận diện thương hiệu
> **Người lập hồ sơ:** AI Quản lý / Reviewer (rà soát chỉ đọc ngày 04/11/2026, trên HEAD `679f91f4` + WIP của thợ)
> **Người thực hiện:** AI Thợ (Executor)
> **Phạm vi:** chỉ phần người dùng NHÌN THẤY và tài liệu. **Không** đổi tên nội bộ làm mất dữ liệu hoặc vi phạm giấy phép (xem mục 2).

---

## 0. Quyết định đã chốt / cần chủ dự án chốt

| # | Nội dung | Trạng thái |
|---|---|---|
| Q1 | Tên hiển thị mới: **`ZBuild`** (viết hoa Z và B). Thợ dùng đúng chuỗi này ở mọi nơi hiển thị. | Giả định của Reviewer, **chủ dự án xác nhận nếu muốn viết khác** (`Zbuild`, `ZBUILD`) |
| Q2 | Chuỗi hiển thị hiện tại **`Dunvex CAD` / `DUNVEX CAD`** (trang chủ, tiêu đề tab, hộp thoại tài khoản) có đổi sang ZBuild không? | **CHỜ CHỦ DỰ ÁN.** Mặc định: KHÔNG đổi ở nhóm A–C; thợ chỉ liệt kê vị trí ở nhóm D và dừng ở đó |
| Q3 | Logo: chữ **Z** màu vàng, nền trong suốt. Mã màu mặc định **`#FFC400`**. | Giả định, chủ dự án có thể gửi mã màu/ảnh logo khác |
| Q4 | Có đổi khóa lưu trữ trình duyệt (`chili3d-db`, `chili3d.app.*`) không? | **KHÔNG đổi trong task này** (mất dữ liệu người dùng). Chỉ làm nếu có task migration riêng |

---

## 1. Kết quả rà soát hiện trạng (Reviewer đã kiểm bằng grep, loại trừ node_modules/dist/log)

Chuỗi "chili3d" (không phân biệt hoa/thường) xuất hiện ở ~1500 file, nhưng **phần lớn là tên nội bộ không được đổi**. Chia nhóm:

### Nhóm A — Người dùng nhìn thấy trên giao diện (PHẢI đổi)
| File:dòng | Hiện tại | Đổi thành |
|---|---|---|
| `packages/i18n/src/en.ts:34` | `Or ask how to use Chili3D …` | `ZBuild` |
| `packages/i18n/src/en.ts:332` | `Chili3D User Manual` | `ZBuild User Manual` |
| `packages/i18n/src/en.ts:501` | `Welcome to chili3d` | `Welcome to ZBuild` |
| `packages/i18n/src/pt-br.ts:34`, `:468` | `Chili3D` | `ZBuild` |
| `packages/i18n/src/ru.ts:248`, `:394` | `Chili3D` / `chili3d` | `ZBuild` |
| `packages/i18n/src/zh-cn.ts:33`, `:319`, `:488` | `Chili3D` / `chili3d` | `ZBuild` |
| `packages/i18n/src/vi.ts:14` | `Sổ tay hướng dẫn Chili3D` | `Sổ tay hướng dẫn ZBuild` |
| `packages/i18n/src/vi.ts:164` | `Tải tệp xuống (.chili3d)` | Sửa nhãn cho đúng đuôi thật `.cd` (xem mục 2, hàng "đuôi file") — **không** ghi `.zbuild` |
| `packages/ui/src/dialog.ts:67` | fallback tiêu đề hộp thoại `"chili3d"` | `"ZBuild"` |
| `packages/ui/src/home/home.ts:264` | liên kết `https://github.com/xiangechen/chili3d` | Giữ link GitHub gốc nếu đó là ghi công; thay bằng link repo của dự án nếu chủ dự án muốn (hỏi Q) |
| `packages/web/src/loading.ts:52` | `Loading...` (không có tên) | Tùy chọn: thêm logo Z |
| `docs/manual/*.md` (15 file, ~28 lần) và `docs/manual/book.toml` (2 chỗ, tiêu đề sách + header PDF) | `Chili3D` / `Chili3D Pro` | `ZBuild` (giữ nguyên chữ "Pro" nếu còn ý nghĩa; xem Q) |
| `packages/ai/src/llm/prompt.ts:48` | `You are the AI assistant for Chili3D` | `ZBuild` (**bắt buộc**, đây là prompt hệ thống, AI tự xưng tên theo đây) |
| `packages/ai/src/skills/appGuide.ts:66`, `:175` | `Chili3D app guide`, `operate the Chili3D app` | `ZBuild` |
| `packages/ai/src/skills/commandGuide.ts:2766,2769,2771` | `Chili3D Command Knowledge Base` | `ZBuild` |
| `packages/ai/src/diagnostics/runtimeErrorReporter.ts:304` | tiêu đề báo cáo `Chili3D AI Assistant` | `ZBuild AI Assistant` |
| `packages/app/src/pluginManager.ts:306` | thông báo `Chili3D version … does not satisfy` | `ZBuild` (chỉ chuỗi thông báo, **không** đổi `manifest.engines.chili3d`) |
| `packages/ai/src/bridge/index.ts:49` | `update the page or chili3d-mcp` | Giữ nếu `chili3d-mcp` là tên gói thật; chỉ sửa câu chữ xung quanh |
| `README.md` | toàn bộ tiêu đề + liên kết `chili3d.com`, `chili3d.pages.dev` | Viết lại phần giới thiệu thành ZBuild; **giữ** phần ghi công dự án gốc Chili3D (xem mục 2, hàng "giấy phép") |
| `public/videos.json:6` | `chili3d的更新记录：V0.7` | Dữ liệu video cộng đồng của dự án gốc. Hỏi chủ dự án: giữ hay bỏ khỏi trang chủ |
| `plugins/*/manifest.json` | `author.name: "Chili3D Team"` | Giữ (là tác giả plugin mẫu) hoặc đổi thành `ZBuild Team` cho 4 plugin mẫu, ghi rõ chọn gì |
| Tên tệp xuất | `diagnosticTools.ts:53`, `manualReader.ts:521,535`: `chili3d-error-report-…` | `zbuild-error-report-…` (sửa cả test `runtimeErrorReporter.test.ts:232`) |
| `packages/ai/src/tools/diagnosticTools`/`stlWriter.ts:142` | tên mặc định khi xuất STL `chili3d` | `zbuild` |

### Nhóm B — Logo (quả ớt đỏ → chữ Z vàng)
Logo quả ớt là symbol `icon-chili` trong **`public/iconfont.js`** (một `<symbol id="icon-chili" viewBox="0 0 1024 1024">` với đường vẽ quả ớt), tô bằng `currentColor`. Được dùng ở 6 chỗ:

| Vị trí | File:dòng |
|---|---|
| Trang chủ (cạnh chữ `DUNVEX CAD`) | `packages/ui/src/home/home.ts:180` |
| Thanh Ribbon (góc trái) | `packages/ui/src/ribbon/ribbon.ts:98` |
| Lệnh bật/tắt chat AI | `packages/app/src/commands/aiChatCommand.ts:8` |
| Tiêu đề panel chat AI | `packages/ai/src/chatPanel.ts:669` |
| Trạng thái trống panel chat AI | `packages/ai/src/chatPanel.ts:779` |
| Mặc định của phần tử SVG | `packages/element/src/elements.ts:27` |
| Tab trình duyệt | `public/favicon.svg` (hình quả ớt, xuất từ Vectornator) + `public/index.html:10` |

Khuyến nghị thiết kế (không bắt buộc đúng từng pixel): chữ **Z** đậm, hình học, vàng `#FFC400`, nền trong suốt, nhìn rõ trên cả giao diện sáng và tối.

### Nhóm C — Tên NỘI BỘ: KHÔNG ĐƯỢC đổi trong task này
| Tên | Vì sao giữ nguyên |
|---|---|
| Scope gói `@chili3d/*` (hàng nghìn import, `package.json` của từng package, `"name": "chili3d"` ở gốc) | Đổi là sửa ~1400 file, không có lợi ích cho người dùng, rủi ro build vỡ |
| Header giấy phép `// Part of the Chili3d Project, under the AGPL-3.0 License.` trong mọi file TS, `LICENSE`, `cpp/` (LGPL, `LICENSE-chili-wasm.txt`) | **Nghĩa vụ giấy phép AGPL/LGPL** — phải giữ ghi công. Rule của `AGENTS.md`: mọi file TS bắt đầu bằng header này |
| `DBName = "chili3d-db"` (`packages/core/src/constants.ts:5`), `ObjectStorage("chili3d","app")` (`objectStorage.ts:5`, sinh khóa `chili3d.app.*`), `chili3d:ai:error_reports`, `chili3d-macros` (plugins/macro) | Đổi = người dùng mất toàn bộ bản vẽ, cấu hình AI và macro trong trình duyệt. Muốn đổi phải có task migration (đọc DB cũ → ghi DB mới) |
| Đuôi file `.cd` (`DOCUMENT_FILE_EXTENSION`), `.chiliplugin` (`PLUGIN_FILE_EXTENSION`) | Đổi làm hỏng tương thích tệp đã lưu và plugin |
| Tag custom element `chili3d-main-window`, `chili-home`, `chili-loading` + CSS `:global(chili3d-main-window …)` | Không hiển thị, đổi chỉ tăng rủi ro vỡ CSS/test |
| `__chiliTest` (cổng test dev), thư mục tạm `chili3d-verify-*`, `chili3d-scenario-*` trong `scripts/` | Nội bộ kiểm thử |
| `compose.yml`: tên service `chili3d`, volume `chili3d-data` (VPS đang chạy) | Đổi tên volume trên VPS sẽ tạo volume mới rỗng và **mất dữ liệu bản vẽ trên server**. Không đổi |
| `server/storageServer.mjs:220` đường dẫn cũ `chili3d/documents` | Tương thích dữ liệu cũ |
| `git remote upstream` = `xiangechen/chili3d` | Ghi công / đồng bộ upstream |
| Tên gói `cpp/` và file wasm `chili-wasm.*` | Artefact biên dịch |

### Nhóm D — Thương hiệu `Dunvex CAD` hiện có (CHỜ Q2, thợ chỉ liệt kê, KHÔNG sửa)
| File:dòng | Chuỗi |
|---|---|
| `packages/ui/src/home/home.ts:183` | `DUNVEX CAD` (chữ cạnh logo trang chủ) |
| `public/index.html:7,8,9` | meta keywords, author, `<title>Dunvex CAD - …` |
| `packages/i18n/src/vi.ts:119`, `:534` | `Chào mừng đến với Dunvex CAD`, `Hoặc hỏi cách sử dụng Dunvex CAD` |
| `packages/ui/src/auth/authDialog.ts:53` | `Tài khoản Dunvex CAD` |
| `server/storageServer.mjs:935` | log `Dunvex CAD SQLite Storage & Auth Server` (nội bộ) |
| `localStorage` khóa `dunvex_auth_token`, `dunvex_auth_user`, id `dunvex-auth-dialog` | **Nội bộ, không đổi** (đổi sẽ đăng xuất mọi người) |
| `docs/MAINTENANCE.md` tiêu đề | tài liệu vận hành |

Ghi chú: `public/index.html` đang gắn tên `Dunvex CAD`, không phải `Chili3D`. Nếu chủ dự án chọn Q2 = đổi hết sang ZBuild thì thợ làm nhóm D theo cùng cách và cập nhật `vi.ts`.

---

## 2. Nguyên tắc bắt buộc cho thợ

1. **Không dùng `sed -i` / thay thế hàng loạt toàn repo.** Chỉ sửa từng dòng trong bảng nhóm A, B (và D nếu Q2 xác nhận). Mỗi file sửa xong phải xem `git diff <file>`.
2. **Không đổi** bất cứ thứ gì thuộc nhóm C. Nếu cho rằng cần đổi một mục, ghi đề xuất vào mục "Phát hiện" và dừng, đừng tự làm.
3. **Giữ ghi công:** thêm (không xóa) vào `README.md` một mục `## Ghi công / Credits` nói rõ ZBuild xây trên dự án mã nguồn mở Chili3D (AGPL-3.0, tác giả gốc `xiangechen`), giữ nguyên `LICENSE`.
4. i18n: chuỗi nằm trong `packages/i18n/src/*.ts`; không đổi **khóa** (`"home.welcome"`…), chỉ đổi **giá trị**. Nếu thêm khóa mới, phải thêm vào `packages/core/src/i18n/keys.ts` và đủ 5 ngôn ngữ.
5. Test: chuỗi `Chili3D` đang được test khóa ở `packages/ai/test/commandGuide.test.ts:13` (`Chili3D Command Knowledge Base`), `runtimeErrorReporter.test.ts:125,232`, `packages/ui/test`/`element/test/elements.test.ts:188` (`#icon-chili`). Sửa test **đồng thời** với code, và không sửa test để che lỗi.
6. Đổi tên symbol `icon-chili` → `icon-zbuild` được phép **chỉ khi** sửa đủ 6 chỗ dùng + `elements.test.ts` + mock `packages/ui/test/_helpers/elementMocks.ts:127,130`. Nếu thấy rủi ro, giữ id `icon-chili` và chỉ thay nội dung hình (cách an toàn hơn, **khuyến nghị**).
7. UI/logo: nạp skill `impeccable` theo hướng dẫn của hệ thống nếu có; kiểm Light/Dark, kích thước 16/32/64px, không méo, không có nền trắng trong tab trình duyệt.

---

## 3. Việc cần làm (chi tiết từng bước)

### Bước 1 — Logo
1. Thiết kế SVG chữ **Z** vàng `#FFC400`, viewBox `0 0 1024 1024`, nền trong suốt, một `<path>`, bo/cắt vuông theo đồng nhất.
2. Trong `public/iconfont.js`: thay **nội dung** `<symbol id="icon-chili" …>` (chỉ symbol này, giữ nguyên ~hàng trăm symbol còn lại). Nếu symbol hiện tô theo `currentColor`, thêm `fill="#FFC400"` trực tiếp vào path để màu vàng không đổi theo chủ đề.
3. Thay `public/favicon.svg` bằng chữ Z vàng (có thể kèm nền bo góc tối `#1b1b1b` để nổi trên tab sáng; ghi lựa chọn vào nhật ký).
4. Kiểm CSS đè màu: `home.module.css` (`& .logo svg { fill: currentColor; color: var(--foreground-color) }`), `ribbon.module.css`, `chatPanel.module.css` (`.titleIcon`, `.emptyIcon`). Nếu CSS ép `fill: currentColor` làm Z mất màu vàng, sửa selector để giữ vàng (hoặc để Z kế thừa `fill` từ symbol).
5. Chụp ảnh thật: trang chủ, ribbon, panel chat AI (tiêu đề + trạng thái trống), tab trình duyệt, ở cả giao diện sáng và tối. Lưu `docs/tasks/TASK-39-evidence/screens/`.

### Bước 2 — Chữ hiển thị (nhóm A)
Sửa từng dòng theo bảng nhóm A. Sau đó:
```bash
# danh sách còn lại phải chỉ gồm nhóm C và phần được giữ có chủ đích
grep -rIn -i "chili3d\|chili 3d" packages/*/src public docs/manual README.md plugins/*/manifest.json \
  | grep -v "@chili3d/\|Part of the Chili3d Project\|chili3d-db\|chili3d\.app\|chili3d-main-window\|chili3d-macros\|chili3d:ai" \
  > docs/tasks/TASK-39-evidence/remaining-chili3d.txt
```
Mọi dòng còn lại trong file này phải được giải thích (giữ vì nhóm C / ghi công / chờ Q) trong nhật ký.

### Bước 3 — Prompt AI & kiến thức AI
Sửa `prompt.ts`, `appGuide.ts`, `commandGuide.ts` (nhóm A). Chạy `npx rstest packages/ai`. Kiểm bằng test: prompt hệ thống chứa `ZBuild` và không chứa `Chili3D`.

### Bước 4 — Sổ tay
Sửa 15 file `docs/manual/*.md` + `book.toml`; ảnh trong `docs/manual/images/` có thể chứa logo/ tên cũ: liệt kê, **không** bắt buộc chụp lại (ghi `CHƯA KIỂM`/để task sau). Kiểm ManualReader vẫn hiển thị sổ tay (đã dựng ở TASK-35).

### Bước 5 — Kiểm toàn bộ
```bash
npx rstest packages/ai packages/ui packages/element packages/i18n packages/web > docs/tasks/TASK-39-evidence/rstest.log 2>&1; echo "EXIT=$?" >> docs/tasks/TASK-39-evidence/rstest.log
npm run test  ; npm run check ; npm run build ; npx tsc --noEmit -p . ; git diff --check
```
Mỗi lệnh một log có dòng `EXIT=`, đầu log ghi `git rev-parse HEAD`; chạy **sau** lần sửa code cuối và **sau** commit code. Số warning Biome không được tăng so với baseline ghi trong TASK-36.

### Bước 6 — Kiểm trên app thật (dev server `npm run dev`, cổng 8080)
Dùng headless Chrome (như `scripts/verifyTask37RealApp.mjs`) hoặc kiểm tay, ghi lại:
- `document.title` và icon tab.
- Trang chủ: chữ + logo Z vàng; mục "Welcome" đúng ngôn ngữ (đổi 5 ngôn ngữ, mỗi ngôn ngữ chụp 1 ảnh hoặc ghi chuỗi).
- Mở sổ tay: tiêu đề đã là ZBuild.
- Mở panel chat AI: tiêu đề + trạng thái trống; gửi câu hỏi giả không cần LLM → chỉ kiểm giao diện. Phần xưng tên của AI thật `CHƯA KIỂM — thiếu khóa LLM`.
- **Tương thích dữ liệu:** mở trang với dữ liệu IndexedDB cũ (`chili3d-db`) vẫn thấy dự án cũ trong "Dự án gần đây" (chứng minh Q4 không làm mất dữ liệu).

---

## 4. Tiêu chí nghiệm thu (Reviewer sẽ kiểm độc lập, không tin báo cáo)

| # | Tiêu chí | Cách Reviewer kiểm |
|---|---|---|
| N1 | Không còn chuỗi hiển thị `Chili3D`/`chili3d` ngoài danh sách ngoại lệ đã giải thích | `grep` lại như Bước 2, đối chiếu `remaining-chili3d.txt` |
| N2 | Logo Z vàng ở đủ 7 vị trí (6 `icon-chili` + favicon) | Xem ảnh trong `screens/` + mở app tại cổng 8080 |
| N3 | Nhóm C **không** bị đổi | `git diff --stat` + grep: `chili3d-db`, `DOCUMENT_FILE_EXTENSION`, `@chili3d/*`, header giấy phép, `compose.yml` không đổi |
| N4 | Test + build + check + tsc đạt, log `EXIT=0` sau commit cuối | Mở log, so SHA và giờ file với giờ commit |
| N5 | README có mục ghi công, `LICENSE` không đổi | `git diff LICENSE README.md` |
| N6 | Dự án cũ trong IndexedDB vẫn mở được | Ảnh/log Bước 6 |
| N7 | Sổ tay hiển thị được, tên ZBuild | Ảnh |
| N8 | Không có bí mật, không đổi `documentVersion`, không push/deploy | `git diff package.json`, `git status` |

## 5. KHÔNG ĐƯỢC LÀM
- Không `sed -i` hàng loạt; không đổi nhóm C; không đổi `documentVersion`.
- Không xóa header giấy phép, không sửa `LICENSE`.
- Không push, không deploy, không sửa `.env`.
- Không tự đánh `[x] DONE`; chỉ `[?] WAITING_REVIEW` sau khi có đủ log và ảnh.
- Không bịa kết quả: phần chưa chạy ghi `CHƯA KIỂM`.

## 6. Nhật ký Thực thi & Báo cáo Thay đổi (Execution Log)
*(Thợ điền: ngày giờ, SHA thật, file + hàm đã sửa, tên test, đường dẫn log, `CHƯA KIỂM:`, `CHƯA DEPLOY`.)*
