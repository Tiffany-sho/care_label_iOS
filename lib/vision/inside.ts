/**
 * 記号の「中身」だけを切り出して照合する（Stage 3）。
 *
 * なぜ要るか:
 *   記号全体を 56x64 に正規化した相関では、桶の中の「30」と「40」の差が
 *   数十画素にしかならず、150/170/180 の相関がほぼ同値になる。実写で
 *   温度の正解が 0/9 だったのはこれが原因で、閾値では動かない。
 *   中身だけを切り出して正規化すれば、同じ照合器のまま分解能が桁で変わる。
 *
 * 切り方は基本形で2通りに分かれる。**分岐の条件は記号の定義から決まる**ので、
 * 実データに合わせた後付けではない。
 *   - 中身が外形から**離れている**もの（桶の数字・円の文字・点）
 *     → 外形の外接矩形に完全に含まれる別の連結成分だけを残す。
 *       下線は外形の箱の外（下）にあるので自動的に落ちる。
 *   - 中身が外形に**接している**もの（三角の×と斜線、自然乾燥の線と日陰の斜線）
 *     → 別成分にならないので上の方法では何も残らない。
 *       穴を埋めたシルエットを内側へ収縮し、その内側のインクを残す。
 */

import bundledInside from "./inside.json";
import type { Mask } from "./binarize";
import { labelComponents, type Comp, type Labelled } from "./components";
import { resizeArea } from "./match";
import { bodyComponent, fillHoles, strokeWidth } from "./shape";

export type InsidePatch = { mask: Mask; w: number; h: number };

/** 中身がどう並ぶかで正規化の寸法を変える。桶の数字だけ横長。 */
export function insideCanonSize(base: string): [number, number] {
  return base === "tub" ? [48, 32] : [48, 48];
}

/**
 * 外形の外接矩形に完全に含まれる、外形以外の成分だけを残す。
 * minAreaRatio は外形の外接矩形に対する比。生地のノイズを落とすため。
 */
export function insideByComponents(
  labelled: Labelled,
  w: number,
  h: number,
  body: Comp,
  minAreaRatio = 0.002,
): InsidePatch | null {
  const boxArea = Math.max(1, (body.x1 - body.x0 + 1) * (body.y1 - body.y0 + 1));
  const keep = new Set<number>();
  for (const c of labelled.comps.values()) {
    if (c.root === body.root) continue;
    // 外接矩形の**中心**が外形の中にあれば採る。完全に含まれることを求めると、
    // 手洗いの手のように手首が桶の縁より上へ出る中身が丸ごと落ちる（実測で
    // 手洗い5件が全部「中身なし」になっていた）。
    const cx = (c.x0 + c.x1) / 2;
    const cy = (c.y0 + c.y1) / 2;
    if (cx < body.x0 || cx > body.x1 || cy < body.y0 || cy > body.y1) continue;
    if (c.area / boxArea < minAreaRatio) continue;
    keep.add(c.root);
  }
  if (keep.size === 0) return null;
  // 外形の外接矩形からはみ出した部分は切り落とす（下線を巻き込まないため）。
  const out = new Uint8Array(w * h);
  let ink = 0;
  for (let y = body.y0; y <= body.y1; y++) {
    for (let x = body.x0; x <= body.x1; x++) {
      const i = y * w + x;
      if (keep.has(labelled.labels[i])) {
        out[i] = 1;
        ink++;
      }
    }
  }
  return ink > 0 ? { mask: out, w, h } : null;
}

/**
 * 穴を埋めたシルエットを内側へ収縮し、その内側にあるインクを残す。
 * 収縮は (2r+1) の正方形。累積和で1画素あたり定数時間。
 */
export function insideByErosion(
  mask: Mask,
  w: number,
  h: number,
  body: Comp,
  /** 削る半径を線の太さの何倍にするか */
  strokeFactor: number,
): InsidePatch | null {
  const bw = body.x1 - body.x0 + 1;
  const bh = body.y1 - body.y0 + 1;
  const sub = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      sub[y * bw + x] = mask[(body.y0 + y) * w + (body.x0 + x)];
    }
  }
  const filled = fillHoles(sub, bw, bh);
  const sw = strokeWidth(mask, w, h, { x0: body.x0, y0: body.y0, x1: body.x1, y1: body.y1 });
  const r = Math.max(2, Math.round(strokeFactor * sw));
  // 積分画像で「窓が全部インク」を判定する
  const sum = new Int32Array((bw + 1) * (bh + 1));
  for (let y = 0; y < bh; y++) {
    let row = 0;
    for (let x = 0; x < bw; x++) {
      row += filled[y * bw + x];
      sum[(y + 1) * (bw + 1) + x + 1] = sum[y * (bw + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  let ink = 0;
  for (let y = 0; y < bh; y++) {
    const y0 = y - r;
    const y1 = y + r;
    if (y0 < 0 || y1 >= bh) continue;
    for (let x = 0; x < bw; x++) {
      const x0 = x - r;
      const x1 = x + r;
      if (x0 < 0 || x1 >= bw) continue;
      const area =
        sum[(y1 + 1) * (bw + 1) + x1 + 1] -
        sum[y0 * (bw + 1) + x1 + 1] -
        sum[(y1 + 1) * (bw + 1) + x0] +
        sum[y0 * (bw + 1) + x0];
      if (area !== (2 * r + 1) * (2 * r + 1)) continue;
      if (sub[y * bw + x]) {
        out[(body.y0 + y) * w + (body.x0 + x)] = 1;
        ink++;
      }
    }
  }
  return ink > 0 ? { mask: out, w, h } : null;
}

/**
 * インクの外接矩形で切り、指定寸法へ面積平均して 0..255 のバイト列にする。
 * テンプレートの書き出しと、実行時の照合で同じものを使うための共通部分。
 */
export function insideBytes(
  patch: InsidePatch,
  outW: number,
  outH: number,
): Uint8Array | null {
  const resized = insideResize(patch, outW, outH);
  if (resized === null) return null;
  const out = new Uint8Array(resized.length);
  for (let i = 0; i < resized.length; i++) {
    const v = Math.round(resized[i]);
    out[i] = v <= 0 ? 0 : v >= 255 ? 255 : v;
  }
  return out;
}

/** 平均0・ノルム1にする。 */
export function toUnitVector(src: Float64Array | Uint8Array): Float64Array {
  const v = new Float64Array(src.length);
  let mean = 0;
  for (let i = 0; i < src.length; i++) mean += src[i];
  mean /= src.length;
  let sq = 0;
  for (let i = 0; i < src.length; i++) {
    v[i] = src[i] - mean;
    sq += v[i] * v[i];
  }
  const norm = Math.max(Math.sqrt(sq), 1e-9);
  for (let i = 0; i < src.length; i++) v[i] /= norm;
  return v;
}

/** インクの外接矩形で切り、指定寸法へ面積平均してから平均0・ノルム1にする。 */
export function insideVector(
  patch: InsidePatch,
  outW: number,
  outH: number,
): Float64Array | null {
  const resized = insideResize(patch, outW, outH);
  return resized === null ? null : toUnitVector(resized);
}

function insideResize(
  patch: InsidePatch,
  outW: number,
  outH: number,
): Float64Array | null {
  const { mask, w, h } = patch;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      ink++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (ink < 12) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const src = new Float64Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      src[y * cw + x] = mask[(y0 + y) * w + (x0 + x)] ? 255 : 0;
    }
  }
  return resizeArea(src, cw, ch, outW, outH);
}

/**
 * 中身の切り出しを、基本形に応じた方法で作る。
 * 両方作れる基本形では両方返し、照合側で相関の高いほうを採る。
 */
export function insideCandidates(
  mask: Mask,
  w: number,
  h: number,
  strokeFactor: number,
): InsidePatch[] {
  const labelled = labelComponents(mask, w, h);
  const body = bodyComponent(labelled);
  if (body === null) return [];
  const out: InsidePatch[] = [];
  const comp = insideByComponents(labelled, w, h, body);
  if (comp !== null) out.push(comp);
  const ero = insideByErosion(mask, w, h, body, strokeFactor);
  if (ero !== null) out.push(ero);
  return out;
}

// ---------------------------------------------------------------------------
// 中身のテンプレート（桶の温度の数字・円の文字）
// ---------------------------------------------------------------------------

export type InsideBundle = {
  tubWidth: number;
  tubHeight: number;
  circleWidth: number;
  circleHeight: number;
  items: { base: string; cls: string; font: number; patch: string }[];
};

export type InsideTemplate = {
  base: string;
  /** 桶なら "30".."95"、円なら "P" / "F" / "W" */
  cls: string;
  vector: Float64Array;
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64.indexOf(clean[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

export function loadInsideTemplates(bundle: InsideBundle): InsideTemplate[] {
  return bundle.items.map((it) => ({
    base: it.base,
    cls: it.cls,
    vector: toUnitVector(decodeBase64(it.patch)),
  }));
}

export type InsideMatch = {
  cls: string;
  correlation: number;
  /** 1位と2位（別クラス）の相関差 */
  margin: number;
};

/**
 * 中身を切り出してクラスを当てる。切り出せなければ null。
 *
 * **切り出せない＝中身が外形とつながっている**、という情報自体が使える。
 * 桶なら手洗いの手か禁止の×、円なら禁止の×しかその形にならない。
 */
export function classifyInside(
  labelled: Labelled,
  w: number,
  h: number,
  base: string,
  templates: InsideTemplate[],
): InsideMatch | null {
  const body = bodyComponent(labelled);
  if (body === null) return null;
  const patch = insideByComponents(labelled, w, h, body);
  if (patch === null) return null;
  const [cw, ch] = insideCanonSize(base);
  const v = insideVector(patch, cw, ch);
  if (v === null) return null;
  let best: InsideTemplate | null = null;
  let bestCorr = -2;
  const corrs: { cls: string; corr: number }[] = [];
  for (const t of templates) {
    if (t.base !== base) continue;
    let acc = 0;
    for (let i = 0; i < v.length; i++) acc += v[i] * t.vector[i];
    corrs.push({ cls: t.cls, corr: acc });
    if (acc > bestCorr) {
      bestCorr = acc;
      best = t;
    }
  }
  if (best === null) return null;
  let second = -2;
  for (const c of corrs) {
    if (c.cls === best.cls) continue;
    if (c.corr > second) second = c.corr;
  }
  return { cls: best.cls, correlation: bestCorr, margin: bestCorr - second };
}

/**
 * 同梱の中身テンプレート。桶の温度の数字（6種）と円の文字（P/F/W）だけ。
 *
 * 手洗いの手と禁止の×は輪郭とつながって別成分にならず、この方式では
 * 切り出せない。**切り出せないこと自体が「中身が輪郭とつながっている」
 * という情報**なので、無理に作らない。
 */
export const INSIDE_TEMPLATES: InsideTemplate[] = loadInsideTemplates(
  bundledInside as InsideBundle,
);
