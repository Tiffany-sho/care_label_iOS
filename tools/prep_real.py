"""Convert the real tag photos into raw grayscale for the Node evaluator.

アプリと同じ前処理をなぞる: 指定範囲を切り出してから長辺を maxSide に縮める。
crops.json があれば、その矩形（元画像の画素座標）を使う。無ければ写真全体。
矩形に "a"（度）があれば、その角度だけ傾いた枠として切り出す。
アプリの「枠を傾ける」に相当する。

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/prep_real.py <photo_dir> <out_dir> [crops.json] [maxSide]
"""

import json
import os
import sys

import numpy as np
from PIL import Image

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except Exception:
    pass


def main() -> None:
    src = sys.argv[1]
    out = sys.argv[2]
    crops_path = sys.argv[3] if len(sys.argv) > 3 else None
    max_side = int(sys.argv[4]) if len(sys.argv) > 4 else 1400
    os.makedirs(out, exist_ok=True)

    crops = {}
    if crops_path and os.path.exists(crops_path):
        with open(crops_path, encoding="utf-8") as f:
            crops = json.load(f)

    items = []
    names = sorted(
        [n for n in os.listdir(src) if n.lower().endswith((".png", ".jpg", ".heic"))],
        key=lambda n: int("".join(c for c in n if c.isdigit()) or 0),
    )
    for name in names:
        im = Image.open(os.path.join(src, name)).convert("L")
        key = os.path.splitext(name)[0]
        c = crops.get(key)
        if c and c.get("a"):
            # 傾いた枠。外接矩形で切ってから回し、中身を抜く。
            cx = c["x"] + c["w"] / 2
            cy = c["y"] + c["h"] / 2
            pad = int(max(c["w"], c["h"]))
            box = (int(cx - pad), int(cy - pad), int(cx + pad), int(cy + pad))
            im = im.crop(box).rotate(c["a"], resample=Image.BILINEAR, center=(pad, pad))
            im = im.crop(
                (
                    int(pad - c["w"] / 2),
                    int(pad - c["h"] / 2),
                    int(pad + c["w"] / 2),
                    int(pad + c["h"] / 2),
                )
            )
        elif c:
            im = im.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
        scale = max_side / max(im.size)
        if scale < 1:
            im = im.resize(
                (max(8, round(im.width * scale)), max(8, round(im.height * scale))),
                Image.LANCZOS,
            )
        arr = np.asarray(im, dtype=np.uint8)
        raw_name = key + ".raw"
        arr.tofile(os.path.join(out, raw_name))
        items.append(
            {"name": key, "file": raw_name, "w": int(arr.shape[1]), "h": int(arr.shape[0])}
        )
        print("  %-10s %dx%d%s" % (key, arr.shape[1], arr.shape[0], " (cropped)" if c else ""))

    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"items": items}, f)
    print("wrote %d images" % len(items))


if __name__ == "__main__":
    main()
