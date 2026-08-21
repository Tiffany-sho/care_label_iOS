/**
 * 1記号ぶんの読み取り（パイプラインの Stage 2）。
 *
 * 実測から来ている約束。変えると安全性が壊れるので、変えるなら再測定すること。
 *  1. 1記号110px未満のとき bars に 0 を返さない（null＝unknown を返す）。
 *     誤りは100%が過小方向で、それは「弱い洗濯指定を通常洗濯だと言う」という
 *     最も危険な誤り方向に一致する（tools/RESOLUTION.md）。
 *  2. 相関が閾値未満なら最近傍テンプレートに丸めない。
 *  3. countDots は基本形が tumble/iron のときだけ呼ぶ。
 */

import { binarize, blurGray, type GrayImage } from "./binarize";
import { labelComponents } from "./components";
import { rotateGray } from "./rotate";
import { classifyInside, INSIDE_TEMPLATES } from "./inside";
import { bodyComponent, componentMask, crossScore } from "./shape";
import { SYMBOL_BY_CODE } from "../symbols";
import {
  BAR_BASES,
  countBars,
  countDots,
  DOT_BASES,
  EMPTY_INTERIOR_MAX,
  interiorInk,
} from "./features";
import {
  bestMatchRaw,
  MIN_CORRELATION,
  MIN_MARGIN,
  normalise,
  type CareTemplate,
  type MatchResult,
} from "./match";

/**
 * 実測に基づく下限（tools/RESOLUTION.md）。
 * 100pxで下線100%、90pxで97.8%、80pxで94.2%、60pxで74.3%（ベースライン56.5%）。
 * 余裕を見て110pxを採用する。
 */
export const MIN_GLYPH_PX_FOR_BARS = 110;

export type SymbolReading = {
  /** その基本形が下線を持ちえない、または解像度が足りないときは null。0 と混同しない */
  bars: number | null;
  /** その基本形が点を持ちえないときは null */
  dots: number | null;
  code: string | null;
  base: string | null;
  correlation: number | null;
  /** 1位と2位のテンプレート相関の差。信頼度の本体（lib/vision/match.ts 参照） */
  margin: number | null;
  /** 1記号の長辺のピクセル数。撮影ガイドの判定にも使う */
  glyphPixels: number;
  /**
   * JIS L 0001 の43記号に無い記号だと分かったとき true。
   * 今のところ「中身のない丸」（クリーニング店向けの表示）だけ。
   * 近い記号へ丸めず、読み飛ばす。
   */
  outOfTable: boolean;
};

/**
 * 照合の前に、記号1個ごとに試す変換の組み合わせ。
 *
 * 実写91記号を固定矩形で測って決めた（tools/exp_base3.cjs）。基本形の正解率:
 *   何もしない                             84.6%
 *   線の太さ違い [-2,0,2,4]                 91.2%
 *   ＋傾き ±6度（3度刻み）                 94.5%
 *   ＋ぼかし（短辺/18）を候補に足す        97.8%
 * ぼかしの割る数は 16/18/20 が同値（97.8%）、22 で 96.7%、25 で 95.6%、
 * 12 で 92.3%。平らな部分の中央を採る。
 *
 * 傾きはタグ全体でも補正しているが、記号は1個ずつ微妙に傾く（印字と生地のたわみ）。
 * ±10度まで広げると 93.4% に下がるので、広ければよいものではない。
 */
const READ_ANGLES = [-6, -3, 0, 3, 6];
const READ_BLUR_DIVISOR = 18;

type Candidate = {
  hit: MatchResult;
  /** 照合に使った正規化ベクトル。候補を絞って取り直すのに使う */
  vector: Float64Array;
  /** 照合に使った画像（ぼかし後・回転後） */
  angle: number;
};

export type ReadOptions = {
  /**
   * インクが背景より暗いか。**タグ全体で決めた値を渡すこと。**
   * 記号1個に切り詰めた画像では、四角い記号の輪郭が切り抜きの四辺に触れて
   * 縁がインクだらけになり、自前の判定が反転する（lib/vision/binarize.ts）。
   */
  inkDark?: boolean;
};

export function readSymbol(
  img: GrayImage,
  templates: CareTemplate[],
  opts: ReadOptions = {},
): SymbolReading {
  const glyphPixels = Math.max(img.width, img.height);
  const reading: SymbolReading = {
    bars: null,
    dots: null,
    code: null,
    base: null,
    correlation: null,
    margin: null,
    glyphPixels,
    outOfTable: false,
  };

  // 1) ぼかし × 傾き の候補から、素の相関がいちばん高いものを選ぶ。
  //    足切りは選び終わってから1回だけ掛ける（bestMatchRaw を使う理由）。
  const radius = Math.max(1, Math.round(Math.min(img.width, img.height) / READ_BLUR_DIVISOR));
  const soft = blurGray(img, radius);
  let best: Candidate | null = null;
  for (const src of [img, soft]) {
    for (const deg of READ_ANGLES) {
      const g = deg === 0 ? src : rotateGray(src, deg);
      const v = normalise(binarize(g, opts.inkDark), g.width, g.height);
      if (v === null) continue;
      const hit = bestMatchRaw(v, templates);
      if (hit === null) continue;
      if (best === null || hit.correlation > best.hit.correlation) {
        best = { hit, vector: v, angle: deg };
      }
    }
  }
  if (best === null || best.hit.correlation < MIN_CORRELATION) return reading;

  // 2) 数えるのは**ぼかしていない**画像で。ぼかすと下線や日陰の斜線が溶ける
  //    （eval/README.md に記録がある `425 -> 420`、`152 -> 150` がこれ）。
  //    傾きだけは照合で選ばれた角度に合わせる。
  const sharp = best.angle === 0 ? img : rotateGray(img, best.angle);
  const mask = binarize(sharp, opts.inkDark);
  const labelled = labelComponents(mask, sharp.width, sharp.height);
  const base = best.hit.template.base;

  // 丸の記号に当たったのに中身が空なら、それは43記号のどれでもない。
  // 実物のタグに載る「中身のない丸」（クリーニング店向け）がこれで、
  // 放っておくと 610（丸に F）などと断定してしまう。
  if (base === "circle") {
    const inside = interiorInk(mask, sharp.width, sharp.height, labelled);
    if (inside !== null && inside < EMPTY_INTERIOR_MAX) {
      reading.outOfTable = true;
      return reading;
    }
  }

  reading.base = base;

  if (DOT_BASES.has(base)) {
    reading.dots = countDots(labelled);
  }
  if (BAR_BASES.has(base)) {
    const bars = countBars(mask, labelled, sharp.width, sharp.height);
    if (bars > 0 || glyphPixels >= MIN_GLYPH_PX_FOR_BARS) {
      reading.bars = bars;
    }
  }

  // 3) 「測った属性に合う候補だけに絞ってから順位を取り直す」を、1位が
  //    足切りに掛かるときの受け皿として試したが、**測り直しで悪化した**。
  //    確定分の正解率 84.0% -> 78.8%、余計に出した 530 が3件。
  //    点の数え違い（2個を3個と数える）がそのまま答えになるため。
  //    属性の測定がテンプレートの順位より確かだと言えるまで、ここは足さない。
  //
  //    唯一の例外が**禁止の×**。これは実測で誤検出が出ない（下記）。
  let hit = best.hit;

  //    桶の温度の数字と円の文字は、記号全体の相関では分離できない。
  //    56x64 の中で「30」と「40」の差は数十画素しかなく、150/170/180 が
  //    ほぼ同値になる（実測: top3 が 0.489/0.485/0.480 に並ぶ）。
  //    中身だけを切り出して正規化すれば同じ照合器で分離できる。
  //    実測（実写の桶15・円18）: 相関 0.4 以上で採用すると **15件中15件正解**。
  //    0.4 未満は 0.121 と 0.360 の2件で、どちらも誤り。境目はよく空いている。
  if (base === "tub" || base === "circle") {
    const ins = classifyInside(labelled, sharp.width, sharp.height, base, INSIDE_TEMPLATES);
    //    中身が**切り出せない**こと自体が情報になる。桶で中身が輪郭と
    //    つながるのは、手洗いの手か禁止の×しかない（温度の数字は必ず離れて
    //    いる）。実写の桶15件のうち中身が取れなかったのは6件で、その内訳は
    //    手洗い5・禁止1。取り違えは0件だった。
    if (ins === null && base === "tub") {
      const merged = templates.filter((t) => {
        const g = SYMBOL_BY_CODE[t.code]?.glyph;
        if (g === undefined || g.base !== "tub") return false;
        return Boolean(g.hand) || g.forbidden === true;
      });
      const refined = merged.length > 0 ? bestMatchRaw(best.vector, merged) : null;
      if (refined !== null) hit = refined;
    }
    if (ins !== null && ins.correlation >= INSIDE_MIN_CORRELATION) {
      const narrowed = templates.filter((t) => {
        if (t.base !== base) return false;
        const g = SYMBOL_BY_CODE[t.code]?.glyph;
        if (g === undefined) return false;
        if (base === "tub") return "temp" in g && g.temp === Number(ins.cls);
        return "letter" in g && g.letter === ins.cls;
      });
      const refined = narrowed.length > 0 ? bestMatchRaw(best.vector, narrowed) : null;
      if (refined !== null) hit = refined;
    }
  }

  //    点の個数は、アイロンとタンブル乾燥の記号番号をそのまま決める
  //    （510/520/530、310/320）。相関では 510/520/530 が 0.758/0.715/0.681 と
  //    並んで1位が入れ替わるので、数えたほうを使う。
  //    0個のときは絞らない。「無い」ではなく「見えなかった」ことが多く、
  //    0で絞ると「アイロン禁止 500」という重い誤りを作る。
  if (reading.dots !== null && reading.dots > 0) {
    const sameDots = templates.filter((t) => t.base === base && t.dots === reading.dots);
    const refined = sameDots.length > 0 ? bestMatchRaw(best.vector, sameDots) : null;
    if (refined !== null) hit = refined;
  }

  if (base !== "tub" && isCrossed(sharp.width, labelled)) {
    const forbidden = templates.filter((t) => {
      if (t.base !== base) return false;
      const g = SYMBOL_BY_CODE[t.code]?.glyph;
      return g !== undefined && "forbidden" in g && g.forbidden === true;
    });
    const refined = forbidden.length > 0 ? bestMatchRaw(best.vector, forbidden) : null;
    if (refined !== null) hit = refined;
  }
  if (hit.margin < MIN_MARGIN) return reading;

  reading.code = hit.template.code;
  reading.correlation = hit.correlation;
  reading.margin = hit.margin;
  return reading;
}

/**
 * 検証用: 基本形を外から与えて、カウンタだけを回す。
 * Python 参照実装（features_from_gray）と同じ条件で突き合わせるために使う。
 */
/**
 * 禁止の×が引かれているか。
 *
 * ×は「図形の中心を通る斜めの直線が2方向ある」ことで見分ける。外接矩形の
 * 対角線をそのままたどる案は、腕が角まで届かない印字（実物のタグは製造元で
 * 流儀が違う）で 0.63〜0.75 までしか出ず、8件取りこぼした。中心を固定して
 * 角度を振るほうが頑健だった。
 *
 * 実測（実写91記号、太さの許容 3%）: 禁止37件・通常54件で
 *   通常側の最大 0.94 / 禁止側の最小 0.60。
 *   **0.95 で切ると誤検出0件のまま 28/37 を拾える。**
 * 「中心から離した平行線との差」を見る案も試したが、分離は 81/91 に悪化した
 * （×の腕以外にも図形の縁があるため差が付かない）。取り下げた。
 *
 * 桶だけは除く。**手洗いの手**が桶の内側を埋める塊で、通常側なのに 0.94 まで
 * 上がる唯一の記号だから。塊状の中身を持つのは43記号でこれだけなので、
 * この除外は実データに合わせた後付けではなく記号の定義から言える。
 */
/** 中身の照合をそのまま採用してよい相関の下限（実測で境目は 0.36 と 0.61 の間） */
const INSIDE_MIN_CORRELATION = 0.4;

const CROSS_TOLERANCE = 0.03;
const CROSS_MIN = 0.95;

function isCrossed(w: number, labelled: ReturnType<typeof labelComponents>): boolean {
  const body = bodyComponent(labelled);
  if (body === null) return false;
  const sub = componentMask(labelled, w, body);
  const score = crossScore(sub.mask, sub.w, sub.h, CROSS_TOLERANCE);
  return Math.min(score[0], score[1]) >= CROSS_MIN;
}

export function countOnly(img: GrayImage): { bars: number; dots: number } {
  const mask = binarize(img);
  const labelled = labelComponents(mask, img.width, img.height);
  return {
    bars: countBars(mask, labelled, img.width, img.height),
    dots: countDots(labelled),
  };
}
