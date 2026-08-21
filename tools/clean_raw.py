"""dataset/clean の PNG を生グレースケールに落とす。

Node 側に画像コーデックを持たせないため（tools/dump_raw.py と同じ理由）。
テンプレートの切り出しは lib/vision の TS をそのまま使いたいので、
二値化・連結成分の判断は Node 側で行い、ここは変換だけをする。

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/clean_raw.py dataset/clean tools/.build/cleanraw
"""

import io
import json
import os
import sys

import numpy as np
from PIL import Image


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else "dataset/clean"
    dst = sys.argv[2] if len(sys.argv) > 2 else "tools/.build/cleanraw"
    os.makedirs(dst, exist_ok=True)

    with io.open(os.path.join(src, "index.json"), encoding="utf-8") as f:
        index = json.load(f)

    items = []
    for it in index["items"]:
        gray = np.asarray(
            Image.open(os.path.join(src, it["file"])).convert("L"), dtype=np.uint8
        )
        name = it["file"].replace(".png", ".raw")
        gray.tofile(os.path.join(dst, name))
        items.append(
            {
                "file": name,
                "w": int(gray.shape[1]),
                "h": int(gray.shape[0]),
                "code": it["code"],
                "font": it["font"],
            }
        )

    with io.open(os.path.join(dst, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"items": items}, f, indent=1)
    print("wrote %d raw images to %s" % (len(items), dst))


if __name__ == "__main__":
    main()
