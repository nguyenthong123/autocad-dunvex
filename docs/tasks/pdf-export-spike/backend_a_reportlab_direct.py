# Part of the Chili3d Project, under the AGPL-3.0 License.
"""Backend A: write PDF path operators directly with reportlab (no intermediate format)."""

from __future__ import annotations

import time
from pathlib import Path

from reportlab.lib.colors import Color, black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from sample_drawing import SampleDrawing, layout_drawing, mm, model_to_paper

OUT = Path(__file__).resolve().parent / "output"


def _register_vn_font() -> str:
    """Prefer a system TTF that covers Vietnamese; fall back to Helvetica."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        p = Path(path)
        if not p.exists():
            continue
        try:
            name = "DunvexSpikeVN"
            pdfmetrics.registerFont(TTFont(name, str(p)))
            return name
        except Exception:
            continue
    return "Helvetica"


def export_pdf(
    path: Path,
    *,
    size: str = "A3",
    landscape: bool = True,
    fit: bool = False,
    embed_font: bool = True,
    scale: float | None = None,
) -> dict:
    drawing = SampleDrawing(scale=scale) if scale is not None else SampleDrawing()
    layout = layout_drawing(drawing, size=size, landscape=landscape, fit=fit)
    font = _register_vn_font() if embed_font else "Helvetica"

    t0 = time.perf_counter()
    c = canvas.Canvas(str(path), pagesize=(layout.page_w, layout.page_h))
    c.setTitle(drawing.title)
    c.setAuthor("Dunvex CAD PDF spike")

    # Clip drawing content to printable margin so fixed-scale overflow is cut at the edge.
    c.saveState()
    clip = c.beginPath()
    clip.rect(
        layout.margin_pt,
        layout.margin_pt,
        layout.page_w - 2 * layout.margin_pt,
        layout.page_h - 2 * layout.margin_pt,
    )
    c.clipPath(clip, stroke=0)

    c.setStrokeColor(black)
    c.setLineWidth(mm(drawing.continuous_w_mm))
    c.setDash([])
    x0, y0 = model_to_paper(layout, 0, 0)
    x1, y1 = model_to_paper(layout, drawing.width_mm, drawing.height_mm)
    c.rect(x0, y0, x1 - x0, y1 - y0, stroke=1, fill=0)

    inset = 150.0
    c.setLineWidth(mm(drawing.thin_w_mm))
    ix0, iy0 = model_to_paper(layout, inset, inset)
    ix1, iy1 = model_to_paper(layout, drawing.width_mm - inset, drawing.height_mm - inset)
    c.rect(ix0, iy0, ix1 - ix0, iy1 - iy0, stroke=1, fill=0)

    c.setDash(3, 2)
    c.setLineWidth(mm(drawing.dashed_w_mm))
    mx = drawing.width_mm / 2
    cx0, cy0 = model_to_paper(layout, mx, 0)
    cx1, cy1 = model_to_paper(layout, mx, drawing.height_mm)
    c.line(cx0, cy0, cx1, cy1)
    c.setDash([])

    r = drawing.fillet_r_mm
    bx0, by0 = model_to_paper(layout, 0, 0)
    bx1, by1 = model_to_paper(layout, 2 * r, 2 * r)
    c.setLineWidth(mm(drawing.continuous_w_mm))
    c.setStrokeColor(Color(0.1, 0.1, 0.55))
    c.arc(bx0, by0, bx1, by1, 180, 90)

    dim_off = 350.0
    c.setStrokeColor(black)
    c.setLineWidth(mm(drawing.thin_w_mm))
    e1a, e1b = model_to_paper(layout, 0, 0), model_to_paper(layout, 0, -dim_off)
    e2a, e2b = model_to_paper(layout, drawing.width_mm, 0), model_to_paper(
        layout, drawing.width_mm, -dim_off
    )
    c.line(*e1a, *e1b)
    c.line(*e2a, *e2b)
    d1 = model_to_paper(layout, 0, -dim_off * 0.85)
    d2 = model_to_paper(layout, drawing.width_mm, -dim_off * 0.85)
    c.setLineWidth(mm(drawing.continuous_w_mm))
    c.line(*d1, *d2)
    ah = mm(1.5)
    for tip, direction in ((d1, 1), (d2, -1)):
        c.setFillColor(black)
        arrow = c.beginPath()
        arrow.moveTo(tip[0], tip[1])
        arrow.lineTo(tip[0] + direction * ah * 2.2, tip[1] + ah * 0.6)
        arrow.lineTo(tip[0] + direction * ah * 2.2, tip[1] - ah * 0.6)
        arrow.close()
        c.drawPath(arrow, fill=1, stroke=0)

    mid = model_to_paper(layout, drawing.width_mm / 2, -dim_off * 0.85)
    c.setFillColor(black)
    c.setFont(font, 9)
    c.drawCentredString(mid[0], mid[1] + mm(1.2), drawing.dim_text)

    c.restoreState()

    # Title / note outside the clip so they remain readable when content overflows.
    c.setFillColor(black)
    c.setFont(font, 11)
    c.drawString(layout.margin_pt, layout.page_h - mm(7), drawing.title)
    c.setFont(font, 8)
    c.drawString(layout.margin_pt, mm(3), drawing.note_vi)

    if layout.clip:
        c.setFillColor(Color(0.75, 0.05, 0.05))
        c.setFont(font, 9)
        ox, oy = layout.clip_excess_mm
        c.drawString(
            layout.margin_pt,
            layout.page_h - mm(12),
            f"CANH BAO: ty le 1:{int(layout.scale)} khong vua giay — cat thua ~ {ox:.1f}x{oy:.1f} mm. Chon A3 ngang hoac vua trang.",
        )

    expected_paper_mm = drawing.width_mm / layout.scale
    c.setStrokeColor(Color(0, 0.45, 0))
    c.setLineWidth(mm(0.5))
    bar_y = mm(12)
    bar_x0 = layout.margin_pt
    bar_x1 = bar_x0 + mm(expected_paper_mm)
    c.line(bar_x0, bar_y, bar_x1, bar_y)
    c.setFont(font, 7)
    c.setFillColor(Color(0, 0.35, 0))
    c.drawString(
        bar_x0,
        bar_y + mm(1.5),
        f"Thanh kiem: canh 5.100 @ 1:{int(round(layout.scale))} = {expected_paper_mm:.3f} mm giay",
    )

    c.showPage()
    c.save()
    elapsed_ms = (time.perf_counter() - t0) * 1000
    return {
        "backend": "A_reportlab_direct",
        "path": str(path),
        "bytes": path.stat().st_size,
        "elapsed_ms": round(elapsed_ms, 2),
        "page": size,
        "landscape": landscape,
        "fit": fit,
        "scale": layout.scale,
        "clip": layout.clip,
        "clip_excess_mm": layout.clip_excess_mm,
        "expected_edge_paper_mm": expected_paper_mm,
        "font": font,
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    print(export_pdf(OUT / "sample_A_direct_A3_1to50.pdf", size="A3", landscape=True, fit=False))
    # 1:50 fits A4 landscape for this sample; 1:15 forces a real clip warning.
    print(export_pdf(OUT / "sample_A_direct_A4_1to15_CLIP.pdf", size="A4", landscape=True, fit=False, scale=15))
    print(export_pdf(OUT / "sample_A_direct_A4_fit.pdf", size="A4", landscape=True, fit=True))
