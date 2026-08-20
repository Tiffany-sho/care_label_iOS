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
 * 形状は公式リーフレット（経済産業省・消費者庁「衣類の取扱表示」令和6年8月改正）と
 * 照合済み。一致度は tools/OFFICIAL_MATCH.md、測り方は tools/compare_official.py。
 * 座標を触ったら必ず測り直すこと。見た目の印象で調整すると悪化する（実際にした）。
 *
 * まだ一致度が低いもの: タンブル乾燥NG 0.34 / 手洗い 0.43 /
 * ドライNG 0.41 / ウェットNG 0.38 / 30℃弱い洗濯 0.38
 */

import type { Glyph } from "./symbols";

export const VIEW_W = 100;
export const VIEW_H = 112;
/** 標準の線幅 */
export const STROKE_WIDTH = 7;

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

/**
 * 禁止を表す×。大きさは基本形ごとに違うので座標を渡す。
 *
 * 値は tools/compare_official.py の一致度で選んだもの。
 * 「公式では外形より外にはみ出している」と見て広げたら、アイロンNGが
 * 0.75 -> 0.31、漂白NGが 0.68 -> 0.46 と軒並み悪化した。見た目の印象より
 * 数値を優先すること。
 */
function cross(x0: number, y0: number, x1: number, y1: number): SvgNode[] {
  return [
    { tag: "line", x1: x0, y1: y0, x2: x1, y2: y1 },
    { tag: "line", x1: x1, y1: y0, x2: x0, y2: y1 },
  ];
}

function dots(n: 0 | 1 | 2 | 3, cy: number, center = 50): SvgNode[] {
  const d = 12;
  const xs =
    n === 1
      ? [center]
      : n === 2
        ? [center - d / 2, center + d / 2]
        : n === 3
          ? [center - d, center, center + d]
          : [];
  return xs.map((x) => ({ tag: "circle", cx: x, cy, r: 4.5, filled: true }));
}

/**
 * 桶に差し入れた手。公式は塗りつぶしではなく、指が分かれた輪郭線。
 * 以前は黒い塊で描いていて、公式との一致度が 0.37 しかなかった。
 */
function hand(): SvgNode[] {
  return [
    // 指4本（下向き）。太さ7・間隔7で描いていたので隣どうしがくっつき、
    // 黒い塊になっていた（公式は指の間が空いて見える）。細くして間隔を空ける。
    // 指4本。桶の中に垂れ下がる。
    { tag: "line", x1: 49, y1: 46, x2: 49, y2: 78, sw: 4 },
    { tag: "line", x1: 54, y1: 44, x2: 54, y2: 80, sw: 4 },
    { tag: "line", x1: 59, y1: 44, x2: 59, y2: 80, sw: 4 },
    { tag: "line", x1: 64, y1: 46, x2: 64, y2: 76, sw: 4 },
    // 手の輪郭。公式の手は**細長く、手首が桶の縁の上まで伸びる**。
    // 幅を広げると手ではなく袋に見え、上を開けると毛が生えて見える。
    // 上へ向かってすぼまる2本の曲線で手首を作る。
    { tag: "path", d: "M46 78 Q42 60 44 42 Q46 18 52 6", sw: 4 },
    { tag: "path", d: "M60 6 Q66 18 66 42 Q65 58 64 70", sw: 4 },
    // 親指（左に張り出して下を向く）
    { tag: "path", d: "M44 46 Q36 46 35 56 Q34 65 41 66", sw: 4 },
  ];
}

export function glyphNodes(glyph: Glyph): SvgNode[] {
  switch (glyph.base) {
    case "tub": {
      const out: SvgNode[] = [
        // 桶の外形。公式は**浅くて広い**（インクの縦横比 1.50、こちらは 1.17 だった）。
        // 波も大きな二山ではなく、小さい波が4つ並ぶ。
        { tag: "path", d: "M4 26 L15 79 Q16 85 23 85 L77 85 Q84 85 85 79 L96 26" },
        { tag: "path", d: "M4 26 Q15 18 26 26 T48 26 T70 26 T92 26 L96 26" },
      ];
      if (glyph.temp !== undefined) {
        out.push({ tag: "text", x: 50, y: 58, value: String(glyph.temp), size: 30 });
      }
      if (glyph.hand) out.push(...hand());
      out.push(...bars(glyph.bars));
      if (glyph.forbidden) out.push(...cross(8, 26, 92, 85));
      return out;
    }

    case "triangle": {
      const out: SvgNode[] = [{ tag: "path", d: "M50 10 L92 86 L8 86 Z" }];
      // 酸素系のみ: 右辺と平行な2本の斜線
      // 酸素系のみ: 右辺と平行な2本の斜線。
      // 太くする・長くする・位置を下げる、をそれぞれ試したが公式との一致度は
      // 0.58 -> 0.47〜0.51 と全部下がった。この形のまま置く。
      if (glyph.slashes) {
        out.push(
          { tag: "line", x1: 34, y1: 74, x2: 50, y2: 45 },
          { tag: "line", x1: 49, y1: 74, x2: 65, y2: 45 },
        );
      }
      if (glyph.forbidden) out.push(...cross(3, 12, 97, 86));
      return out;
    }

    case "tumble": {
      const out: SvgNode[] = [
        { tag: "rect", x: 16, y: 14, width: 68, height: 68, rx: 2 },
        // 公式の円は四角の内側いっぱい（直径が四角の約8割）。
        // 以前は直径が6割しかなく、一致度が 0.24〜0.27 だった。
        { tag: "circle", cx: 50, cy: 48, r: 28 },
        ...dots(glyph.dots, 48),
      ];
      // 禁止の×は**四角より横に長い**。公式のインクの縦横比は 1.289 で、
      // 四角に収めていたこちらは 1.000 だった。一致度 0.35 の主因。
      if (glyph.forbidden) out.push(...cross(6, 14, 94, 82));
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
      // 日陰: 左上の斜線。**右上から左下**（"/" の向き）。
      // 公式リーフレットを実測して確定した。以前は左上から右下（"\\"）に
      // 引いていて向きが逆だった。上端の 47% あたりから左辺の 38% あたりへ。
      if (glyph.shade) out.push({ tag: "line", x1: 47, y1: 13, x2: 14, y2: 39 });
      return out;
    }

    case "iron": {
      // 公式（経産省・消費者庁リーフレット 令和6年8月改正）の形を実測して置き直した。
      // 閉じた図形ではなく、左上が開いた1本の折れ線:
      //   取っ手の上辺 → 右へ → 右下がりの斜辺 → 底辺を左へ → 左の斜辺を上へ →
      //   内側の水平線を右へ
      // 以前は「丘に取っ手」の形にしていて、公式との一致度が 0.29〜0.40 しかなかった。
      const out: SvgNode[] = [
        { tag: "path", d: "M24 22 L82 22 L97 82 L3 82 L20 52 L89 52" },
        ...dots(glyph.dots, 68, 43),
      ];
      // 「スチームなし」は、アイロンの下に×を付けた蒸気の印が並ぶ。
      // NOTE: 形は公式リーフレットの見た目からの近似で、照合できていない。
      if (glyph.noSteam) {
        out.push(
          { tag: "line", x1: 38, y1: 88, x2: 38, y2: 98, sw: 5 },
          { tag: "line", x1: 50, y1: 88, x2: 50, y2: 100, sw: 5 },
          { tag: "line", x1: 62, y1: 88, x2: 62, y2: 98, sw: 5 },
          { tag: "line", x1: 32, y1: 88, x2: 68, y2: 106, sw: 5 },
          { tag: "line", x1: 68, y1: 88, x2: 32, y2: 106, sw: 5 },
        );
      }
      if (glyph.forbidden) out.push(...cross(3, 22, 97, 82));
      return out;
    }

    case "circle": {
      const out: SvgNode[] = [{ tag: "circle", cx: 50, cy: 48, r: 38 }];
      if (glyph.letter) {
        out.push({ tag: "text", x: 50, y: 50, value: glyph.letter, size: 50 });
      }
      out.push(...bars(glyph.bars));
      if (glyph.forbidden) out.push(...cross(5, 10, 95, 86));
      return out;
    }
  }
}
