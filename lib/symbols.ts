/**
 * JIS L 0001（2016-12-01 施行 / ISO 3758 準拠）の取扱い表示記号 41 種。
 *
 * 設計上の大原則:
 *   1. 記号は「上限」または「可否」を示すのであって「推奨値」ではない。
 *      例:「40」は "40℃で洗え" ではなく "40℃まで" の意味。文言は必ずこの語彙で書く。
 *   2. 記号が付いていないカテゴリは「情報なし」であって「何をしてもよい」ではない。
 *      規則エンジンは未指定カテゴリについて推測した指示を作らない。
 */

export type CategoryId =
  | "wash"
  | "bleach"
  | "tumble"
  | "natural"
  | "iron"
  | "dryclean"
  | "wetclean";

export type Category = {
  id: CategoryId;
  /** ピッカーのタブ名 */
  tab: string;
  /** 基本記号の形 */
  shape: string;
};

export const CATEGORIES: Category[] = [
  { id: "wash", tab: "洗濯", shape: "洗濯桶" },
  { id: "bleach", tab: "漂白", shape: "三角形" },
  { id: "tumble", tab: "タンブル乾燥", shape: "四角の中に円" },
  { id: "natural", tab: "自然乾燥", shape: "四角" },
  { id: "iron", tab: "アイロン", shape: "アイロン" },
  { id: "dryclean", tab: "ドライ", shape: "円の中に P / F" },
  { id: "wetclean", tab: "ウェット", shape: "円の中に W" },
];

/** 図形の描き方（CareSymbol が読む） */
export type Glyph =
  | { base: "tub"; temp?: number; hand?: boolean; bars: 0 | 1 | 2; forbidden?: boolean }
  | { base: "triangle"; slashes?: boolean; forbidden?: boolean }
  | { base: "tumble"; dots: 0 | 1 | 2; forbidden?: boolean }
  | { base: "natural"; dir: "v" | "h"; lines: 1 | 2; shade: boolean }
  | { base: "iron"; dots: 0 | 1 | 2 | 3; noSteam?: boolean; forbidden?: boolean }
  | { base: "circle"; letter?: "P" | "F" | "W"; bars: 0 | 1 | 2; forbidden?: boolean };

/** 規則エンジンが読む構造化属性（カテゴリごとに形が違う判別可能ユニオン） */
export type Facts =
  | { k: "wash"; allowed: false }
  | {
      k: "wash";
      allowed: true;
      maxTempC: number;
      /** normal=通常 / mild=弱い / veryMild=非常に弱い / hand=手洗い */
      action: "normal" | "mild" | "veryMild" | "hand";
    }
  | { k: "bleach"; chlorine: boolean; oxygen: boolean }
  | { k: "tumble"; allowed: false }
  | { k: "tumble"; allowed: true; maxExhaustC: number }
  | { k: "natural"; dir: "hang" | "flat"; wet: boolean; shade: boolean }
  | { k: "iron"; allowed: false }
  | { k: "iron"; allowed: true; maxSoleC: number; steam: boolean }
  | { k: "dryclean"; allowed: false }
  | {
      k: "dryclean";
      allowed: true;
      solvent: "pce+petroleum" | "petroleum";
      action: "normal" | "mild";
    }
  | { k: "wetclean"; allowed: false }
  | { k: "wetclean"; allowed: true; action: "normal" | "mild" | "veryMild" };

export type CareSymbolDef = {
  /** JIS L 0001 の記号番号 */
  code: string;
  /**
   * 記号番号が確認できていないもの。令和6年8月改正で増えた記号のうち、
   * 公式リーフレットには載っているが番号を確認できていないものに立てる。
   * UI では番号を出さない。
   */
  numberUnverified?: boolean;
  category: CategoryId;
  /** ピッカーに出す短いラベル */
  name: string;
  /** JIS が定める意味（言い換えずにそのまま提示する） */
  meaning: string;
  glyph: Glyph;
  facts: Facts;
};

export const SYMBOLS: CareSymbolDef[] = [
  // ── 洗濯（家庭洗濯） 14 種 ───────────────────────────────
  {
    code: "190", category: "wash", name: "95℃ 通常",
    meaning: "液温は95℃を限度とし、洗濯機で洗濯ができる",
    glyph: { base: "tub", temp: 95, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 95, action: "normal" },
  },
  {
    code: "180", category: "wash", name: "70℃ 通常",
    meaning: "液温は70℃を限度とし、洗濯機で洗濯ができる",
    glyph: { base: "tub", temp: 70, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 70, action: "normal" },
  },
  {
    code: "170", category: "wash", name: "60℃ 通常",
    meaning: "液温は60℃を限度とし、洗濯機で洗濯ができる",
    glyph: { base: "tub", temp: 60, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 60, action: "normal" },
  },
  {
    code: "171", category: "wash", name: "60℃ 弱い洗濯",
    meaning: "液温は60℃を限度とし、洗濯機で弱い洗濯ができる",
    glyph: { base: "tub", temp: 60, bars: 1 },
    facts: { k: "wash", allowed: true, maxTempC: 60, action: "mild" },
  },
  {
    code: "160", category: "wash", name: "50℃ 通常",
    meaning: "液温は50℃を限度とし、洗濯機で洗濯ができる",
    glyph: { base: "tub", temp: 50, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 50, action: "normal" },
  },
  {
    code: "161", category: "wash", name: "50℃ 弱い洗濯",
    meaning: "液温は50℃を限度とし、洗濯機で弱い洗濯ができる",
    glyph: { base: "tub", temp: 50, bars: 1 },
    facts: { k: "wash", allowed: true, maxTempC: 50, action: "mild" },
  },
  {
    code: "150", category: "wash", name: "40℃ 通常",
    meaning: "液温は40℃を限度とし、洗濯機で洗濯ができる",
    glyph: { base: "tub", temp: 40, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 40, action: "normal" },
  },
  {
    code: "151", category: "wash", name: "40℃ 弱い洗濯",
    meaning: "液温は40℃を限度とし、洗濯機で弱い洗濯ができる",
    glyph: { base: "tub", temp: 40, bars: 1 },
    facts: { k: "wash", allowed: true, maxTempC: 40, action: "mild" },
  },
  {
    code: "152", category: "wash", name: "40℃ 非常に弱い洗濯",
    meaning: "液温は40℃を限度とし、洗濯機で非常に弱い洗濯ができる",
    glyph: { base: "tub", temp: 40, bars: 2 },
    facts: { k: "wash", allowed: true, maxTempC: 40, action: "veryMild" },
  },
  {
    code: "140", category: "wash", name: "30℃ 通常",
    meaning: "液温は30℃を限度とし、洗濯機で洗濯ができる",
    glyph: { base: "tub", temp: 30, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 30, action: "normal" },
  },
  {
    code: "141", category: "wash", name: "30℃ 弱い洗濯",
    meaning: "液温は30℃を限度とし、洗濯機で弱い洗濯ができる",
    glyph: { base: "tub", temp: 30, bars: 1 },
    facts: { k: "wash", allowed: true, maxTempC: 30, action: "mild" },
  },
  {
    code: "142", category: "wash", name: "30℃ 非常に弱い洗濯",
    meaning: "液温は30℃を限度とし、洗濯機で非常に弱い洗濯ができる",
    glyph: { base: "tub", temp: 30, bars: 2 },
    facts: { k: "wash", allowed: true, maxTempC: 30, action: "veryMild" },
  },
  {
    code: "110", category: "wash", name: "手洗い 40℃",
    meaning: "液温は40℃を限度とし、手洗いができる",
    glyph: { base: "tub", hand: true, bars: 0 },
    facts: { k: "wash", allowed: true, maxTempC: 40, action: "hand" },
  },
  {
    // 上と同じくリーフレットに載っているが、JIS の記号番号は未確認。
    code: "111", numberUnverified: true,
    category: "wash", name: "手洗い 30℃",
    meaning: "液温は30℃を限度とし、手洗いができる",
    // 公式リーフレットでは、40℃手洗いとの違いは数字ではなく下線1本。
    glyph: { base: "tub", hand: true, bars: 1 },
    facts: { k: "wash", allowed: true, maxTempC: 30, action: "hand" },
  },
  {
    code: "100", category: "wash", name: "家庭洗濯禁止",
    meaning: "家庭での洗濯禁止",
    glyph: { base: "tub", bars: 0, forbidden: true },
    facts: { k: "wash", allowed: false },
  },

  // ── 漂白 3 種 ─────────────────────────────────────────
  {
    code: "220", category: "bleach", name: "塩素系・酸素系 可",
    meaning: "塩素系及び酸素系の漂白剤を使用して漂白ができる",
    glyph: { base: "triangle" },
    facts: { k: "bleach", chlorine: true, oxygen: true },
  },
  {
    code: "210", category: "bleach", name: "酸素系のみ 可",
    meaning: "酸素系漂白剤の使用はできるが、塩素系漂白剤は使用禁止",
    glyph: { base: "triangle", slashes: true },
    facts: { k: "bleach", chlorine: false, oxygen: true },
  },
  {
    code: "200", category: "bleach", name: "漂白禁止",
    meaning: "漂白処理はできない",
    glyph: { base: "triangle", forbidden: true },
    facts: { k: "bleach", chlorine: false, oxygen: false },
  },

  // ── タンブル乾燥 3 種 ──────────────────────────────────
  {
    code: "320", category: "tumble", name: "高温 80℃まで",
    meaning: "排気温度の上限は80℃とし、タンブル乾燥ができる",
    glyph: { base: "tumble", dots: 2 },
    facts: { k: "tumble", allowed: true, maxExhaustC: 80 },
  },
  {
    code: "310", category: "tumble", name: "低温 60℃まで",
    meaning: "排気温度の上限は60℃とし、低い温度でのタンブル乾燥ができる",
    glyph: { base: "tumble", dots: 1 },
    facts: { k: "tumble", allowed: true, maxExhaustC: 60 },
  },
  {
    code: "300", category: "tumble", name: "タンブル乾燥禁止",
    meaning: "タンブル乾燥禁止",
    glyph: { base: "tumble", dots: 0, forbidden: true },
    facts: { k: "tumble", allowed: false },
  },

  // ── 自然乾燥 8 種 ─────────────────────────────────────
  {
    code: "440", category: "natural", name: "つり干し",
    meaning: "つり干しがよい",
    glyph: { base: "natural", dir: "v", lines: 1, shade: false },
    facts: { k: "natural", dir: "hang", wet: false, shade: false },
  },
  {
    code: "445", category: "natural", name: "日陰のつり干し",
    meaning: "日陰でのつり干しがよい",
    glyph: { base: "natural", dir: "v", lines: 1, shade: true },
    facts: { k: "natural", dir: "hang", wet: false, shade: true },
  },
  {
    code: "430", category: "natural", name: "ぬれつり干し",
    meaning: "ぬれつり干しがよい",
    glyph: { base: "natural", dir: "v", lines: 2, shade: false },
    facts: { k: "natural", dir: "hang", wet: true, shade: false },
  },
  {
    code: "435", category: "natural", name: "日陰のぬれつり干し",
    meaning: "日陰でのぬれつり干しがよい",
    glyph: { base: "natural", dir: "v", lines: 2, shade: true },
    facts: { k: "natural", dir: "hang", wet: true, shade: true },
  },
  {
    code: "420", category: "natural", name: "平干し",
    meaning: "平干しがよい",
    glyph: { base: "natural", dir: "h", lines: 1, shade: false },
    facts: { k: "natural", dir: "flat", wet: false, shade: false },
  },
  {
    code: "425", category: "natural", name: "日陰の平干し",
    meaning: "日陰での平干しがよい",
    glyph: { base: "natural", dir: "h", lines: 1, shade: true },
    facts: { k: "natural", dir: "flat", wet: false, shade: true },
  },
  {
    code: "410", category: "natural", name: "ぬれ平干し",
    meaning: "ぬれ平干しがよい",
    glyph: { base: "natural", dir: "h", lines: 2, shade: false },
    facts: { k: "natural", dir: "flat", wet: true, shade: false },
  },
  {
    code: "415", category: "natural", name: "日陰のぬれ平干し",
    meaning: "日陰でのぬれ平干しがよい",
    glyph: { base: "natural", dir: "h", lines: 2, shade: true },
    facts: { k: "natural", dir: "flat", wet: true, shade: true },
  },

  // ── アイロン 4 種 ─────────────────────────────────────
  {
    code: "530", category: "iron", name: "高温 210℃まで",
    meaning: "底面温度210℃を限度としてアイロン仕上げができる",
    glyph: { base: "iron", dots: 3 },
    facts: { k: "iron", allowed: true, maxSoleC: 210, steam: true },
  },
  {
    code: "520", category: "iron", name: "中温 160℃まで",
    meaning: "底面温度160℃を限度としてアイロン仕上げができる",
    glyph: { base: "iron", dots: 2 },
    facts: { k: "iron", allowed: true, maxSoleC: 160, steam: true },
  },
  {
    code: "510", category: "iron", name: "低温 120℃まで",
    meaning: "底面温度120℃を限度としてアイロン仕上げができる",
    glyph: { base: "iron", dots: 1 },
    facts: { k: "iron", allowed: true, maxSoleC: 120, steam: true },
  },
  {
    // 令和6年8月改正のリーフレットでは、低温120℃と「スチームなし」が
    // 別の記号として並んでいる。JIS の記号番号は未確認なので暫定。
    code: "515", numberUnverified: true,
    category: "iron", name: "低温 120℃ スチームなし",
    meaning: "底面温度120℃を限度としてアイロン仕上げができる。スチームは使用できない",
    glyph: { base: "iron", dots: 1, noSteam: true },
    facts: { k: "iron", allowed: true, maxSoleC: 120, steam: false },
  },
  {
    code: "500", category: "iron", name: "アイロン禁止",
    meaning: "アイロン仕上げ禁止",
    glyph: { base: "iron", dots: 0, forbidden: true },
    facts: { k: "iron", allowed: false },
  },

  // ── ドライクリーニング 5 種 ────────────────────────────
  {
    code: "620", category: "dryclean", name: "パーク・石油系 通常",
    meaning: "パークロロエチレン及び石油系溶剤によるドライクリーニングができる",
    glyph: { base: "circle", letter: "P", bars: 0 },
    facts: { k: "dryclean", allowed: true, solvent: "pce+petroleum", action: "normal" },
  },
  {
    code: "621", category: "dryclean", name: "パーク・石油系 弱い操作",
    meaning: "パークロロエチレン及び石油系溶剤による弱いドライクリーニングができる",
    glyph: { base: "circle", letter: "P", bars: 1 },
    facts: { k: "dryclean", allowed: true, solvent: "pce+petroleum", action: "mild" },
  },
  {
    code: "610", category: "dryclean", name: "石油系 通常",
    meaning: "石油系溶剤によるドライクリーニングができる",
    glyph: { base: "circle", letter: "F", bars: 0 },
    facts: { k: "dryclean", allowed: true, solvent: "petroleum", action: "normal" },
  },
  {
    code: "611", category: "dryclean", name: "石油系 弱い操作",
    meaning: "石油系溶剤による弱いドライクリーニングができる",
    glyph: { base: "circle", letter: "F", bars: 1 },
    facts: { k: "dryclean", allowed: true, solvent: "petroleum", action: "mild" },
  },
  {
    code: "600", category: "dryclean", name: "ドライ禁止",
    meaning: "ドライクリーニング禁止",
    glyph: { base: "circle", bars: 0, forbidden: true },
    facts: { k: "dryclean", allowed: false },
  },

  // ── ウェットクリーニング 4 種 ──────────────────────────
  {
    code: "710", category: "wetclean", name: "ウェット 通常",
    meaning: "ウェットクリーニングができる",
    glyph: { base: "circle", letter: "W", bars: 0 },
    facts: { k: "wetclean", allowed: true, action: "normal" },
  },
  {
    code: "711", category: "wetclean", name: "ウェット 弱い操作",
    meaning: "弱い操作によるウェットクリーニングができる",
    glyph: { base: "circle", letter: "W", bars: 1 },
    facts: { k: "wetclean", allowed: true, action: "mild" },
  },
  {
    code: "712", category: "wetclean", name: "ウェット 非常に弱い操作",
    meaning: "非常に弱い操作によるウェットクリーニングができる",
    glyph: { base: "circle", letter: "W", bars: 2 },
    facts: { k: "wetclean", allowed: true, action: "veryMild" },
  },
  {
    code: "700", category: "wetclean", name: "ウェット禁止",
    meaning: "ウェットクリーニング禁止",
    glyph: { base: "circle", letter: "W", bars: 0, forbidden: true },
    facts: { k: "wetclean", allowed: false },
  },
];

export const SYMBOL_BY_CODE: Record<string, CareSymbolDef> = Object.fromEntries(
  SYMBOLS.map((s) => [s.code, s]),
);

export function symbolsOf(category: CategoryId): CareSymbolDef[] {
  return SYMBOLS.filter((s) => s.category === category);
}
