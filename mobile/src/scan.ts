/**
 * 撮影画像 → 記号の候補、までの一連の流れ（Stage 1〜4 の結線）。
 *
 * 出てくるのは「答え」ではなく「ピッカーの下書き」。迷ったら選ばない。
 *
 * 実機で失敗したときに何も分からないと詰められないので、
 * 途中経過（成分の数・輪郭候補・採用した行・1記号のpx・相関とマージン）を
 * すべて持ち帰る。ScanResult.diag がそれ。
 */

import type { CategoryId } from "../../lib/symbols";
import { SYMBOL_BY_CODE } from "../../lib/symbols";
import type { GrayImage } from "../../lib/vision/binarize";
import { loadTemplates, type CareTemplate } from "../../lib/vision/match";
import { readSymbol } from "../../lib/vision/reader";
import { resolveReading } from "../../lib/vision/resolve";
import { cropGray, segmentSymbolsDebug } from "../../lib/vision/segment";
import bundle from "../../lib/vision/templates.json";

let cached: CareTemplate[] | null = null;

/** テンプレートの正規化は41x3584の一度きり。毎回やる必要はない。 */
export function templates(): CareTemplate[] {
  if (cached === null) cached = loadTemplates(bundle);
  return cached;
}

export type ScanHit = {
  category: CategoryId;
  code: string;
  confidence: "high" | "low";
  note: string;
  glyphPixels: number;
};

/** 失敗したときに、どこで落ちたかを人が読める形にするための記録 */
export type ScanDiag = {
  /** 実際に処理した画像のサイズ */
  imageW: number;
  imageH: number;
  /** 全体を見たか、中央帯を切り出して見たか */
  region: "full" | "center";
  /** ノイズと枠を除いた連結成分の数 */
  components: number;
  /** 記号の輪郭になりうると判断した数 */
  candidates: number;
  /** 記号列として採用した行の要素数 */
  rowMembers: number;
  /** その行の代表的な記号の高さ(px)。110px 未満だと下線が読めない */
  rowHeightPx: number;
  /** 切り出した各記号の相関とマージン */
  perSymbol: {
    px: number;
    code: string | null;
    correlation: number | null;
    margin: number | null;
    resolved: string | null;
  }[];
};

export type ScanResult = {
  boxes: number;
  hits: ScanHit[];
  unresolved: number;
  warnings: string[];
  diag: ScanDiag;
};

/** ガイド枠に相当する中央の帯。写真に服や背景が大きく写っている場合の保険 */
function centerBand(img: GrayImage): GrayImage {
  const x0 = Math.floor(img.width * 0.04);
  const x1 = Math.ceil(img.width * 0.96) - 1;
  const bandH = Math.round((x1 - x0 + 1) / 3);
  const cy = Math.floor(img.height / 2);
  const y0 = Math.max(0, cy - Math.floor(bandH / 2));
  const y1 = Math.min(img.height - 1, y0 + bandH - 1);
  return cropGray(img, { x0, y0, x1, y1 }, 0);
}

function scanRegion(img: GrayImage, region: "full" | "center"): ScanResult {
  const seg = segmentSymbolsDebug(img);
  const hits: ScanHit[] = [];
  const warnings: string[] = [];
  const perSymbol: ScanDiag["perSymbol"] = [];
  let unresolved = 0;

  for (const box of seg.boxes) {
    const crop = cropGray(img, box, 3);
    const reading = readSymbol(crop, templates());
    const resolved = resolveReading(reading);
    perSymbol.push({
      px: reading.glyphPixels,
      code: reading.code,
      correlation: reading.correlation,
      margin: reading.margin,
      resolved: resolved.code,
    });

    if (resolved.code === null) {
      unresolved++;
      if (resolved.note) warnings.push(resolved.note);
      continue;
    }
    const def = SYMBOL_BY_CODE[resolved.code];
    hits.push({
      category: def.category,
      code: def.code,
      confidence: resolved.confidence,
      note: resolved.note,
      glyphPixels: reading.glyphPixels,
    });
    if (resolved.note) warnings.push(`${def.name}: ${resolved.note}`);
  }

  return {
    boxes: seg.boxes.length,
    hits,
    unresolved,
    warnings,
    diag: {
      imageW: img.width,
      imageH: img.height,
      region,
      components: seg.components,
      candidates: seg.candidates,
      rowMembers: seg.rowMembers,
      rowHeightPx: seg.rowHeight,
      perSymbol,
    },
  };
}

export function scanGray(img: GrayImage): ScanResult {
  // 写真全体で試し、うまく取れないときはガイド枠相当の中央帯でも試す。
  // 服や背景が大きく写っていると二値化がそちらに引きずられるため。
  const full = scanRegion(img, "full");
  if (full.hits.length >= 3) return withGuidance(full);

  const band = scanRegion(centerBand(img), "center");
  const better =
    band.hits.length > full.hits.length ||
    (band.hits.length === full.hits.length && band.boxes > full.boxes)
      ? band
      : full;
  return withGuidance(better);
}

function withGuidance(r: ScanResult): ScanResult {
  const w = [...r.warnings];
  if (r.boxes === 0) {
    w.unshift(
      "記号を1つも見つけられませんでした。タグの記号の列だけが枠いっぱいに入るよう、もっと近づいて撮り直してください。",
    );
  } else if (r.diag.rowHeightPx > 0 && r.diag.rowHeightPx < 110) {
    w.unshift(
      `記号が小さすぎます（1記号 約${r.diag.rowHeightPx}px、必要なのは110px以上）。もっと近づいて撮り直してください。`,
    );
  } else if (r.hits.length === 0 && r.boxes > 0) {
    w.unshift(
      `記号は${r.boxes}個見つかりましたが、どれも確定できませんでした。ピントと明るさを確認し、真正面から撮り直してください。`,
    );
  }
  return { ...r, warnings: w };
}

/**
 * 同じ分類に複数の候補が出たら、確信度が高いほう → 大きく写っているほうを採る。
 * タグには1分類1記号しか無いので、ここで必ず1つに絞れる。
 */
export function hitsToSelection(hits: ScanHit[]): Partial<Record<CategoryId, string>> {
  const best = new Map<CategoryId, ScanHit>();
  for (const h of hits) {
    const cur = best.get(h.category);
    if (cur === undefined) {
      best.set(h.category, h);
      continue;
    }
    const better =
      (h.confidence === "high" && cur.confidence !== "high") ||
      (h.confidence === cur.confidence && h.glyphPixels > cur.glyphPixels);
    if (better) best.set(h.category, h);
  }
  const out: Partial<Record<CategoryId, string>> = {};
  for (const [cat, h] of best) out[cat] = h.code;
  return out;
}

/** 診断結果を、そのまま貼って送れるテキストにする */
export function diagText(d: ScanDiag): string {
  const head =
    `画像 ${d.imageW}x${d.imageH} / 範囲 ${d.region} / 成分 ${d.components} / ` +
    `輪郭候補 ${d.candidates} / 記号列 ${d.rowMembers}個 / 記号の高さ ${d.rowHeightPx}px`;
  const rows = d.perSymbol.map(
    (p, i) =>
      `#${i + 1} ${p.px}px 一致=${p.code ?? "-"} 相関=${p.correlation?.toFixed(2) ?? "-"} ` +
      `差=${p.margin?.toFixed(3) ?? "-"} 確定=${p.resolved ?? "-"}`,
  );
  return [head, ...rows].join("\n");
}
