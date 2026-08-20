/**
 * 切り出し済みのタグ画像 → 記号の読み取り、までをまとめた入口。
 *
 * アプリ（mobile/src/scan.ts）と評価ツール（tools/eval_real.cjs）が
 * 同じ経路を通るようにするための層。片方だけ直して差が出るのを防ぐ。
 */

import type { GrayImage } from "./binarize";
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
