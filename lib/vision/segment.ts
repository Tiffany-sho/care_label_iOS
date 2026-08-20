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

import { binarize, type GrayImage, type Mask } from "./binarize";
import { compHeight, compWidth, labelComponents, type Comp } from "./components";
import { fitAngleDeg } from "./rotate";

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
  /** 最も背の高い行に対して、何割の高さまでを記号列とみなすか */
  rowHeightRatio?: number;
  /** 記号列として採る段の上限 */
  maxRows?: number;
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
  /** 記号列として採用した段の数 */
  rows: number;
  /** 記号列の傾き（度）。正でおおむね右下がり */
  angleDeg: number;
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
      // 縦位置が近いだけでなく、高さもそろっていることを要求する。
      // そろっていないと、行の中に文字や大きな塊が混ざって中央値が壊れる。
      const similar = Math.max(h, rowH) <= 1.7 * Math.min(h, rowH);
      if (similar && Math.abs(cy - rowCy) <= 0.6 * Math.max(h, rowH)) {
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
    // 罫線・縫い目のような成分は捨てたいが、**下線を巻き添えにしないこと**。
    // 「弱い洗濯」の下線は細長い（幅60・高さ5程度＝縦横比12）ので、
    // 縦横比だけで切ると下線がまるごと消える。実写でこれが起き、
    // 142 -> 140、151 -> 110 のように下線が読めなくなっていた。
    // 画像を横断するほど長いものだけを罫線として捨てる。
    const aspect = compWidth(c) / Math.max(1, compHeight(c));
    const spansImage = compWidth(c) > 0.55 * w || compHeight(c) > 0.55 * h;
    if (spansImage && (aspect > 8 || aspect < 1 / 8)) continue;
    kept.push(c);
  }
  const empty: SegmentDebug = {
    components: kept.length,
    candidates: 0,
    rowMembers: 0,
    rowHeight: 0,
    rows: 0,
    angleDeg: 0,
    boxes: [],
  };
  if (kept.length === 0) return empty;

  // 記号の輪郭になりうる成分。ほぼ正方形で、画像に対して大きすぎないもの。
  //
  // 以前は「一番背の高い成分の45%以上」を条件にしていた。これは実写で壊れる。
  // 服の影のような巨大な塊が1つ混じるだけで基準が跳ね上がり、記号がすべて
  // 候補から外れて検出0になった（test_9, test_10 が実際にそうだった）。
  // 高さの絶対基準は使わず、形と大きさの上限だけで絞って、あとは行の作り方で決める。
  // 高さの上限を画像の 0.6 倍にしていたが、これは**利用者が記号列にぴったり
  // 枠を合わせたとき**に壊れる。記号だけを切り出した細長い帯では記号の高さが
  // 画像高さの 8〜9 割になり、候補が全滅して検出0になった（実測: test_1,
  // test_10 が 0/6）。枠の引き方は利用者次第なので、高さでは絞らない。
  // 幅なら根拠がある。記号は必ず横に2個以上並ぶので、画像幅の半分を
  // 超える成分は記号ではない。
  const candidates = kept.filter((c) => {
    const ch = compHeight(c);
    const cw = compWidth(c);
    if (cw > 0.5 * w || ch > 0.95 * h) return false;
    const aspect = cw / Math.max(1, ch);
    return aspect >= 0.6 && aspect <= 2.2;
  });
  if (candidates.length === 0) return { ...empty, candidates: 0 };

  // 記号列は、そのタグで最も背の高い「行」。文字はこれより小さい。
  //
  // **段は1つとは限らない**。実写10枚のうち5枚が2段組で、1段しか見ないと
  // 検出が 3/7 や 1/6 まで落ちていた。最も背の高い行と同じくらいの高さの行は
  // すべて記号列として扱う。
  const rows = groupIntoRows(candidates);
  const scored = rows.map((row) => ({
    row,
    h: median(row.map(compHeight)),
    // 単独の成分だけの行はロゴや大きな文字であることが多い
    score: row.length >= 2 ? median(row.map(compHeight)) : median(row.map(compHeight)) * 0.5,
  }));
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { ...empty, candidates: candidates.length };

  // 同じタグなら、段が違っても記号の大きさはそろう。
  // 「一番背の高い行と同じくらいの高さの行」だけを記号列として採る。
  // 単に「◯割以上の高さ」にすると、文字の行が紛れ込む（実写で26個検出した）。
  const topH = scored[0].h;
  const lo = (opts.rowHeightRatio ?? 0.78) * topH;
  const hi = topH / (opts.rowHeightRatio ?? 0.78);
  const selected = scored
    .filter((r) => r.h >= lo && r.h <= hi && r.row.length >= 2)
    .slice(0, opts.maxRows ?? 3);
  if (selected.length === 0) selected.push(scored[0]);

  // 段を上から順に、その中は左から順に。
  //
  // ここを boxes 全体に対する y -> x の並べ替えにしてはいけない。
  // 同じ段でも桶と四角では上端の高さが違うので、y で先に並べると
  // 段の中の左右が入れ替わる（合成データで正解率が 90% -> 40% に落ちた）。
  const byRow = [...selected].sort(
    (a, b) =>
      Math.min(...a.row.map((c) => c.y0)) - Math.min(...b.row.map((c) => c.y0)),
  );
  const boxes: SymbolBox[] = [];
  let rowMembers = 0;
  const rowHeights: number[] = [];
  for (const sel of byRow) {
    rowMembers += sel.row.length;
    rowHeights.push(sel.h);
    boxes.push(...splitWideBoxes(mask, w, h, boxesForRow(sel.row, kept, opts)));
  }

  // 一番要素の多い段の中心を通る直線から傾きを出す
  const widest = [...selected].sort((a, b) => b.row.length - a.row.length)[0];
  const angleDeg = fitAngleDeg(
    widest.row.map((c) => ({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 })),
  );

  return {
    components: kept.length,
    candidates: candidates.length,
    rowMembers,
    rowHeight: Math.round(median(rowHeights)),
    rows: selected.length,
    angleDeg,
    boxes,
  };
}

/**
 * 横に長すぎる切り出しを分ける。
 *
 * 印字が太いタグでは、隣り合う記号が二値化の時点でつながって1つの成分になる。
 * 実写 test_15 は5記号が3つの箱にまとまり、うち1つは画像の高さの1.5倍の幅が
 * あった。記号はどれもほぼ正方形なので、幅が段の記号の高さより明らかに広い箱は
 * 中に複数入っていると見てよい。
 *
 * 分ける位置は、箱の中の列ごとのインク量がいちばん少ないところ。
 * 完全にくっついていて谷が無いときは等分に落とす（何もしないよりましなので）。
 */
export function splitWideBoxes(
  mask: Mask,
  w: number,
  h: number,
  boxes: SymbolBox[],
): SymbolBox[] {
  if (boxes.length === 0) return boxes;
  const mh = median(boxes.map((b) => b.y1 - b.y0 + 1));
  if (mh <= 0) return boxes;

  const out: SymbolBox[] = [];
  for (const b of boxes) {
    const bw = b.x1 - b.x0 + 1;
    const parts = Math.round(bw / mh);
    if (parts < 2 || bw < 1.5 * mh) {
      out.push(b);
      continue;
    }
    // 列ごとのインク量
    const prof = new Float64Array(bw);
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (mask[y * w + x]) prof[x - b.x0]++;
      }
    }
    const cuts: number[] = [];
    const step = bw / parts;
    for (let k = 1; k < parts; k++) {
      const center = Math.round(k * step);
      // 等分点のまわり ±0.25 記号ぶんだけ見て、いちばんインクの薄い列を選ぶ
      const span = Math.max(2, Math.round(0.25 * mh));
      let bestX = center;
      let bestV = Infinity;
      for (let x = center - span; x <= center + span; x++) {
        if (x <= 0 || x >= bw - 1) continue;
        if (prof[x] < bestV) {
          bestV = prof[x];
          bestX = x;
        }
      }
      cuts.push(bestX);
    }
    let start = 0;
    for (const cut of [...cuts, bw]) {
      const x0 = b.x0 + start;
      const x1 = b.x0 + Math.min(cut, bw - 1);
      if (x1 <= x0) continue;
      // 切ったあとの上下は、その範囲のインクに合わせて詰め直す
      let y0 = b.y1;
      let y1 = b.y0;
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (mask[y * w + x]) {
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            break;
          }
        }
      }
      if (y1 >= y0) out.push({ x0, y0, x1, y1 });
      start = cut + 1;
    }
  }
  return out;
}

/** 1つの行について、輪郭・下線・点をまとめ直して記号の矩形を作る */
function boxesForRow(
  best: Comp[],
  kept: Comp[],
  opts: SegmentOptions,
): SymbolBox[] {
  const mergeOverlap = opts.mergeOverlap ?? 0.35;
  const medianH = median(best.map(compHeight));
  if (medianH <= 0) return [];
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

  return clusters
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
}

export function segmentSymbols(
  img: GrayImage,
  opts: SegmentOptions = {},
): SymbolBox[] {
  return segmentSymbolsDebug(img, opts).boxes;
}
