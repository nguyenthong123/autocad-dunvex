# PDF kỹ thuật v1 — bàn giao nghiệm thu

**Trạng thái:** chờ reviewer nghiệm thu. **Chưa** triển khai VPS.  
**Survey SHA:** `3c450e85`  
**Implementation tip (commit handoff):** xem `git log -1` sau khi merge commit bàn giao.  
**Thư mục:** `docs/tasks/pdf-export-v1/`

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

## Nghiệm thu tỷ lệ (mẫu A3 ngang 1:50)

File: `output/sample_app_A3_1to50.pdf` · preview: `output/preview_app_A3_1to50-1.png`

| Kiểm tra | Kết quả |
|---|---|
| Cạnh 5100 mm @ 1:50 trong tọa độ PDF | **102.0 mm** (tol ±0.2) — PASS |
| `pdfinfo` Page size | 1190.55 × 841.89 pts (A3) |
| `pdffonts` | `NotoSans-Regular-…` CID TrueType, **emb=yes**, uni=yes |
| `pdftotext` | Có “Bản vẽ…”, “Ghi chú…”, “5.100”, “102.000 mm giấy” |
| Content stream | `c` (cubic) ≥1, `l` paths, text ops — vector, không raster trang |
| `pdftoppm` 150 dpi | Preview PNG đã lưu |
| Sai lệch cung r=400 @ 1:50 | ≈ **0.002 mm** giấy (< 0.01) |

## Dung lượng / tốc độ / bundle

| Mẫu | Bytes | Thời gian ghi |
|---|---|---|
| Sample A3 1:50 (acceptance) | 9 693 | ~17 ms |
| Lưới lớn hơn (500 nét + font) | 10 718 | ~18 ms |
| Unit `writePdfPlan` (sample plan) | >5 KB | <5 s (thường ≪100 ms) |

**Tải thêm production (lazy khi mở PDF):**

| Asset | raw | gzip |
|---|---|---|
| `576.js` (pdf-lib + fontkit chunk) | 432 124 | **173.2 KiB** |
| `*.ttf` Noto subset | 62 744 | **30.5 KiB** |
| **Tổng khi mở tính năng** | | **≈ 199.6 KiB gzip** |

Mốc khảo sát 250 KB gzip: **đạt** (~200 KiB). Writer chỉ nạp qua `preloadPdfWriter` / `export('.pdf')` — không vào critical path khởi động.

**Mac / Windows:** cùng bundle web; không phụ thuộc font hệ thống / Python.

## Test / build

```bash
npx rstest packages/core/test/pdfLayout.test.ts packages/builder/test/pdfExport.test.ts
npx rstest packages/builder/test/defaultDataExchange.test.ts packages/app/test/commands/importExport.test.ts
node docs/tasks/pdf-export-v1/accept_sample.mjs
SKIP_TYPECHECK=true npm run build   # đã xanh local
```

## Luồng code chính

- `packages/core/src/pdf/` — layout, Bézier, `PdfExportPlan`, canvas preview
- `packages/builder/src/pdf/` — collect từ selection, `pdf-lib` writer, sample plan, font OFL
- `DefaultDataExchange` — `.pdf` trong `exportFormats`, `planPdfExport`, `preloadPdfWriter`
- `Export` command — thuộc tính trang (dependency `format=.pdf`), dialog preview/clip

## Việc reviewer cần xác nhận

- [ ] PASS tỷ lệ 102.0 ± 0.2 mm + Poppler checklist
- [ ] PASS bundle lazy ~200 KiB gzip
- [ ] UX preview/clip/skipped chấp nhận được
- [ ] Cho phép (hoặc từ chối) triển khai VPS sau khi chốt
