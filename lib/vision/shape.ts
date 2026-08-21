/**
 * 記号を「外形」と「中身」に分ける幾何の道具。
 *
 * なぜ要るか（測定にもとづく）:
 *   記号全体を 56x64 に正規化した1回の相関では、実写で足りない。
 *   「30」と「40」の差はそのパッチ上で数十画素しかなく、150/170/180 の相関が
 *   ほぼ同値になってマージンが崩れる。中身だけを切り出して正規化すれば、
 *   同じ照合器のまま分解能が桁で変わる（lib/vision/inside.ts）。
 *
 * ⚠️ 「穴を埋めたシルエットなら禁止の×の影響を受けないので基本形を当てられる」
 *   という筋は**測って外れた**。×の影響を受けないのは事実だが、埋めたあとの
 *   形どうしが見分けられない。実写91記号での基本形の正解率は、記号全体の
 *   相関 97.8% に対し、埋めたシルエット 78.0%。禁止の6記号に絞って
 *   埋めた形で選び直す案も、通しの一致が 109 -> 81 に崩れた（どれも似た塊に
 *   なり、全部が 700 に寄る）。**埋めるのは「中身を切り出すための下ごしらえ」
 *   であって、形を見分ける手段ではない。**
 */

import type { Mask } from "./binarize";
import { compBoxArea, type Comp, type Labelled } from "./components";

export type Box = { x0: number; y0: number; x1: number; y1: number };

export function boxWidth(b: Box): number {
  return b.x1 - b.x0 + 1;
}
export function boxHeight(b: Box): number {
  return b.y1 - b.y0 + 1;
}

/**
 * 外形の成分。外接矩形の面積が最大のものを採る。
 *
 * 面積（画素数）ではなく外接矩形で選ぶのは、輪郭線が細いため。
 * 塗りつぶされた大きな汚れより、細い線でできた大きな枠のほうを外形としたい。
 * 禁止の×は輪郭と交差して同じ成分に融合するので、自然にここへ含まれる。
 */
export function bodyComponent(labelled: Labelled): Comp | null {
  let best: Comp | null = null;
  let bestArea = -1;
  for (const c of labelled.comps.values()) {
    const a = compBoxArea(c);
    if (a > bestArea) {
      bestArea = a;
      best = c;
    }
  }
  return best;
}

/** ある成分だけを 1 とした、その外接矩形ぶんのマスク。 */
export function componentMask(
  labelled: Labelled,
  w: number,
  comp: Comp,
): { mask: Mask; w: number; h: number } {
  const sw = comp.x1 - comp.x0 + 1;
  const sh = comp.y1 - comp.y0 + 1;
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      out[y * sw + x] = labelled.labels[(comp.y0 + y) * w + (comp.x0 + x)] === comp.root ? 1 : 0;
    }
  }
  return { mask: out, w: sw, h: sh };
}

/**
 * 縁から届かない背景画素（＝図形に囲まれた穴）を 1 にしたマスク。
 * 明示スタックで塗る（端末で再帰は深くしたくない）。
 */
export function holeMask(mask: Mask, w: number, h: number): Mask {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number): void => {
    if (mask[i] === 0 && seen[i] === 0) {
      seen[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const y = (i / w) | 0;
    const x = i - y * w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const holes = new Uint8Array(w * h);
  for (let i = 0; i < holes.length; i++) holes[i] = mask[i] === 0 && seen[i] === 0 ? 1 : 0;
  return holes;
}

/** 穴を埋めたシルエット。基本形はこれで見る。 */
export function fillHoles(mask: Mask, w: number, h: number): Mask {
  const holes = holeMask(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || holes[i];
  return out;
}

/**
 * 禁止の×を、図形の中心を通る直線として探す。
 *
 * 最初は外接矩形の対角線をそのままたどったが、実写の `200`（漂白不可）で
 * 被覆が 0.63〜0.75 までしか出ず、8件を取りこぼした。×の腕が矩形の角まで
 * 届いていない（印字ごとに大きさが違う）のが原因。
 * ×が必ず満たす性質は「**図形の中心を通る**斜めの直線が2方向ある」ことなので、
 * 角ではなく中心を固定して角度を振る。
 *
 * 戻り値は2つの角度帯（右下がり / 右上がり）それぞれの最大被覆率。
 *
 * 「中心から離した平行線との差」を見て塊と線を分ける案も測ったが、
 * 分離は 84/91 から 81/91 に悪化した。×の腕以外にも図形の縁があるので
 * 差が付かない。取り下げた。
 */
export function crossScore(
  mask: Mask,
  w: number,
  h: number,
  tolRatio = 0.03,
): [number, number] {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n === 0) return [0, 0];
  const cx = sx / n;
  const cy = sy / n;
  const tol = Math.max(1, Math.round(Math.min(w, h) * tolRatio));
  const hit = (x: number, y: number): boolean => {
    const x0 = Math.max(0, Math.round(x) - tol);
    const x1 = Math.min(w - 1, Math.round(x) + tol);
    const y0 = Math.max(0, Math.round(y) - tol);
    const y1 = Math.min(h - 1, Math.round(y) + tol);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) if (mask[yy * w + xx]) return true;
    }
    return false;
  };
  const coverage = (deg: number): number => {
    const r = (deg * Math.PI) / 180;
    const dx = Math.cos(r);
    const dy = Math.sin(r);
    const lim = (d: number, c: number, size: number): number =>
      d === 0 ? Infinity : d > 0 ? (size - 1 - c) / d : -c / d;
    const tPos = Math.min(lim(dx, cx, w), lim(dy, cy, h));
    const tNeg = Math.min(lim(-dx, cx, w), lim(-dy, cy, h));
    const len = tPos + tNeg;
    if (!Number.isFinite(len) || len < 4) return 0;
    const steps = Math.max(16, Math.round(len));
    let ok = 0;
    for (let i = 0; i <= steps; i++) {
      const t = -tNeg + (len * i) / steps;
      if (hit(cx + dx * t, cy + dy * t)) ok++;
    }
    return ok / (steps + 1);
  };
  let a = 0;
  let b = 0;
  for (let deg = 20; deg <= 70; deg += 2) {
    const v = coverage(deg);
    if (v > a) a = v;
    const u = coverage(180 - deg);
    if (u > b) b = u;
  }
  return [a, b];
}
