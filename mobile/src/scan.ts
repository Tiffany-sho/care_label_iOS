/**
 * 撮影画像 → 記号の候補、までの一連の流れ（Stage 1〜4 の結線）。
 *
 * 出てくるのは「答え」ではなく「ピッカーの下書き」。
 * 迷ったら選ばない、が全体の方針。
 */

import type { CategoryId } from "../../lib/symbols";
import { SYMBOL_BY_CODE } from "../../lib/symbols";
import type { GrayImage } from "../../lib/vision/binarize";
import { loadTemplates, type CareTemplate } from "../../lib/vision/match";
import { readSymbol } from "../../lib/vision/reader";
import { resolveReading } from "../../lib/vision/resolve";
import { cropGray, segmentSymbols } from "../../lib/vision/segment";
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

export type ScanResult = {
  /** 切り出せた記号の数 */
  boxes: number;
  hits: ScanHit[];
  /** 切り出せたが確定できなかった数 */
  unresolved: number;
  warnings: string[];
};

export function scanGray(img: GrayImage): ScanResult {
  const boxes = segmentSymbols(img);
  const hits: ScanHit[] = [];
  const warnings: string[] = [];
  let unresolved = 0;

  for (const box of boxes) {
    const crop = cropGray(img, box, 3);
    const reading = readSymbol(crop, templates());
    const resolved = resolveReading(reading);
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

  if (boxes.length === 0) {
    warnings.push(
      "記号を1つも見つけられませんでした。タグが画面いっぱいに写るよう近づいて、真正面から撮り直してください。",
    );
  }
  return { boxes: boxes.length, hits, unresolved, warnings };
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
