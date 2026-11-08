# PDF kỹ thuật v1 — bàn giao nghiệm thu

**Trạng thái:** chờ reviewer duyệt VPS sau bằng chứng UI. **Chưa** triển khai VPS.  
**Survey SHA:** `3c450e85`  
**Implementation SHA (feat):** `a109d26e4892a89d24a14df1c822e45986a9603a`  
**UI-acceptance fix SHA:** `0b396d8ffcef76d5d6dc72c06834f534c6ccd504`  
**Thư mục:** `docs/tasks/pdf-export-v1/`

## Phân loại file (UI vs script)

| Thư mục | Nguồn | Dùng để duyệt VPS? |
|---|---|---|
| `output/ui/` | Live web build: `planPdfExport` → preview canvas → `dataExchange.export('.pdf')` → `download()` trên document nodes thật | **Có** |
| `output/script/` | `accept_sample.mjs` / `buildSamplePdfPlan` (layout-replay, không qua UI) | Chỉ tham chiếu; reviewer đã từ chối VPS nếu chỉ có nhóm này |

### Artifact UI chính

| File | Vai trò |
|---|---|
| `output/ui/from_ui_A3_1to50.pdf` | PDF tải xuống A3 ngang 1:50 |
| `output/ui/from_ui_A3_1to50_preview.png` | Preview canvas **cùng** `PdfExportPlan` lần xuất |
| `output/ui/from_ui_A3_1to50_render-1.png` | `pdftoppm` 150 dpi của PDF tải xuống |
| `output/ui/from_ui_A4_1to15_CLIP.pdf` | Xác nhận cắt mép (A4 ngang 1:15) |
| `output/ui/from_ui_A4_1to15_CLIP_preview.png` | Preview clip — khớp vùng cắt của PDF |
| `output/ui/clip_cancel_confirm_evidence.json` | Hủy: không tăng blob tải; Xác nhận: có PDF clip |
| `output/ui/acceptance_measure.json` | Đo cạnh + SHA256 artifact |

**SHA256 PDF UI**

```
5a7ab574a16c5b56a91341ffd00e69053087313189856051628095ce4233c7bc  from_ui_A3_1to50.pdf
0552eb9870c271b2bc9c2dceeea3f1df752e5e99d87262f1a6db2acf5dbcdace  from_ui_A4_1to15_CLIP.pdf
```

## Quyết định đã thi công (§6 HANDOFF spike)

| Mục | Thực hiện |
|---|---|
| Phạm vi | 1 tờ A4/A3, ngang/dọc, lề, fixed/fit, nét cơ bản, preview |
| Nội dung | Đối tượng đã chọn → chiếu lên workplane (else XY) → cắt khung in |
| Camera/zoom | Không ảnh hưởng tỷ lệ giấy (`layoutPdfPage`) |
| Writer | `pdf-lib` + `@pdf-lib/fontkit`, lazy khi chọn `.pdf` |
| Font | Noto Sans OFL subset (`packages/builder/assets/fonts/`, ~62 KB / ~30.5 KB gzip) |
| LINE / ARC | Vector; ARC/CIRCLE = cubic Bézier; đo lệch trên giấy |
| UI | `file.export` + nhóm thuộc tính PDF; preview canvas = cùng `PdfExportPlan` |
| Clip | Cảnh báo + nút “Xuất (cắt mép)” bắt buộc xác nhận |
| Unsupported | Toast `pdf.skipped:{0}` |
| Sau v1 | 3D HLR, nhiều tờ, layer PDF — chưa làm |

## Nghiệm thu UI (mẫu thật trên production dist)

Mẫu in-app: cạnh `edge-bottom-5100` (5100 mm), cung r=400, `centerline-dash`, dim, chữ VN, `transformed-edge` (tx=+10 → world x=110).

| Kiểm tra | Kết quả |
|---|---|
| Cạnh hình học trong PDF A3 1:50 | **102.0 mm** (3 cạnh ≈102; tol ±0.2) — **PASS** |
| `plan.longestEdgePaperMm` | 102 |
| Sai lệch cung r=400 @ 1:50 | ≈ **0.002 mm** giấy |
| `pdfinfo` Page size | 1190.55 × 841.89 pts (A3) |
| `pdffonts` | `NotoSans-Regular-…` CID TrueType, **emb=yes**, uni=yes |
| `pdftotext` | Đủ “Bản vẽ mẫu…”, “Ghi chú: cạnh dài 5.100…”, “5100” — không cắt chữ |
| Render QA | Ghi chú **không** chồng nhãn kích thước; mũi tên rõ; nét đứt hiện |
| Transform | `transformed-edge` world x = 110 |
| Clip Hủy | `cancelNoDownload: true` (blob count không tăng) |
| Clip Xác nhận | `clip: true`, excess ≈ 89.7×56.7 mm; PDF + preview khớp cắt mép |
| Text size trên giấy | model `textHeight / scale` → ≈ 9.9 / 8.5 / 11.3 pt (3.5 / 3.0 / 4.0 mm) |

## Dung lượng / tốc độ / bundle (đo lại trên production build)

| Mẫu | Bytes | Thời gian ghi |
|---|---|---|
| UI A3 1:50 | 8 951 | ~133 ms (browser `export`) |
| UI A4 clip 1:15 | 11 076 | — |

**Tải thêm production (lazy khi mở PDF) — đo lại:**

| Asset | raw | gzip -9 |
|---|---|---|
| `dist/576.js` (pdf-lib + fontkit) | 432 124 | **173 183 B ≈ 169.1 KiB** |
| `dist/66ca43b066485d1d.ttf` Noto subset | 62 744 | **31 284 B ≈ 30.6 KiB** |
| **Tổng khi mở tính năng** | | **≈ 199.7 KiB gzip** |

Mốc khảo sát 250 KB gzip: **đạt**. Writer chỉ nạp qua `preloadPdfWriter` / `export('.pdf')`.

## Mac / Windows

| Môi trường | Đã thử? | Ghi chú |
|---|---|---|
| **macOS** 27.0.1 (Darwin 27.0.0, arm64, MacBook Pro) | **Có** — build, typecheck, rstest 76/76, serve `dist`, UI export + Poppler | Bằng chứng UI trong `output/ui/` sinh trên máy này |
| **Windows** | **Chưa** chạy trên máy Windows trong vòng này | Cùng bundle web; không phụ thuộc font hệ thống / Python. Cần xác nhận bổ sung trên Windows nếu reviewer yêu cầu |

## Test / typecheck / build

```bash
npx rstest packages/core/test/pdfLayout.test.ts packages/builder/test/pdfExport.test.ts \
  packages/builder/test/defaultDataExchange.test.ts packages/app/test/commands/importExport.test.ts
# → 76 passed, 0 failed

npx tsc -p tsconfig.json --noEmit   # riêng, không gộp vào build
# → exit 0

SKIP_TYPECHECK=true npm run build
npx serve dist -l 8080
```

## Fix sau phản hồi reviewer

- `collectDrawing` text: `sizePt = mmToPt(heightMm / layout.scale)` (trước đó quên ÷ scale → chữ khổ khổng lồ trên giấy).
- Nét đứt theo tên (`center|dash|centerline|…`) cho mẫu `centerline-dash`.

## Luồng code chính

- `packages/core/src/pdf/` — layout, Bézier, `PdfExportPlan`, canvas preview
- `packages/builder/src/pdf/` — collect từ selection, `pdf-lib` writer, sample plan, font OFL
- `DefaultDataExchange` — `.pdf` trong `exportFormats`, `planPdfExport`, `preloadPdfWriter`
- `Export` command — thuộc tính trang (dependency `format=.pdf`), dialog preview/clip

## Menu / ribbon run (08/11 — Hermes chạy nốt ca dở của thợ, build 0b396d8f)

Harness mới: `menu_ui_acceptance.mjs` — click thật qua CDP Input (chuột thật), không gọi thẳng `planPdfExport`.

- Bấm ribbon **Xuất bản vẽ (Export)** → mở panel `CommandContext`.
- Danh sách format thật có 10 mục chứa `.pdf` (dump trong report) → chọn `.pdf` → nhóm thuộc tính PDF hiện (dependency hoạt động).
- Chọn/điền thật trên panel: Khổ giấy=A3, Hướng giấy=Ngang, Chế độ tỷ lệ=cố định, Tỷ lệ 1:n=50, Lề=10; **đọc lại object lệnh** trước khi xác nhận (`pdfPageSize=A3`, `orientation=landscape`, `scale=50`).
- Bấm ✓ xác nhận selection (10 đối tượng) → dialog **Xem trước PDF**: `1:50.00 · A3 landscape`, `Longest edge on paper: 102.000 mm`, `Max arc deviation 0.0021 mm`.
- Bấm **Xác nhận** → **trình duyệt tự lưu file tải xuống** `downloads/edge-bottom-5100.pdf` (8.952 B; `Page.setDownloadBehavior`, không phải blob-hook).

**Đo trên chính file tải xuống** (content stream vector `m`/`l`, không phải giá trị plan):
- 3 đoạn ngang 102.000 mm giấy = 289.134 pt (đúng 5100 mm @ 1:50), delta **0.000 mm** (dung sai ±0,2).
- Hai đoạn ngang dài nhất (2× 400 mm) + dọc 277 mm là **khung lề trang**, không phải cạnh hình vẽ — loại khỏi phép đo cạnh.
- `pdfinfo`: 1 page, 1190.55 × 841.89 pts (A3). `pdffonts`: NotoSans CID TrueType emb=yes uni=yes. `pdftotext`: đủ tiêu đề, số "5100", ghi chú "Ghi chú: cạnh dài 5.100 mm · tỷ lệ 1:50 · kiểm tra in 100%" — không cắt chữ.
- Render 150 dpi: ghi chú nằm riêng dưới đường kích thước, **không chồng nhãn** (fix `0b396d8f` thể hiện trên bản menu).

**SHA256** `from_menu_A3_1to50.pdf`: `a7a7e913dbceaae7097cce026cfa0b46bc8330ee1421c6a7f8f0a65ca70a9a11`. Khác PDF integration (`5a7ab574…`) do PDF lưu CreationDate/ModDate theo lần chạy (8.952 vs 8.951 byte); **hình học khớp** (cạnh 102.000 mm cả hai). SHA thay đổi theo mỗi lần re-run (timestamp trong PDF); bản chốt là lần chạy 08/11 12:30 bằng đúng code harness sau khi biome format — report `menu_acceptance_report.json` (mtime 12:30:13) mới hơn harness (12:29:32). (Bản gốc trong `downloads/` bị lượt clip ghi đè vì trùng tên `edge-bottom-5100.pdf`; bản copy `from_menu_A3_1to50.pdf` giữ nguyên SHA ở trên.)

## Menu clip run (08/11 12:30 — `menu_clip_acceptance.mjs`, full-green EXIT=0)

**Commit bàn giao bằng chứng menu (A3 + clip, harness + output/menu-ui + relabel integration):** `3e7aead395a490bd68548e2adc11d43172a52df4` — HEAD `dev`, chưa push.

Lượt cắt mép thật qua menu trên cùng build `0b396d8f`, A4 ngang, tỷ lệ cố định 1:15 (nội dung 340 mm vượt khung in 277 mm):

- Panel khai báo thật: `format=.pdf`, `Khổ giấy=A4`, `Hướng giấy=Ngang`, `Chế độ tỷ lệ=Tỷ lệ cố định`, `Tỷ lệ 1:n=15` (gõ phím thật + Enter), **đọc lại object lệnh** trước xác nhận.
- Dialog preview hiện đúng: `Nội dung vượt khổ — thừa: 89.7 × 56.7 mm`, hai nút `Xuất (cắt mép)` / `Hủy bỏ` (ảnh 05/06).
- **Hủy bỏ trước:** file tải 0→0 **và** `Page.downloadWillBegin` = 0 sự kiện → không có lượt tải (khớp bằng chứng integration).
- **Chạy lại → Xuất (cắt mép):** trình duyệt tự lưu `edge-bottom-5100.pdf` → `from_menu_A4_1to15_CLIP.pdf` (11.077 B; integration 11.076 B — lệch 1 byte do timestamp).
  **SHA256:** `76f217c50f54e7767ea8dda8f4094fd2b2f9425de27e3913691d42a8becb6c05` (= bản gốc trong `downloads/`).
- **So file tải với preview (đo từ content stream):**
  - Clip rect `W n` trong file = **(10, 10, 277, 190) mm** — **giống hệt** clip rect của PDF integration (preview canvas dùng chung `clipRect` primitive, `ctx.clip()` ↔ `clip()` operator).
  - Cạnh 5100 @ 1:15 giữ tọa độ 340.000 mm trong stream; phần **hiển thị 250.333 mm** + **tràn khung 89.667 mm** = đúng `clipExcessMm[0]` integration (89.6667) → cắt mép khớp preview tới µm.
  - pdfinfo A4 landscape 841.89 × 595.276 pts; render 150 dpi thấy nét cắt (tâm nét đứt cụt, dòng ghi chú hết ngay mép khung).
- Ghi chú harness: hai runner giờ **từ chối chạy nếu CDP port còn daemon cũ** (chống dính trạng thái Chrome mồ côi).

**Windows vẫn CHƯA được thử** — round này vẫn chỉ macOS (không có môi trường Windows); web bundle không phụ thuộc font hệ thống/Python, nhưng cần máy Windows xác nhận khi Chủ dự án yêu cầu.

**Bundle lazy đo lại trên dist vừa rebuild (11:36, chứa fix):** `dist/576.js` 173.183 B + `66ca43b066485d1d.ttf` 31.284 B (gzip -9) = 204.467 B ≈ **199.7 KiB** < mốc 250 KB — khớp số thợ báo.

**Hạn chế ghi rõ:** trường format là `<select>` native — popup do OS vẽ, CDP không chụp được; ảnh `02_format_list_with_pdf.png` mở đúng element đó ở chế độ listbox (still the real live DOM list) để thấy dòng `.pdf`. Chrome chạy headful + `--enable-unsafe-swiftshader` (WebGL bắt buộc cho ThreeView; headless fail "Could not create a WebGL context").

## Việc reviewer cần xác nhận

- [x] PASS tỷ lệ 102.0 ± 0.2 mm trên **PDF từ UI** + Poppler/render checklist — integration `5a7ab574…` (đã duyệt SHA) + menu run đo vector 102.000 mm, delta 0.000 (08/11)
- [x] PASS bundle lazy ~200 KiB gzip (đo lại 199.7 — re-measure 08/11 trên dist mới: 204.467 B gzip)
- [x] PASS Hủy clip không tải / Xác nhận cắt mép khớp preview — tích hợp: `output/integration/clip_cancel_confirm_evidence.json` (`0552eb98…` đã duyệt SHA); **menu thật (08/11 12:30)**: Hủy→0 file + 0 event tải, Xuất (cắt mép)→file browser `76f217c5…`, clip rect (10,10,277,190) mm giống hệt integration, overflow 89.667 mm = excess preview
- [x] Phân biệt rõ `output/ui/` vs `output/script/` — `output/ui/` đã relabel `integration/`, bằng chứng click menu thật nằm `output/menu-ui/`
- [ ] Cho phép (hoặc từ chối) triển khai VPS sau khi chốt — **cần Chủ dự án quyết**

---

## SHA phát hành VPS (PDF đã nghiệm thu + bản sửa test) — 08/11/2026

Branch `release/pdf-v1-tests`, tip **`99ac37cf5dff3e8724faa05d5246d3e6ac8b3366`**.
Gốc: `2c72ecec` (PDF v1 đã nghiệm thu — code PDF byte-identical) + cherry-pick đúng 6 commit:
`6c15b231` (ticket docs) · `11134899` (fix mock v1 = `918d0b67`) · `ca793db5` (fix ownership v2 = `1d2ef2a0`,
ticket đã ĐÓNG tại reviewer) · `af7ce05f` (chore .gitignore) · `be462f89` (ghi kết quả) · `99ac37cf` (ghi đóng).

**Phạm vi diff so với `2c72ecec` (10 file, chỉ test/docs/.gitignore — không app code, không C1):**
`.gitignore` · `ROADMAP.md` · `docs/tasks/TASK-40-bug-localstorage-suite-pollution.md` ·
`packages/core/test-utils/localStorageMock.ts` · `packages/core/test-utils/setup.ts` ·
`packages/core/test/localStorageMock.test.ts` (7 ca) · `packages/core/test/objectStorage.test.ts` ·
`packages/core/test/config.test.ts` · `packages/core/test/navigation.test.ts` ·
`packages/builder/test/appBuilder.test.ts`.

**Kiểm tra trên SHA phát hành:** `npm run test` RUN1 tại `be462f89` (tree code) = **10270 passed / 0 failed, exit 0**;
RUN2 tại tip `99ac37cf` (chênh docs-only) = **10270 / 0, exit 0**. Tổng dev hiện tại là 10295 — đúng 25 ca
C1/C2 governance **không có** trong bản phát hành này (chờ Reviewer nghiệm thu C1 tại `8ab2c4ab`).

**Windows: CÒN CHỜ XÁC NHẬN** — chưa có môi trường; mọi kết quả trên là macOS arm64.
Quyết định deploy VPS: của Chủ dự án — branch/SHA đã sẵn, Hermes không tự push/deploy.
