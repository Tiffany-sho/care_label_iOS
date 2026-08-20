"""Compose synthetic *care labels*, not bare symbol strips.

Why this replaces synth_tag.py as the Stage 1 benchmark
-------------------------------------------------------
synth_tag.py put 6 symbols on a blank strip and the segmentation scored 100%.
On real tags it found 2-3 of 6 and resolved none. The gap is not subtle: a real
care label is dense with text -- fibre content, brand, size, warnings -- and the
symbol row is a minority of the ink on it. A benchmark without that text was
measuring an easier problem than the one the app has, and the 100% was
misleading rather than merely optimistic.

So: text lines above and below, a border, varied fonts and sizes, and the
symbol row somewhere in the middle.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/synth_label.py dataset/clean tools/.build/labels [labels_per_setting]
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from degrade import degrade  # noqa: E402

PX_PER_SYMBOL = [200, 150, 120, 100, 80]
CATEGORY_ORDER = ["wash", "bleach", "tumble", "natural", "iron", "dryclean"]
FIXED_SEVERITY = 2

FONTS = [
    "C:/Windows/Fonts/meiryo.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
    "C:/Windows/Fonts/YuGothR.ttc",
]

# 実物のタグに載っている類の文字列。記号の周りを埋めるのが目的なので、
# 意味よりも「行数・文字種・密度」が実物に近いことを優先する。
TOP_LINES = [
    ["綿 100%", "COTTON 100%"],
    ["ポリエステル 65%", "綿 35%"],
    ["表地 ナイロン 100%", "裏地 ポリエステル 100%"],
    ["毛 80%  アクリル 20%"],
    ["レーヨン 55% 麻 45%"],
]
BOTTOM_LINES = [
    ["タンブル乾燥はお避けください", "MADE IN JAPAN"],
    ["淡色と分けて洗ってください", "日本製"],
    ["蛍光増白剤の入っていない洗剤をご使用ください"],
    ["摩擦により色移りすることがあります", "MADE IN CHINA"],
    ["形を整えて干してください", "アイロンは当て布を使用"],
]
BRANDS = ["STUDIO KIKKA", "no.42", "MUJIRO", "HANEDA CLOTH", "kotoba"]
SIZES = ["M", "L", "S", "38", "F"]


def text_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def compose_label(symbols, images, rng: np.random.Generator) -> Image.Image:
    """Symbol row in the middle, text above and below, thin border."""
    h = max(im.height for im in images)
    gap = int(round(h * float(rng.uniform(0.16, 0.32))))
    row_w = sum(im.width for im in images) + gap * (len(images) - 1)

    font_path = FONTS[int(rng.integers(0, len(FONTS)))]
    small = text_font(font_path, max(10, int(h * 0.16)))
    tiny = text_font(font_path, max(9, int(h * 0.13)))
    brand_font = text_font(font_path, max(11, int(h * 0.20)))

    top = TOP_LINES[int(rng.integers(0, len(TOP_LINES)))]
    bottom = BOTTOM_LINES[int(rng.integers(0, len(BOTTOM_LINES)))]
    brand = BRANDS[int(rng.integers(0, len(BRANDS)))]
    size_txt = SIZES[int(rng.integers(0, len(SIZES)))]

    pad = int(h * 0.22)
    line_h = int(h * 0.24)
    top_block = line_h * (len(top) + 1)
    bottom_block = line_h * (len(bottom) + 1)

    width = max(row_w + pad * 2, int(row_w * 1.15))
    height = pad * 2 + top_block + h + bottom_block
    label = Image.new("L", (width, height), 255)
    d = ImageDraw.Draw(label)

    # タグの外枠。実物は縫い付けの線や折り返しが入る
    d.rectangle(
        [1, 1, width - 2, height - 2], outline=0, width=max(1, int(h * 0.012))
    )

    y = pad
    d.text((pad, y), brand, font=brand_font, fill=0)
    d.text((width - pad, y), size_txt, font=brand_font, fill=0, anchor="ra")
    y += line_h
    for line in top:
        d.text((pad, y), line, font=small, fill=0)
        y += line_h

    x = (width - row_w) // 2
    row_y = y
    for im in images:
        label.paste(im, (x, row_y + (h - im.height) // 2))
        x += im.width + gap
    y = row_y + h + int(line_h * 0.5)

    for line in bottom:
        d.text((pad, y), line, font=tiny, fill=0)
        y += line_h

    return label, (row_y, h)


def main() -> None:
    clean_dir = sys.argv[1]
    out_prefix = sys.argv[2]
    per_setting = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    by_cat: dict[str, list] = {}
    for it in index["items"]:
        by_cat.setdefault(it["category"], []).append(it)

    rng = np.random.default_rng(5150)
    records = []
    offset = 0

    with open(out_prefix + ".bin", "wb") as blob:
        for px in PX_PER_SYMBOL:
            for k in range(per_setting):
                chosen = [
                    by_cat[cat][int(rng.integers(0, len(by_cat[cat])))]
                    for cat in CATEGORY_ORDER
                ]
                images = [
                    Image.open(os.path.join(clean_dir, it["file"])).convert("L")
                    for it in chosen
                ]
                label, _ = compose_label(chosen, images, rng)
                # degrade() は長辺基準なので、記号あたりの px から全体の目標を逆算する
                target = int(round(px * label.width / images[0].width))
                out = degrade(label, FIXED_SEVERITY, rng, target=target)

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
        "wrote %d labels (%.1f MB) across %d settings"
        % (len(records), offset / 1e6, len(PX_PER_SYMBOL))
    )


if __name__ == "__main__":
    main()
