# PDF kỹ thuật Dunvex CAD — bàn giao khảo sát & thử nghiệm

**Trạng thái:** chờ reviewer chốt phạm vi. **Chưa** triển khai vào app.  
**SHA khảo sát:** `3c450e85e9ba08e8e3585563fa7a92e23386c9b2` (`📝 docs(storage): record TASK-41 post-deploy verify results`)  
**Thư mục spike:** `docs/tasks/pdf-export-spike/`  
**Ngày:** 2026-11-08

---

## 1. Khảo sát codebase (tái sử dụng / khoảng trống)

### Luồng xuất hiện tại

| Thành phần | Vị trí | Ghi chú |
|---|---|---|
| Lệnh UI | `packages/app/src/commands/importExport.ts` (`file.export`) | Dialog chọn format từ `dataExchange.exportFormats()`, gọi `export(format, nodes)` |
| Data exchange | `packages/builder/src/defaultDataExchange.ts` | Formats: DXF/STEP/IGES/BREP/STL/PLY/OBJ — **không có PDF** |
| DXF 2D | `packages/builder/src/dxfConverter.ts` | LINE / CIRCLE / ARC đúng kiểu; Ellipse/Bezier/BSpline → LWPOLYLINE 32 đoạn; **không xuất TEXT / DIMENSION** |
| Annotation | `packages/core/src/model/annotation.ts` (`DimensionAnnotation`, `TextAnnotation`) | Layout đường kích thước: `planarDimensionLayout.ts` / `dimensionLayout.ts` |
| Chọn theo vùng | `packages/three/src/threeView.ts` `detectVisualRect` / `detectShapesRect` | Frustum/SelectionBox theo **viewport camera**, kèm annotation AABB — **không** phải paper-space print region |

### Có thể tái sử dụng cho PDF

- **Đường thẳng, cung tròn, hình tròn đầy:** cùng phân loại curve như DXF (`CurveUtils.isCircle` → ARC/CIRCLE; line → LINE).
- **Kích thước:** lấy geometry đã layout (`extension` / `dimension line` / arrows) từ `planarDimensionLayout` + chuỗi đo làm text searchable; không cần raster.
- **Chữ ghi chú:** `TextAnnotation` content + vị trí/plane — cần font nhúng (DXF hiện bỏ qua).
- **Chọn đối tượng:** `detectShapesRect` / `detectVisualRect` dùng được để **lọc node/edge trong vùng màn hình**, nhưng vùng in PDF phải là **hộp paper-space riêng** (mm trên tờ), không tái dùng trực tiếp frustum 3D làm khung trang.

### Chưa xuất đúng / chưa có đường

| Loại | Vấn đề |
|---|---|
| TEXT / ghi chú VN | DXF không ghi; cần font Unicode nhúng |
| DIMENSION (mọi kiểu) | Không có entity DXF; PDF phải tự vẽ từ layout |
| Ellipse / spline / bezier | Chỉ polyline mẫu 32 đoạn — cung “đúng” mất nếu không nâng sampler hoặc xuất curve |
| Angular / radial dim | Layout có, nhưng cần map riêng sang path PDF |
| Ảnh / view tô bóng | Không có pipeline paper-space; cần raster có giới hạn DPI |
| Vùng in paper-space | Chưa có; selection hiện tại là viewport crossing |
| Hình chiếu 3D che nét | **Ngoài phạm vi v1** (xem §6) |

---

## 2. Thiết kế luồng một tờ PDF vector (đề xuất UX)

```
[Chọn vùng in] → [Khổ A4|A3] [Ngang|Dọc] [Lề mm]
        → [Tỷ lệ cố định 1:n | Vừa trang]
        → [Kiểu nét: đậm/mảnh/đứt]
        → Preview (cùng Layout engine với exporter)
        → Nếu cố định không vừa: tô vùng bị cắt + excess_mm + gợi ý A3 / vừa trang
        → Xuất .pdf
```

**Quy tắc bố cục (đã prototype trong `sample_drawing.py`):**

- `Layout`: `page_w/h`, `origin`, `scale`, `margin_pt`, `clip`, `clip_excess_mm`.
- Model-mm → paper-pt: `pt = mm(model / scale)`; cùng hàm cho preview canvas và file.
- **Preview ≡ export:** một `layout_drawing()`; preview chỉ khác backend vẽ (Canvas/SVG DOM vs PDF writers).
- **Clip:** khi `fit=false` và content + 2×lề vượt khổ → `clip=true`, excess theo từng trục; spike A4 @ 1:15 → thừa ngang **63.0 mm** (cảnh báo đỏ trên trang).

**Mẫu đã chứng minh:** cạnh model **5100 mm** @ **1:50** → **102.0 mm** trên giấy; thanh kiểm xanh đo trên render 150 dpi ≈ **101.94 mm** (sai số pixel).

---

## 3. So sánh backend trên cùng bản mẫu

Cùng geometry: chữ nhật 5100×2550, nét đứt giữa, cung fillet, dim `5.100`, ghi chú tiếng Việt, thanh kiểm 102 mm.

| | **A — reportlab trực tiếp** | **B — SVG → svglib → PDF** | **C — pdf-lib (browser)** |
|---|---|---|---|
| File A3 1:50 | **33 760 B** | 35 847 B | **1 812 B** |
| Thời gian gen | **~6–11 ms** | ~8–45 ms | **~5–17 ms** |
| Khổ trang | A3 đúng 420×297 mm | Đúng sau rescale 96→72 dpi | A3 đúng |
| Curve operator (`c`/`v`/`y`) | **Có** (3) | **Có** (3) | **Không** (polyline ~25 `l`) |
| Font VN searchable | **Có** (`AAAAAA+ArialUnicodeMS` emb+sub+uni) | Có (Arial subset) | **Không** (Helvetica ASCII fallback) |
| `pdftotext` “Bản vẽ” / “Ghi chú” | OK | OK | Chỉ ASCII + `5.100` |
| Thanh 102 mm @150dpi | 101.94 mm | 101.94 mm | 101.94 mm |
| Bundle app | Python — **không** vào browser bundle | Python — không | **+~205 KB gzip** (`pdf-lib.esm.min.js` 523 KB raw); hiện `extraneous`, chưa trong `package.json` |
| Mac / Windows | Cần runtime Python+font hệ thống | Như A | **Chạy trong browser — đồng nhất** |

**Lỗi / bẫy quan sát được**

1. **B page size 0.75×** nếu không rescale: svglib hiểu width SVG unitless là CSS px @96 dpi; PDF 72 pt/in → MediaBox nhỏ hơn 25%. Đã vá bằng `drawing.scale(page/w)`.
2. **C không nhúng Unicode** với `StandardFonts.Helvetica` → mất dấu tiếng Việt.
3. **C không có cubic curve** → cung là xấp xỉ đoạn thẳng (spike dùng nhiều đoạn; vẫn nhìn mượt ở 150 dpi nhưng không phải path cong PDF).
4. **A/B phụ thuộc font máy** (`Arial Unicode.ttf` trên macOS) — Windows cần đường dẫn/font đóng gói riêng nếu dùng Python.
5. File A “noembed” chỉ **2 281 B** nhưng mất VN; embed subset ≈ **+31 KB** trên mẫu này (chấp nhận được).

**Kết luận đo được:** Layout/tỷ lệ **đúng trên cả ba** khi MediaBox đúng. Chất lượng kỹ thuật + chữ VN: **A ≥ B ≫ C (hiện trạng)**. Runtime app Dunvex là **browser** → **không chọn A/B làm writer production**; chọn **hướng C (pdf-lib hoặc tương đương)**, vá font nhúng + cung Bézier, **dùng chung Layout đã chứng minh ở A**.

---

## 4. Tối ưu theo nội dung

| Hạng mục | Việc làm | Kết quả spike |
|---|---|---|
| Hình học | Giữ path vector (`m`/`l`/`c`), không raster trang | A/B: curve+line trong content stream; C: line-only |
| Chữ | Searchable `Tj`/`TJ` + font subset nhúng | A: emb yes; C: standard font no emb |
| Font license | Đóng gói font OFL (vd. Noto Sans) trong app — **không** phụ thuộc Arial hệ thống | Việc triển khai sau khi duyệt |
| Tái sử dụng | Một font dict / page; không nhúng lại mỗi chuỗi | reportlab subset 1 font object |
| Ảnh / shaded | Giới hạn theo kích thước đặt trên trang, gợi ý **≤150 dpi** paper (hoặc 72 dpi nháp) | Chưa có trên mẫu; ghi nhận policy |
| Trước/sau tối ưu | `sample_A_opt_noembed.pdf` 2281 B vs embed 33760 B | Embed cần cho VN; không tối ưu bằng cách bỏ font |

---

## 5. Kiểm tra theo quy trình PDF skill (Poppler)

Công cụ: `pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm` (+ `pypdf` content stream). Script: `validate_pdfs.py` → `output/validation_report.json`.

### A3 @ 1:50 (mẫu chuẩn)

| Kiểm tra | A | B (đã vá) | C |
|---|---|---|---|
| `pdfinfo` Page size | 1190.55×841.89 pts (A3) | A3 | A3 |
| `pdffonts` emb+uni | ArialUnicodeMS yes | ArialMT yes | Helvetica **no** |
| `pdftotext` VN | “Bản vẽ…”, “Ghi chú…” | OK | ASCII fallback |
| Vector stream | `c`×3, `l`/`m`, text | tương tự | `l`/`m` only, 0 `c` |
| Thanh kiểm 5.100@1:50 | **102.000 mm** (text) / **101.94 mm** (PNG@150dpi) | cùng | cùng |
| Lề 10 mm | content inset | OK | OK |
| Nét mảnh / đứt / cung / ghi chú | Có | Có | Có (cung polyline; chữ ASCII) |
| Cắt mép | A4@1:15 CLIP — thừa 63 mm ngang, cảnh báo đỏ | tương tự | A4@1:50 (mẫu này vừa A4 — clip demo chính ở A/B 1:15) |

Preview PNG bàn giao:

- `output/preview_A_A3_1to50.png`
- `output/preview_A_A4_1to15_CLIP.png`
- `output/preview_B_A3_1to50.png`
- `output/preview_C_A3_1to50.png`

PDF mẫu: `output/sample_{A,B,C}_*.pdf`.

---

## 6. Phương án đề xuất (chờ duyệt)

### Phạm vi v1 (đề xuất làm)

1. **Một tờ**, vector, A4/A3, ngang/dọc, lề, tỷ lệ cố định | vừa trang, kiểu nét cơ bản.
2. **Vùng in paper-space** + preview dùng **cùng Layout** với exporter; cảnh báo cắt khi không vừa.
3. Writer **trong browser** (`pdf-lib` hoặc `svg2pdf.js` nếu chọn nhánh SVG preview):  
   - nhúng **font OFL subset**;  
   - LINE exact; ARC/CIRCLE → cubic Bézier (dung sai góc ≤1° hoặc 4 đoạn/90°);  
   - dim/text từ annotation layout + `pdftotext`-able.  
4. Móc vào `file.export` / `DefaultDataExchange.exportFormats()` thêm `.pdf` (sau khi duyệt).
5. Thu thập geometry từ selection (tái dùng `detectShapesRect` để lọc) rồi chiếu lên plane bản vẽ 2D đang active — **không** làm hidden-line 3D ở v1.

### Ngoài phạm vi v1 (hạng mục sau — tách rõ)

- Hình chiếu 3D có **che nét** (hidden-line / HLR).
- **Nhiều tờ** / atlas.
- **Layer PDF** (OCG).
- Xuất PDF từ view shaded chất lượng in ấn cao (chỉ policy DPI nếu có ảnh đính kèm).

### Tiêu chí nghiệm thu v1 (đề xuất)

1. Một tờ A3 ngang, tỷ lệ 1:50: cạnh model 5100 mm → **102.0 ± 0.2 mm** trên giấy khi in 100% (đo thanh kiểm hoặc cạnh vector).
2. `pdffonts`: ít nhất một font **emb=yes** hỗ trợ đủ glyph tiếng Việt của title/note mẫu.
3. `pdftotext` lấy được `5.100` và chuỗi có dấu (không thay bằng ``).
4. Content stream có path vector (không raster toàn trang); cung không vỡ răng cưa rõ ở 150 dpi.
5. Preview và file xuất cùng khổ/tỷ lệ/lề; khi cố định không vừa → UI + trang thể hiện vùng cắt / excess.
6. Chạy được trên **Mac và Windows** qua cùng build web (không phụ thuộc Python/font hệ thống).
7. Bundle tăng thêm **≤ ~250 KB gzip** cho thư viện PDF (hoặc ghi rõ nếu chọn nặng hơn).

### Việc reviewer cần chốt

- [ ] Đồng ý phạm vi v1 vs hạng mục sau (§6).
- [ ] Chọn writer: **pdf-lib + font nhúng** (khuyến nghị) hay **SVG trung gian → svg2pdf** (preview DOM = export).
- [ ] Font đóng gói (Noto Sans / khác) + license OK.
- [ ] Vùng in: chỉ objects đã chọn, hay mọi object giao hộp paper-space.
- [ ] Cho phép triển khai vào `file.export` sau khi duyệt tài liệu này.

---

## 7. Cách tái chạy spike

```bash
cd docs/tasks/pdf-export-spike
python3 -m venv .venv && .venv/bin/pip install reportlab svglib pypdf pillow
.venv/bin/python backend_a_reportlab_direct.py
.venv/bin/python backend_b_svg_intermediate.py
node backend_c_pdf_lib.mjs   # cần pdf-lib (npm i -D pdf-lib nếu thiếu)
.venv/bin/python validate_pdfs.py
```

Không merge spike vào runtime app cho đến khi reviewer duyệt.
