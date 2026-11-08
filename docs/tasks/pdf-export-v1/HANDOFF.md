# PDF kỹ thuật v1 — bàn giao nghiệm thu

**Trạng thái:** chờ reviewer duyệt VPS sau bằng chứng UI. **Chưa** triển khai VPS.  
**Survey SHA:** `3c450e85`  
**Implementation SHA (feat):** `a109d26e4892a89d24a14df1c822e45986a9603a`  
**UI-acceptance fix SHA:** _(commit chứa sau khi ghi handoff — textHeight ÷ scale + dashed-by-name)_  
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

## Việc reviewer cần xác nhận

- [ ] PASS tỷ lệ 102.0 ± 0.2 mm trên **PDF từ UI** + Poppler/render checklist
- [ ] PASS bundle lazy ~200 KiB gzip (đo lại 199.7)
- [ ] PASS Hủy clip không tải / Xác nhận cắt mép khớp preview
- [ ] Phân biệt rõ `output/ui/` vs `output/script/`
- [ ] Cho phép (hoặc từ chối) triển khai VPS sau khi chốt
