# Part of the Chili3d Project, under the AGPL-3.0 License.
"""Validate spike PDFs with Poppler + pypdf (PDF skill workflow)."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from pypdf import PdfReader

OUT = Path(__file__).resolve().parent / "output"
TMP = Path(__file__).resolve().parent / "tmp"


def run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)


def pdfinfo(path: Path) -> dict:
    text = run(["pdfinfo", str(path)])
    data = {}
    for line in text.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            data[k.strip()] = v.strip()
    return data


def pdffonts(path: Path) -> str:
    return run(["pdffonts", str(path)])


def pdftotext(path: Path) -> str:
    return run(["pdftotext", "-layout", str(path), "-"])


def has_vector_ops(path: Path) -> dict:
    """Heuristic: content stream contains path/text operators (not only image XObjects)."""
    reader = PdfReader(str(path))
    page = reader.pages[0]
    raw = page.get_contents()
    if raw is None:
        return {"has_contents": False}
    data = raw.get_data() if hasattr(raw, "get_data") else bytes(raw)
    # Flatten if array
    if isinstance(raw, list):
        data = b"".join(x.get_data() for x in raw)
    text = data.decode("latin-1", errors="ignore")
    return {
        "has_contents": True,
        "has_moveto": " m\n" in text or " m " in text or re.search(r"\bm\b", text) is not None,
        "has_lineto": re.search(r"\bl\b", text) is not None,
        "has_curve": re.search(r"\b[cvy]\b", text) is not None,
        "has_text": "Tj" in text or "TJ" in text,
        "has_image": "/Image" in text or "Do\n" in text and "Im" in text,
        "stream_bytes": len(data),
    }


def measure_page_mm(info: dict) -> tuple[float, float] | None:
    # "Page size:       1190.55 x 841.89 pts (A3)"
    m = re.search(r"([\d.]+)\s*x\s*([\d.]+)\s*pts", info.get("Page size", ""))
    if not m:
        return None
    w_pt, h_pt = float(m.group(1)), float(m.group(2))
    return w_pt * 25.4 / 72.0, h_pt * 25.4 / 72.0


def validate_one(path: Path) -> dict:
    info = pdfinfo(path)
    fonts = pdffonts(path)
    text = pdftotext(path)
    vector = has_vector_ops(path)
    page_mm = measure_page_mm(info)

    # Render for visual QA
    TMP.mkdir(parents=True, exist_ok=True)
    png_prefix = TMP / path.stem
    run(["pdftoppm", "-png", "-r", "150", str(path), str(png_prefix)])
    pngs = sorted(TMP.glob(path.stem + "*.png"))

    expected_102 = "102" in text or "102.000" in text or "102.0" in text
    has_vi = ("Ghi chú" in text) or ("Bản vẽ" in text) or ("5.100" in text)
    # ASCII-fallback samples still carry 5.100
    has_dim = "5.100" in text

    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "pdfinfo": info,
        "page_mm": page_mm,
        "fonts_raw": fonts,
        # pdffonts columns: name type encoding emb sub uni — parse the emb column (yes/no).
        "fonts_embedded": any(
            re.match(r"^\S+\s+\S+\s+\S+\s+yes\b", line) for line in fonts.splitlines()[2:]
        ),
        "text_excerpt": text[:500],
        "has_vietnamese_or_dim": has_vi or has_dim,
        "has_dim_5100": has_dim,
        "scale_bar_mentions_102": expected_102,
        "vector": vector,
        "pngs": [str(p) for p in pngs],
    }


def main() -> None:
    results = []
    for path in sorted(OUT.glob("sample_*.pdf")):
        results.append(validate_one(path))
    out = OUT / "validation_report.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
