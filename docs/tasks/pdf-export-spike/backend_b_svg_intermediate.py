# Part of the Chili3d Project, under the AGPL-3.0 License.
"""Backend B: emit SVG (vector intermediate) then convert to PDF via svglib+reportlab."""

from __future__ import annotations

import time
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg

from sample_drawing import SampleDrawing, layout_drawing, mm, model_to_paper

OUT = Path(__file__).resolve().parent / "output"
TMP = Path(__file__).resolve().parent / "tmp"


def _svg_for(drawing: SampleDrawing, layout) -> str:
    """Build an SVG page matching the PDF layout (same origin/scale/margins)."""
    w, h = layout.page_w, layout.page_h

    def p(x_mm: float, y_mm: float) -> tuple[float, float]:
        # SVG y grows downward; flip from PDF coords.
        px, py = model_to_paper(layout, x_mm, y_mm)
        return px, h - py

    x0, y0 = p(0, 0)
    x1, y1 = p(drawing.width_mm, drawing.height_mm)
    # After flip, y1 < y0 for rectangle top
    rx, ry = min(x0, x1), min(y0, y1)
    rw, rh = abs(x1 - x0), abs(y0 - y1)

    inset = 150.0
    ix0, iy0 = p(inset, inset)
    ix1, iy1 = p(drawing.width_mm - inset, drawing.height_mm - inset)
    irx, iry = min(ix0, ix1), min(iy0, iy1)
    irw, irh = abs(ix1 - ix0), abs(iy0 - iy1)

    mx = drawing.width_mm / 2
    cx0, cy0 = p(mx, 0)
    cx1, cy1 = p(mx, drawing.height_mm)

    r = drawing.fillet_r_mm
    # Arc: SVG path A — from (0,r) to (r,0) in model (left → bottom of fillet)
    ax0, ay0 = p(0, r)
    ax1, ay1 = p(r, 0)
    r_paper = mm(r / layout.scale)

    dim_off = 350.0
    d1x, d1y = p(0, -dim_off * 0.85)
    d2x, d2y = p(drawing.width_mm, -dim_off * 0.85)
    e1x, e1y = p(0, -dim_off)
    e2x, e2y = p(drawing.width_mm, -dim_off)
    t0x, t0y = p(0, 0)
    t1x, t1y = p(drawing.width_mm, 0)
    mid_x = (d1x + d2x) / 2
    mid_y = (d1y + d2y) / 2 - 4

    m = layout.margin_pt
    clip_w = w - 2 * m
    clip_h = h - 2 * m

    warn = ""
    if layout.clip:
        ox, oy = layout.clip_excess_mm
        warn = (
            f'<text x="{m}" y="18" fill="#c00" font-size="9" font-family="Arial, sans-serif">'
            f"CANH BAO: ty le 1:{int(layout.scale)} cat thua ~ {ox:.1f}x{oy:.1f} mm</text>"
        )

    expected = drawing.width_mm / layout.scale
    bar_x1 = m + mm(expected)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <clipPath id="pageMargin">
      <rect x="{m}" y="{m}" width="{clip_w}" height="{clip_h}"/>
    </clipPath>
  </defs>
  <text x="{m}" y="14" font-size="11" font-family="Arial, sans-serif">{escape(drawing.title)}</text>
  {warn}
  <g clip-path="url(#pageMargin)" fill="none" stroke="#000">
    <rect x="{rx}" y="{ry}" width="{rw}" height="{rh}" stroke-width="{mm(drawing.continuous_w_mm)}"/>
    <rect x="{irx}" y="{iry}" width="{irw}" height="{irh}" stroke-width="{mm(drawing.thin_w_mm)}"/>
    <line x1="{cx0}" y1="{cy0}" x2="{cx1}" y2="{cy1}" stroke-width="{mm(drawing.dashed_w_mm)}"
          stroke-dasharray="3 2"/>
    <path d="M {ax0} {ay0} A {r_paper} {r_paper} 0 0 0 {ax1} {ay1}"
          stroke="#1a1a8c" stroke-width="{mm(drawing.continuous_w_mm)}"/>
    <line x1="{t0x}" y1="{t0y}" x2="{e1x}" y2="{e1y}" stroke-width="{mm(drawing.thin_w_mm)}"/>
    <line x1="{t1x}" y1="{t1y}" x2="{e2x}" y2="{e2y}" stroke-width="{mm(drawing.thin_w_mm)}"/>
    <line x1="{d1x}" y1="{d1y}" x2="{d2x}" y2="{d2y}" stroke-width="{mm(drawing.continuous_w_mm)}"/>
    <text x="{mid_x}" y="{mid_y}" fill="#000" stroke="none" font-size="9"
          font-family="Arial, sans-serif" text-anchor="middle">{escape(drawing.dim_text)}</text>
  </g>
  <text x="{m}" y="{h - 6}" font-size="8" font-family="Arial, sans-serif">{escape(drawing.note_vi)}</text>
  <line x1="{m}" y1="{h - 18}" x2="{bar_x1}" y2="{h - 18}" stroke="#00730a" stroke-width="{mm(0.5)}"/>
  <text x="{m}" y="{h - 22}" fill="#005a08" font-size="7" font-family="Arial, sans-serif">
    Thanh kiem: canh 5.100 @ 1:{int(round(layout.scale))} = {expected:.3f} mm giay
  </text>
</svg>
"""


def export_pdf(
    path: Path,
    *,
    size: str = "A3",
    landscape: bool = True,
    fit: bool = False,
    scale: float | None = None,
) -> dict:
    drawing = SampleDrawing(scale=scale) if scale is not None else SampleDrawing()
    layout = layout_drawing(drawing, size=size, landscape=landscape, fit=fit)
    TMP.mkdir(parents=True, exist_ok=True)
    svg_path = TMP / (path.stem + ".svg")

    t0 = time.perf_counter()
    svg_path.write_text(_svg_for(drawing, layout), encoding="utf-8")
    drawing_rl = svg2rlg(str(svg_path))
    if drawing_rl is None:
        raise RuntimeError(f"svglib failed to parse {svg_path}")
    # svglib treats unitless SVG width/height as CSS px (96 dpi). PDF uses 72 pt/in,
    # so the drawing comes back at 72/96 = 0.75 of the intended page. Rescale + force
    # MediaBox to the layout page size so paper mm match backend A.
    sx = layout.page_w / drawing_rl.width if drawing_rl.width else 1.0
    sy = layout.page_h / drawing_rl.height if drawing_rl.height else 1.0
    drawing_rl.scale(sx, sy)
    drawing_rl.width = layout.page_w
    drawing_rl.height = layout.page_h
    renderPDF.drawToFile(drawing_rl, str(path), fmt="PDF")
    elapsed_ms = (time.perf_counter() - t0) * 1000
    expected_paper_mm = drawing.width_mm / layout.scale
    return {
        "backend": "B_svg_intermediate",
        "path": str(path),
        "svg_path": str(svg_path),
        "bytes": path.stat().st_size,
        "svg_bytes": svg_path.stat().st_size,
        "elapsed_ms": round(elapsed_ms, 2),
        "page": size,
        "landscape": landscape,
        "fit": fit,
        "scale": layout.scale,
        "clip": layout.clip,
        "clip_excess_mm": layout.clip_excess_mm,
        "expected_edge_paper_mm": expected_paper_mm,
        "svglib_px_rescale": (round(sx, 4), round(sy, 4)),
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    print(export_pdf(OUT / "sample_B_svg_A3_1to50.pdf", size="A3", landscape=True, fit=False))
    print(export_pdf(OUT / "sample_B_svg_A4_1to15_CLIP.pdf", size="A4", landscape=True, fit=False, scale=15))
    print(export_pdf(OUT / "sample_B_svg_A4_fit.pdf", size="A4", landscape=True, fit=True))
