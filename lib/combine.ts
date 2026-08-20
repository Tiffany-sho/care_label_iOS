/**
 * 複数の服を「一緒に洗えるか」の判定。
 *
 * 守っていること（緩めると、このアプリが嘘をつく）:
 *   1. 手洗いの記号を「洗濯機の手洗いコース」に丸めない。
 *      手洗いの記号は「洗濯機は使えない」という意味なので、他の服と同じ回には入れられない。
 *   2. 干し方とアイロンは合成しない。1着ずつの作業なので、まとめる意味がない。
 *   3. 表示がない分類は「制限がない」ではなく「わからない」として伝播させる。
 *      1着でも表示が無ければ、その分類は決められない。
 *   4. 上限は最も低いものに合わせる。強さは最も弱い指定に合わせる。
 *
 * 色移り・素材の相性は記号に書かれていないので、ここでは何も言わない。
 */

import type { Selection } from "./plan";
import { SYMBOL_BY_CODE, type CareSymbolDef } from "./symbols";
import { ironText, naturalText, WASH_ACTION_LABEL, WASH_ACTION_ORDER } from "./summary";

export type CombineItem = {
  id: string;
  name: string;
  selection: Selection;
};

export type CombineNotice = {
  id: string;
  name: string;
  kind: "nohome" | "handOnly" | "noWashSymbol" | "noBleachSymbol" | "noTumbleSymbol";
  /** stop = この服を外さないと判定できない / warn = 判定はできるが分からない分類がある */
  severity: "stop" | "warn";
  title: string;
  body: string;
  /** 根拠になった記号（無い場合は undefined） */
  code?: string;
};

export type CombineRow = {
  key: "temp" | "action" | "bleach" | "tumble";
  label: string;
  value: string;
  why: string;
};

export type CombinePerGarment = {
  id: string;
  name: string;
  naturalCode?: string;
  ironCode?: string;
  text: string;
};

export type CombineResult = {
  count: number;
  /** まとめて洗える判定が出せたか */
  ok: boolean;
  headline: string;
  /** 一行でまとめた結論（ok のときだけ） */
  summary: string;
  rows: CombineRow[];
  notices: CombineNotice[];
  perGarment: CombinePerGarment[];
  /** 外せば残りで判定できる服 */
  removable: { ids: string[]; rest: number };
  /** 全部が手洗い指定（洗濯機ではなく、手洗いで一緒に） */
  handOnly: boolean;
};

function def(item: CombineItem, cat: keyof Selection): CareSymbolDef | undefined {
  const code = item.selection[cat];
  return code ? SYMBOL_BY_CODE[code] : undefined;
}

function names(list: { name: string }[]): string {
  return list.map((g) => `〈${g.name}〉`).join("");
}

export function combineWash(items: CombineItem[]): CombineResult {
  const empty: CombineResult = {
    count: items.length,
    ok: false,
    headline: "",
    summary: "",
    rows: [],
    notices: [],
    perGarment: [],
    removable: { ids: [], rest: 0 },
    handOnly: false,
  };

  const perGarment: CombinePerGarment[] = items.map((it) => {
    const nat = def(it, "natural");
    const iro = def(it, "iron");
    const parts = [naturalText(nat), ironText(iro) ? `アイロン${ironText(iro)}` : null]
      .filter((s): s is string => s !== null);
    return {
      id: it.id,
      name: it.name,
      naturalCode: nat?.code,
      ironCode: iro?.code,
      text: parts.length > 0 ? parts.join("・") : "干し方とアイロンの表示なし",
    };
  });

  if (items.length < 2) {
    return {
      ...empty,
      headline: "2点以上えらんでください",
      perGarment,
    };
  }

  const notices: CombineNotice[] = [];

  // ── 一緒に回せない服を先に外す ───────────────────────
  const washable: { item: CombineItem; d: CareSymbolDef }[] = [];
  const handItems: { item: CombineItem; d: CareSymbolDef }[] = [];

  for (const it of items) {
    const d = def(it, "wash");
    if (!d || d.facts.k !== "wash") {
      notices.push({
        id: it.id,
        name: it.name,
        kind: "noWashSymbol",
        severity: "stop",
        title: `〈${it.name}〉は洗濯の表示がありません`,
        body: "表示がない＝制限がない、ではありません。この服を他と一緒に洗ってよいとは言えないので、判定から外してください。",
      });
      continue;
    }
    if (!d.facts.allowed) {
      notices.push({
        id: it.id,
        name: it.name,
        kind: "nohome",
        severity: "stop",
        code: d.code,
        title: `〈${it.name}〉は家庭で洗えません`,
        body: "洗濯機も手洗いもできない記号です。この服だけはクリーニング店へ。",
      });
      continue;
    }
    if (d.facts.action === "hand") handItems.push({ item: it, d });
    else washable.push({ item: it, d });
  }

  // 手洗いの服と洗濯機の服が混ざったら、一緒には回せない。
  // 「手洗いコース」に読み替えない（記号は洗濯機不可を意味する）。
  if (handItems.length > 0 && washable.length > 0) {
    for (const h of handItems) {
      notices.push({
        id: h.item.id,
        name: h.item.name,
        kind: "handOnly",
        severity: "stop",
        code: h.d.code,
        title: `〈${h.item.name}〉は手洗いのみ`,
        body: "手洗いの記号は「洗濯機は使えない」という意味です。洗濯機の手洗いコースに置き換えられる指定ではないので、他の服と一緒には回せません。",
      });
    }
  }

  const stops = notices.filter((n) => n.severity === "stop");
  const group =
    handItems.length > 0 && washable.length === 0
      ? handItems
      : washable;
  const handOnly = handItems.length > 0 && washable.length === 0;

  // ── 分からない分類（判定はできるが、決められない） ──────────
  for (const g of group) {
    if (!def(g.item, "bleach")) {
      notices.push({
        id: g.item.id,
        name: g.item.name,
        kind: "noBleachSymbol",
        severity: "warn",
        title: `〈${g.item.name}〉は漂白の表示がありません`,
        body: "表示がない＝制限がない、ではありません。この組み合わせで漂白してよいとは言えないので、漂白は「わからない」のままにします。",
      });
    }
    if (!def(g.item, "tumble")) {
      notices.push({
        id: g.item.id,
        name: g.item.name,
        kind: "noTumbleSymbol",
        severity: "warn",
        title: `〈${g.item.name}〉は乾燥機の表示がありません`,
        body: "乾燥機を使ってよいとは言えません。この組み合わせでは「わからない」のままにします。",
      });
    }
  }

  if (stops.length > 0) {
    const rest = items.length - new Set(stops.map((n) => n.id)).size;
    return {
      count: items.length,
      ok: false,
      headline: `この${items.length}点は一緒に洗えません`,
      summary:
        stops.length === 1
          ? "同じ洗濯機で回せない服が1点あります。"
          : `同じ洗濯機で回せない服が${stops.length}点あります。`,
      rows: [],
      notices,
      perGarment,
      removable: { ids: [...new Set(stops.map((n) => n.id))], rest },
      handOnly,
    };
  }

  // ── 水の温度：いちばん低い上限に合わせる ─────────────────
  const rows: CombineRow[] = [];
  let coldest = group[0];
  for (const g of group) {
    if (
      g.d.facts.k === "wash" &&
      g.d.facts.allowed &&
      coldest.d.facts.k === "wash" &&
      coldest.d.facts.allowed &&
      g.d.facts.maxTempC < coldest.d.facts.maxTempC
    ) {
      coldest = g;
    }
  }
  const minTemp =
    coldest.d.facts.k === "wash" && coldest.d.facts.allowed
      ? coldest.d.facts.maxTempC
      : 0;
  rows.push({
    key: "temp",
    label: "水の温度",
    value: `${minTemp}℃まで`,
    why: `最も低い上限は〈${coldest.item.name}〉の${minTemp}℃`,
  });

  // ── 洗い方：いちばん弱い指定に合わせる ───────────────────
  let weakest = group[0];
  for (const g of group) {
    if (
      g.d.facts.k === "wash" &&
      g.d.facts.allowed &&
      weakest.d.facts.k === "wash" &&
      weakest.d.facts.allowed &&
      WASH_ACTION_ORDER[g.d.facts.action] < WASH_ACTION_ORDER[weakest.d.facts.action]
    ) {
      weakest = g;
    }
  }
  const action =
    weakest.d.facts.k === "wash" && weakest.d.facts.allowed
      ? weakest.d.facts.action
      : "normal";
  rows.push({
    key: "action",
    label: "洗い方",
    value: WASH_ACTION_LABEL[action],
    why: handOnly
      ? "全部が手洗いの指定です。洗濯機は使えません"
      : `いちばん弱い指定は〈${weakest.item.name}〉`,
  });

  // ── 漂白：全部できるときだけ「できる」 ────────────────────
  const bleachDefs = group.map((g) => ({ g, d: def(g.item, "bleach") }));
  const bleachMissing = bleachDefs.filter((b) => !b.d).map((b) => b.g.item);
  const bleachNo = bleachDefs.filter(
    (b) => b.d?.facts.k === "bleach" && !b.d.facts.chlorine && !b.d.facts.oxygen,
  );
  const chlorineNo = bleachDefs.filter(
    (b) => b.d?.facts.k === "bleach" && !b.d.facts.chlorine && b.d.facts.oxygen,
  );
  if (bleachNo.length > 0) {
    rows.push({
      key: "bleach",
      label: "漂白",
      value: "できません",
      why: `${names(bleachNo.map((b) => b.g.item))}が漂白禁止。全部OKのときだけ「できる」にします`,
    });
  } else if (bleachMissing.length > 0) {
    rows.push({
      key: "bleach",
      label: "漂白",
      value: "わかりません",
      why: `${names(bleachMissing)}に漂白の表示がありません。表示がない＝できる、ではありません`,
    });
  } else if (chlorineNo.length > 0) {
    rows.push({
      key: "bleach",
      label: "漂白",
      value: "酸素系だけ",
      why: `${names(chlorineNo.map((b) => b.g.item))}が塩素系不可`,
    });
  } else {
    rows.push({
      key: "bleach",
      label: "漂白",
      value: "できます",
      why: "全部の服で塩素系・酸素系のどちらも使えます",
    });
  }

  // ── 乾燥機：全部できるときだけ「できる」 ───────────────────
  const tumbleDefs = group.map((g) => ({ g, d: def(g.item, "tumble") }));
  const tumbleMissing = tumbleDefs.filter((t) => !t.d).map((t) => t.g.item);
  const tumbleNo = tumbleDefs.filter(
    (t) => t.d?.facts.k === "tumble" && !t.d.facts.allowed,
  );
  if (tumbleNo.length > 0) {
    rows.push({
      key: "tumble",
      label: "乾燥機",
      value: "できません",
      why: `${names(tumbleNo.map((t) => t.g.item))}が禁止`,
    });
  } else if (tumbleMissing.length > 0) {
    rows.push({
      key: "tumble",
      label: "乾燥機",
      value: "わかりません",
      why: `${names(tumbleMissing)}に乾燥機の表示がありません`,
    });
  } else {
    let lowest = Infinity;
    for (const t of tumbleDefs) {
      if (t.d?.facts.k === "tumble" && t.d.facts.allowed) {
        lowest = Math.min(lowest, t.d.facts.maxExhaustC);
      }
    }
    rows.push({
      key: "tumble",
      label: "乾燥機",
      value: `排気温度${lowest}℃まで`,
      why: "全部の服でタンブル乾燥ができます。最も低い上限に合わせています",
    });
  }

  // ── 一行のまとめ ──────────────────────────────
  const cannot: string[] = [];
  if (rows.find((r) => r.key === "bleach")?.value === "できません") cannot.push("漂白剤");
  if (rows.find((r) => r.key === "tumble")?.value === "できません") cannot.push("乾燥機");
  const unclear: string[] = [];
  if (rows.find((r) => r.key === "bleach")?.value === "わかりません") unclear.push("漂白");
  if (rows.find((r) => r.key === "tumble")?.value === "わかりません") unclear.push("乾燥機");

  const summary = [
    handOnly
      ? `${minTemp}℃まで・手洗いで一緒に洗えます。`
      : `${minTemp}℃まで・${WASH_ACTION_LABEL[action]}で洗えます。`,
    cannot.length > 0 ? `${cannot.join("と")}は使えません。` : "",
    unclear.length > 0
      ? `${unclear.join("と")}は、表示がない服があるので決められません。`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return {
    count: items.length,
    ok: true,
    headline: handOnly
      ? `この${items.length}点は一緒に手洗いできます`
      : `この${items.length}点は一緒に洗えます`,
    summary,
    rows,
    notices,
    perGarment,
    removable: { ids: [], rest: items.length },
    handOnly,
  };
}
