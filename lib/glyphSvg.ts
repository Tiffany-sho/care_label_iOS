/**
 * 取扱い表示記号の「図形そのもの」の定義。
 *
 * React にも Node のデータ生成ツールにも依存しないプレーンな記述にしてある。
 * 描画するのは components/CareSymbol.tsx、SVG 文字列に落とすのは tools/render.mjs。
 * パスを2箇所に書くと必ずズレるので、幾何はここだけに置く。
 *
 * 座標系は全記号共通で viewBox="0 0 100 112"。
 *   - 基本形は y=10..86 に収める
 *   - 「弱い操作」を示す下線は y=95 / y=107（2本のとき視認できる間隔を確保）
 *
 * NOTE: 形状は JIS の記号の近似。「日陰」の斜線の向き・本数と「手洗い」の手の形は
 *       公開前に公式の記号一覧との照合が必要。
 */

import type { Glyph } from "./symbols";

export const VIEW_W = 100;
export const VIEW_H = 112;
/** 標準の線幅 */
export const STROKE_WIDTH = 5;

export type SvgNode =
  | { tag: "path"; d: string; sw?: number; filled?: boolean }
  | {
      tag: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      sw?: number;
    }
  | {
      tag: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      sw?: number;
      filled?: boolean;
    }
  | { tag: "circle"; cx: number; cy: number; r: number; sw?: number; filled?: boolean }
  | { tag: "text"; x: number; y: number; value: string; size: number };

function bars(n: 0 | 1 | 2): SvgNode[] {
  if (n === 0) return [];
  const out: SvgNode[] = [{ tag: "line", x1: 20, y1: 95, x2: 80, y2: 95 }];
  if (n === 2) out.push({ tag: "line", x1: 20, y1: 107, x2: 80, y2: 107 });
  return out;
}

function cross(): SvgNode[] {
  return [
    { tag: "line", x1: 14, y1: 12, x2: 86, y2: 84, sw: 6 },
    { tag: "line", x1: 86, y1: 12, x2: 14, y2: 84, sw: 6 },
  ];
}

function dots(n: 0 | 1 | 2 | 3, cy: number): SvgNode[] {
  const xs = n === 1 ? [50] : n === 2 ? [40, 60] : n === 3 ? [33, 50, 67] : [];
  return xs.map((x) => ({ tag: "circle", cx: x, cy, r: 4.5, filled: true }));
}

/** 桶に差し入れた手。指4本（上）＋手のひら＋親指（左） */
function hand(): SvgNode[] {
  return [
    { tag: "rect", x: 34, y: 40, width: 7, height: 26, rx: 3.5, filled: true },
    { tag: "rect", x: 43, y: 34, width: 7, height: 32, rx: 3.5, filled: true },
    { tag: "rect", x: 52, y: 36, width: 7, height: 30, rx: 3.5, filled: true },
    { tag: "rect", x: 61, y: 42, width: 7, height: 24, rx: 3.5, filled: true },
    { tag: "rect", x: 32, y: 58, width: 38, height: 20, rx: 8, filled: true },
    { tag: "line", x1: 34, y1: 62, x2: 23, y2: 70, sw: 10 },
  ];
}

export function glyphNodes(glyph: Glyph): SvgNode[] {
  switch (glyph.base) {
    case "tub": {
      const out: SvgNode[] = [
        // 桶の外形（上端は水面の波線で閉じる）
        { tag: "path", d: "M6 18 L16 78 Q17 86 25 86 L75 86 Q83 86 84 78 L94 18" },
        { tag: "path", d: "M6 18 Q20 5 34 18 T62 18 T90 18 L94 18" },
      ];
      if (glyph.temp !== undefined) {
        out.push({ tag: "text", x: 50, y: 56, value: String(glyph.temp), size: 30 });
      }
      if (glyph.hand) out.push(...hand());
      out.push(...bars(glyph.bars));
      if (glyph.forbidden) out.push(...cross());
      return out;
    }

    case "triangle": {
      const out: SvgNode[] = [{ tag: "path", d: "M50 10 L92 86 L8 86 Z" }];
      // 酸素系のみ: 右辺と平行な2本の斜線
      if (glyph.slashes) {
        out.push(
          { tag: "line", x1: 34, y1: 74, x2: 50, y2: 45 },
          { tag: "line", x1: 49, y1: 74, x2: 65, y2: 45 },
        );
      }
      if (glyph.forbidden) out.push(...cross());
      return out;
    }

    case "tumble": {
      const out: SvgNode[] = [
        { tag: "rect", x: 12, y: 10, width: 76, height: 76, rx: 2 },
        { tag: "circle", cx: 50, cy: 48, r: 24 },
        ...dots(glyph.dots, 48),
      ];
      if (glyph.forbidden) out.push(...cross());
      return out;
    }

    case "natural": {
      const out: SvgNode[] = [
        { tag: "rect", x: 12, y: 10, width: 76, height: 76, rx: 2 },
      ];
      if (glyph.dir === "v") {
        if (glyph.lines === 1) {
          out.push({ tag: "line", x1: 50, y1: 22, x2: 50, y2: 74 });
        } else {
          out.push(
            { tag: "line", x1: 43, y1: 22, x2: 43, y2: 74 },
            { tag: "line", x1: 57, y1: 22, x2: 57, y2: 74 },
          );
        }
      } else if (glyph.lines === 1) {
        out.push({ tag: "line", x1: 26, y1: 48, x2: 74, y2: 48 });
      } else {
        out.push(
          { tag: "line", x1: 26, y1: 42, x2: 74, y2: 42 },
          { tag: "line", x1: 26, y1: 58, x2: 74, y2: 58 },
        );
      }
      // 日陰: 左上隅の斜線。干し線に接触しない長さに留める
      if (glyph.shade) out.push({ tag: "line", x1: 13, y1: 11, x2: 32, y2: 30 });
      return out;
    }

    case "iron": {
      const out: SvgNode[] = [
        {
          tag: "path",
          d: "M2 84 L98 84 L98 62 Q98 55 91 54 L67 54 Q65 22 50 22 Q35 22 33 54 L25 54 Q17 55 13 62 Z",
        },
        ...dots(glyph.dots, 70),
      ];
      if (glyph.forbidden) out.push(...cross());
      return out;
    }

    case "circle": {
      const out: SvgNode[] = [{ tag: "circle", cx: 50, cy: 48, r: 38 }];
      if (glyph.letter) {
        out.push({ tag: "text", x: 50, y: 50, value: glyph.letter, size: 40 });
      }
      out.push(...bars(glyph.bars));
      if (glyph.forbidden) out.push(...cross());
      return out;
    }
  }
}
