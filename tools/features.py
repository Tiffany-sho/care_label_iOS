"""Classic-CV reference implementation of the "counting" half of the reader,
plus its measurement on the synthetic set.

The claim being tested
----------------------
A VLM is weak at counting (1 bar vs 2 bars, 1 dot vs 2 vs 3), and almost all
of the *meaning* in JIS L 0001 lives in exactly those counts. The proposed fix
is to not ask a model to count at all: isolate the features geometrically and
count connected components / profile peaks instead. This file measures how far
that holds as the image degrades.

Protocol / assumptions (stated so the numbers are not read as more than they are)
  - the symbol is already cropped to one glyph (Stage 1 of the pipeline)
  - the base shape is already known (square/circle/tub/iron: easy for a model,
    the shapes are entirely different), so bars are only asked of tub+circle
    symbols and dots only of tumble+iron symbols
  - this is synthetic degradation, NOT photographs of real tags. It bounds the
    method's sensitivity to blur/resolution/contrast; it does not prove field
    accuracy.

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/features.py dataset/synth [out.md]
"""

import json
import os
import sys
from collections import defaultdict

import numpy as np
from PIL import Image


# --------------------------------------------------------------------------
# binarisation
# --------------------------------------------------------------------------
def _box_blur_axis1(a: np.ndarray, r: int) -> np.ndarray:
    """One box-blur pass along axis 1, edges clamped, via prefix sums.

    Deliberately NOT PIL's GaussianBlur: that is a library-internal
    approximation we cannot reproduce exactly in another language. The port to
    TypeScript has to produce bit-identical output, so the smoothing has to be
    an algorithm we specify, not one we borrow. Prefix sums in float64 are
    evaluated left to right in both implementations, so the rounding matches.
    """
    h, w = a.shape
    pad = np.concatenate(
        [np.repeat(a[:, :1], r, axis=1), a, np.repeat(a[:, -1:], r, axis=1)], axis=1
    )
    p = np.zeros((h, pad.shape[1] + 1), dtype=np.float64)
    np.cumsum(pad, axis=1, out=p[:, 1:])
    n = 2 * r + 1
    return (p[:, n:] - p[:, :-n]) / n


def box_blur3(a: np.ndarray, r: int) -> np.ndarray:
    """Three separable box passes ~ a Gaussian. Only used to estimate lighting."""
    out = a.astype(np.float64)
    for _ in range(3):
        out = _box_blur_axis1(out, r)
        out = _box_blur_axis1(out.T, r).T
    return out


def flatten_background(gray: np.ndarray) -> np.ndarray:
    """Divide out uneven lighting / fabric shading before thresholding.

    Same idea as flat-field correction: estimate the illumination with a very
    heavy blur, then normalise by it. Without this, a global threshold fails
    as soon as one corner of the tag is in shadow.
    """
    h, w = gray.shape
    radius = max(4, max(h, w) // 6)
    bg = np.maximum(box_blur3(gray, radius), 1.0)
    out = gray.astype(np.float64) / bg * 200.0
    return np.clip(out, 0, 255).astype(np.uint8)


def otsu_threshold(gray: np.ndarray) -> int:
    hist = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    total = float(gray.size)
    sum_total = float(np.dot(np.arange(256), hist))
    w_b = 0.0
    sum_b = 0.0
    best_var = -1.0
    best_t = 127
    for t in range(256):
        w_b += hist[t]
        if w_b == 0.0:
            continue
        w_f = total - w_b
        if w_f <= 0.0:
            break
        sum_b += t * hist[t]
        m_b = sum_b / w_b
        m_f = (sum_total - sum_b) / w_f
        var = w_b * w_f * (m_b - m_f) ** 2
        if var > best_var:
            best_var = var
            best_t = t
    return best_t


def ink_is_dark(flat: np.ndarray, threshold: int) -> bool:
    """Whichever Otsu class has fewer pixels is the ink.

    "Ink is darker than the background" broke on a real photo of white
    printing on black fabric. After flat-field correction the background
    lands near 200 either way, so the minority class is the printing
    regardless of the garment colour. Black printing (every dataset so far)
    is already the minority, so this does not change existing numbers.
    """
    border = np.concatenate(
        [flat[0, :], flat[-1, :], flat[1:-1, 0], flat[1:-1, -1]]
    )
    return int(np.count_nonzero(border <= threshold)) * 2 <= border.size


def binarize(gray: np.ndarray) -> np.ndarray:
    flat = flatten_background(gray)
    t = otsu_threshold(flat)
    return (flat <= t) if ink_is_dark(flat, t) else (flat > t)  # True = ink


# --------------------------------------------------------------------------
# connected components (8-connectivity, union-find over ink pixels only)
# --------------------------------------------------------------------------
class _DSU:
    def __init__(self) -> None:
        self.p: list[int] = []

    def make(self) -> int:
        self.p.append(len(self.p))
        return len(self.p) - 1

    def find(self, x: int) -> int:
        p = self.p
        while p[x] != x:
            p[x] = p[p[x]]
            x = p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


class Comp:
    __slots__ = ("area", "y0", "y1", "x0", "x1")

    def __init__(self) -> None:
        self.area = 0
        self.y0 = 10**9
        self.y1 = -1
        self.x0 = 10**9
        self.x1 = -1

    def add(self, y: int, x: int) -> None:
        self.area += 1
        if y < self.y0:
            self.y0 = y
        if y > self.y1:
            self.y1 = y
        if x < self.x0:
            self.x0 = x
        if x > self.x1:
            self.x1 = x

    @property
    def w(self) -> int:
        return self.x1 - self.x0 + 1

    @property
    def h(self) -> int:
        return self.y1 - self.y0 + 1

    @property
    def fill(self) -> float:
        return self.area / float(max(1, self.w * self.h))


def label_components(mask: np.ndarray):
    """Return (labels array, {root: Comp}). Raster-order two-pass labelling."""
    h, w = mask.shape
    labels = np.full((h, w), -1, dtype=np.int32)
    dsu = _DSU()
    ys, xs = np.nonzero(mask)  # row-major == raster order
    for y, x in zip(ys.tolist(), xs.tolist()):
        best = -1
        for dy, dx in ((-1, -1), (-1, 0), (-1, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                lab = labels[ny, nx]
                if lab >= 0:
                    if best < 0:
                        best = lab
                    else:
                        dsu.union(best, lab)
        if best < 0:
            best = dsu.make()
        labels[y, x] = best

    comps: dict[int, Comp] = defaultdict(Comp)
    for y, x in zip(ys.tolist(), xs.tolist()):
        root = dsu.find(int(labels[y, x]))
        labels[y, x] = root
        comps[root].add(y, x)
    return labels, comps


# --------------------------------------------------------------------------
# feature counting
# --------------------------------------------------------------------------
def count_bars(mask: np.ndarray, labels: np.ndarray, comps: dict) -> int:
    """Count the 'weak / very weak treatment' underbars beneath the glyph.

    Underbars are separate components: wide, thin, and below the glyph's centre.
    If blur has fused the two bars into one component, the row profile of that
    component is used to recover the count from its peaks.
    """
    if not comps:
        return 0
    h, w = mask.shape
    outline = max(comps.items(), key=lambda kv: kv[1].w * kv[1].h)
    o_mid_y = (outline[1].y0 + outline[1].y1) / 2.0

    cand_roots = [
        root
        for root, c in comps.items()
        if root != outline[0]
        and c.w >= 0.28 * w
        and c.h <= 0.20 * h
        and c.y0 > o_mid_y
    ]
    if not cand_roots:
        return 0

    band = np.isin(labels, cand_roots)
    prof = band.sum(axis=1).astype(np.float32)
    peak = prof.max()
    if peak <= 0:
        return 0
    # Rows carrying most of a bar's width; count the maximal runs of them.
    strong = prof > 0.45 * peak
    runs = 0
    prev = False
    for v in strong.tolist():
        if v and not prev:
            runs += 1
        prev = v
    return min(runs, 2)


# lib/vision/features.ts の DOT_ROW_BAND / DOT_AREA_RATIO と同じ値にすること。
# 食い違えば verify_ts.cjs の dots 比較が赤くなるので、黙って進むことはない。
DOT_ROW_BAND = 0.16
DOT_AREA_RATIO = 1.8


def count_dots(mask: np.ndarray, comps: dict) -> int:
    """Count the temperature dots inside the tumble-dry circle / the iron.

    Size and aspect alone also count fabric-weave specks as dots: two real
    photos read "2 dots" as 3, i.e. "iron up to 160C" became "up to 210C".
    That is the dangerous direction. Real dots always sit on one row and have
    the same size, so keep only the largest group satisfying both.
    """
    if not comps:
        return 0
    outline = max(comps.values(), key=lambda c: c.w * c.h)
    box = float(max(1, outline.w * outline.h))
    outline_h = outline.h
    dots = []
    for c in comps.values():
        if c is outline:
            continue
        if not (outline.x0 <= c.x0 and c.x1 <= outline.x1):
            continue
        if not (outline.y0 <= c.y0 and c.y1 <= outline.y1):
            continue
        rel = c.area / box
        if not (0.0012 <= rel <= 0.030):
            continue
        aspect = c.w / float(max(1, c.h))
        if not (0.45 <= aspect <= 2.2):
            continue
        if c.fill < 0.40:
            continue
        dots.append(((c.y0 + c.y1) / 2.0, c.area))
    if len(dots) <= 1:
        return len(dots)

    best = 1
    for scy, sarea in dots:
        n = 0
        for cy, area in dots:
            if abs(cy - scy) > DOT_ROW_BAND * outline_h:
                continue
            if area > DOT_AREA_RATIO * sarea:
                continue
            if sarea > DOT_AREA_RATIO * area:
                continue
            n += 1
        if n > best:
            best = n
    return min(best, 3)


def features_from_gray(gray: np.ndarray) -> tuple[int, int]:
    """(bars, dots) for one already-cropped, single-glyph grayscale image."""
    mask = binarize(gray)
    labels, comps = label_components(mask)
    return count_bars(mask, labels, comps), count_dots(mask, comps)


def read_features(path: str) -> tuple[int, int]:
    gray = np.asarray(Image.open(path).convert("L"), dtype=np.uint8)
    return features_from_gray(gray)


# --------------------------------------------------------------------------
# evaluation
# --------------------------------------------------------------------------
BAR_BASES = ("tub", "circle")  # only these can carry underbars
DOT_BASES = ("tumble", "iron")  # only these can carry dots


def main() -> None:
    root = sys.argv[1]
    out_md = sys.argv[2] if len(sys.argv) > 2 else None

    with open(os.path.join(root, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    items = manifest["items"]

    # sev -> counters
    stats = defaultdict(lambda: defaultdict(int))
    confusion = defaultdict(lambda: defaultdict(int))  # (sev, true, pred) for bars

    for i, it in enumerate(items):
        if i % 400 == 0:
            print("  ... %d/%d" % (i, len(items)))
        bars, dots = read_features(os.path.join(root, it["file"]))
        sev = it["severity"]

        if it["base"] in BAR_BASES:
            stats[sev]["bar_n"] += 1
            if bars == it["bars"]:
                stats[sev]["bar_ok"] += 1
            confusion[sev][(it["bars"], bars)] += 1
            # A safety-relevant miss: reporting a weaker restriction than the truth.
            if bars < it["bars"]:
                stats[sev]["bar_unsafe"] += 1

        if it["base"] in DOT_BASES:
            stats[sev]["dot_n"] += 1
            if dots == it["dots"]:
                stats[sev]["dot_ok"] += 1
            # More dots than truth = claiming a higher temperature is allowed.
            if dots > it["dots"]:
                stats[sev]["dot_unsafe"] += 1

    lines = []
    lines.append("| severity | 縮小後サイズ | 下線本数 正解率 | うち危険側 | 点の個数 正解率 | うち危険側 |")
    lines.append("|---|---|---|---|---|---|")
    for sev in sorted(stats):
        s = stats[sev]
        px = manifest["target_px"][str(sev)] if str(sev) in manifest["target_px"] else manifest["target_px"][sev]
        bar_acc = 100.0 * s["bar_ok"] / max(1, s["bar_n"])
        dot_acc = 100.0 * s["dot_ok"] / max(1, s["dot_n"])
        bar_bad = 100.0 * s["bar_unsafe"] / max(1, s["bar_n"])
        dot_bad = 100.0 * s["dot_unsafe"] / max(1, s["dot_n"])
        lines.append(
            "| s%d | %dpx | %.1f%% (%d/%d) | %.1f%% | %.1f%% (%d/%d) | %.1f%% |"
            % (sev, px, bar_acc, s["bar_ok"], s["bar_n"], bar_bad,
               dot_acc, s["dot_ok"], s["dot_n"], dot_bad)
        )

    report = "\n".join(lines)
    print()
    print(report.encode("ascii", "replace").decode("ascii"))

    if out_md:
        with open(out_md, "w", encoding="utf-8") as f:
            f.write("# 古典CVによる特徴カウントの実測\n\n")
            f.write(report + "\n\n")
            f.write("## 下線本数の混同行列（正解 -> 推定）\n\n")
            for sev in sorted(confusion):
                f.write("### s%d\n\n" % sev)
                f.write("| 正解 | 推定0 | 推定1 | 推定2 |\n|---|---|---|---|\n")
                for t in (0, 1, 2):
                    row = [confusion[sev].get((t, p), 0) for p in (0, 1, 2)]
                    f.write("| %d | %d | %d | %d |\n" % (t, row[0], row[1], row[2]))
                f.write("\n")
        print("\nwrote %s" % out_md)


if __name__ == "__main__":
    main()
