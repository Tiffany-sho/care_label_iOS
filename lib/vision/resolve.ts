/**
 * Stage 4: 読み取った属性を、実在する41記号へ射影する。
 *
 * 大原則:
 *   **「最も近い実在の記号」へ丸めない。** 丸めた瞬間に、根拠のない断定が混入する。
 *   決まらないものは null（unknown）にして、人に選ばせる。
 *
 * テンプレートマッチングの結果と、古典CVで数えた下線・点が食い違ったときは
 * **数えた方を優先する**。実測（tools/TEMPLATE_MATCH.md / RESOLUTION.md）で
 * カウンタの方が精度が高く、かつ過大予測を出さないため。
 */

import { SYMBOL_BY_CODE, SYMBOLS, type CareSymbolDef } from "../symbols";
import { HIGH_CONFIDENCE_MARGIN } from "./match";
import type { SymbolReading } from "./reader";

export type Resolved = {
  /** 確定できなければ null */
  code: string | null;
  /** high = そのまま採用してよい / low = 人の確認が要る */
  confidence: "high" | "low";
  /** 表示用の説明 */
  note: string;
};

function glyphBars(def: CareSymbolDef): number {
  const g = def.glyph;
  return "bars" in g ? g.bars : 0;
}

function glyphDots(def: CareSymbolDef): number {
  const g = def.glyph;
  return "dots" in g ? g.dots : 0;
}

/**
 * 「基本形と、下線・点以外の中身」が同じで、下線/点だけ違う記号を探す。
 * 温度の数字や P/F/W、禁止の×といった他の要素は一致していなければならない。
 */
function findVariant(
  base: CareSymbolDef,
  wantBars: number,
  wantDots: number,
): CareSymbolDef | null {
  const g = base.glyph;
  for (const cand of SYMBOLS) {
    const cg = cand.glyph;
    if (cg.base !== g.base) continue;
    if (glyphBars(cand) !== wantBars) continue;
    if (glyphDots(cand) !== wantDots) continue;
    const forbiddenA = "forbidden" in g && Boolean(g.forbidden);
    const forbiddenB = "forbidden" in cg && Boolean(cg.forbidden);
    if (forbiddenA !== forbiddenB) continue;
    if (g.base === "tub" && cg.base === "tub") {
      if ((g.temp ?? null) !== (cg.temp ?? null)) continue;
      if (Boolean(g.hand) !== Boolean(cg.hand)) continue;
    }
    if (g.base === "circle" && cg.base === "circle") {
      if ((g.letter ?? null) !== (cg.letter ?? null)) continue;
    }
    return cand;
  }
  return null;
}

export function resolveReading(reading: SymbolReading): Resolved {
  if (reading.code === null) {
    return {
      code: null,
      confidence: "low",
      note: "記号を特定できませんでした。手で選んでください。",
    };
  }
  const matched = SYMBOL_BY_CODE[reading.code];
  if (matched === undefined) {
    return { code: null, confidence: "low", note: "未知の記号番号です。" };
  }

  const wantBars = reading.bars ?? glyphBars(matched);
  const wantDots = reading.dots ?? glyphDots(matched);

  if (wantBars === glyphBars(matched) && wantDots === glyphDots(matched)) {
    // 下線・点の実測が分類結果と矛盾しない。
    // それでも「読み取り結果は答えではなく下書き」なので、確認は促す。
    const unresolvedBars =
      reading.bars === null && ["tub", "circle"].includes(matched.glyph.base);
    if (unresolvedBars) {
      return {
        code: matched.code,
        confidence: "low",
        note: `解像度が足りず下線の有無を判定できていません（1記号 ${reading.glyphPixels}px）。弱い洗濯の指定を見落としている可能性があります。`,
      };
    }
    // マージンが小さい＝2位のテンプレートと僅差。実測ではこの帯の誤り率が跳ね上がる。
    const thin = (reading.margin ?? 0) < HIGH_CONFIDENCE_MARGIN;
    return {
      code: matched.code,
      confidence: thin ? "low" : "high",
      note: thin
        ? "似た記号との差が小さく、取り違えている可能性があります。確認してください。"
        : "",
    };
  }

  // 食い違った。カウンタを信じて、実在する記号を探し直す。
  const variant = findVariant(matched, wantBars, wantDots);
  if (variant === null) {
    return {
      code: null,
      confidence: "low",
      note: "読み取った特徴に一致する記号が存在しません。近い記号へ丸めずに未確定にしました。",
    };
  }
  return {
    code: variant.code,
    confidence: "low",
    note: `形の分類は ${matched.name} でしたが、下線・点の実測に合わせて ${variant.name} としました。確認してください。`,
  };
}
