"""Dump the synthetic set as raw grayscale + the Python reference outputs.

The TypeScript port has to be checked against this. Raw bytes are used instead
of PNG so that the Node side needs no image codec: a codec difference would
show up as a port bug and waste a day.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/dump_raw.py dataset/synth tools/.build/parity
"""

import base64
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import features_from_gray  # noqa: E402
from match import normalise  # noqa: E402


# lib/vision/match.ts の STROKE_VARIANTS と同じ値にすること。
# ここがずれるとパリティ試験は「移植のバグ」を報告するが、実際は設定違い。
STROKE_VARIANTS = (-2, 0, 2)


def morph(patch: np.ndarray, steps: int) -> np.ndarray:
    """3x3 の膨張／収縮を steps 回。lib/vision/match.ts の morph と同じ規則。"""
    if steps == 0:
        return patch
    grow = steps > 0
    cur = patch > 127
    for _ in range(abs(steps)):
        pad = np.pad(cur, 1, mode="edge")
        stack = np.stack(
            [pad[dy : dy + cur.shape[0], dx : dx + cur.shape[1]] for dy in range(3) for dx in range(3)]
        )
        cur = stack.any(axis=0) if grow else stack.all(axis=0)
    return np.where(cur, 255, 0).astype(np.uint8)


def load_shipped_templates(path: str):
    """Load ios/templates.json exactly the way the TypeScript side does.

    Not the full-precision clean renders: the shipped templates are quantised
    to bytes, and that quantisation shifts correlations by ~5e-4, which is
    enough to flip a near-tie. Comparing against anything else would make the
    parity test report a port bug that is not one.
    """
    with open(path, encoding="utf-8") as f:
        bundle = json.load(f)
    cw, ch = bundle["canonWidth"], bundle["canonHeight"]
    n = cw * ch
    codes, vecs = [], []
    for item in bundle["templates"]:
        raw = np.frombuffer(base64.b64decode(item["patch"]), dtype=np.uint8)
        assert raw.size == n, item["code"]
        for steps in STROKE_VARIANTS:
            v = morph(raw.reshape(ch, cw), steps).ravel().astype(np.float64)
            v -= v.mean()
            v /= max(float(np.linalg.norm(v)), 1e-6)
            codes.append(item["code"])
            vecs.append(v)
    return codes, np.stack(vecs)


def main() -> None:
    root = sys.argv[1]
    out_prefix = sys.argv[2]
    os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

    with open(os.path.join(root, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    items = manifest["items"]

    tmpl_codes, T = load_shipped_templates(os.path.join("lib", "vision", "templates.json"))

    records = []
    offset = 0
    with open(out_prefix + ".bin", "wb") as blob:
        for i, it in enumerate(items):
            if i % 500 == 0:
                print("  ... %d/%d" % (i, len(items)))
            gray = np.asarray(
                Image.open(os.path.join(root, it["file"])).convert("L"), dtype=np.uint8
            )
            h, w = gray.shape
            raw = gray.tobytes()
            blob.write(raw)

            bars, dots = features_from_gray(gray)
            v = normalise(gray)
            if v is None:
                code, corr = None, None
            else:
                sims = T @ v
                k = int(np.argmax(sims))
                code, corr = tmpl_codes[k], float(sims[k])

            records.append(
                {
                    "file": it["file"],
                    "offset": offset,
                    "w": int(w),
                    "h": int(h),
                    "bars": int(bars),
                    "dots": int(dots),
                    "code": code,
                    "corr": corr,
                }
            )
            offset += len(raw)

    with open(out_prefix + ".json", "w", encoding="utf-8") as f:
        json.dump({"records": records}, f)

    print(
        "wrote %s.bin (%.1f MB) and %d records"
        % (out_prefix, offset / 1e6, len(records))
    )


if __name__ == "__main__":
    main()
