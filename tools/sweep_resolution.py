"""Isolate resolution: how many pixels does one symbol need?

The severity sweep in features.py bundles resolution, blur, contrast and noise
together, so it cannot say *which* one kills the reader. Here every nuisance is
held at the fixed "s2" level (a mediocre but not terrible photo) and only the
downscale target is varied. The output is the single number the iOS capture UI
needs: the minimum on-screen size of one symbol.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/sweep_resolution.py dataset/clean [out.md]
"""

import json
import os
import sys
from collections import defaultdict

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from degrade import degrade  # noqa: E402
from features import BAR_BASES, DOT_BASES, features_from_gray  # noqa: E402

# Longest side of the single-symbol crop, in pixels.
TARGETS = [200, 160, 140, 130, 120, 110, 100, 95, 90, 85, 80, 70, 60, 50]

# Everything except resolution is pinned here: mild blur, mild contrast loss,
# mild noise, mild rotation. Raising this shifts the threshold up; the point is
# the shape of the curve and the location of the cliff.
FIXED_SEVERITY = 2

VARIANTS = 4


def main() -> None:
    clean_dir = sys.argv[1]
    out_md = sys.argv[2] if len(sys.argv) > 2 else None

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    items = index["items"]

    rng = np.random.default_rng(4711)
    rows = []

    for target in TARGETS:
        acc = defaultdict(int)
        for it in items:
            src = Image.open(os.path.join(clean_dir, it["file"])).convert("L")
            for _ in range(VARIANTS):
                img = degrade(src, FIXED_SEVERITY, rng, target=target)
                bars, dots = features_from_gray(np.asarray(img, dtype=np.uint8))
                if it["base"] in BAR_BASES:
                    acc["bar_n"] += 1
                    acc["bar_ok"] += int(bars == it["bars"])
                    acc["bar_under"] += int(bars < it["bars"])
                    acc["bar_over"] += int(bars > it["bars"])
                if it["base"] in DOT_BASES:
                    acc["dot_n"] += 1
                    acc["dot_ok"] += int(dots == it["dots"])
                    acc["dot_under"] += int(dots < it["dots"])
                    acc["dot_over"] += int(dots > it["dots"])
        rows.append((target, dict(acc)))
        print(
            "  %3dpx  bars %.1f%%  dots %.1f%%"
            % (
                target,
                100.0 * acc["bar_ok"] / max(1, acc["bar_n"]),
                100.0 * acc["dot_ok"] / max(1, acc["dot_n"]),
            )
        )

    # A detector that always answers 0 would already score this much.
    bar_major = sum(1 for it in items if it["base"] in BAR_BASES and it["bars"] == 0)
    bar_total = sum(1 for it in items if it["base"] in BAR_BASES)
    dot_major = sum(1 for it in items if it["base"] in DOT_BASES and it["dots"] == 0)
    dot_total = sum(1 for it in items if it["base"] in DOT_BASES)
    bar_base = 100.0 * bar_major / bar_total
    dot_base = 100.0 * dot_major / dot_total
    print("\n  always-zero baseline: bars %.1f%%  dots %.1f%%" % (bar_base, dot_base))

    if out_md:
        with open(out_md, "w", encoding="utf-8") as f:
            f.write("# 解像度だけを振ったときの特徴カウント精度\n\n")
            f.write(
                "ぼけ・コントラスト・ノイズ・回転は s%d 相当に固定し、"
                "1記号あたりのピクセル数だけを変えた。VARIANTS=%d。\n\n"
                % (FIXED_SEVERITY, VARIANTS)
            )
            f.write(
                "「常に0と答える」だけの検出器でも下線 %.1f%% / 点 %.1f%% は取れる。"
                "この値まで落ちたら、精度が残っているのではなく完全に死んでいる。\n\n"
                % (bar_base, dot_base)
            )
            f.write("| 1記号のpx | 下線 正解率 | 過小 | 過大 | 点 正解率 | 過小 | 過大 |\n")
            f.write("|---|---|---|---|---|---|---|\n")
            for target, a in rows:
                f.write(
                    "| %dpx | %.1f%% | %.1f%% | %.1f%% | %.1f%% | %.1f%% | %.1f%% |\n"
                    % (
                        target,
                        100.0 * a["bar_ok"] / max(1, a["bar_n"]),
                        100.0 * a["bar_under"] / max(1, a["bar_n"]),
                        100.0 * a["bar_over"] / max(1, a["bar_n"]),
                        100.0 * a["dot_ok"] / max(1, a["dot_n"]),
                        100.0 * a["dot_under"] / max(1, a["dot_n"]),
                        100.0 * a["dot_over"] / max(1, a["dot_n"]),
                    )
                )
        print("\nwrote %s" % out_md)


if __name__ == "__main__":
    main()
