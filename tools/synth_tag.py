"""Compose synthetic tag strips: several symbols in a row, then degraded.

Stage 1 (finding and cutting out each symbol) is the only stage with no
measurement behind it, because it needs whole tags rather than single glyphs.
Real tags are still the thing that matters, but a synthetic strip at least
answers "does the segmentation code work at all, and where does it start to
drop symbols" before anyone points a phone at a shirt.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/synth_tag.py dataset/clean tools/.build/tags [strips_per_setting]
"""

import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from degrade import degrade  # noqa: E402

# Longest side of ONE symbol after the downscale. The measured floor for the
# underbars is 100px (tools/RESOLUTION.md), so the sweep brackets it.
PX_PER_SYMBOL = [200, 150, 120, 100, 80, 60]

# One symbol per category, which is what a real care label carries.
CATEGORY_ORDER = ["wash", "bleach", "tumble", "natural", "iron", "dryclean"]

FIXED_SEVERITY = 2


def compose(symbols, images, gap_ratio: float, margin_ratio: float) -> Image.Image:
    """Paste the clean renders side by side on white, with gaps and a margin."""
    hs = [im.height for im in images]
    h = max(hs)
    gap = int(round(h * gap_ratio))
    margin = int(round(h * margin_ratio))
    total_w = sum(im.width for im in images) + gap * (len(images) - 1) + margin * 2
    strip = Image.new("L", (total_w, h + margin * 2), 255)
    x = margin
    for im in images:
        strip.paste(im, (x, margin + (h - im.height) // 2))
        x += im.width + gap
    return strip


def main() -> None:
    clean_dir = sys.argv[1]
    out_prefix = sys.argv[2]
    per_setting = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    items = index["items"]

    by_cat: dict[str, list] = {}
    for it in items:
        by_cat.setdefault(it["category"], []).append(it)

    rng = np.random.default_rng(90210)
    records = []
    offset = 0

    with open(out_prefix + ".bin", "wb") as blob:
        for px in PX_PER_SYMBOL:
            for k in range(per_setting):
                chosen = []
                for cat in CATEGORY_ORDER:
                    pool = by_cat[cat]
                    chosen.append(pool[int(rng.integers(0, len(pool)))])
                images = [
                    Image.open(os.path.join(clean_dir, it["file"])).convert("L")
                    for it in chosen
                ]
                strip = compose(
                    chosen,
                    images,
                    gap_ratio=float(rng.uniform(0.18, 0.35)),
                    margin_ratio=float(rng.uniform(0.10, 0.22)),
                )
                # degrade() scales by the longest side, so convert "px per symbol"
                # into a target for the whole strip.
                target = int(round(px * strip.width / images[0].width))
                out = degrade(strip, FIXED_SEVERITY, rng, target=target)

                arr = np.asarray(out, dtype=np.uint8)
                blob.write(arr.tobytes())
                records.append(
                    {
                        "offset": offset,
                        "w": int(arr.shape[1]),
                        "h": int(arr.shape[0]),
                        "px_per_symbol": px,
                        "index": k,
                        "codes": [it["code"] for it in chosen],
                    }
                )
                offset += arr.size

    with open(out_prefix + ".json", "w", encoding="utf-8") as f:
        json.dump({"records": records, "px_per_symbol": PX_PER_SYMBOL}, f)
    print(
        "wrote %d strips (%.1f MB) across %d settings"
        % (len(records), offset / 1e6, len(PX_PER_SYMBOL))
    )


if __name__ == "__main__":
    main()
