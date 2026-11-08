# BUG TASK-40 — nhiễm `localStorage` làm đỏ bộ test toàn repo (repro + hướng xử lý)

**Người nhận:** AI phụ trách TASK-40 (packages/ai governance).
**Trạng thái PDF v1:** đã nghiệm thu tại tip `2c72ecec` — phạm vi `docs/tasks/pdf-export-v1` + `packages/*/pdf` **không được đụng tới** khi sửa bug này.
**Chốt VPS:** chỉ gửi khi `npm run test` toàn repo xanh — hiện CHƯA xanh vì bug này.

## Triệu chứng (bằng chứng thật, không suy đoán)
- `hermes verify --json` tại tip `2c72ecec`: phase `test` exit 1; **đúng 1 test fail**:
  `packages/ai/test/governance/batchBGovernance.test.ts :: TASK-40 Batch B governance > rules change after approval revokes write rights and requires a new plan`
- Lỗi: `TypeError: Cannot read properties of undefined (reading 'getItem')` tại
  `packages/core/src/foundation/objectStorage.ts:25` (và `removeItem` tại dòng 40),
  chuỗi gọi qua `packages/ai/src/governance/rulesStore.ts:215`, điểm nổ `batchBGovernance.test.ts:692`.
- Nghĩa là `globalThis.localStorage` = **undefined** khi rulesStore chạy.

## Đã loại trừ (kết quả chạy thật, đừng mất thời gian lặp lại)
| Lệnh | Kết quả |
|---|---|
| `npx rstest packages/ai/test/` (cả package ai) | 750 passed, 0 failed |
| `npx rstest packages/ai/test/governance/` | 25 passed, 0 failed |
| `npx rstest objectStorage.test.ts appBuilder.test.ts batchBGovernance.test.ts` (2 thứ tự) | pass hết (67, 41) |
→ Fail **chỉ tái hiện với `npm run test` cả repo** (worker scheduling ghép file nhiễm vào cùng realm với file ai). Lệnh repro chuẩn: `npm run test` (tái hiện 1/1 lần tại 2c72ecec qua hermes verify; có thể phụ thuộc số worker — chạy 2–3 lần nếu trượt).

## Root cause (đọc từ mã nguồn — file gây nhiễm KHÔNG thuộc ai)
1. `packages/core/test-utils/localStorageMock.ts` (mockLocalStorage):
   `Object.defineProperty(global, "localStorage", { value: proxy, writable: true })` — **thiếu `configurable: true`** (mặc định false) → property bị thay thế vĩnh viễn khỏi realm, happy-dom không khôi phục được.
2. `packages/core/test/objectStorage.test.ts` (dòng ~15–19) và `packages/builder/test/appBuilder.test.ts` (dòng ~49–53):
   `afterEach → Object.defineProperty(global, "localStorage", { value: undefined, writable: true })`
   → để lại **`localStorage = undefined`** trong global; file sau chạy cùng worker (batchB → rulesStore → ObjectStorage) nổ.

## Hướng sửa đề xuất (người nhận quyết định phương án)
- A (gọn nhất, sửa test-utils + 2 file test core/builder): mock dùng `configurable: true`; `afterEach` **khôi phục descriptor gốc** (lưu `Object.getOwnPropertyDescriptor(globalThis,"localStorage")` trong `beforeAll`, restore trong `afterAll`) thay vì gán `undefined`.
- B (phòng thủ phía bị hại): batchB test tự cài `localStorage` stub cấu hình được trong `beforeEach`, hoặc rulesStore nhận storage injection trong test.
- Nên làm cả A (gốc) + cân nhắc B (cách ly).
- **Không** đổi `rstest.config.ts` thành serial-only để né — che triệu chứng, làm chậm suite.

## Phạm vi & luật
- Chỉ sửa trong `packages/core/test*`, `packages/builder/test*`, `packages/ai/test|src/governance` nếu cần cách ly. Cấm đụng `packages/*/pdf`, `docs/tasks/pdf-export-v1` (đã nghiệm thu, tip `2c72ecec`).
- Không đụng tiến trình/headless Chrome của AI khác; chỉ chạy `npm run test`.
- **Windows vẫn CHƯA có môi trường kiểm tra** (PDF v1): khi bàn giao kèm xác nhận Windows hoặc ghi rõ CHƯA KIỂM.

## Tiêu chí nghiệm thu của ticket
1. `npm run test` xanh **2 lần liên tiếp** tại tip sửa (dán exit code + summary Tests vào ticket/ROADMAP).
2. Không còn `defineProperty(... "localStorage" ...)` nào thiếu `configurable` trong test-utils.
3. Không đổi hành vi runtime (src app) ngoài test; PDF v1 không đổi.
Bàn giao: commit `ID`/prefix 🐛+📝 như quy ước repo, kèm lệnh + exit code thật.

---

## Nhật ký xử lý (Hermes, 08/11/2026)

- **SHA fix:** `918d0b670f57c8a8c83c490835298e20c613f347` — 🐛 fix(core): cô lập mock + restore descriptor gốc (`localStorageMock.ts` capture descriptor lần install đầu, `configurable: true`, export `restoreLocalStorage()`; `objectStorage.test.ts` + `appBuilder.test.ts` bỏ gán `undefined`, dùng restore; test hồi quy mới `packages/core/test/localStorageMock.test.ts` 5 ca, gồm ràng buộc accessor của happy-dom).
- **npm run test trên đúng SHA đó (tree sạch):** RUN 1 → `failedFiles: 0, failedTests: 0, passedTests: 10269`, exit 0 · RUN 2 (liền sau đó, `git status` 0 thay đổi) → cùng số, exit 0. Server tests (`node --test`) gộp trong `npm run test` cũng exit 0.
- `tsc -p tsconfig.json --noEmit` exit 0 (trước commit) · `biome check` no fixes.
- **Tiêu chí 2:** không còn `defineProperty(..."localStorage"...)` thiếu `configurable` trong test-utils; các file test chỉ dùng install/restore cặp đôi.
- Phạm vi: chỉ test-utils + 3 file test + 1 file test mới; **0 dòng app code**; PDF v1 (`2c72ecec`) không đụng.
- LLM/`batchBGovernance`: không sửa gì phía ai — victim pass trong full suite nhờ gốc được sửa.

## Follow-up — 08/11/2026 sau: ticket MỞ LẠI vì `hermes verify` vẫn đỏ (Hermes)

`hermes verify` chạy `npm run test` với phân công file→worker đông hơn (74s so với ~200s),
bắt gặp collision mà hai lần chạy xanh trên `918d0b67` chưa chạm phải:
`batchBGovernance > approved plan then interleaved edit...` vẫn `localStorage` undefined.
→ Fix v1 chưa đủ: **capture một lần per module-instance vẫn khóa "bản gốc" sai** khi file
đầu tiên trong worker capture lúc binding đã bẩn, và `config.test.ts`/`navigation.test.ts`
install mock mà **không bao giờ restore**.

Đã làm (test-utils/test-only, không app code):
1. `localStorageMock.ts` — hợp đồng v2 THEO OWNERSHIP: re-capture mỗi lần realm không còn
   giữ đúng mock của mình; `restoreLocalStorage()` chỉ rewind binding do mình cài,
   không bao giờ xóa/thay binding lạ (đường dẫn `delete` mù đã bị cắt).
2. `config.test.ts` + `navigation.test.ts`: thêm `afterEach(restoreLocalStorage)`.
3. `setup.ts` (global setup, chạy cho MỌI file): `beforeEach` repair — nếu realm mất
   storage khả dụng thì gắn lại in-memory mới; binding lành không bị đụng. Đây là lưới
   an toàn chống mọi file gây nhiễm tương lai, không thay điều tra gốc.
4. Test ghim mới trong `localStorageMock.test.ts`: restore không được rewind/xóa binding
   đã bị chủ khác chiếm (7 ca).

Bằng chứng: probe tổng hợp (file cài `localStorage = undefined` + governance suite,
`--pool.maxWorkers 1`) → 51/51 xanh nhờ repair; combo 12 file nhiễm/tải 303/303 xanh;
`tsc` 0, `biome` 0, `npm run test` exit 0 (10295 passed / 0 failed). CHƯA KIỂM (tiếp):
danh tính file gây nhiễm gốc trong full-suite — đã được repair chặn đứng ở biên test;
Windows chưa có môi trường.


## Ghi nhận chốt ticket — 08/11/2026 (Hermes)

- Fix v2: **`1d2ef2a0b77055cc91266e2dbfb58db660f8410c`** (`🐛 fix(core): ownership-based localStorage mock + per-test realm repair`).
- Hai lần `npm run test` LIÊN TIẾP trên đúng `1d2ef2a0`: **10295 passed / 0 failed, exit 0** cả hai (log tạm `/tmp/ls3_r1.log`, `/tmp/ls3_r2.log`).
- `hermes verify --json` trên HEAD chốt (`1d2ef2a0` + chore `.gitignore` ignore `.hermes/`): **ok=true** — bootstrap 0, build 0, `npm run test` 0 (kể cả stage `node --test` server), `npm run check` 0, readiness `http://127.0.0.1:8080/` = **HTTP 200** rồi graceful teardown.
- Phát sinh khi verify: recipe auto-detect xếp `npm run format` vào nhóm test; script này là MUTATOR (biome --write, clang-format -i) và clang-format@1.8.0 chỉ bundle binary `darwin_x64` → spawn lỗi errno -86 trên host arm64 (chưa có Rosetta) — crash xảy ra TRƯỚC khi đụng file cpp (git status sạch). Manifest curated `.hermes/environment.json` (local, không commit) loại `format` khỏi verification, giữ `test` + `check`.
- Trạng thái ticket: **ĐÃ XỬ LÝ — chờ Reviewer đóng.** Phạm vi: test-utils/test/docs/.gitignore; app code và vùng PDF `2c72ecec` không đổi. Windows: chưa có môi trường, ghi nhận chờ.
