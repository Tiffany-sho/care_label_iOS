"""円の中身が空かどうかを、内側の窓のインク量で見分けられるか測る。

実物のタグには「中身のない丸」が載る。クリーニング店向けの表示で、
JIS L 0001 の43記号には無い。近い記号に丸めず読み飛ばしたいので、
その判定に使える量があるかを先に測る。

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/probe_interior.py [窓の大きさ]
"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import binarize, label_components  # noqa: E402


def interior(gray: np.ndarray, k: float) -> float | None:
    mask = binarize(gray)
    _, comps = label_components(mask)
    if not comps:
        return None
    ring = max(comps.values(), key=lambda c: (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1))
    cx = (ring.x0 + ring.x1) / 2
    cy = (ring.y0 + ring.y1) / 2
    r = min(ring.x1 - ring.x0 + 1, ring.y1 - ring.y0 + 1) / 2
    y0 = max(0, int(round(cy - k * r)))
    y1 = min(mask.shape[0], int(round(cy + k * r)) + 1)
    x0 = max(0, int(round(cx - k * r)))
    x1 = min(mask.shape[1], int(round(cx + k * r)) + 1)
    win = mask[y0:y1, x0:x1]
    return float(win.mean()) if win.size else None


def main() -> None:
    k = float(sys.argv[1]) if len(sys.argv) > 1 else 0.45
    rows = []
    for f in sorted(os.listdir("dataset/clean")):
        if not f.endswith("__f0.png"):
            continue
        g = np.asarray(Image.open(os.path.join("dataset/clean", f)).convert("L"), dtype=np.uint8)
        rows.append((f[:3], interior(g, k)))
    rows.sort(key=lambda r: r[1] if r[1] is not None else -1)
    print("window k=%.2f" % k)
    for code, v in rows:
        print("  %s  %s" % (code, "-" if v is None else "%.3f" % v))


if __name__ == "__main__":
    main()
