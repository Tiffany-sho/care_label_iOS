/**
 * 1記号ぶんの読み取り（パイプラインの Stage 2）。
 *
 * 実測から来ている約束。変えると安全性が壊れるので、変えるなら再測定すること。
 *  1. 1記号110px未満のとき bars に 0 を返さない（null＝unknown を返す）。
 *     誤りは100%が過小方向で、それは「弱い洗濯指定を通常洗濯だと言う」という
 *     最も危険な誤り方向に一致する（tools/RESOLUTION.md）。
 *  2. 相関が閾値未満なら最近傍テンプレートに丸めない。
 *  3. countDots は基本形が tumble/iron のときだけ呼ぶ。
 */

import { binarize, type GrayImage } from "./binarize";
import { labelComponents } from "./components";
import { BAR_BASES, countBars, countDots, DOT_BASES } from "./features";
import { bestMatch, normalise, type CareTemplate } from "./match";

/**
 * 実測に基づく下限（tools/RESOLUTION.md）。
 * 100pxで下線100%、90pxで97.8%、80pxで94.2%、60pxで74.3%（ベースライン56.5%）。
 * 余裕を見て110pxを採用する。
 */
export const MIN_GLYPH_PX_FOR_BARS = 110;

export type SymbolReading = {
  /** その基本形が下線を持ちえない、または解像度が足りないときは null。0 と混同しない */
  bars: number | null;
  /** その基本形が点を持ちえないときは null */
  dots: number | null;
  code: string | null;
  base: string | null;
  correlation: number | null;
  /** 1位と2位のテンプレート相関の差。信頼度の本体（lib/vision/match.ts 参照） */
  margin: number | null;
  /** 1記号の長辺のピクセル数。撮影ガイドの判定にも使う */
  glyphPixels: number;
};

export function readSymbol(
  img: GrayImage,
  templates: CareTemplate[],
): SymbolReading {
  const mask = binarize(img);
  const labelled = labelComponents(mask, img.width, img.height);
  const glyphPixels = Math.max(img.width, img.height);

  const reading: SymbolReading = {
    bars: null,
    dots: null,
    code: null,
    base: null,
    correlation: null,
    margin: null,
    glyphPixels,
  };

  // 先に基本形を決める。カウンタは基本形で意味が変わるので、
  // 基本形が分からないうちに数えてはいけない。
  const v = normalise(mask, img.width, img.height);
  if (v === null) return reading;
  const hit = bestMatch(v, templates);
  if (hit === null) return reading;

  reading.code = hit.template.code;
  reading.base = hit.template.base;
  reading.correlation = hit.correlation;
  reading.margin = hit.margin;

  if (DOT_BASES.has(hit.template.base)) {
    reading.dots = countDots(labelled);
  }
  if (BAR_BASES.has(hit.template.base)) {
    const bars = countBars(mask, labelled, img.width, img.height);
    if (bars > 0 || glyphPixels >= MIN_GLYPH_PX_FOR_BARS) {
      reading.bars = bars;
    }
  }
  return reading;
}

/**
 * 検証用: 基本形を外から与えて、カウンタだけを回す。
 * Python 参照実装（features_from_gray）と同じ条件で突き合わせるために使う。
 */
export function countOnly(img: GrayImage): { bars: number; dots: number } {
  const mask = binarize(img);
  const labelled = labelComponents(mask, img.width, img.height);
  return {
    bars: countBars(mask, labelled, img.width, img.height),
    dots: countDots(labelled),
  };
}
