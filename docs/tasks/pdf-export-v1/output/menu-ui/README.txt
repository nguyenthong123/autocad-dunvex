MENU/RIBBON UI — real file.export clicks (no exporter-API shortcuts)
====================================================================

A3 run (menu_ui_acceptance.mjs, 08/11 12:30 — final code post-biome):
  01 export panel before .pdf · 02 format listbox with .pdf selected (real live DOM list)
  03 panel A3/Ngang/1:50 · 04 preview dialog (1:50.00 · A3 landscape, longest edge 102.000 mm)
  from_menu_A3_1to50.pdf = browser-downloaded copy,
  SHA256 a7a7e913dbceaae7097cce026cfa0b46bc8330ee1421c6a7f8f0a65ca70a9a11 (8952 B)
  Edge measured from the DOWNLOADED file's own content stream: horizontal segments
  102.000 mm paper (= 5100 mm @ 1:50), delta 0.000 mm, tol ±0.2 → PASS.
  (downloads/ original was later replaced by the clip run's same-named file; this copy
   keeps the SHA above.)

Clip run (menu_clip_acceptance.mjs, 08/11 12:30):
  05/06 clip preview dialogs (warning "Nội dung vượt khổ — thừa: 89.7 × 56.7 mm",
      buttons "Xuất (cắt mép)" / "Hủy bỏ")
  Phase cancel  → files 0→0, Page.downloadWillBegin events 0 (NO download)
  Phase confirm → browser saved edge-bottom-5100.pdf → from_menu_A4_1to15_CLIP.pdf
      SHA256 76f217c50f54e7767ea8dda8f4094fd2b2f9425de27e3913691d42a8becb6c05 (11077 B)
      Clip rect parsed from stream: (10,10,277,190) mm — identical to integration CLIP pdf.
      Full edge: 340.000 mm kept in stream; visible 250.333 + overflow past frame 89.667
      (= integration clipExcessMm[0]) → preview and downloaded file agree exactly.
  Render QA: right-side frame cut visible (centerline truncated, note text ends at frame).

Environment: macOS headful Chrome + --enable-unsafe-swiftshader (WebGL required for ThreeView),
dist rebuilt 08/11 11:36 from HEAD 0aca9ed0 (code == 0b396d8f).
Reports: menu_acceptance_report.json · menu_clip_report.json · clip_cancel_confirm_evidence.json
Windows: NOT tested in this round (no Windows environment available).
