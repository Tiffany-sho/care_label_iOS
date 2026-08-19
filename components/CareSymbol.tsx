/**
 * 取扱い表示記号の SVG レンダラ。
 *
 * 41 種を個別の SVG ファイルで持たず、
 *   基本形（桶・三角・四角・円・アイロン）＋ 付加要素（数字・点・線・斜線・×）
 * の合成として描く。JIS の記号体系そのものが合成的なので、これが素直。
 *
 * 座標系は全記号共通で viewBox="0 0 100 112"。
 *   - 基本形は y=10..86 に収める
 *   - 「弱い操作」を示す下線は y=95 / y=107（2本のとき視認できる間隔を確保）
 *
 * NOTE: 形状は JIS の記号を近似したもの。特に「日陰」の斜線の向きと
 *       「手洗い」の手の形は、公開前に公式の記号一覧との照合が必要。
 */

import type { Glyph } from "@/lib/symbols";

const SW = 5; // 標準の線幅

function Bars({ n }: { n: 0 | 1 | 2 }) {
  if (n === 0) return null;
  return (
    <>
      <line x1="20" y1="95" x2="80" y2="95" />
      {n === 2 && <line x1="20" y1="107" x2="80" y2="107" />}
    </>
  );
}

function Cross() {
  return (
    <>
      <line x1="14" y1="12" x2="86" y2="84" strokeWidth="6" />
      <line x1="86" y1="12" x2="14" y2="84" strokeWidth="6" />
    </>
  );
}

function Dots({ n, cy }: { n: 0 | 1 | 2 | 3; cy: number }) {
  const xs = n === 1 ? [50] : n === 2 ? [40, 60] : n === 3 ? [33, 50, 67] : [];
  return (
    <>
      {xs.map((x) => (
        <circle key={x} cx={x} cy={cy} r="4.5" fill="currentColor" stroke="none" />
      ))}
    </>
  );
}

function Hand() {
  // 桶に差し入れた手。指4本（上）＋手のひら＋親指（左）。
  return (
    <g fill="currentColor" stroke="none">
      <rect x="34" y="40" width="7" height="26" rx="3.5" />
      <rect x="43" y="34" width="7" height="32" rx="3.5" />
      <rect x="52" y="36" width="7" height="30" rx="3.5" />
      <rect x="61" y="42" width="7" height="24" rx="3.5" />
      <rect x="32" y="58" width="38" height="20" rx="8" />
      <line
        x1="34"
        y1="62"
        x2="23"
        y2="70"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </g>
  );
}

function Body({ glyph }: { glyph: Glyph }) {
  switch (glyph.base) {
    case "tub":
      return (
        <>
          {/* 桶の外形（上端は水面の波線で閉じる） */}
          <path d="M6 18 L16 78 Q17 86 25 86 L75 86 Q83 86 84 78 L94 18" />
          <path d="M6 18 Q20 5 34 18 T62 18 T90 18 L94 18" />
          {glyph.temp !== undefined && (
            <text
              x="50"
              y="56"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="30"
              fontWeight="700"
              fill="currentColor"
              stroke="none"
            >
              {glyph.temp}
            </text>
          )}
          {glyph.hand && <Hand />}
          <Bars n={glyph.bars} />
          {glyph.forbidden && <Cross />}
        </>
      );

    case "triangle":
      return (
        <>
          <path d="M50 10 L92 86 L8 86 Z" />
          {/* 酸素系のみ: 右辺と平行な2本の斜線 */}
          {glyph.slashes && (
            <>
              <line x1="34" y1="74" x2="50" y2="45" />
              <line x1="49" y1="74" x2="65" y2="45" />
            </>
          )}
          {glyph.forbidden && <Cross />}
        </>
      );

    case "tumble":
      return (
        <>
          <rect x="12" y="10" width="76" height="76" rx="2" />
          <circle cx="50" cy="48" r="24" />
          <Dots n={glyph.dots} cy={48} />
          {glyph.forbidden && <Cross />}
        </>
      );

    case "natural":
      return (
        <>
          <rect x="12" y="10" width="76" height="76" rx="2" />
          {glyph.dir === "v" ? (
            glyph.lines === 1 ? (
              <line x1="50" y1="22" x2="50" y2="74" />
            ) : (
              <>
                <line x1="43" y1="22" x2="43" y2="74" />
                <line x1="57" y1="22" x2="57" y2="74" />
              </>
            )
          ) : glyph.lines === 1 ? (
            <line x1="26" y1="48" x2="74" y2="48" />
          ) : (
            <>
              <line x1="26" y1="42" x2="74" y2="42" />
              <line x1="26" y1="58" x2="74" y2="58" />
            </>
          )}
          {/* 日陰: 左上隅の斜線。干し線に接触しない長さに留める */}
          {glyph.shade && <line x1="13" y1="11" x2="32" y2="30" />}
        </>
      );

    case "iron":
      return (
        <>
          <path d="M2 84 L98 84 L98 62 Q98 55 91 54 L67 54 Q65 22 50 22 Q35 22 33 54 L25 54 Q17 55 13 62 Z" />
          <Dots n={glyph.dots} cy={70} />
          {glyph.forbidden && <Cross />}
        </>
      );

    case "circle":
      return (
        <>
          <circle cx="50" cy="48" r="38" />
          {glyph.letter && (
            <text
              x="50"
              y="50"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="40"
              fontWeight="700"
              fill="currentColor"
              stroke="none"
            >
              {glyph.letter}
            </text>
          )}
          <Bars n={glyph.bars} />
          {glyph.forbidden && <Cross />}
        </>
      );
  }
}

export default function CareSymbol({
  glyph,
  size = 56,
  title,
}: {
  glyph: Glyph;
  size?: number;
  title?: string;
}) {
  // title を渡さない場合は、隣に必ずテキストラベルがある前提の装飾として扱う。
  return (
    <svg
      viewBox="0 0 100 112"
      width={size}
      height={(size * 112) / 100}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      <Body glyph={glyph} />
    </svg>
  );
}
