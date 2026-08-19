"""Emit the parity fixture the Swift port must reproduce exactly.

A port bug does not look like a crash, it looks like "mostly the same numbers".
The only way to catch it is to pin the reference implementation's output on
concrete images and assert equality on the other side.

Note the gating: bars are only asked of tub/circle and dots only of
tumble/iron. Asking outside that is a caller error, not a counter bug -- the
digits inside a 95C wash tub genuinely do look like two dots to a blob counter.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/make_fixture.py dataset/synth ios/expected.json [stride]
"""

import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from features import BAR_BASES, DOT_BASES, features_from_gray  # noqa: E402


def main() -> None:
    root = sys.argv[1]
    out_path = sys.argv[2]
    stride = int(sys.argv[3]) if len(sys.argv) > 3 else 37

    with open(os.path.join(root, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    cases = []
    for it in manifest["items"][::stride]:
        gray = np.asarray(
            Image.open(os.path.join(root, it["file"])).convert("L"), dtype=np.uint8
        )
        bars, dots = features_from_gray(gray)
        cases.append(
            {
                "file": it["file"],
                "code": it["code"],
                "base": it["base"],
                "severity": it["severity"],
                # None means "this base shape cannot carry the feature";
                # the Swift side must return nil, not 0.
                "bars": bars if it["base"] in BAR_BASES else None,
                "dots": dots if it["base"] in DOT_BASES else None,
                "true_bars": it["bars"] if it["base"] in BAR_BASES else None,
                "true_dots": it["dots"] if it["base"] in DOT_BASES else None,
            }
        )

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"cases": cases}, f, indent=1)
    print("wrote %d cases to %s" % (len(cases), out_path))


if __name__ == "__main__":
    main()
