"""Blur-only variants of synthetic labels, at a fixed size.

Why a separate dataset
----------------------
The first attempt at calibrating a focus metric used tools/dump_raw.py, whose
images vary in size *and* noise *and* blur all at once. The metric came out
backwards -- it scored the most degraded images as the sharpest -- because at
46px with heavy noise, the Laplacian is measuring noise, not edges.

What the app actually needs to detect is "a large photo that is out of focus".
So: fix the size, add only a little noise, and vary the blur.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/synth_focus.py dataset/clean tools/.build/focus [labels_per_radius]
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth_label import CATEGORY_ORDER, compose_label  # noqa: E402

# ピントの外れ具合。0 は合焦、6 は完全に読めない。
BLUR_RADII = [0.0, 0.6, 1.2, 1.8, 2.5, 3.5, 5.0, 7.0]

# 1記号あたり 150px 相当に固定する（解像度は十分な状態）
PX_PER_SYMBOL = 150


def main() -> None:
    clean_dir = sys.argv[1]
    out_prefix = sys.argv[2]
    per_radius = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    by_cat: dict[str, list] = {}
    for it in index["items"]:
        by_cat.setdefault(it["category"], []).append(it)

    rng = np.random.default_rng(2024)
    records = []
    offset = 0

    with open(out_prefix + ".bin", "wb") as blob:
        for radius in BLUR_RADII:
            for k in range(per_radius):
                chosen = [
                    by_cat[cat][int(rng.integers(0, len(by_cat[cat])))]
                    for cat in CATEGORY_ORDER
                ]
                images = [
                    Image.open(os.path.join(clean_dir, it["file"])).convert("L")
                    for it in chosen
                ]
                label, _ = compose_label(chosen, images, rng)
                target = int(round(PX_PER_SYMBOL * label.width / images[0].width))
                scale = target / label.width
                label = label.resize(
                    (target, max(8, round(label.height * scale))), Image.LANCZOS
                )

                out = label
                if radius > 0:
                    out = out.filter(ImageFilter.GaussianBlur(radius))
                arr = np.asarray(out, dtype=np.float64)
                # 撮影ノイズは少しだけ。ここで支配的にすると焦点の話でなくなる
                arr = arr + rng.normal(0.0, 2.5, size=arr.shape)
                arr = np.clip(arr, 0, 255).astype(np.uint8)

                blob.write(arr.tobytes())
                records.append(
                    {
                        "offset": offset,
                        "w": int(arr.shape[1]),
                        "h": int(arr.shape[0]),
                        "blur": radius,
                        "codes": [it["code"] for it in chosen],
                    }
                )
                offset += arr.size

    with open(out_prefix + ".json", "w", encoding="utf-8") as f:
        json.dump({"records": records, "blur_radii": BLUR_RADII}, f)
    print(
        "wrote %d labels (%.1f MB) across %d blur levels"
        % (len(records), offset / 1e6, len(BLUR_RADII))
    )


if __name__ == "__main__":
    main()
