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
