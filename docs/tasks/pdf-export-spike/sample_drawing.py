# Part of the Chili3d Project, under the AGPL-3.0 License.
# Sample technical drawing in millimetres (model space).
# Edge length 5100 mm (shown as "5.100" in VN thousands notation) at 1:50 → 102 mm on paper.

from __future__ import annotations

from dataclasses import dataclass, field


# Paper sizes in points (1 pt = 1/72 in). reportlab uses points.
MM_TO_PT = 72.0 / 25.4


def mm(v: float) -> float:
    return v * MM_TO_PT


A4_PORTRAIT = (mm(210), mm(297))
A4_LANDSCAPE = (mm(297), mm(210))
A3_PORTRAIT = (mm(297), mm(420))
A3_LANDSCAPE = (mm(420), mm(297))


@dataclass
class SampleDrawing:
    """Planar technical sample: rectangle, dashed centreline, arc fillet, notes, dimension."""

    # Model-space mm. Bottom edge is the measured 5100 mm edge.
    width_mm: float = 5100.0
    height_mm: float = 2550.0
    fillet_r_mm: float = 400.0
    scale: float = 50.0  # 1:50
    margin_mm: float = 10.0
    title: str = "Bản vẽ mẫu PDF kỹ thuật — Dunvex CAD"
    note_vi: str = "Ghi chú: cạnh dài 5.100 mm · tỷ lệ 1:50 · kiểm tra in 100%"
    dim_text: str = "5.100"

    # Line styles (model stroke width in paper mm after scale is separate)
    continuous_w_mm: float = 0.35
    thin_w_mm: float = 0.18
    dashed_w_mm: float = 0.18

    def paper_size(self, size: str, landscape: bool) -> tuple[float, float]:
        key = (size.upper(), landscape)
        return {
            ("A4", False): A4_PORTRAIT,
            ("A4", True): A4_LANDSCAPE,
            ("A3", False): A3_PORTRAIT,
            ("A3", True): A3_LANDSCAPE,
        }[key]

    def content_size_on_paper_mm(self) -> tuple[float, float]:
        return self.width_mm / self.scale, self.height_mm / self.scale

    def fits_on_page(self, size: str, landscape: bool) -> bool:
        pw, ph = self.paper_size(size, landscape)
        cw, ch = self.content_size_on_paper_mm()
        m = self.margin_mm
        return mm(cw) + mm(2 * m) <= pw and mm(ch) + mm(2 * m) <= ph

    def clip_excess_mm(self, size: str, landscape: bool) -> tuple[float, float]:
        """How much content overflows printable area (width, height) in paper-mm; 0 if fits."""
        pw, ph = self.paper_size(size, landscape)
        cw, ch = self.content_size_on_paper_mm()
        m = self.margin_mm
        avail_w = pw / MM_TO_PT - 2 * m
        avail_h = ph / MM_TO_PT - 2 * m
        return max(0.0, cw - avail_w), max(0.0, ch - avail_h)


@dataclass
class Layout:
    page_w: float
    page_h: float
    origin_x: float  # paper pts of model (0,0)
    origin_y: float
    scale: float  # model-mm → paper-mm factor is 1/scale; pts = mm(model/scale)
    margin_pt: float
    clip: bool
    clip_excess_mm: tuple[float, float]


def layout_drawing(
    drawing: SampleDrawing,
    *,
    size: str = "A3",
    landscape: bool = True,
    fit: bool = False,
) -> Layout:
    page_w, page_h = drawing.paper_size(size, landscape)
    margin_pt = mm(drawing.margin_mm)
    if fit:
        cw, ch = drawing.content_size_on_paper_mm()
        # Recompute scale so content + margins fit.
        avail_w = page_w - 2 * margin_pt
        avail_h = page_h - 2 * margin_pt
        # content on paper pts at scale s: mm(drawing.width_mm / s)
        # want mm(W/s) <= avail → s >= W / (avail/MM_TO_PT)
        s_w = drawing.width_mm / (avail_w / MM_TO_PT)
        s_h = drawing.height_mm / (avail_h / MM_TO_PT)
        scale = max(s_w, s_h)
        excess = (0.0, 0.0)
        clip = False
    else:
        scale = drawing.scale
        excess = drawing.clip_excess_mm(size, landscape)
        clip = excess[0] > 1e-6 or excess[1] > 1e-6

    content_w = mm(drawing.width_mm / scale)
    content_h = mm(drawing.height_mm / scale)
    origin_x = margin_pt
    origin_y = page_h - margin_pt - content_h
    return Layout(
        page_w=page_w,
        page_h=page_h,
        origin_x=origin_x,
        origin_y=origin_y,
        scale=scale,
        margin_pt=margin_pt,
        clip=clip,
        clip_excess_mm=excess,
    )


def model_to_paper(layout: Layout, x_mm: float, y_mm: float) -> tuple[float, float]:
    """Model mm (y up) → PDF pts (y up from bottom)."""
    s = layout.scale
    return layout.origin_x + mm(x_mm / s), layout.origin_y + mm(y_mm / s)
