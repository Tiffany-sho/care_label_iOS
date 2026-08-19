"""Does this problem even need a learned model?

Before reaching for a CNN or a VLM, measure the dumbest thing that could work:
normalised cross-correlation against the 41 clean templates. If that already
classifies well, the "AI" in "read the tag with AI" is mostly unnecessary, the
app can run fully offline with no inference cost, and the model budget can be
spent where it is actually needed (finding and rectifying the tag).

Fairness of the split
  - templates come from font 0 only
  - test images come from fonts 1 and 2
  so a test image is never matched against a template rendered from the very
  same source bitmap. This measures generalisation across letterforms, which is
  the realistic condition (tag printers use whatever font they like).

Alignment: each image is cropped to its ink bounding box and resized to a
canonical box, which removes the translation and scale jitter. The residual
rotation is left in on purpose.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/match.py dataset/clean [out.md]
"""

import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from degrade import degrade  # noqa: E402
from features import binarize  # noqa: E402

CANON = (56, 64)  # (w, h) of the normalised patch
TARGETS = [160, 120, 100, 80, 60]
FIXED_SEVERITY = 2
VARIANTS = 4


def area_weights(in_n: int, out_n: int) -> np.ndarray:
    """(out_n, in_n) box-resampling weights, each row summing to 1.

    Deliberately not PIL's resize: the TypeScript port has to build the same
    weights, and Pillow's filter support / scaling rules are library internals.
    Plain area averaging is a rule we can state in one line and reimplement
    anywhere.
    """
    w = np.zeros((out_n, in_n), dtype=np.float64)
    scale = in_n / out_n
    for j in range(out_n):
        s0 = j * scale
        s1 = (j + 1) * scale
        i0 = int(np.floor(s0))
        i1 = min(int(np.ceil(s1)), in_n)
        for i in range(i0, i1):
            overlap = min(s1, i + 1.0) - max(s0, float(i))
            if overlap > 0:
                w[j, i] = overlap
        total = w[j].sum()
        if total > 0:
            w[j] /= total
    return w


def resize_area(patch: np.ndarray, out_w: int, out_h: int) -> np.ndarray:
    """Separable area resampling: rows first, then columns."""
    in_h, in_w = patch.shape
    vertical = area_weights(in_h, out_h) @ patch          # (out_h, in_w)
    return vertical @ area_weights(in_w, out_w).T          # (out_h, out_w)


def canonical_patch(gray: np.ndarray) -> np.ndarray | None:
    """Crop to the ink bbox and resize to CANON. Values are 0..255 floats."""
    mask = binarize(gray)
    ys, xs = np.nonzero(mask)
    if ys.size < 12:
        return None
    patch = mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.float64)
    return resize_area(patch * 255.0, CANON[0], CANON[1])


def normalise(gray: np.ndarray) -> np.ndarray | None:
    """Crop to the ink bbox, resize to CANON, return a zero-mean unit vector."""
    patch = canonical_patch(gray)
    if patch is None:
        return None
    v = patch.ravel().astype(np.float64)
    v -= v.mean()
    n = np.linalg.norm(v)
    return None if n < 1e-6 else v / n


def main() -> None:
    clean_dir = sys.argv[1]
    out_md = sys.argv[2] if len(sys.argv) > 2 else None

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    items = index["items"]

    tmpl_items = [it for it in items if it["font"] == 0]
    test_items = [it for it in items if it["font"] != 0]

    tmpl_vecs = []
    tmpl_meta = []
    for it in tmpl_items:
        gray = np.asarray(
            Image.open(os.path.join(clean_dir, it["file"])).convert("L"), dtype=np.uint8
        )
        v = normalise(gray)
        assert v is not None, it["file"]
        tmpl_vecs.append(v)
        tmpl_meta.append(it)
    T = np.stack(tmpl_vecs)  # (41, D)
    print("templates: %d" % len(tmpl_meta))

    rng = np.random.default_rng(31337)
    rows = []
    # Where the residual error actually lives, measured at one middle resolution.
    err_by_base: Counter = Counter()
    n_by_base: Counter = Counter()
    confusions: Counter = Counter()
    DIAG_TARGET = 120

    for target in TARGETS:
        acc = defaultdict(int)
        for it in test_items:
            src = Image.open(os.path.join(clean_dir, it["file"])).convert("L")
            for _ in range(VARIANTS):
                img = degrade(src, FIXED_SEVERITY, rng, target=target)
                v = normalise(np.asarray(img, dtype=np.uint8))
                acc["n"] += 1
                if v is None:
                    continue
                best = int(np.argmax(T @ v))
                pred = tmpl_meta[best]
                hit = pred["code"] == it["code"]
                acc["code_ok"] += int(hit)
                acc["base_ok"] += int(pred["base"] == it["base"])
                acc["bars_ok"] += int(pred["bars"] == it["bars"])
                acc["dots_ok"] += int(pred["dots"] == it["dots"])
                if target == DIAG_TARGET:
                    n_by_base[it["base"]] += 1
                    if not hit:
                        err_by_base[it["base"]] += 1
                        confusions[(it["code"], pred["code"])] += 1
        rows.append((target, dict(acc)))
        print(
            "  %3dpx  code %.1f%%  base %.1f%%  bars %.1f%%  dots %.1f%%"
            % (
                target,
                100.0 * acc["code_ok"] / max(1, acc["n"]),
                100.0 * acc["base_ok"] / max(1, acc["n"]),
                100.0 * acc["bars_ok"] / max(1, acc["n"]),
                100.0 * acc["dots_ok"] / max(1, acc["n"]),
            )
        )

    if out_md:
        with open(out_md, "w", encoding="utf-8") as f:
            f.write("# テンプレートマッチング（学習なし）のベースライン\n\n")
            f.write(
                "41個のクリーン画像（フォント0）をテンプレートにし、"
                "フォント1・2から作った劣化画像を最近傍で分類した。"
                "ぼけ・コントラスト・ノイズ・回転は s%d 相当に固定。VARIANTS=%d。\n\n"
                % (FIXED_SEVERITY, VARIANTS)
            )
            f.write("| 1記号のpx | 41クラス完全一致 | 基本形 | 下線本数 | 点の個数 |\n")
            f.write("|---|---|---|---|---|\n")
            for target, a in rows:
                f.write(
                    "| %dpx | %.1f%% | %.1f%% | %.1f%% | %.1f%% |\n"
                    % (
                        target,
                        100.0 * a["code_ok"] / max(1, a["n"]),
                        100.0 * a["base_ok"] / max(1, a["n"]),
                        100.0 * a["bars_ok"] / max(1, a["n"]),
                        100.0 * a["dots_ok"] / max(1, a["n"]),
                    )
                )
            f.write("\n## 誤りがどこに残るか（%dpx）\n\n" % DIAG_TARGET)
            f.write("| 基本形 | 誤り率 | 件数 |\n|---|---|---|\n")
            for b in sorted(
                n_by_base, key=lambda k: -err_by_base[k] / max(1, n_by_base[k])
            ):
                f.write(
                    "| %s | %.1f%% | %d/%d |\n"
                    % (
                        b,
                        100.0 * err_by_base[b] / max(1, n_by_base[b]),
                        err_by_base[b],
                        n_by_base[b],
                    )
                )
            f.write("\n主な取り違え（正解 -> 推定）:\n\n")
            for (t, p), c in confusions.most_common(12):
                f.write("- `%s` -> `%s` : %d件\n" % (t, p, c))
        print("\nwrote %s" % out_md)


if __name__ == "__main__":
    main()
