/**
 * 「数える」処理。tools/features.py の count_bars / count_dots の移植。
 *
 * ここをモデルに任せないのが設計の要。VLM は counting が最も苦手で、
 * JIS L 0001 の意味はほぼ全部その counting に乗っている
 * （下線1本か2本か、点が1/2/3個か）。幾何で切り分けて数えれば決定的に解ける。
 *
 * 実測（tools/RESOLUTION.md）:
 *   1記号100px以上で下線100%、点は50pxでも100%。
 *   そして**過大予測は全条件で0%**。誤りは常に「あるのに無い」方向。
 */

import type { Mask } from "./binarize";
import {
  compBoxArea,
  compFill,
  compHeight,
  compWidth,
  largestComponent,
  type Comp,
  type Labelled,
} from "./components";

/**
 * 下線（弱い操作 / 非常に弱い操作）の本数。0..2。
 *
 * 下線は輪郭とは別の連結成分で、幅が広く・薄く・図形の中心より下にある。
 * ぼけて2本が1成分に融合しても、行プロファイルにへこみが残っていれば2本として拾える。
 */
export function countBars(
  mask: Mask,
  labelled: Labelled,
  w: number,
  h: number,
): number {
  const { labels, comps } = labelled;
  if (comps.size === 0) return 0;
  const outline = largestComponent(comps);
  if (outline === undefined) return 0;
  const midY = (outline.y0 + outline.y1) / 2;

  const candidates = new Set<number>();
  for (const c of comps.values()) {
    if (c.root === outline.root) continue;
    if (compWidth(c) >= 0.28 * w && compHeight(c) <= 0.2 * h && c.y0 > midY) {
      candidates.add(c.root);
    }
  }
  if (candidates.size === 0) return 0;

  const profile = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) {
      if (candidates.has(labels[y * w + x])) n++;
    }
    profile[y] = n;
  }
  let peak = 0;
  for (let y = 0; y < h; y++) if (profile[y] > peak) peak = profile[y];
  if (peak <= 0) return 0;

  const threshold = 0.45 * peak;
  let runs = 0;
  let prev = false;
  for (let y = 0; y < h; y++) {
    const strong = profile[y] > threshold;
    if (strong && !prev) runs++;
    prev = strong;
  }
  return Math.min(runs, 2);
}

/**
 * タンブル乾燥の円／アイロン内部の点の個数。0..3。
 *
 * ⚠️ 基本形が tumble / iron のときだけ呼ぶこと。
 * 桶に対して呼ぶと、中の数字「95」が点2個として拾われる（実際に起きた）。
 * これは呼ぶ側の誤りであってカウンタのバグではない。
 */
export function countDots(labelled: Labelled): number {
  const { comps } = labelled;
  if (comps.size === 0) return 0;
  const outline = largestComponent(comps);
  if (outline === undefined) return 0;
  const box = compBoxArea(outline);

  let n = 0;
  for (const c of comps.values()) {
    if (c === outline) continue;
    if (!(outline.x0 <= c.x0 && c.x1 <= outline.x1)) continue;
    if (!(outline.y0 <= c.y0 && c.y1 <= outline.y1)) continue;
    const rel = c.area / box;
    if (!(rel >= 0.0012 && rel <= 0.03)) continue;
    const aspect = compWidth(c) / Math.max(1, compHeight(c));
    if (!(aspect >= 0.45 && aspect <= 2.2)) continue;
    if (compFill(c) < 0.4) continue;
    n++;
  }
  return Math.min(n, 3);
}

/** 下線を持ちうる基本形 */
export const BAR_BASES = new Set(["tub", "circle"]);
/** 点を持ちうる基本形 */
export const DOT_BASES = new Set(["tumble", "iron"]);

/**
 * 「丸の中身」のインク率。中身のない丸を見分けるために使う。
 *
 * 実物のタグには、JIS L 0001 の43記号に無い**中身のない丸**が載ることがある
 * （クリーニング店向けの表示）。一番近い記号に丸めると 610（丸に F）などと
 * 断定してしまうので、読み飛ばせるようにする。
 *
 * 一番外側の輪郭（面積最大の外接矩形を持つ成分）の中心に、その半径の
 * 45% の窓を置いて数える。実測（tools/probe_interior.py、43記号）:
 *   中身のない丸 0.000 / 610・611 0.282 / 620・621 0.349 /
 *   600 0.445 / 710〜712 0.536 / 700 0.719
 * 0.000 と 0.282 の間は十分に空いているので、0.15 で切る。
 * 0.20 まで上げると劣化画像で 611（丸に F・下線）を4枚落とした。0.10 まで下げても
 * 落ちる枚数は変わらない（2322枚中2枚。どちらも別の基本形を丸と読み違えたもの）。
 */
export const EMPTY_INTERIOR_MAX = 0.15;

export function interiorInk(
  mask: Mask,
  w: number,
  h: number,
  labelled: Labelled,
  window = 0.45,
): number | null {
  let ring: Comp | null = null;
  let bestArea = -1;
  for (const c of labelled.comps.values()) {
    const area = (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1);
    if (area > bestArea) {
      bestArea = area;
      ring = c;
    }
  }
  if (ring === null) return null;
  const cx = (ring.x0 + ring.x1) / 2;
  const cy = (ring.y0 + ring.y1) / 2;
  const r = Math.min(ring.x1 - ring.x0 + 1, ring.y1 - ring.y0 + 1) / 2;
  const y0 = Math.max(0, Math.round(cy - window * r));
  const y1 = Math.min(h - 1, Math.round(cy + window * r));
  const x0 = Math.max(0, Math.round(cx - window * r));
  const x1 = Math.min(w - 1, Math.round(cx + window * r));
  let ink = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      n++;
      if (mask[y * w + x]) ink++;
    }
  }
  return n > 0 ? ink / n : null;
}
