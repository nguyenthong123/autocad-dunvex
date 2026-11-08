FROM LIVE WEB APP (production dist on localhost:8080)
====================================================
Path: planPdfExport → drawPdfPlanToCanvas (preview) → dataExchange.export(".pdf")
     → Chili3dCore.download()  — same writer path file.export uses after preview confirm.

Sample document built in-app: edge 5100 mm, arc r=400, centerline-dash, dim, VN text,
transformed-edge (tx=+10 → world x=110).

Files in THIS folder are UI evidence. Do NOT confuse with output/script/.

Key artifacts
-------------
from_ui_A3_1to50.pdf              downloaded PDF (A3 landscape 1:50)
from_ui_A3_1to50_preview.png      canvas preview of the SAME plan (same export)
from_ui_A3_1to50_render-1.png     pdftoppm 150 dpi of the downloaded PDF
from_ui_A4_1to15_CLIP.pdf         clip-confirm download (A4 landscape 1:15)
from_ui_A4_1to15_CLIP_preview.png clip preview (matches clipped result)
from_ui_A4_1to15_CLIP_render-1.png pdftoppm of clip PDF
clip_cancel_confirm_evidence.json Hủy = no download; Xác nhận = clipped PDF
acceptance_measure.json           geometric edge measure + SHA256 of artifacts
