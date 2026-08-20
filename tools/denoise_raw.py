"""Apply a square median filter to the raw grayscale evaluation images.

Used to sweep "does denoising the photo before binarising help?" without
touching the shared source. Once a radius is chosen it gets ported into
lib/vision/binarize.ts, so the filter is defined here in the plainest
possible terms: median over a (2r+1)x(2r+1) window, edges extended by
replication. No library filter, nothing implementation-defined.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/denoise_raw.py <in_dir> <out_dir> <radius>
"""

import json
import os
import shutil
import sys

import numpy as np


def median_filter(a: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return a
    n = 2 * r + 1
    pad = np.pad(a, r, mode="edge")
    win = np.lib.stride_tricks.sliding_window_view(pad, (n, n))
    return np.median(win, axis=(2, 3)).astype(np.uint8)


def box_blur3(a: np.ndarray, r: int) -> np.ndarray:
    """Same 3x box blur as lib/vision/binarize.ts, so a win here is portable."""
    if r <= 0:
        return a
    n = 2 * r + 1
    out = a.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            pad = np.pad(out, [(r, r) if i == axis else (0, 0) for i in range(2)], mode="edge")
            c = np.cumsum(pad, axis=axis)
            c = np.concatenate(
                [np.zeros([1 if i == axis else c.shape[i] for i in range(2)]), c], axis=axis
            )
            hi = np.take(c, range(n, c.shape[axis]), axis=axis)
            lo = np.take(c, range(0, c.shape[axis] - n), axis=axis)
            out = (hi - lo) / n
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    src, dst, r = sys.argv[1], sys.argv[2], int(sys.argv[3])
    mode = sys.argv[4] if len(sys.argv) > 4 else "median"
    os.makedirs(dst, exist_ok=True)
    meta = json.load(open(os.path.join(src, "index.json"), encoding="utf-8"))
    for it in meta["items"]:
        a = np.fromfile(os.path.join(src, it["file"]), dtype=np.uint8)
        a = a.reshape(it["h"], it["w"])
        f = median_filter(a, r) if mode == "median" else box_blur3(a, r)
        f.tofile(os.path.join(dst, it["file"]))
    shutil.copy(os.path.join(src, "index.json"), os.path.join(dst, "index.json"))
    print("%s radius %d -> %s" % (mode, r, dst))


if __name__ == "__main__":
    main()
