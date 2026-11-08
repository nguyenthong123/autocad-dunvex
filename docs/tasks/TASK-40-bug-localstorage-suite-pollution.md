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
