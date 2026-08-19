/**
 * Stage 1: タグの写真から記号を1個ずつ切り出す。
 *
 * ⚠️ パイプラインで**唯一、測定できていない段**。Stage 2 以降（分類・カウント）は
 * 合成2214枚で Python 参照実装と完全一致を確認済みだが、ここは実写のタグでしか
 * 評価できず、まだ実写の評価セットが無い。精度の主張はしない。
 *
 * 利用している事前知識:
 *   記号列は「ほぼ同じ高さの図形が、横一列に、間隔をあけて並ぶ」。
 *   これは非常に強い制約なので、まずはルールベースで足りるはず、という賭け。
 *   1記号は複数の連結成分に分かれる（輪郭・下線・点・内側の円）ので、
 *   x方向の重なりでまとめ直すのが要点。
 */

import { binarize, type GrayImage } from "./binarize";
import { compHeight, compWidth, labelComponents, type Comp } from "./components";

export type SymbolBox = { x0: number; y0: number; x1: number; y1: number };

export type SegmentOptions = {
  /** これ未満の面積比の成分はノイズとして捨てる */
  minAreaRatio?: number;
  /** 画像のこの割合以上を占める成分は、タグの枠とみなして捨てる */
  frameRatio?: number;
  /** 同じ記号とみなす x 方向の重なり（小さい方の幅に対する比） */
  mergeOverlap?: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 画像から矩形を切り出す。pad は元画像の範囲でクランプされる。 */
export function cropGray(img: GrayImage, box: SymbolBox, pad = 2): GrayImage {
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(img.width - 1, box.x1 + pad);
  const y1 = Math.min(img.height - 1, box.y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = (y0 + y) * img.width + x0;
    data.set(img.data.subarray(src, src + w), y * w);
  }
  return { data, width: w, height: h };
}

type Cluster = SymbolBox & { hasOutline: boolean };

function overlapX(a: SymbolBox, b: SymbolBox): number {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
}

export function segmentSymbols(
  img: GrayImage,
  opts: SegmentOptions = {},
): SymbolBox[] {
  const minAreaRatio = opts.minAreaRatio ?? 0.00003;
  const frameRatio = opts.frameRatio ?? 0.85;
  const mergeOverlap = opts.mergeOverlap ?? 0.35;

  const { width: w, height: h } = img;
  const mask = binarize(img);
  const { comps } = labelComponents(mask, w, h);

  const minArea = Math.max(6, minAreaRatio * w * h);
  const kept: Comp[] = [];
  for (const c of comps.values()) {
    if (c.area < minArea) continue;
    // タグの外枠や画像全体をなぞる成分は記号ではない
    if (compWidth(c) > frameRatio * w && compHeight(c) > frameRatio * h) continue;
    kept.push(c);
  }
  if (kept.length === 0) return [];

  // 記号の輪郭になりうる「背の高い」成分から基準の高さを決める。
  // 下線や点は小さいので、これらを混ぜて中央値を取ると基準が壊れる。
  let maxH = 0;
  for (const c of kept) maxH = Math.max(maxH, compHeight(c));
  const outlines = kept.filter((c) => compHeight(c) >= 0.4 * maxH);
  if (outlines.length === 0) return [];
  const medianH = median(outlines.map(compHeight));
  if (medianH <= 0) return [];

  // x 方向の重なりでまとめる。1記号が輪郭・下線・点に割れているのを戻す。
  const sorted = [...kept].sort((a, b) => a.x0 - b.x0);
  const clusters: Cluster[] = [];
  for (const c of sorted) {
    const box: SymbolBox = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 };
    const isOutline = compHeight(c) >= 0.4 * maxH;
    let merged = false;
    for (const cl of clusters) {
      const ov = overlapX(box, cl);
      const minW = Math.min(compWidth(c), cl.x1 - cl.x0 + 1);
      if (ov <= 0 || ov < mergeOverlap * minW) continue;
      // 縦にも近いことを要求する。別の行のノイズを吸い込まないため。
      const cyA = (box.y0 + box.y1) / 2;
      const cyB = (cl.y0 + cl.y1) / 2;
      if (Math.abs(cyA - cyB) > 1.5 * medianH) continue;
      cl.x0 = Math.min(cl.x0, box.x0);
      cl.x1 = Math.max(cl.x1, box.x1);
      cl.y0 = Math.min(cl.y0, box.y0);
      cl.y1 = Math.max(cl.y1, box.y1);
      cl.hasOutline = cl.hasOutline || isOutline;
      merged = true;
      break;
    }
    if (!merged) clusters.push({ ...box, hasOutline: isOutline });
  }

  const out = clusters.filter((cl) => {
    if (!cl.hasOutline) return false;
    const cw = cl.x1 - cl.x0 + 1;
    const ch = cl.y1 - cl.y0 + 1;
    // 下線ぶん縦に伸びるので、高さの上限はゆるめに取る
    if (ch < 0.5 * medianH || ch > 2.4 * medianH) return false;
    if (cw < 0.35 * medianH || cw > 2.0 * medianH) return false;
    return true;
  });

  out.sort((a, b) => a.x0 - b.x0);
  return out.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));
}
