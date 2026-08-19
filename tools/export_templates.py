"""Export the 41 matching templates for the iOS side.

The Swift matcher must compare against exactly the same patches the Python
benchmark used, otherwise the measured numbers do not transfer. So the
canonical patch is computed here (after the bbox crop and the resize) and
shipped as raw bytes; Swift only has to subtract the mean and normalise.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/export_templates.py dataset/clean ios/templates.json
"""

import base64
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import binarize  # noqa: E402
from match import CANON  # noqa: E402


def canonical_patch(gray: np.ndarray) -> np.ndarray:
    """Same steps as match.normalise(), stopping before the mean/norm step."""
    mask = binarize(gray)
    ys, xs = np.nonzero(mask)
    if ys.size < 12:
        raise ValueError("template has almost no ink")
    patch = mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.float32)
    img = Image.fromarray((patch * 255).astype(np.uint8), mode="L").resize(
        CANON, Image.BILINEAR
    )
    return np.asarray(img, dtype=np.uint8)


def main() -> None:
    clean_dir = sys.argv[1]
    out_path = sys.argv[2]

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)

    out = []
    for it in index["items"]:
        if it["font"] != 0:  # font 0 is the reference letterform
            continue
        gray = np.asarray(
            Image.open(os.path.join(clean_dir, it["file"])).convert("L"), dtype=np.uint8
        )
        patch = canonical_patch(gray)
        out.append(
            {
                "code": it["code"],
                "base": it["base"],
                "bars": it["bars"],
                "dots": it["dots"],
                "patch": base64.b64encode(patch.tobytes()).decode("ascii"),
            }
        )

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {"canonWidth": CANON[0], "canonHeight": CANON[1], "templates": out},
            f,
            indent=1,
        )
    size_kb = os.path.getsize(out_path) / 1024.0
    print("wrote %d templates to %s (%.0f KB)" % (len(out), out_path, size_kb))


if __name__ == "__main__":
    main()
