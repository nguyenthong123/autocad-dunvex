# TASK-40 Đợt C — Phương án triển khai (chờ Reviewer duyệt)

> **Ngày:** 06/11/2026  
> **Trạng thái:** `WAITING_REVIEWER_APPROVAL` — chưa viết mã Đợt C  
> **Căn cứ:** Đợt B đã triển khai kiểm tra trên VPS (tip `c5caebd6`, code `b7db4591`)  
> **Tuyên bố ràng buộc:** Đợt B **đã bảo vệ phạm vi** (nguồn / cổng quyền / Undo chuỗi / vòng đời thẻ & quy tắc). **Hậu kiểm theo tiêu chí (criteria verification) và bảng dung sai chưa có hiệu lực.**

---

## 1. Mục tiêu Đợt C

Bổ sung lớp **hậu kiểm có phạm vi hỗ trợ rõ** sau các mutation trong phạm vi kế hoạch đã duyệt, kèm vòng sửa sai và UI trạng thái bằng chứng — **không** thay thế cổng quyền Đợt B.

| Thành phần | Mô tả | Ngoài phạm vi Đợt C |
| --- | --- | --- |
| Criteria engine | Phép kiểm hình học/topology có trạng thái `pass` / `fail` / `unknown` | Selective inversion (đề tài riêng) |
| Evidence lifecycle | Gắn bằng chứng với task + node ids; vô hiệu hóa khi hình học/ids đổi | Sync quy tắc đa thiết bị đầy đủ |
| Tolerance table | Áp dụng **chỉ sau** khi Reviewer chốt bảng Mục 5.2 (hoặc bản rút gọn được duyệt) | Tự nhận “thông suốt tuyệt đối” khi phép kiểm chưa đủ |
| UI | Hiển thị tiêu chí đã hỗ trợ / unknown / fail; không tuyên bố vượt phạm vi | Batch D nghiệm thu vận hành dài |

---

## 2. Thứ tự triển khai đề xuất

### C1 — Khung bằng chứng & trạng thái (không đo hình học sâu)
1. Kiểu `VerificationEvidence` / `CriterionResult` trong `packages/ai/src/governance/` (hoặc `verification/`).
2. Gắn `taskId`, `documentId`, `rulesFingerprint`, danh sách node ids liên quan, `status: pass|fail|unknown`.
3. API: `recordEvidence`, `invalidateEvidenceForNodes`, `getTaskEvidence`.
4. UI status line: cập nhật `getGovernanceStatus()` — `criteriaVerification: "active"` **chỉ khi** ít nhất một criterion runner đã đăng ký; trước đó giữ `deferred`.
5. Test: evidence bị invalidate khi node bị sửa/xóa; không dùng evidence của node cũ.

### C2 — Criterion runners có phạm vi công bố
Ưu tiên các phép **đã thừa nhận giới hạn** trong đề án Đợt A:

| Criterion | Đầu vào | Pass/Fail | Unknown khi |
| --- | --- | --- | --- |
| `volume_delta` | solid trước/sau, dung sai tương đối đã duyệt | ΔV trong ngưỡng | không lấy được volume |
| `ray_probe_clear` | danh sách điểm + hướng | mọi mẫu rỗng theo kỳ vọng | thiếu mẫu / kernel lỗi |
| `bbox_contains` | bbox kỳ vọng vs thực tế | trong dung sai dài | shape null |
| `through_opening` (nếu đủ thời gian) | face trước/sau + probes | có vòng mở hai phía | flush-floor / membrane chưa phân tích đủ → **unknown**, không fail giả |

Mỗi runner khai báo `supportNotes` (chuỗi locale) để UI/prompt nói đúng giới hạn.

### C3 — Vòng sửa sai trong agent loop
1. Sau mutation gated, nếu criterion `fail` → đưa báo cáo vào journal / tool result; agent được phép chỉnh trong **phạm vi plan còn hiệu lực**.
2. Nếu plan đã `PLAN_INVALIDATED` / rules drift → **không** sửa bằng quyền cũ; yêu cầu `propose_task_plan` lại.
3. Ngân sách sửa sai: giới hạn số vòng (cấu hình); vượt ngân sách → dừng + báo user.
4. Test offline harness: fail giả → một vòng sửa → pass; invalidated plan → không ghi tiếp.

### C4 — Tolerance table (cổng Reviewer)
1. Không hard-code bảng 5.2 cho đến khi Reviewer chọn:
   - **(A)** duyệt nguyên bảng 5.2, hoặc  
   - **(B)** duyệt subset (ví dụ chỉ nhóm Nội thất ±0.2 mm / ±0.2°), hoặc  
   - **(C)** trì hoãn bảng; runners dùng `unknown` khi thiếu dung sai.
2. Lưu dung sai đã duyệt trong `DesignRules` (cùng fingerprint Đợt B) — đổi bảng = đổi fingerprint = thu hồi plan.

### C5 — UI & bàn giao
1. Thẻ/khu vực bằng chứng trên ChatPanel: pass/fail/unknown + `supportNotes`.
2. Status: phân biệt rõ “Đợt B bảo vệ phạm vi” vs “Đợt C hậu kiểm”.
3. Ma trận criterion × tool (chỉ các đường đã gắn runner).
4. Test + typecheck + Biome + build; SHA bàn giao; **chờ duyệt trước deploy VPS**.

---

## 3. Quyết định cần Reviewer chốt trước khi code

1. Chọn phương án dung sai **A / B / C** ở mục C4.
2. Criterion nào bắt buộc trong C2 (tối thiểu `volume_delta` + `ray_probe_clear`?).
3. Ngân sách vòng sửa sai mặc định (đề xuất: 2).
4. Có yêu cầu UI riêng ngoài status line + thẻ evidence trong chat không?

---

## 4. Tiêu chí xong Đợt C (để nghiệm thu sau này)

- [ ] Ít nhất hai criterion runners có test pass/fail/unknown.
- [ ] Evidence invalidate đúng khi node/plan/rules đổi.
- [ ] Agent loop tôn trọng fail → sửa trong scope; không vượt plan đã thu hồi.
- [ ] UI không tuyên bố tiêu chí chưa hỗ trợ là đã kiểm.
- [ ] Bảng dung sai chỉ áp dụng đúng quyết định Reviewer.
- [ ] SHA + test/build; deploy VPS chỉ sau duyệt.

---

## 5. Không làm trong Đợt C

- Selective inversion / undo chọn lọc.
- Coi Đợt B là chưa đủ bảo vệ phạm vi (Đợt B đã có hiệu lực).
- Deploy VPS Đợt C trước khi Reviewer duyệt SHA Đợt C.

---

*Tài liệu phương án — chờ Reviewer duyệt trước khi triển khai mã Đợt C.*

---

## Nhật ký thực thi — C1 + chuẩn bị C2 (08/11/2026, Hermes)

**Trạng thái:** C1 đã code + test; C2 chuẩn bị hai phép kiểm đầu tiên (kích thước, vị trí) — **chờ Reviewer nghiệm thu C1** trước khi mở rộng bộ phép đo / vòng sửa sai C3 / deploy VPS.

**4 quyết định §3 — Chủ dự án chốt bằng chỉ đạo 08/11:**
1. Dung sai: **phương án C** — runners không có bảng mặc định; thiếu `expected`/`toleranceMm` theo task → `unknown`, không bao giờ pass im lặng.
2. C2 tối thiểu: `dimension_match` + `position_match` (world bbox, mm) — đã code + test kernel thật.
3. Ngân sách sửa sai C3: **tối đa 2 lần**, dừng khi không tiến triển (chưa code — thuộc vòng C3, chờ duyệt C1).
4. UI: chỉ **thanh trạng thái + thẻ bằng chứng trong chat** (không thêm khu vực riêng).

**C1 đã triển khai (`packages/ai/src/governance/verification/`):**
- `types.ts` — `CriterionSpec` (id, kind, required, subjectNodeIds, expected, toleranceMm, source) / `CriterionEvidence` / `CriterionStatus pass|fail|unknown` / `TaskCriteriaEvaluation`.
- `evidenceStore.ts` — `registerCriterionRunner`, `defineTaskCriteria`, `recordCriterionEvidence` (tự gắn documentId + rulesFingerprint + thời điểm lúc ghi), `invalidateEvidenceForNodeIds`, `invalidateAllTaskEvidence`, `evaluateTaskCriteria` (bằng chứng stale đọc lại `unknown`, không dùng lại pass cũ), `onTaskEvidenceChanged`, `resetVerificationForTests`.
- `status.ts` — `criteriaVerification: active` chỉ khi ≥1 runner đăng ký; dòng trạng thái hiển thị `⏳ còn N/M tiêu chí bắt buộc chưa đạt` hoặc `✔ đủ tiêu chí bắt buộc`; `toleranceTable: not_applied` giữ nguyên.
- `governedRouter.ts` — write thành tiện ích gated → invalidate bằng chứng theo node tác động (dùng `analyzeToolImpact` Đợt B); undo → invalidate toàn bộ bằng chứng task; write bị từ chối **không** đụng bằng chứng.
- `chatPanel.ts` + css — thẻ bằng chứng render mỗi tiêu chí (✅/❌/❓ + số đo + lý do + `supportNotes` + dòng stale); badge hoàn tất chỉ hiện khi store báo `completable`.
- `web/src/index.ts` — `__chiliTest.governance` (dev/preview) cho reviewer demo trên app thật; production build **không** auto-register runner nào → trạng thái Đợt C vẫn `deferred` thành thật cho tới khi Reviewer duyệt bật C2.

**C2-chuẩn-bị (`verification/runners/geometry.ts`):**
- `dimension_match`: cạnh bbox world từng trục, dung sai [X,Y,Z] do task; sai → fail kèm "trục nào, đo bao nhiêu, lệch bao nhiêu".
- `position_match`: tâm bbox world từng trục; cùng luật.
-supportNotes công khai giới hạn: bbox **không** chứng minh lỗ/rãnh/hình dạng; **không** suy quan hệ xuyên từ điểm mẫu; tâm bbox ≠ centroid hình bất đối xứng.

**Test mới (25 ca):** `batchC1Evidence.test.ts` (13 — binding, unknown≠pass, optional-fail không chặn, required-fail chặn, invalidate node/rules/document/plan, router invalidate khi write + không invalidate khi bị chặn, listener), `batchC2SizePosition.kernel.test.ts` (8 — kernel OCCT thật: pass khớp phép đo độc lập, **sai kích thước → fail**, **sai vị trí → fail**, thiếu dung sai/NaN/subject mất → **unknown**, sửa hình rồi thì pass cũ stale), `batchC1Card.dom.test.ts` (6 — mỗi trạng thái UI một ca: pass/fail/unknown/stale/plan-mất-hiệu-lực/class trạng thái).

**Bằng chứng chạy:** `tsc -p` exit 0 · `biome check` 0 error · `npm run build` exit 0.
**SHA C1 = `8ab2c4ab888eca686cca58028e551098415ddd39`. Hai lần `npm run test` LIÊN TIẾP trên đúng SHA đó: RUN1 10294 passed / 0 failed (exit 0), RUN2 10294 / 0 (exit 0). Commit bằng chứng UI nối tiếp chỉ thêm docs/ảnh, không đổi code.**
**Ticket localStorage:** tách riêng trước C1 — ticket `28ca0283`, fix `918d0b67`, ghi 2 lần full-suite xanh `4ecb89ed`.
**ĐÃ KIỂM UI:** 3 trạng thái thật quay trên ChatPanel (store + component thật, build DEV qua `__chiliTest.governance`; trigger scripted, KHÔNG phải vòng LLM end-to-end): `docs/tasks/TASK-40-batch-C-evidence/c1-ui/` — 6 ảnh PNG + `c1_ui_states.json` (cardText may-doc) + README quy trình.
**CHƯA KIỂM:** vòng LLM thật end-to-end (ma trận §11.11 — thuộc Đợt D); Windows (không có môi trường).


## C1.1 — Review follow-up 08/11 (marker đọc-lại + bảo thủ + timing)

1. `verification/stateMarker.ts` mới: `historyMarkOf` (undo-top object identity qua WeakMap + stack depth — hai record cùng tên là hai trạng thái khác nhau) và `subjectsSignatureOf` (world-bbox size+center mỗi subject, lưới 1/1000 mm; node unreadable/gone cho tag ổn định để không tự đổi marker).
2. `recordCriterionEvidence` gắn cả hai marker lúc ghi; `isFresh`/`staleReason` đối chiếu MỖI LẦN đọc: `history-changed` (tài liệu có lệnh mới ngoài agent) hoặc `state-changed` (hình học subject khác lúc đo). Không cần router biết — UI/lệnh trực tiếp cũng bị bắt; đo lại (`runTaskCriterionChecks`) thì phục hồi với binding mới.
3. `governedRouter.affectedNodeIds` → `null` khi impact `indeterminate`/`document_variable`/exception ⇒ `invalidateAllTaskEvidence(task, "…vô hiệu hóa bảo thủ…")`; write phân tích được giữ invalidate đúng subject (test chứng minh cả hai nhánh).
4. `chatPanel`: sub `executeCommand` + `closeCommandContext` (kênh core hiện có — core không có model-changed pub, không sửa core) → rAF-coalesce `refreshGovernanceCard` — badge rơi ⏳ ngay frame sau lệnh UI, không chờ agent cycle.
5. Seam test `applySuccessfulWriteForTests` (router) để kiểm hậu-thuật-write không phải qua cổng quyền.
6. Test mới: `batchC1StateMarker.test.ts` 6 ca, kernel ngoài-biên 1 ca, `chatPanel.test.ts` mount thật 1 ca (✔→⏳). Tổng targeted 172/0; full suite 10303/0; build/tsc/biome sạch. GIỮ NGUYÊN các ca rules-đổi / Undo / write-bị-từ-chối của C1.
