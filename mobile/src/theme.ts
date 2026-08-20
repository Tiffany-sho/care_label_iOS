/** Web 版（app/globals.css）と同じ暖色のライトテーマ。 */
export const T = {
  bg: "#faf9f5",
  surface: "#ffffff",
  surface2: "#f4f2ea",
  surface3: "#ece9df",

  ink: "#2b2a26",
  ink2: "#4a4843",
  muted: "#6b6a62",

  accent: "#d97757",
  accentWeak: "rgba(217,119,87,0.14)",

  border: "#e7e4d8",
  borderStrong: "#dbd7c8",

  ok: "#1a7f37",
  okWeak: "rgba(26,127,55,0.12)",
  warn: "#9a6700",
  warnWeak: "rgba(154,103,0,0.14)",
  danger: "#cf222e",
  dangerWeak: "rgba(207,34,46,0.12)",

  radius: 12,
  /** カード・ボタンの角。モックに合わせて大きめ */
  radiusLg: 16,
} as const;

/**
 * タブの右上に出す小さい点の色。
 * タブで隠れている分類の状態（条件つき／できない／表示なし）を、
 * 切り替えなくても一目で分かるようにするためのもの。
 * 「条件つき」は T.warn（#9a6700）だと点が小さすぎて沈むので、明るい黄を使う。
 */
export const DOT_COLORS = {
  ok: T.ok,
  caution: "#e6b422",
  forbidden: T.danger,
  unknown: "#b9b4a6",
} as const;

/** 本文の文字サイズ。主担当者向けに、既定より一段大きくしている */
export const TYPE = {
  title: 24,
  h1: 20,
  h2: 17,
  body: 14,
  bodyLead: 13.5,
  small: 12.5,
  tiny: 11,
} as const;

/**
 * バッジの言葉。専門用語ではなく、家庭で使う言い方にそろえる。
 * 「情報なし」は「タグに表示なし」と書く。何が無いのかを言わないと、
 * アプリの不具合と読まれる。
 */
export const LEVEL_LABEL = {
  ok: "できます",
  caution: "条件つき",
  forbidden: "できない",
  unknown: "タグに表示なし",
} as const;

export const LEVEL_COLORS = {
  ok: { bg: T.okWeak, fg: T.ok },
  caution: { bg: T.warnWeak, fg: T.warn },
  forbidden: { bg: T.dangerWeak, fg: T.danger },
  unknown: { bg: T.surface3, fg: T.muted },
} as const;
