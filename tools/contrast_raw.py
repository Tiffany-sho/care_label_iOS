"""Sweep "push dark pixels toward black and light pixels toward white".

Three transforms, all applied to the raw grayscale before anything else:

  stretch : linear rescale so the 2nd and 98th percentile land on 0 and 255
  sigmoid : stretch, then an S-curve with gain g around the midpoint
  local   : subtract the local mean and divide by the local spread
            (window = side/8), then rescale. This is the only one that can
            change which pixels are darker than which; the other two are
            monotonic, and Otsu re-picks its threshold on the new histogram,
            so a monotonic curve mostly cancels out.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/contrast_raw.py <in_dir> <out_dir> <mode> [param]
"""

import json
import os
import shutil
import sys

import numpy as np


def stretch(a: np.ndarray, lo_p: float = 2.0, hi_p: float = 98.0) -> np.ndarray:
    lo, hi = np.percentile(a, [lo_p, hi_p])
    if hi - lo < 1e-6:
        return a
    return np.clip((a.astype(np.float64) - lo) * (255.0 / (hi - lo)), 0, 255)


def sigmoid(a: np.ndarray, gain: float) -> np.ndarray:
    x = stretch(a) / 255.0
    y = 1.0 / (1.0 + np.exp(-gain * (x - 0.5)))
    lo = 1.0 / (1.0 + np.exp(gain * 0.5))
    hi = 1.0 / (1.0 + np.exp(-gain * 0.5))
    return np.clip((y - lo) * (255.0 / (hi - lo)), 0, 255)


def box_mean(a: np.ndarray, r: int) -> np.ndarray:
    pad = np.pad(a.astype(np.float64), r, mode="edge")
    c = np.cumsum(np.cumsum(pad, axis=0), axis=1)
    c = np.pad(c, ((1, 0), (1, 0)))
    n = 2 * r + 1
    h, w = a.shape
    return (c[n : n + h, n : n + w] - c[0:h, n : n + w] - c[n : n + h, 0:w] + c[0:h, 0:w]) / (n * n)


def local(a: np.ndarray, divisor: float) -> np.ndarray:
    r = max(4, int(min(a.shape) / divisor))
    m = box_mean(a, r)
    v = np.maximum(box_mean(a.astype(np.float64) ** 2, r) - m * m, 0.0)
    s = np.sqrt(v)
    z = (a.astype(np.float64) - m) / np.maximum(s, 8.0)
    return np.clip(128.0 + 64.0 * z, 0, 255)


def flat_sigmoid(a: np.ndarray, gain: float) -> np.ndarray:
    """Flat-field first, then the S-curve.

    A global curve on the raw photo is at the mercy of whatever else is in
    frame (a dark garment around a white tag drags the percentiles). Removing
    the illumination first means the curve acts on ink-vs-paper only. This is
    the variant that could actually preserve a thin line through the blur.
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from features import flatten_background

    return sigmoid(flatten_background(a), gain)


def main() -> None:
    src, dst, mode = sys.argv[1], sys.argv[2], sys.argv[3]
    param = float(sys.argv[4]) if len(sys.argv) > 4 else 8.0
    os.makedirs(dst, exist_ok=True)
    meta = json.load(open(os.path.join(src, "index.json"), encoding="utf-8"))
    for it in meta["items"]:
        a = np.fromfile(os.path.join(src, it["file"]), dtype=np.uint8).reshape(it["h"], it["w"])
        if mode == "stretch":
            out = stretch(a)
        elif mode == "sigmoid":
            out = sigmoid(a, param)
        elif mode == "flatsig":
            out = flat_sigmoid(a, param)
        elif mode == "local":
            out = local(a, param)
        else:
            raise SystemExit("unknown mode " + mode)
        out.astype(np.uint8).tofile(os.path.join(dst, it["file"]))
    shutil.copy(os.path.join(src, "index.json"), os.path.join(dst, "index.json"))
    print("%s %s -> %s" % (mode, param, dst))


if __name__ == "__main__":
    main()
