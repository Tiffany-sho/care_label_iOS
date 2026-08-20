/**
 * 撮影画像 → 記号の候補、までの一連の流れ（Stage 1〜4 の結線）。
 *
 * 出てくるのは「答え」ではなく「ピッカーの下書き」。迷ったら選ばない。
 *
 * 実機で失敗したときに何も分からないと詰められないので、
 * 途中経過（成分の数・輪郭候補・採用した行・1記号のpx・相関とマージン）を
 * すべて持ち帰る。ScanResult.diag がそれ。
 *
 * 見つけた記号1つずつの切り抜き（ScanSymbol.uri）も一緒に返す。
 * 読み取り中の画面と確認の画面で、認識器が実際に見た画像を人に見せるため。
 */

import type { CategoryId } from "../../lib/symbols";
import { CATEGORIES, SYMBOL_BY_CODE } from "../../lib/symbols";
import type { GrayImage } from "../../lib/vision/binarize";
import { loadTemplates, type CareTemplate } from "../../lib/vision/match";
import { readTag } from "../../lib/vision/pipeline";
import { resolveReading } from "../../lib/vision/resolve";
import { rotateGray } from "../../lib/vision/rotate";
import type { SymbolBox } from "../../lib/vision/segment";
import bundle from "../../lib/vision/templates.json";
import { boxToRegion, grayToPngUri } from "./pngUri";

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

/** 見つけた記号1つぶん。切り抜きの画像と、そこから読んだ結果 */
export type ScanSymbol = {
  /** 切り抜いた画像（data URI）。認識器が見たものそのもの */
  uri: string;
  /** 読み取りに使った画像の中での位置 */
  box: SymbolBox;
  /** 確定できなかったときは null */
  code: string | null;
  category: CategoryId | null;
  confidence: "high" | "low";
  note: string;
  glyphPixels: number;
};

/** 失敗したときに、どこで落ちたかを人が読める形にするための記録 */
export type ScanDiag = {
  /** 実際に処理した画像のサイズ */
  imageW: number;
  imageH: number;
  /** ノイズと枠を除いた連結成分の数 */
  components: number;
  /** 記号の輪郭になりうると判断した数 */
  candidates: number;
  /** 記号列として採用した行の要素数 */
  rowMembers: number;
  /** その行の代表的な記号の高さ(px)。110px 未満だと下線が読めない */
  rowHeightPx: number;
  /** 記号列として採った段の数 */
  rows: number;
  /** 実際に適用した傾き補正（度） */
  angleDeg: number;
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
  /** 見つけた記号（読めなかったものも含む）を、写っている順に */
  symbols: ScanSymbol[];
  /** 読み取りに使った画像そのもの（data URI）。オレンジの枠を重ねる下地 */
  stripUri: string;
  unresolved: number;
  warnings: string[];
  diag: ScanDiag;
};

function scanRegion(img: GrayImage): ScanResult {
  // 切り出し → 傾き補正の判断 → 読み取り は lib/vision/pipeline に集約してある。
  // 評価ツール（tools/eval_real.cjs）と同じ経路を通すため。
  const tag = readTag(img, templates());
  const seg = tag.seg;
  const hits: ScanHit[] = [];
  const symbols: ScanSymbol[] = [];
  const warnings: string[] = [];
  const perSymbol: ScanDiag["perSymbol"] = [];
  let unresolved = 0;

  // 傾き補正が入ったときは、記号の位置もその画像の座標で返ってくる。
  // 人に見せる切り抜きも同じ画像から取らないと、枠が記号からずれる。
  const shown =
    tag.appliedAngle !== 0 ? rotateGray(img, -tag.appliedAngle) : img;

  tag.readings.forEach((reading, i) => {
    const resolved = resolveReading(reading);
    const box = seg.boxes[i];
    perSymbol.push({
      px: reading.glyphPixels,
      code: reading.code,
      correlation: reading.correlation,
      margin: reading.margin,
      resolved: resolved.code,
    });

    const def = resolved.code === null ? undefined : SYMBOL_BY_CODE[resolved.code];
    if (box !== undefined) {
      symbols.push({
        uri: grayToPngUri(shown, boxToRegion(box), 220),
        box,
        code: def?.code ?? null,
        category: def?.category ?? null,
        confidence: resolved.confidence,
        note: resolved.note,
        glyphPixels: reading.glyphPixels,
      });
    }

    if (def === undefined) {
      unresolved++;
      if (resolved.note) warnings.push(resolved.note);
      return;
    }
    hits.push({
      category: def.category,
      code: def.code,
      confidence: resolved.confidence,
      note: resolved.note,
      glyphPixels: reading.glyphPixels,
    });
    if (resolved.note) warnings.push(`${def.name}: ${resolved.note}`);
  });

  return {
    boxes: seg.boxes.length,
    hits,
    symbols,
    stripUri: grayToPngUri(shown, undefined, 640),
    unresolved,
    warnings,
    diag: {
      imageW: img.width,
      imageH: img.height,
      components: seg.components,
      candidates: seg.candidates,
      rowMembers: seg.rowMembers,
      rowHeightPx: seg.rowHeight,
      rows: seg.rows,
      angleDeg: tag.appliedAngle,
      perSymbol,
    },
  };
}

export function scanGray(img: GrayImage): ScanResult {
  // 範囲は人が枠で囲んで決めるので、ここでは1回だけ走査する。
  // 以前は「写真全体」と「中央帯」の2回走らせていたが、囲んでもらえば当て推量が
  // 要らなくなるうえ、画素数も減って速くなる。
  return withGuidance(scanRegion(img));
}

function withGuidance(r: ScanResult): ScanResult {
  const w = [...r.warnings];
  if (r.boxes === 0) {
    w.unshift(
      "枠の中に記号を1つも見つけられませんでした。枠が記号の列だけを囲んでいるか確認してください。文字や服が多く入っていると失敗します。",
    );
  } else if (r.diag.rowHeightPx > 0 && r.diag.rowHeightPx < 110) {
    w.unshift(
      `記号が小さすぎます（1記号 約${r.diag.rowHeightPx}px、必要なのは110px以上）。枠を記号の列にぴったり合わせるか、寄って撮り直してください。`,
    );
  } else if (r.hits.length === 0 && r.boxes > 0) {
    w.unshift(
      `記号は${r.boxes}個見つかりましたが、どれも確定できませんでした。枠に文字が入っていないか、記号が斜めになっていないか確認してください。`,
    );
  }

  // 同じ分類の記号が2つ以上読めたときは、1つしか結果に出せない（1分類1記号なので）。
  // 黙って捨てると「検出したのに結果に出ない記号がある」という形で見えるだけで、
  // 何が起きたのか分からない。実際これがテストのたびに「結果非表示1件」として
  // 記録されていた。捨てたことを言う。
  const perCategory = new Map<CategoryId, string[]>();
  for (const h of r.hits) {
    const list = perCategory.get(h.category) ?? [];
    list.push(h.code);
    perCategory.set(h.category, list);
  }
  for (const [cat, codes] of perCategory) {
    if (codes.length < 2) continue;
    const name = CATEGORIES.find((c) => c.id === cat)?.tab ?? cat;
    w.push(
      `「${name}」の記号を${codes.length}個読みました（${codes.join(" / ")}）。` +
        `タグには1分類1つしか無いので、確信度の高いほうだけを使い、残りは捨てています。` +
        `どれかは読み違いです。`,
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

/**
 * 確認画面に出す行。
 * hitsToSelection で捨てられた候補（同じ分類の2個目）は「採用されなかった」と分かるように、
 * 採用された記号だけを確定の行として扱う。
 */
export function adoptedSymbols(r: ScanResult): ScanSymbol[] {
  const sel = hitsToSelection(r.hits);
  const used = new Set<string>();
  return r.symbols.map((s) => {
    if (s.code === null || s.category === null) return s;
    const adopted = sel[s.category] === s.code && !used.has(s.category);
    if (adopted) used.add(s.category);
    return adopted
      ? s
      : {
          ...s,
          code: null,
          category: null,
          confidence: "low" as const,
          note: `「${CATEGORIES.find((c) => c.id === s.category)?.tab}」の記号が複数読めたため、こちらは使っていません`,
        };
  });
}

/** 診断結果を、そのまま貼って送れるテキストにする */
export function diagText(d: ScanDiag): string {
  const head =
    `画像 ${d.imageW}x${d.imageH} / 成分 ${d.components} / 輪郭候補 ${d.candidates} / ` +
    `${d.rows}段 ${d.rowMembers}個 / 記号の高さ ${d.rowHeightPx}px / 傾き補正 ${d.angleDeg.toFixed(1)}度`;
  const rows = d.perSymbol.map(
    (p, i) =>
      `#${i + 1} ${p.px}px 一致=${p.code ?? "-"} 相関=${p.correlation?.toFixed(2) ?? "-"} ` +
      `差=${p.margin?.toFixed(3) ?? "-"} 確定=${p.resolved ?? "-"}`,
  );
  return [head, ...rows].join("\n");
}
