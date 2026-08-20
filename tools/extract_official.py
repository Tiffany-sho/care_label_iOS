"""Cut the official symbols out of the government leaflet PDF.

Why
---
自前で描いた41記号の形が公式と合っているかを、目視ではなく数値で確かめるため。
リーフレット（経済産業省・消費者庁「衣類の取扱表示」令和6年8月改正）では
各記号が白い角丸の枠に入っているので、白い塊を見つけて、その中のインクを切り出す。

切り出した画像はあくまで**照合の基準**として使う。アプリに同梱するテンプレートは
自前で描いたもの（lib/glyphSvg.ts）のままにする。

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/extract_official.py <pdf> <out_dir>
"""

import os
import sys

import fitz
import numpy as np
from PIL import Image

DPI = 400
# 白枠として認めるサイズ（px, DPI=400 のとき）
MIN_BOX = 120
MAX_BOX = 460


def label_white_boxes(white: np.ndarray) -> list[tuple[int, int, int, int]]:
    """白い矩形領域の外接矩形を返す（単純な走査+union-find）。"""
    h, w = white.shape
    labels = np.full((h, w), -1, dtype=np.int32)
    parent: list[int] = []

    def find(a: int) -> int:
        x = a
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    ys, xs = np.nonzero(white)
    for y, x in zip(ys.tolist(), xs.tolist()):
        best = -1
        for dy, dx in ((-1, 0), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                lab = labels[ny, nx]
                if lab >= 0:
                    if best < 0:
                        best = lab
                    else:
                        union(best, lab)
        if best < 0:
            best = len(parent)
            parent.append(best)
        labels[y, x] = best

    boxes: dict[int, list[int]] = {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        r = find(int(labels[y, x]))
        b = boxes.get(r)
        if b is None:
            boxes[r] = [x, y, x, y]
        else:
            if x < b[0]:
                b[0] = x
            if y < b[1]:
                b[1] = y
            if x > b[2]:
                b[2] = x
            if y > b[3]:
                b[3] = y
    return [tuple(b) for b in boxes.values()]


def main() -> None:
    pdf = sys.argv[1]
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)

    page = fitz.open(pdf)[0]
    pix = page.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    print("page raster: %dx%d" % (img.shape[1], img.shape[0]))

    white = img >= 250
    boxes = label_white_boxes(white)
    boxes = [
        b
        for b in boxes
        if MIN_BOX <= (b[2] - b[0]) <= MAX_BOX and MIN_BOX <= (b[3] - b[1]) <= MAX_BOX
    ]
    # 白枠の内側にも白い領域が出る（文字の抜きなど）。内包されるものは捨てる。
    def inside(a, b):
        return a[0] >= b[0] and a[1] >= b[1] and a[2] <= b[2] and a[3] <= b[3]

    boxes = [a for a in boxes if not any(a is not b and inside(a, b) for b in boxes)]
    # 上から下、左から右
    boxes.sort(key=lambda b: (round(b[0] / 40), b[1]))
    print("white boxes found:", len(boxes))

    saved = 0
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        pad = 6
        sub = img[y0 + pad : y1 - pad, x0 + pad : x1 - pad]
        if sub.size == 0:
            continue
        ink = sub <= 128
        if ink.sum() < 200:
            continue  # 中身が無い白枠
        iy, ix = np.nonzero(ink)
        crop = sub[iy.min() : iy.max() + 1, ix.min() : ix.max() + 1]
        name = "sym_%02d_x%04d_y%04d.png" % (saved, x0, y0)
        Image.fromarray(crop).save(os.path.join(out, name))
        saved += 1
    print("saved %d symbol crops to %s" % (saved, out))


if __name__ == "__main__":
    main()
