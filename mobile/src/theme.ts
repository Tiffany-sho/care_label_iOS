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
} as const;

export const LEVEL_LABEL = {
  ok: "そのまま可",
  caution: "条件つき",
  forbidden: "不可",
  unknown: "情報なし",
} as const;

export const LEVEL_COLORS = {
  ok: { bg: T.okWeak, fg: T.ok },
  caution: { bg: T.warnWeak, fg: T.warn },
  forbidden: { bg: T.dangerWeak, fg: T.danger },
  unknown: { bg: T.surface3, fg: T.muted },
} as const;
