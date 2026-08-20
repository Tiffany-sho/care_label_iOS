"""Compare our drawn symbols against the official leaflet crops, with numbers.

「形は公式の近似。照合が必要」と書き続けてきた宿題を、目視ではなく数値で片づける。
公式（tools/extract_official.py の出力）と自前（dataset/clean）の各記号を、
インクの外接矩形で正規化してから相関を取る。低いものが直すべきもの。

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/compare_official.py <official_dir> <clean_dir> <out_sheet.png> [out.md]
"""

import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# 公式リーフレット上の位置（x座標のまとまり）と、こちらの記号番号の対応。
# リーフレットは41記号の全部ではなく代表例なので、載っているものだけ。
MAPPING = [
    # (official file prefix x, index within column, our code, label)
    (151, 0, "150", "40℃ 洗濯機標準"),
    (151, 1, "151", "40℃ 洗濯機弱?"),
    (151, 2, "141", "30℃ 洗濯機弱"),
    (151, 3, "110", "40℃ 手洗い"),
    (151, 4, None, "30℃ 手洗い（未実装）"),
    (151, 5, "100", "家庭洗濯NG"),
    (878, 0, "220", "漂白OK"),
    (878, 1, "210", "酸素系のみ"),
    (878, 2, "200", "漂白NG"),
    (1279, 0, "320", "タンブル高温"),
    (1279, 1, "310", "タンブル低温"),
    (1279, 2, "300", "タンブルNG"),
    (2344, 0, "530", "アイロン高温"),
    (2344, 1, "520", "アイロン中温"),
    (2344, 2, "510", "アイロン低温"),
    (2344, 3, None, "低温スチームなし（未実装）"),
    (2344, 4, "500", "アイロンNG"),
    (2748, 0, "620", "ドライ P 通常"),
    (2748, 1, "611", "ドライ F 弱"),
    (2748, 2, "712", "ウェット 非常に弱"),
    (2748, 3, "600", "ドライNG"),
    (2748, 4, "700", "ウェットNG"),
]

CANON = (96, 108)


def norm_vec(img: np.ndarray) -> np.ndarray | None:
    """インクの外接矩形で切り出し、正規サイズにして平均0・ノルム1にする。"""
    ink = img <= 128
    if ink.sum() < 30:
        return None
    ys, xs = np.nonzero(ink)
    patch = ink[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.float64)
    im = Image.fromarray((patch * 255).astype(np.uint8), mode="L").resize(
        CANON, Image.BILINEAR
    )
    v = np.asarray(im, dtype=np.float64).ravel()
    v -= v.mean()
    n = np.linalg.norm(v)
    return None if n < 1e-6 else v / n


def main() -> None:
    off_dir, clean_dir, sheet_path = sys.argv[1], sys.argv[2], sys.argv[3]
    out_md = sys.argv[4] if len(sys.argv) > 4 else None

    files = sorted(os.listdir(off_dir))
    by_col: dict[int, list[str]] = {}
    for f in files:
        if not f.endswith(".png"):
            continue
        x = int(f.split("_x")[1].split("_")[0])
        # x が近いものは同じ列にまとめる
        key = min(by_col.keys(), key=lambda k: abs(k - x), default=None)
        if key is None or abs(key - x) > 80:
            key = x
        by_col.setdefault(key, []).append(f)
    for k in by_col:
        by_col[k].sort(key=lambda f: int(f.split("_y")[1].split(".")[0]))

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    ours = {it["code"]: it["file"] for it in index["items"] if it["font"] == 0}

    rows = []
    for col_x, idx, code, label in MAPPING:
        key = min(by_col.keys(), key=lambda k: abs(k - col_x))
        col = by_col[key]
        if idx >= len(col):
            continue
        off_img = np.asarray(
            Image.open(os.path.join(off_dir, col[idx])).convert("L"), dtype=np.uint8
        )
        our_img = None
        corr = None
        if code is not None and code in ours:
            our_img = np.asarray(
                Image.open(os.path.join(clean_dir, ours[code])).convert("L"),
                dtype=np.uint8,
            )
            a, b = norm_vec(off_img), norm_vec(our_img)
            if a is not None and b is not None:
                corr = float(np.dot(a, b))
        rows.append((label, code, off_img, our_img, corr))

    # ── 並べたシートを作る ──
    CELL = 130
    PAD = 8
    LBL = 210
    W = LBL + CELL * 2 + PAD * 4
    H = PAD + len(rows) * (CELL + PAD) + 30
    sheet = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(sheet)
    d.text((LBL + PAD, 6), "official", fill=0)
    d.text((LBL + CELL + PAD * 3, 6), "ours", fill=0)
    y = 26
    for label, code, off_img, our_img, corr in rows:
        txt = "%s  %s" % (code or "-", "corr=%.2f" % corr if corr is not None else "-")
        d.text((6, y + CELL // 2 - 6), txt, fill=0)
        for j, im in enumerate([off_img, our_img]):
            if im is None:
                continue
            p = Image.fromarray(im).convert("L")
            p.thumbnail((CELL, CELL), Image.LANCZOS)
            sheet.paste(
                p,
                (
                    LBL + PAD + j * (CELL + PAD * 2) + (CELL - p.width) // 2,
                    y + (CELL - p.height) // 2,
                ),
            )
        y += CELL + PAD
    sheet.save(sheet_path)
    print("wrote", sheet_path)

    scored = [(c, code, label) for label, code, _, _, c in rows if c is not None]
    scored.sort()
    print("\n  一致度が低い順（低いほど描き直しが要る）")
    for c, code, label in scored:
        print("   %5.2f  %-4s" % (c, code or "-"))

    if out_md:
        lines = [
            "# 自前の記号と公式リーフレットの一致度",
            "",
            "公式: 経済産業省・消費者庁「衣類の取扱表示」（令和6年8月改正）のリーフレット。",
            "リーフレットは41記号の全部ではなく代表例なので、載っているものだけを比べている。",
            "",
            "インクの外接矩形で正規化してから相関を取った値。1.00 が完全一致。",
            "",
            "| 記号 | 番号 | 一致度 |",
            "|---|---|---|",
        ]
        for c, code, label in scored:
            lines.append("| %s | %s | %.2f |" % (label, code or "-", c))
        io.open(out_md, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        print("\nwrote", out_md)


if __name__ == "__main__":
    main()
