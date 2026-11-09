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

### Ghi sổ bàn giao C1.1 — 08/11/2026

- **SHA C1.1 = `d3d09640e6f85823c7dea0f04ec5b35e2dcd33bd`** (dev, sau `8ab2c4ab`; working tree sạch — hai lần chạy đúng commit content).
- Hai lần `npm run test` LIÊN TIẾP trên đúng SHA: **10303 passed / 0 failed, exit 0** cả hai (`/tmp/c11_r1.log`, `/tmp/c11_r2.log`).
- `hermes verify --json --skip-start` trên SHA: ok=true (bootstrap/build/test/check exit 0).
- C1 + C1.1 bàn giao kèm nhau cho Reviewer: C1 `8ab2c4ab` + evidence `3de3d40a`; C1.1 `d3d09640` (marker đọc-lại, bảo thủ, cập nhật ngoài agent). CHƯA xin duyệt triển khai C1 — chờ kết quả review.

### Ghi chú flake server-test phát hiện khi ghi sổ C1.1 (ngoài phạm vi, KHÔNG sửa kỳ vọng)

- Lần chạy `hermes verify` thứ nhất tại `d3d09640`: `npm run test` đỏ đúng 1 ca ở tầng `node --test`:
  `server/test/llmProxy.test.mjs :: successfully streams 19MB request body without buffering in RAM` —
  đo RSS delta **10.20MB** ngưỡng **<10MB**. Nguyên nhân **chưa xác nhận**; chỉ ghi nhận tương quan:
  stage đỏ khi chạy ngay sau build+suite cùng chu kỳ verify, xanh khi chạy độc lập.
- Đặc tính: chạy riêng file 3 lần liên tiếp **18/18 xanh cả 3**; hai lần full `npm run test` trực tiếp trên
  `d3d09640` xanh; `hermes verify` lần 2 **ok=true toàn pha exit 0**.
- Kết luận trung thực: flake ngưỡng RSS **có trước**, không liên quan C1.1 (không đụng `server/` hay llmProxy).
  Không tự nâng ngưỡng (rule: không sửa acceptance để che lỗi); giao Reviewer/AI1 quyết nếu cần nới threshold.


## C1.2 — Review follow-up 08/11 (đổi hình học giữ hộp bao; đường History khuyết; bất khả chứng → unknown)

**Yêu cầu Reviewer:** trước khi mở rộng sang lỗ/tô-pô/bảo toàn hình dạng, phải có ca "thay đổi hình học nhưng
giữ nguyên hộp bao"; làm rõ phép thay đổi nào History ghi nhận và cơ chế vô hiệu cho đường còn thiếu;
không chứng minh được trạng thái thì `unknown`.

**Marker mở rộng (`stateMarker.subjectsSignatureOf`)** — mỗi subject giờ ký signature gồm 4 thành phần:
`cạnh hộp bao | tâm hộp bao | thể tích (vol-err nếu kernel không đọc được) | identity object shape đã cache (h#N)`.
- `measure.readSubjectShapeProbe` mới: đọc **object shape cache của node** (`node.shape.value` — không phải
  bản `transformedMul` tạo mới mỗi lần đọc) + `volume()`. `ShapeNode.setShape` có guard `isEqual`: hình học
  **giống hệt** thì giữ object cũ (signature ổn định qua đọc lại nhiều lần — không tự sinh stale giả);
  hình học **khác** (dù bbox y nguyên) thì object mới → identity lật → stale.
- Chủ đề không probe được (node mất / không phải ShapeNode / shape err / null) → tag `unreadable` **ổn định**
  trong signature, và runner tương ứng đã trả `unknown` khi không đọc được dữ liệu — không có đường nào
  "không chứng minh được mà vẫn pass".

**Ma trận History (đọc source `foundation/transaction.ts` + `model/shapeNode.ts`, không phỏng đoán):**
| Đường thay đổi | History ghi? | Cơ chế vô hiệu hoạt động |
|---|---|---|
| Lệnh core qua commandService/stepRunner, thao tác UI (ribbon, property panel), write của agent qua governed router — tất cả đi `Transaction.add`/`addToHistory` | ✅ có record mới | `historyMark` lật (undo-top identity + depth) + router invalidate theo subject/bảo thủ |
| `undo`/`redo` | ✅ stack đổi top | router `invalidateAllTaskEvidence` (ca cũ giữ nguyên) + historyMark |
| Gán trực tiếp `node.shape = Result` / `node.transform = Matrix4` **ngoài** Transaction mở (parametric tự rebuild trong giao dịch của nó; caller raw thì không) | ❌ không record | `stateSignature` (identity + volume + bbox) — kernel test `c2-hole` chứng minh: khoét lỗ lệch tâm giữ nguyên 800×300×2500, signature lật, đọc lại `unknown`, đo lại mới pass hợp lệ |
| `history.disabled = true` (rollback/nạp redo nội bộ) | ❌ | `stateSignature` (rollback khôi phục hình giống hệt → isEqual giữ object → signature không lật = ĐÚNG, trạng thái thật sự trở lại như cũ) |
| Mutation in-place của cùng handle TopoDS không qua `setShape` | ❌ | **Blind spot tài liệu**: không có đường public API nào trong core làm vậy (setShape là cửa duy nhất, hoặc giữ object khi isEqual hoặc swap object); khi C2 thêm tiêu chí bên-trong, runner đó PHẢI tự đọc mạnh hơn (topology/volume riêng) — chưa đọc được thì trả `unknown`, không借用 bbox cũ. Ghi rõ để Reviewer xét trước khi mở rộng lỗ/tô-pô.

**Ca mới:** `batchC2SizePosition.kernel.test.ts :: C1.2 KHOÉT LỖ` (booleanCut cylinder xuyên tấm; assert signature
lật bằng `subjectsSignatureOf` trực tiếp, reason `/state-changed|history-changed/`, nếu history KHÔNG đổi thì buộc
phải là `state-changed`; đo lại pass + hộp bao verification 800/2500 y nguyên). Export `historyMarkOf`/
`subjectsSignatureOf` qua verification index cho test/diagnostic.

**Ghi chú vận hành (ngoài TASK-40):** `scripts/deploy-vps.sh` từ nay sinh `dist/version.json` mang SHA thật mỗi
lần deploy (bài học version.json TASK-41 stale — xem pdf HANDOFF).


### Ghi sổ bàn giao C1.2 — 08/11/2026

- **SHA C1.2 = `863e708964edf1003304ad633e0240d3582c239b`** (dev; cây sạch — file `TASK-40-cad-agent-standard.md` untracked là sản phẩm AI khác chạy song song, **giữ nguyên, không commit**).
- Hai lần `npm run test` LIÊN TIẾP trên đúng SHA: **10304 passed / 0 failed, exit 0** cả hai.
- `hermes verify --json --skip-start` trên SHA: **ok=true** (bootstrap 2s · build 59s · `npm run test` 99s · check 5s — exit 0 toàn bộ).
- **Flake RSS báo riêng (theo yêu cầu Reviewer):** `server/test/llmProxy.test.mjs :: streams 19MB without buffering in RAM` — ngưỡng RSS-delta <10MB; hôm nay đo **10.20MB** (ca đỏ 1, verify đầu tại `d3d09640`) và **14.03MB** (ca đỏ 2, verify đầu tại `863e7089`); các lần chạy lại đều xanh (standalone 18/18 ×3; verify #2 cả hai SHA xanh). Nguyên nhân: **CHƯA XÁC NHẬN** — chỉ có quan sát: delta 10.20–14.03MB khi stage chạy ngay sau build+suite trong cùng verify; chạy độc lập luôn dưới ngưỡng. Không quy kết khi chưa đo phân tích. Khuyến nghị chủ file (AI1/server) cân nhắc tách stage này chạy riêng hoặc nới ngưỡng kèm ghi chú — **tôi không tự sửa kỳ vọng**.
- Trạng thái C1/C1.1/C1.2: **chờ nghiệm thu VPS** — chưa xin duyệt triển khai.
- PDF/VPS: `version.json` đã đồng bộ `99ac37cf` (sha256 file `7ff822a3…` khớp host=container=HTTP; `main.js` giữ `07cf9ee4…`); script deploy tự sinh version.json từ SHA thật cho các lần sau. **Windows vẫn chờ thử — không có môi trường.**


## C1.3 — Review follow-up 08/11 (bất khả chứng → unknown, kể cả chuỗi unreadable ổn định)

- `CriterionRunner.requiresSubjectProof`: runner đo trực tiếp trên subject (dimension/position đặt `true`).
- `evaluateTaskCriteria`: dòng có bằng chứng **pass/fail** (khẳng định) của proof-runner mà marker subject
  không verify được lúc đọc — `stateSignature` thiếu, `no-subjects`, chứa `:unreadable` hoặc `handle-err` —
  **hạ xuống `unknown`** với reason `state-unverifiable…`, kể cả khi chuỗi unreadable giống hệt qua nhiều lần đọc;
  badge hoàn tất mất theo. Bằng chứng đã `unknown` giữ lý do gốc của runner (không ghi đè — hồi quy ca C2
  "thiếu dữ liệu" đã bắt đúng case này).
- Ca mới (4): unit — proof-runner + subject ma (unreadable ổn định, đọc lần 2 vẫn unknown), no-subjects,
  hồi quy runner thường vẫn pass; kernel — `recordCriterionEvidence` TỰ KHAI pass trên subject không tồn tại,
  evaluate từ chối tin lời khai, mọi lần đọc unknown + không completable.
- Nguyên tắc chốt cho đợt mở rộng lỗ/tô-pô: **tiêu chí cần phép đo nào thì marker của phép đo đó phải đọc lại
  được ở thời điểm đánh giá; không đọc lại được → unknown**, không có đường "pass cũ + chuỗi lỗi ổn định".
- Test: targeted 177/0 (tăng 4); pre-commit full 10308/0; build 0 lỗi; tsc 0; biome 0 error.

### Ghi sổ bàn giao C1.3 — 08/11/2026

- **SHA C1.3 = `9f6beda9ab481c87b79ebf1ebce00bd67be72d70`** (dev). Commit tách bạch theo chỉ đạo:
  mốc tài liệu chuẩn CAD `9d48d07d` (riêng) · version hygiene `e6c876f2` · C1.3 `9f6beda9`.
- Hai lần `npm run test` LIÊN TIẾP trên đúng `9f6beda9`: **10308 passed / 0 failed, exit 0** cả hai.
- `hermes verify --json --skip-start`: run 1 ĐỎ đúng 1 ca RSS (delta **13.09MB**); run 2 **ok=true** toàn pha exit 0.
- **Báo flake RSS (số đo + chạy lại, nguyên nhân CHƯA XÁC NHẬN):** 3 lần đỏ trong verify — `10.20MB` (verify #1
  tại `d3d09640`), `14.03MB` (verify #1 tại `863e7089`), `13.09MB` (verify #1 tại `9f6beda9`); mọi lần chạy lại
  độc lập/xen kẽ đều xanh (standalone 18/18 ×3; 4/4 lần `npm run test` trực tiếp tại các SHA; verify run 2 cả ba
  SHA). Tương quan duy nhất quan sát được: đỏ khi stage chạy ngay sau build+suite trong cùng verify. Không kết luận
  nguyên nhân; kỳ vọng không sửa; đề xuất chủ file (AI1/server) tách stage hoặc đo phân tích trước khi nới ngưỡng.
- VPS: `version.json` ≡ `deploy-version.json` (sha256 `7ff822a3…`, chỉ `99ac37cf`) — xác minh host/container/HTTP
  cả hai endpoint. **Windows vẫn chờ thử.** C1.2 + C1.3 **chờ nghiệm thu — chưa triển khai**.

---

## C3 — Nhật ký thực thi sửa sai theo sai lệch đo được (09/11/2026)

### C3 v1.3 — Xác nhận giao dịch trực tiếp từ lệnh sửa C3 & Chặn giao dịch ngoại lai (09/11/2026)

1. **Xác nhận giao dịch từ chính đường ghi C3**:
   - Thay vì chỉ so sánh `historyAfter !== historyBefore` ở cuối hàm (dễ bị đánh lừa nếu có thao tác ngoại lai đổi history trong bước chờ), `executeRepairProposal` trích xuất và kiểm tra trực tiếp giao dịch do lệnh C3 sinh ra ngay khi `tool.handler` vừa kết thúc:
     - `payloadConfirmed`: Tool xác nhận cập nhật thành công (`updated` với `set_node_properties`, `transform` với `transform_node`, không có `error`).
     - `undoAdvanced`: `undoTopImmediatelyAfter !== undoTopBefore` (undo stack top dịch chuyển trực tiếp từ lệnh này).
     - `recordedInTaskHistory`: `governedRouter` đã ghi nhận record giao dịch vào `taskHistoryRecords` của tác vụ gốc.
   - Chỉ khi giao dịch C3 commit thành công, lượt sửa mới được tính.

2. **Kháng thao tác ngoại lai trong bước chờ**:
   - Nếu lệnh C3 không tạo giao dịch (ví dụ tool lỗi, hoặc trả về payload rỗng) nhưng trong bước chờ có thao tác khác làm thay đổi lịch sử tài liệu, C3 từ chối nhận vơ giao dịch ngoại lai, báo lỗi chưa ghi và giữ nguyên số lượt sửa.
   - Nếu lệnh C3 đã commit thành công rồi người dùng đổi tác vụ hoặc hậu kiểm bị hủy, tác vụ gốc vẫn nhận đúng 1 lượt sửa.

3. **Bộ test hồi quy bổ sung**:
   - `C3-async-3`: Lệnh C3 trả về lỗi không tạo giao dịch, thao tác khác đổi lịch sử tài liệu trong bước chờ $\implies$ C3 báo chưa ghi, giữ nguyên số lượt = 0, proposal.executed = false.
   - `C3-async-3b`: Lệnh C3 trả về payload rỗng không tạo giao dịch, thao tác khác đổi lịch sử tài liệu trong bước chờ $\implies$ C3 từ chối, giữ nguyên số lượt = 0.
   - Giữ nguyên toàn bộ 3 ca async `C3-async-1`, `C3-async-1b`, `C3-async-2` từ `b94b3e1d`.

4. **Kết quả kiểm chứng**:
   - `batchC3Repair.kernel.test.ts`: 23/23 passed.
   - `packages/ai/test/governance/`: 102/102 passed (7 test files).
   - Typecheck (`tsc --noEmit`): 0 error.
   - Biome (`npm run check`): 0 error.
   - Trạng thái: `WAITING_REVIEW`, chưa triển khai VPS.

### C3 v1.4 — Chốt cơ chế xác nhận ghi trực tiếp từ tool & Chặn router tự điền (09/11/2026)

1. **Chỉ chấp nhận xác nhận ghi do chính tool trả về cho đúng tài liệu và đề xuất**:
   - `propertyTools.ts` (`setNodePropertiesHandler`) và `nodeTools.ts` (`transformNodeHandler`) tính toán trực tiếp `committed = Boolean(topAfter && topAfter !== topBefore)` và bổ sung `committed`, `documentId`, `proposalId` vào payload trả về.
   - `governedRouter.ts` giữ nguyên toàn bộ cơ chế phát hiện thay đổi lịch sử và ghi nhận đột biến cho các tính năng hiện có (`afterSuccessfulWrite`, `noteGovernedMutation`, `invalidateEvidenceForNodeIds`), nhưng **TUYỆT ĐỐI KHÔNG** dùng thay đổi lịch sử để tự điền/suy diễn xác nhận commit cho C3. Payload phản hồi từ tool được router chuyển tiếp nguyên bản.
   - C3 `executeRepairProposal` truyền `proposalId` vào tool args và kiểm tra nghiêm ngặt:
     - `payloadConfirmed`: Payload phản hồi chứa danh sách thuộc tính hoặc ma trận cập nhật hợp lệ.
     - `hasCommitConfirmation`: Chính tool xác nhận `committed === true`, `documentId === snapshot.documentId`, và `proposalId === snapshot.proposalId`. Không chấp nhận giá trị `undefined` hay giá trị tự điền từ router.
     - `undoAdvanced`: `undoTopImmediatelyAfter !== undoTopBefore` (đỉnh undo dịch chuyển ngay tại thời điểm tool vừa chạy xong).
   - Nếu thiếu xác nhận commit từ tool, C3 báo lỗi rõ ràng `"lệnh sửa chưa xác nhận ghi từ chính tool cho đúng tài liệu và đề xuất"`, giữ nguyên mô hình và không tính lượt sửa.

2. **Ca kiểm thử qua governedRouter thật & Thao tác ngoại lai**:
   - `C3-async-4a`: Chạy qua `governedRouter` thật, tool trả `updated` hợp lệ về hình thức nhưng thiếu xác nhận commit, thao tác ngoại lai commit vào cùng tài liệu trong bước chờ $\implies$ router không tự điền xác nhận, C3 báo chưa xác nhận ghi, giữ nguyên số lượt sửa = 0 và không đổi hình học.
   - `C3-async-4b`: Chạy qua `governedRouter` thật, tool trả `transform` hợp lệ về hình thức nhưng thiếu xác nhận commit, thao tác ngoại lai commit vào cùng tài liệu trong bước chờ $\implies$ C3 báo chưa xác nhận ghi, giữ nguyên số lượt sửa = 0.
   - `C3-async-4c`: Ca đối chứng qua tool thật: lệnh C3 commit giao dịch thật qua `set_node_properties`, người dùng hủy đo lại sau khi commit $\implies$ tác vụ gốc được ghi nhận ĐÚNG 1 lượt sửa, hình học cập nhật thành công.

3. **Kết quả kiểm chứng**:
   - `batchC3Repair.kernel.test.ts`: 26/26 passed.
   - `packages/ai/test/governance/`: 105/105 passed (7 test files).
   - `nodeTools.test.ts` & `propertyTools.test.ts`: 39/39 passed (tương thích ngược hoàn toàn).
   - Full repository test suite: 10,351 tests passed (1 skipped) + 35 backend tests passed = 10,386 tests passed.
   - Typecheck (`tsc --noEmit`): 0 error.
   - Biome (`npm run check`): 0 error.
   - Build (`npm run build`): Thành công (Rspack + plugins).
   - Trạng thái: `WAITING_REVIEW`, chưa triển khai VPS.
