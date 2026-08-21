/**
 * テンプレートマッチング。tools/match.py の移植。
 *
 * 実測（tools/TEMPLATE_MATCH.md）: 学習モデルなしで
 * 基本形 95〜98% / 下線 99%+ / 点 99.7%+。41クラス完全一致は約80%で、
 * 残りの誤りはほぼ全部が記号の中の文字（温度数字と P/F）。
 * つまり学習が要るのは文字だけ。
 */

import { binarize, type GrayImage, type Mask } from "./binarize";

/** 正規化パッチの寸法。tools/match.py の CANON と一致させること。 */
export const CANON_W = 56;
export const CANON_H = 64;

export type CareTemplate = {
  /** JIS L 0001 の記号番号 */
  code: string;
  /** tub / triangle / tumble / natural / iron / circle */
  base: string;
  bars: number;
  dots: number;
  /** 平均0・ノルム1 */
  vector: Float64Array;
};

/**
 * (outN, inN) の面積平均リサンプリング重み。各行の合計は1。
 *
 * 既製の resize を使わないのは意図的。Pillow の BILINEAR は
 * フィルタ支持幅の決め方が実装依存で、他言語で再現できない。
 * 面積平均なら定義を1行で言えて、どこでも同じものを書ける。
 */
export function areaWeights(inN: number, outN: number): Float64Array[] {
  const rows: Float64Array[] = [];
  const scale = inN / outN;
  for (let j = 0; j < outN; j++) {
    const row = new Float64Array(inN);
    const s0 = j * scale;
    const s1 = (j + 1) * scale;
    const i0 = Math.floor(s0);
    const i1 = Math.min(Math.ceil(s1), inN);
    let total = 0;
    for (let i = i0; i < i1; i++) {
      const overlap = Math.min(s1, i + 1) - Math.max(s0, i);
      if (overlap > 0) {
        row[i] = overlap;
        total += overlap;
      }
    }
    if (total > 0) for (let i = i0; i < i1; i++) row[i] /= total;
    rows.push(row);
  }
  return rows;
}

/** 分離可能な面積リサンプリング（先に行、次に列）。 */
export function resizeArea(
  patch: Float64Array,
  inW: number,
  inH: number,
  outW: number,
  outH: number,
): Float64Array {
  const wv = areaWeights(inH, outH);
  const mid = new Float64Array(outH * inW);
  for (let j = 0; j < outH; j++) {
    const row = wv[j];
    for (let x = 0; x < inW; x++) {
      let acc = 0;
      for (let i = 0; i < inH; i++) {
        const g = row[i];
        if (g !== 0) acc += g * patch[i * inW + x];
      }
      mid[j * inW + x] = acc;
    }
  }
  const wh = areaWeights(inW, outW);
  const out = new Float64Array(outH * outW);
  for (let y = 0; y < outH; y++) {
    for (let j = 0; j < outW; j++) {
      const row = wh[j];
      let acc = 0;
      for (let i = 0; i < inW; i++) {
        const g = row[i];
        if (g !== 0) acc += g * mid[y * inW + i];
      }
      out[y * outW + j] = acc;
    }
  }
  return out;
}

/**
 * インクの外接矩形で切り出し → 正規サイズへ面積平均。値は 0..255。
 * 平行移動とスケールのばらつきが落ちる（回転はあえて残す）。
 */
export function canonicalPatch(
  mask: Mask,
  w: number,
  h: number,
): Float64Array | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 0) continue;
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
  const patch = new Float64Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      patch[y * cw + x] = mask[(y0 + y) * w + (x0 + x)] ? 255 : 0;
    }
  }
  return resizeArea(patch, cw, ch, CANON_W, CANON_H);
}

/** 平均0・ノルム1のベクトルにする。 */
export function normalise(mask: Mask, w: number, h: number): Float64Array | null {
  const patch = canonicalPatch(mask, w, h);
  if (patch === null) return null;
  let mean = 0;
  for (let i = 0; i < patch.length; i++) mean += patch[i];
  mean /= patch.length;
  for (let i = 0; i < patch.length; i++) patch[i] -= mean;
  let sq = 0;
  for (let i = 0; i < patch.length; i++) sq += patch[i] * patch[i];
  const norm = Math.sqrt(sq);
  if (norm < 1e-6) return null;
  for (let i = 0; i < patch.length; i++) patch[i] /= norm;
  return patch;
}

export function normaliseImage(img: GrayImage): Float64Array | null {
  return normalise(binarize(img), img.width, img.height);
}

/**
 * 信頼度は「相関の絶対値」ではなく「1位と2位の差（マージン）」で見る。
 *
 * 実測（合成 s0〜s2、1107件）で、相関の絶対値は当たり外れをほとんど分離しない:
 *   正解の相関 中央値 0.879 / 不正解の相関 中央値 0.760 と分布が重なる。
 *   閾値0.60でも、残ったうち約9%が誤りのまま。
 * 一方マージンはよく効く:
 *   margin>=0.01 → 正解の87.2%を残し、残った中の誤り 4.9%
 *   margin>=0.03 → 正解の71.7%を残し、残った中の誤り 0.4%
 * よって 0.01 で足切りし、0.03 以上を「そのまま採用してよい」とする。
 *
 * ただしこの 0.01 は**合成データで決めた値**で、実写にはきつすぎた。
 * 実写91記号で足切りを振ると:
 *   margin 0.03 / corr 0.35 → 正解 42、確定分の正解率 87.5%
 *   margin 0.01 / corr 0.25 → 正解 54、確定分の正解率 80.6%
 *   margin 0.005 / corr 0.20 → 正解 60、確定分の正解率 77.9%
 * 実写では相関そのものが 0.3〜0.6 しか出ないので、マージンも小さくなる。
 * 確信度は resolve.ts が別に付けて画面にも出るので、
 * 「黙って捨てる」より「低い確信度として見せる」ほうを採る。
 */
export const MIN_CORRELATION = 0.2;
export const MIN_MARGIN = 0.005;
export const HIGH_CONFIDENCE_MARGIN = 0.03;

export type MatchOptions = {
  minCorrelation?: number;
  minMargin?: number;
};

export type MatchResult = {
  template: CareTemplate;
  correlation: number;
  /** 1位と2位の相関差。これが信頼度の本体 */
  margin: number;
};

/**
 * 最近傍テンプレート。判定できないときは丸めずに null を返す。
 * 「一番近い記号」は「その記号である」ではない。
 */
export function bestMatch(
  vector: Float64Array,
  templates: CareTemplate[],
  opts: MatchOptions = {},
): MatchResult | null {
  const minCorrelation = opts.minCorrelation ?? MIN_CORRELATION;
  const minMargin = opts.minMargin ?? MIN_MARGIN;
  const hit = bestMatchRaw(vector, templates);
  if (hit === null) return null;
  if (hit.correlation < minCorrelation || hit.margin < minMargin) return null;
  return hit;
}

/**
 * 足切りをしない最近傍。**候補どうしを比べる**ために使う。
 *
 * ぼかしの有無や傾きを変えた複数の候補から1つを選ぶとき、足切りを掛けた
 * `bestMatch` を使うと「捨てられた候補」と「相関の低い候補」の区別がつかない。
 * 選ぶ段では素の相関で比べ、足切りは選び終わってから1回だけ掛ける。
 */
export function bestMatchRaw(
  vector: Float64Array,
  templates: CareTemplate[],
): MatchResult | null {
  let best: CareTemplate | null = null;
  let bestCorr = -2;
  const corrs: number[] = [];
  for (const t of templates) {
    let acc = 0;
    const v = t.vector;
    for (let i = 0; i < vector.length; i++) acc += vector[i] * v[i];
    corrs.push(acc);
    if (acc > bestCorr) {
      bestCorr = acc;
      best = t;
    }
  }
  if (best === null) return null;
  // 2位は「**別の記号の**中での最高」を採る。同じ記号の別変種が2位に来ても
  // それは迷いではないので、マージンを削ってはいけない。
  let secondCorr = -2;
  for (let i = 0; i < templates.length; i++) {
    if (templates[i].code === best.code) continue;
    if (corrs[i] > secondCorr) secondCorr = corrs[i];
  }
  const margin = bestCorr - secondCorr;
  return { template: best, correlation: bestCorr, margin };
}

// ---------------------------------------------------------------------------
// テンプレートの読み込み
// ---------------------------------------------------------------------------

export type TemplateBundle = {
  canonWidth: number;
  canonHeight: number;
  templates: {
    code: string;
    base: string;
    bars: number;
    dots: number;
    /** base64、canonWidth*canonHeight バイト */
    patch: string;
  }[];
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** React Native には atob が無い環境があるので自前で持つ。 */
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

/**
 * 線の太さを変えた変種を何段作るか。
 *
 * 実写の相関が 0.3〜0.6 までしか出ず、合成の 0.7〜0.9 に届かない。
 * 形が違うのではなく、**印字の線の太さ**がこちらの描画と違うのが主因。
 * 布のインクは滲んで太る。テンプレートのパッチを膨張・収縮させれば太さ違いを作れる。
 *
 * 実測（実写63記号、一致数）: [0]=33 [-1,0]=33 [-1,0,1]=32 [-2,-1,0,1]=32
 * [-1,0,1,2]=36 [-2,0,2]=36 [-3,0,3]=36 [-4,-2,0,2,4]=36。
 * **+2 段の膨張が入っているかどうかで決まる**（実物のほうが太い）。
 *
 * 追記（2026-08-21、実写91記号の固定矩形で基本形の正解率を測り直した）:
 *   [0]=84.6%  [-2,0,2]=87.9%  [-3,-1,1,3]=90.1%
 *   [-4,-2,0,2,4]=91.2%  [-2,0,2,4]=91.2%  [-1,0,1,2,3,4]=91.2%
 * **+4 まで入れると 3.3 ポイント上がり、そこから先は平ら**。
 * 平らな部分でいちばん軽い [-2,0,2,4] を採る。
 */
export const STROKE_VARIANTS = [-2, 0, 2, 4];

/** 3x3 の膨張／収縮を steps 回。正で太く、負で細く。 */
function morph(patch: Uint8Array, steps: number): Uint8Array {
  if (steps === 0) return patch;
  const grow = steps > 0;
  let cur = patch;
  for (let s = 0; s < Math.abs(steps); s++) {
    const out = new Uint8Array(cur.length);
    for (let y = 0; y < CANON_H; y++) {
      for (let x = 0; x < CANON_W; x++) {
        let hit = grow ? 0 : 1;
        for (let dy = -1; dy <= 1 && hit === (grow ? 0 : 1); dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = Math.min(Math.max(y + dy, 0), CANON_H - 1);
            const xx = Math.min(Math.max(x + dx, 0), CANON_W - 1);
            const on = cur[yy * CANON_W + xx] > 127;
            if (grow ? on : !on) {
              hit = grow ? 1 : 0;
              break;
            }
          }
        }
        out[y * CANON_W + x] = hit ? 255 : 0;
      }
    }
    cur = out;
  }
  return cur;
}

function toVector(raw: Uint8Array): Float64Array {
  const n = raw.length;
  const v = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += raw[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    v[i] = raw[i] - mean;
    sq += v[i] * v[i];
  }
  const norm = Math.max(Math.sqrt(sq), 1e-6);
  for (let i = 0; i < n; i++) v[i] /= norm;
  return v;
}

/**
 * tools/export_templates.py が書き出した JSON を読む。
 * Python 側と同じパッチを使うことが、測定値をそのまま引き継ぐ条件。
 */
export function loadTemplates(bundle: TemplateBundle): CareTemplate[] {
  if (bundle.canonWidth !== CANON_W || bundle.canonHeight !== CANON_H) {
    throw new Error("template patch size does not match CANON");
  }
  const n = CANON_W * CANON_H;
  const out: CareTemplate[] = [];
  for (const item of bundle.templates) {
    const raw = decodeBase64(item.patch);
    if (raw.length !== n) throw new Error(`bad patch for ${item.code}`);
    for (const steps of STROKE_VARIANTS) {
      out.push({
        code: item.code,
        base: item.base,
        bars: item.bars,
        dots: item.dots,
        vector: toVector(morph(raw, steps)),
      });
    }
  }
  return out;
}
