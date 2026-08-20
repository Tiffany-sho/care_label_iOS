/**
 * 記号の集合 → 「まずこれだけ」の要約。
 *
 * buildPlan（lib/plan.ts）が出すのは分類ごとの完全な説明で、読むのに時間がかかる。
 * 洗濯機の前に立っている人がまず知りたいのは
 *   「何度まで・どのコースか」「使えないものは何か」「干し方」「アイロン」
 * の4つだけなので、そこだけを取り出す。
 *
 * 文言の規約は lib/plan.ts と同じ。温度は必ず「〜まで」。
 * 記号が無い分類は missing に入れて「情報がない」と言う。「制限なし」にはしない。
 */

import type { Selection } from "./plan";
import {
  CATEGORIES,
  SYMBOL_BY_CODE,
  type CareSymbolDef,
  type CategoryId,
} from "./symbols";

/** 洗い方の強さ。数が小さいほど弱い（＝制約が厳しい）*/
export const WASH_ACTION_ORDER = {
  hand: 0,
  veryMild: 1,
  mild: 2,
  normal: 3,
} as const;

export const WASH_ACTION_LABEL = {
  normal: "ふつうのコース",
  mild: "弱いコース",
  veryMild: "非常に弱いコース",
  hand: "手洗いだけ",
} as const;

/** マイクローゼットの一覧に出す短い言い方（カードの幅に収まる長さ） */
const WASH_ACTION_SHORT = {
  normal: "ふつう",
  mild: "弱いコース",
  veryMild: "非常に弱く",
  hand: "手洗いだけ",
} as const;

export type HighlightRow = {
  key: "natural" | "iron";
  label: string;
  value: string;
};

export type Highlight = {
  /** いちばん上に出す1行 */
  headline: string;
  /** 使えないもの（漂白剤・乾燥機・アイロン） */
  forbidden: string[];
  /** 干し方とアイロン */
  rows: HighlightRow[];
  /** 記号が無かった分類 */
  missing: CategoryId[];
  /** 一覧のカードに出す1行 */
  short: string;
  /** 家庭で洗えない服（一覧で写真の上に出す印） */
  homeWashBlocked: boolean;
  /** 記号が1つも選ばれていない */
  empty: boolean;
};

function pick(sel: Selection, cat: CategoryId): CareSymbolDef | undefined {
  const code = sel[cat];
  return code ? SYMBOL_BY_CODE[code] : undefined;
}

export function categoryLabel(cat: CategoryId): string {
  return CATEGORIES.find((c) => c.id === cat)?.tab ?? cat;
}

/** 「日陰でつり干し」のような短い言い方 */
export function naturalText(def: CareSymbolDef | undefined): string | null {
  if (!def || def.facts.k !== "natural") return null;
  const f = def.facts;
  const shade = f.shade ? "日陰で" : "";
  const wet = f.wet ? "ぬれたまま" : "";
  const dir = f.dir === "flat" ? "平干し" : "つり干し";
  return `${shade}${wet}${dir}`;
}

/** 「低温 120℃まで」のような短い言い方 */
export function ironText(def: CareSymbolDef | undefined): string | null {
  if (!def || def.facts.k !== "iron") return null;
  const f = def.facts;
  if (!f.allowed) return "かけられません";
  const label = f.maxSoleC >= 210 ? "高温" : f.maxSoleC >= 160 ? "中温" : "低温";
  return `${label} ${f.maxSoleC}℃まで${f.steam ? "" : "・スチームなし"}`;
}

export function buildHighlight(sel: Selection): Highlight {
  const wash = pick(sel, "wash");
  const bleach = pick(sel, "bleach");
  const tumble = pick(sel, "tumble");
  const natural = pick(sel, "natural");
  const iron = pick(sel, "iron");

  const missing = CATEGORIES.map((c) => c.id).filter((id) => !sel[id]);
  const empty = missing.length === CATEGORIES.length;

  // ── 見出し ─────────────────────────────────────
  let headline: string;
  let short: string;
  let homeWashBlocked = false;

  if (!wash || wash.facts.k !== "wash") {
    headline = "洗濯の記号がタグにありません";
    short = "洗い方はわかりません";
  } else if (!wash.facts.allowed) {
    headline = "家庭では洗えません";
    short = "クリーニング店へ";
    homeWashBlocked = true;
  } else {
    const t = wash.facts.maxTempC;
    const a = wash.facts.action;
    headline =
      a === "hand"
        ? `${t}℃まで・手洗いだけ（洗濯機は使えません）`
        : `${t}℃まで・${WASH_ACTION_LABEL[a]}で洗えます`;
    short = `${t}℃まで・${WASH_ACTION_SHORT[a]}`;
  }

  // ── 使えないもの ────────────────────────────────
  const forbidden: string[] = [];
  if (bleach && bleach.facts.k === "bleach") {
    const f = bleach.facts;
    if (!f.chlorine && !f.oxygen) forbidden.push("漂白剤");
    else if (!f.chlorine) forbidden.push("塩素系の漂白剤");
  }
  if (tumble && tumble.facts.k === "tumble" && !tumble.facts.allowed) {
    forbidden.push("乾燥機");
  }
  if (iron && iron.facts.k === "iron" && !iron.facts.allowed) {
    forbidden.push("アイロン");
  }

  // ── 干し方・アイロン ─────────────────────────────
  const rows: HighlightRow[] = [];
  const nat = naturalText(natural);
  if (nat !== null) rows.push({ key: "natural", label: "干し方は", value: nat });
  const ir = ironText(iron);
  // 「アイロン不可」は上の「使えないもの」に出しているので、ここでは繰り返さない
  if (ir !== null && ir !== "かけられません") {
    rows.push({ key: "iron", label: "アイロンは", value: ir });
  }

  return { headline, forbidden, rows, missing, short, homeWashBlocked, empty };
}

/** 「洗濯・ドライ の記号はタグにありませんでした」の一文 */
export function missingSentence(missing: CategoryId[]): string | null {
  if (missing.length === 0) return null;
  const names = missing.map(categoryLabel).join("・");
  return `${names} の記号はタグにありませんでした。「決まりがない」ではなく「わからない」です。`;
}
