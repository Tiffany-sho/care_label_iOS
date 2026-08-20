/**
 * Stage 1: タグの写真から記号を1個ずつ切り出す。
 *
 * 経緯（消さないこと）:
 *   最初の実装は「連結成分を x 方向の重なりでまとめる」だけだった。
 *   白地に記号だけを並べた合成画像では 100% 切り出せたが、**実機では6個中2〜3個**
 *   しか取れず、確定は0個だった。原因は評価データが実物を代表していなかったこと。
 *   実物の洗濯タグは「綿100%」「ブランド名」「注意書き」といった文字で埋まっていて、
 *   記号はタグ上のインクの少数派でしかない。文字を入れた合成データ
 *   （tools/synth_label.py）で再現したところ、切り出し成功率は 10〜60% に落ちた。
 *
 * そこで、記号列が持つ制約を明示的に使う:
 *   1. 記号はほぼ正方形（外接矩形の縦横比が 0.6〜2.2）
 *   2. 記号どうしは高さがそろっていて、横一列に並ぶ
 *   3. その行は、タグの中で**最も背の高い**行である（文字はもっと小さい）
 *   4. 1記号は複数の連結成分に割れる（輪郭・下線・点・内側の円）ので、
 *      行を決めたあとに x 方向の重なりでまとめ直す
 *
 * それでも「タグ一面の大きなロゴ」のような、記号より背の高い図形には弱い。
 * 実写での評価はまだ足りていない。
 */

import { binarize, type GrayImage } from "./binarize";
import { compHeight, compWidth, labelComponents, type Comp } from "./components";

export type SymbolBox = { x0: number; y0: number; x1: number; y1: number };

export type SegmentOptions = {
  /** これ未満の面積比の成分はノイズとして捨てる */
  minAreaRatio?: number;
  /** 画像のこの割合以上を占める成分は、タグの枠とみなして捨てる */
  frameRatio?: number;
  /** 同じ記号とみなす x 方向の重なり（小さい方の幅に対する比） */
  mergeOverlap?: number;
  /** 記号の下、下線を拾うために見る範囲（記号の高さに対する比） */
  bandBelow?: number;
  /** 切り出しの高さの上限（記号の高さに対する比） */
  maxHeightRatio?: number;
  /** 行の上端からのずれの許容量（記号の高さに対する比）。null で無効 */
  topAlign?: number | null;
  /** 記号の輪郭の下、どこまでを同じ記号の一部として取り込むか（高さに対する比） */
  belowOutline?: number;
};

/** 切り出しの内訳。アプリの診断表示と、失敗の切り分けに使う */
export type SegmentDebug = {
  /** ノイズと枠を除いた成分の数 */
  components: number;
  /** 記号の輪郭になりうると判断した成分の数 */
  candidates: number;
  /** 採用した行の成分数 */
  rowMembers: number;
  /** 採用した行の代表的な記号の高さ（px） */
  rowHeight: number;
  boxes: SymbolBox[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 画像から矩形を切り出す。pad は元画像の範囲でクランプされる。 */
export function cropGray(img: GrayImage, box: SymbolBox, pad = 2): GrayImage {
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(img.width - 1, box.x1 + pad);
  const y1 = Math.min(img.height - 1, box.y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = (y0 + y) * img.width + x0;
    data.set(img.data.subarray(src, src + w), y * w);
  }
  return { data, width: w, height: h };
}

type Cluster = SymbolBox & {
  hasOutline: boolean;
  /** 最初に取り込んだ輪郭の縦位置。周りの文字を吸い込まないための基準 */
  outlineY0: number;
  outlineY1: number;
};

function overlapX(a: SymbolBox, b: SymbolBox): number {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
}

/** y中心が近いものを1行にまとめる。行の代表高さは中央値。 */
function groupIntoRows(candidates: Comp[]): Comp[][] {
  const rows: Comp[][] = [];
  const sorted = [...candidates].sort(
    (a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2,
  );
  for (const c of sorted) {
    const cy = (c.y0 + c.y1) / 2;
    const h = compHeight(c);
    let placed = false;
    for (const row of rows) {
      const rowCy =
        row.reduce((acc, r) => acc + (r.y0 + r.y1) / 2, 0) / row.length;
      const rowH = median(row.map(compHeight));
      if (Math.abs(cy - rowCy) <= 0.6 * Math.max(h, rowH)) {
        row.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([c]);
  }
  return rows;
}

export function segmentSymbolsDebug(
  img: GrayImage,
  opts: SegmentOptions = {},
): SegmentDebug {
  const minAreaRatio = opts.minAreaRatio ?? 0.00003;
  const frameRatio = opts.frameRatio ?? 0.85;
  const mergeOverlap = opts.mergeOverlap ?? 0.35;

  const { width: w, height: h } = img;
  const mask = binarize(img);
  const { comps } = labelComponents(mask, w, h);

  const minArea = Math.max(6, minAreaRatio * w * h);
  const kept: Comp[] = [];
  for (const c of comps.values()) {
    if (c.area < minArea) continue;
    // タグの外枠や画像全体をなぞる成分
    if (compWidth(c) > frameRatio * w && compHeight(c) > frameRatio * h) continue;
    // 罫線・縫い目のような極端に細長い成分
    const aspect = compWidth(c) / Math.max(1, compHeight(c));
    if (aspect > 6 || aspect < 1 / 6) continue;
    kept.push(c);
  }
  const empty: SegmentDebug = {
    components: kept.length,
    candidates: 0,
    rowMembers: 0,
    rowHeight: 0,
    boxes: [],
  };
  if (kept.length === 0) return empty;

  // 記号の輪郭になりうる成分。文字より大きく、ほぼ正方形。
  let maxH = 0;
  for (const c of kept) maxH = Math.max(maxH, compHeight(c));
  const candidates = kept.filter((c) => {
    if (compHeight(c) < 0.45 * maxH) return false;
    const aspect = compWidth(c) / Math.max(1, compHeight(c));
    return aspect >= 0.6 && aspect <= 2.2;
  });
  if (candidates.length === 0) return { ...empty, candidates: 0 };

  // 記号列は、そのタグで最も背の高い「行」。文字はこれより小さい。
  const rows = groupIntoRows(candidates);
  let best: Comp[] | null = null;
  let bestH = -1;
  for (const row of rows) {
    const rowH = median(row.map(compHeight));
    // 単独の成分だけの行は、ロゴや大きな文字であることが多い。
    // 同じ高さのものが2つ以上並んでいることを、記号列の条件にする。
    const score = row.length >= 2 ? rowH : rowH * 0.5;
    if (score > bestH) {
      bestH = score;
      best = row;
    }
  }
  if (best === null) return { ...empty, candidates: candidates.length };

  const medianH = median(best.map(compHeight));
  if (medianH <= 0) return { ...empty, candidates: candidates.length };
  const rowY0 = Math.min(...best.map((c) => c.y0));
  const rowY1 = Math.max(...best.map((c) => c.y1));
  // 下側は下線を拾うために広げるが、広げすぎると下の行の文字を吸い込む。
  // 0.45 は tools/sweep_segment.cjs の実測で選んだ値。
  const bandTop = rowY0 - 0.2 * medianH;
  const bandBottom = rowY1 + (opts.bandBelow ?? 0.45) * medianH;

  const inBand = kept.filter((c) => {
    const cy = (c.y0 + c.y1) / 2;
    return cy >= bandTop && cy <= bandBottom;
  });
  const rowSet = new Set(best.map((c) => c.root));

  // x 方向の重なりでまとめ直す（輪郭・下線・点・内側の円を1記号に戻す）。
  //
  // 取り込む側は「ほぼ完全に内側にある」ことを要求する。単に重なっているだけを
  // 条件にすると、記号の横にある文字を吸い込んでクラスタが太り、
  // 最後のサイズ判定でその記号ごと捨てられる（実際にこれで1個落ちていた）。
  //
  // 「輪郭どうしはまとめない」は試して外した。タンブル乾燥の内側の円は
  // 四角とほぼ同じ大きさで輪郭候補に入ってしまうため、その規則を入れると
  // 四角と円が別クラスタに割れて、かえって全体が壊れる。
  //
  // 縦の判定は「行全体の帯」ではなく「そのクラスタの輪郭からの距離」で行う。
  // 帯で見ると、行の中で一番下に来た記号に合わせて全記号の帯が下に伸び、
  // 記号の真下にある文字を吸い込む。実際に切り出しが記号の高さの1.6倍になり、
  // 照合が壊れていた。
  const belowOutline = opts.belowOutline ?? 0.3;
  const sorted = [...inBand].sort((a, b) => a.x0 - b.x0);
  const clusters: Cluster[] = [];
  for (const c of sorted) {
    const box: SymbolBox = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 };
    const isOutline = rowSet.has(c.root);
    let merged = false;
    for (const cl of clusters) {
      const ov = overlapX(box, cl);
      if (ov <= 0) continue;
      const contained = ov >= Math.max(mergeOverlap, 0.6) * compWidth(c);
      if (!contained) continue;
      if (!isOutline && cl.hasOutline) {
        if (c.y0 > cl.outlineY1 + belowOutline * medianH) continue;
        if (c.y1 < cl.outlineY0 - 0.15 * medianH) continue;
      }
      cl.x0 = Math.min(cl.x0, box.x0);
      cl.x1 = Math.max(cl.x1, box.x1);
      cl.y0 = Math.min(cl.y0, box.y0);
      cl.y1 = Math.max(cl.y1, box.y1);
      if (isOutline && !cl.hasOutline) {
        cl.outlineY0 = box.y0;
        cl.outlineY1 = box.y1;
      }
      cl.hasOutline = cl.hasOutline || isOutline;
      merged = true;
      break;
    }
    if (!merged) {
      clusters.push({
        ...box,
        hasOutline: isOutline,
        outlineY0: box.y0,
        outlineY1: box.y1,
      });
    }
  }

  const boxes = clusters
    .filter((cl) => {
      if (!cl.hasOutline) return false;
      const cw = cl.x1 - cl.x0 + 1;
      const ch = cl.y1 - cl.y0 + 1;
      // 下線2本まで含めても、記号の高さの 1.35 倍を超えることはない。
      // ここを緩めると文字を含んだ切り出しが通ってしまう。
      // しきい値は tools/sweep_segment.cjs の実測で決めた。
      // viewBox の比率から 1.5 で足りるはずと机上で決めたら、文字入り・文字なしの
      // 両方で大きく悪化した。劣化と回転のあとでは比率が素直に効かない。
      // クラスタごとの縦判定を入れたあとは、この値は 1.6〜2.4 のどこでも
      // 結果が同じ（しきい値ではなく規則の方が効いている）。
      if (ch < 0.5 * medianH || ch > (opts.maxHeightRatio ?? 2.0) * medianH)
        return false;
      if (cw < 0.35 * medianH || cw > 2.0 * medianH) return false;
      const topAlign = opts.topAlign === undefined ? null : opts.topAlign;
      if (topAlign !== null && Math.abs(cl.y0 - rowY0) > topAlign * medianH)
        return false;
      return true;
    })
    .sort((a, b) => a.x0 - b.x0)
    .map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));

  return {
    components: kept.length,
    candidates: candidates.length,
    rowMembers: best.length,
    rowHeight: Math.round(medianH),
    boxes,
  };
}

export function segmentSymbols(
  img: GrayImage,
  opts: SegmentOptions = {},
): SymbolBox[] {
  return segmentSymbolsDebug(img, opts).boxes;
}
