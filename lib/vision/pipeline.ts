/**
 * 切り出し済みのタグ画像 → 記号の読み取り、までをまとめた入口。
 *
 * アプリ（mobile/src/scan.ts）と評価ツール（tools/eval_real.cjs）が
 * 同じ経路を通るようにするための層。片方だけ直して差が出るのを防ぐ。
 */

import { blurGray, type GrayImage } from "./binarize";
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
): SymbolReading[] {
  return seg.boxes.map((b) => readSymbol(cropGray(img, b, 3), templates));
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
  const plain = readTagFixed(img, templates, opts);
  const divisor = opts.blurDivisor ?? BLUR_DIVISOR;
  if (divisor <= 0) return plain;

  // 生地の織り目や印字のかすれは、しきい値では取り除けない。画像を先にならす。
  // ぼかす量は記号の大きさに合わせる（写真の画素数ではなく、記号が何画素かで決まる）。
  const size = plain.seg.rowHeight > 0 ? plain.seg.rowHeight : Math.max(img.width, img.height) / 6;
  const radius = Math.min(8, Math.max(1, Math.round(size / divisor)));
  const soft = blurGray(img, radius);
  const blurred = readTagFixed(soft, templates, opts);
  // 切り出しはぼかした画像で、読み取りは元画像で。
  // ぼかすと織り目が消えて記号は見つかるが、日陰の斜線や下線のような
  // 細い特徴まで溶けて 425 が 420 に、152 が 150 に化ける。
  // 「探すのはぼかし・読むのは原画」を第三の候補として同じ土俵で比べる。
  const hybrid: TagReading = {
    seg: blurred.seg,
    readings: blurred.seg.boxes.map((b) => readSymbol(cropGray(img, b, 3), templates)),
    appliedAngle: 0,
  };

  // どちらを採るかは正解を知らずに決めなければならない。
  //
  // 最初は「照合できた記号の数＋平均相関」で選んだが、これは**ぼかし側に
  // 系統的に有利**で、合成タグの正解率が 90〜100% から 52〜59% に落ちた。
  // ぼかすと形がなめらかになり、間違ったテンプレートとの相関まで上がるので、
  // 「数が増えた＝良くなった」にならない。
  // マージン（1位と2位の相関差）は当たり外れを分離する量として実測済みなので
  // （lib/vision/match.ts）、その合計で選ぶ。
  const score = (t: TagReading) =>
    t.readings.reduce((a, r) => a + (r.code !== null ? (r.margin ?? 0) : 0), 0);
  const best = [plain, blurred, hybrid].reduce((a, b) => (score(b) > score(a) ? b : a));
  return best;
}

function readTagFixed(
  img: GrayImage,
  templates: CareTemplate[],
  opts: { minAngle?: number; maxAngle?: number } = {},
): TagReading {
  const minAngle = opts.minAngle ?? 1.2;
  const maxAngle = opts.maxAngle ?? 20;

  const seg0 = segmentSymbolsDebug(img);
  const read0 = readAll(img, seg0, templates);
  const angle = seg0.angleDeg;

  if (
    seg0.boxes.length === 0 ||
    !Number.isFinite(angle) ||
    Math.abs(angle) < minAngle ||
    Math.abs(angle) > maxAngle
  ) {
    return { seg: seg0, readings: read0, appliedAngle: 0 };
  }

  const rotated = rotateGray(img, -angle);
  const seg1 = segmentSymbolsDebug(rotated);
  const read1 = readAll(rotated, seg1, templates);

  // 記号を取りこぼしていないこと、かつ照合が良くなっていることを条件にする
  const better =
    seg1.boxes.length >= seg0.boxes.length &&
    meanCorrelation(read1) > meanCorrelation(read0);
  return better
    ? { seg: seg1, readings: read1, appliedAngle: -angle }
    : { seg: seg0, readings: read0, appliedAngle: 0 };
}
