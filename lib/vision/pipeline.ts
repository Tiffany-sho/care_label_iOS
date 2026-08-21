/**
 * 切り出し済みのタグ画像 → 記号の読み取り、までをまとめた入口。
 *
 * アプリ（mobile/src/scan.ts）と評価ツール（tools/eval_real.cjs）が
 * 同じ経路を通るようにするための層。片方だけ直して差が出るのを防ぐ。
 */

import { blurGray, decideInkDark, type GrayImage } from "./binarize";
import type { CareTemplate } from "./match";
import { readSymbol, type SymbolReading } from "./reader";
import { rotateGray } from "./rotate";
import { cropGray, segmentSymbolsDebug, type SegmentDebug } from "./segment";

export type TagReading = {
  seg: SegmentDebug;
  readings: SymbolReading[];
  /** 実際に適用した回転角（度）。0 なら回していない */
  appliedAngle: number;
};

/**
 * ぼかしの半径 = 記号の高さ / この値。
 * 25〜100 まで振って実写の一致数は 30〜32 でほぼ平らだった（tools/SCAN.md）。
 * どこを選んでも大きくは変わらない、という測定結果のほうが値そのものより重要。
 * 平らな部分の中央あたりを採る。
 */
const BLUR_DIVISOR = 60;

function meanCorrelation(readings: SymbolReading[]): number {
  const vals = readings
    .map((r) => r.correlation)
    .filter((c): c is number => c !== null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function readAll(
  img: GrayImage,
  seg: SegmentDebug,
  templates: CareTemplate[],
  inkDark: boolean,
): SymbolReading[] {
  return seg.boxes.map((b) => readSymbol(cropGray(img, b, 3), templates, { inkDark }));
}

/**
 * タグ画像から記号を読む。
 *
 * 傾き補正は「まっすぐに戻す」だけでは効かなかった。回転の補間で像が甘くなり、
 * かえって相関が下がる写真がある。そこで、回さない場合と回した場合の両方を読み、
 * **平均相関が高いほうを採る**。正解を知らなくても選べる基準なので、
 * 実写でも安全側に働く。
 */
export function readTag(
  img: GrayImage,
  templates: CareTemplate[],
  opts: { minAngle?: number; maxAngle?: number; blurDivisor?: number } = {},
): TagReading {
  // インクの極性は**タグ全体で1回だけ**決める。記号1個に切り詰めた画像では
  // 四角い記号の輪郭が切り抜きの四辺に触れて縁がインクだらけになり、
  // 判定が反転する（lib/vision/binarize.ts の decideInkDark を参照）。
  const inkDark = decideInkDark(img);
  const divisor = opts.blurDivisor ?? BLUR_DIVISOR;

  // 切り出しは、生地の織り目を消したほうが見つかる記号がある（実測で
  // 切出 90 -> 95）。読み取りのほうは readSymbol が記号ごとにぼかしと傾きを
  // 試すので、タグ全体でのぼかしは**切り出しにだけ**効かせればよい。
  // 以前は plain / blurred / hybrid の3通りを最後まで読んで比べていたが、
  // それは readSymbol がぼかしを試す前の名残で、いまは同じ照合を3回している。
  const segPlain = segmentSymbolsDebug(img);
  if (divisor <= 0) return readWith(img, segPlain, templates, inkDark, opts);

  const size = segPlain.rowHeight > 0 ? segPlain.rowHeight : Math.max(img.width, img.height) / 6;
  const radius = Math.min(8, Math.max(1, Math.round(size / divisor)));
  const segBlur = segmentSymbolsDebug(blurGray(img, radius));
  // どちらの切り出しを採るかは正解を知らずに決めなければならない。
  // 「見つかった数が多いほう」を条件にすると、実測で一致が 109 -> 108 に落ちた。
  // マージン（1位と2位の相関差）は当たり外れを分離する量として実測済みなので
  // （lib/vision/match.ts）、その合計で選ぶ。読み取りは2通りで済む
  // （以前は plain / blurred / hybrid の3通りを読んでいたが、ぼかした画像を
  // 読む経路は readSymbol がぼかしを試すようになった時点で重複している）。
  const a = readWith(img, segPlain, templates, inkDark, opts);
  if (segBlur.boxes.length === segPlain.boxes.length && sameBoxes(segPlain, segBlur)) {
    return a;
  }
  const b = readWith(img, segBlur, templates, inkDark, opts);
  const score = (t: TagReading) =>
    t.readings.reduce((acc, r) => acc + (r.code !== null ? (r.margin ?? 0) : 0), 0);
  return score(b) > score(a) ? b : a;
}

/** 2つの切り出しが同じ矩形なら、読み直す必要はない。 */
function sameBoxes(a: SegmentDebug, b: SegmentDebug): boolean {
  if (a.boxes.length !== b.boxes.length) return false;
  for (let i = 0; i < a.boxes.length; i++) {
    const p = a.boxes[i];
    const q = b.boxes[i];
    if (p.x0 !== q.x0 || p.y0 !== q.y0 || p.x1 !== q.x1 || p.y1 !== q.y1) return false;
  }
  return true;
}

/** 切り出しが決まったあと、傾きを直すかどうかを決めて読む。 */
function readWith(
  img: GrayImage,
  seg: SegmentDebug,
  templates: CareTemplate[],
  inkDark: boolean,
  opts: { minAngle?: number; maxAngle?: number },
): TagReading {
  const minAngle = opts.minAngle ?? 1.2;
  const maxAngle = opts.maxAngle ?? 20;
  const angle = seg.angleDeg;
  const read0 = readAll(img, seg, templates, inkDark);
  if (
    seg.boxes.length === 0 ||
    !Number.isFinite(angle) ||
    Math.abs(angle) < minAngle ||
    Math.abs(angle) > maxAngle
  ) {
    return { seg, readings: read0, appliedAngle: 0 };
  }
  const rotated = rotateGray(img, -angle);
  const seg1 = segmentSymbolsDebug(rotated);
  const read1 = readAll(rotated, seg1, templates, inkDark);
  const better =
    seg1.boxes.length >= seg.boxes.length &&
    meanCorrelation(read1) > meanCorrelation(read0);
  return better
    ? { seg: seg1, readings: read1, appliedAngle: -angle }
    : { seg, readings: read0, appliedAngle: 0 };
}
