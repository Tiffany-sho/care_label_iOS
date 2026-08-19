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


def load_shipped_templates(path: str):
    """Load ios/templates.json exactly the way the TypeScript side does.

    Not the full-precision clean renders: the shipped templates are quantised
    to bytes, and that quantisation shifts correlations by ~5e-4, which is
    enough to flip a near-tie. Comparing against anything else would make the
    parity test report a port bug that is not one.
    """
    with open(path, encoding="utf-8") as f:
        bundle = json.load(f)
    n = bundle["canonWidth"] * bundle["canonHeight"]
    codes, vecs = [], []
    for item in bundle["templates"]:
        raw = np.frombuffer(base64.b64decode(item["patch"]), dtype=np.uint8)
        assert raw.size == n, item["code"]
        v = raw.astype(np.float64)
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
