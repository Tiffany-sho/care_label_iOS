/**
 * 記号の集合 → 洗濯手順 を導く規則エンジン。
 *
 * 文言の規約（守らないとこのアプリの存在意義がなくなる）:
 *   - 温度は必ず「〜まで」「上限」と書く。「40℃で洗う」とは絶対に書かない。
 *   - 記号がないカテゴリは推測しない。level:"unknown" として「情報がない」と明示する。
 *   - 記号が禁止しているものを、便利さのために覆す提案をしない。
 */

import {
  CATEGORIES,
  SYMBOL_BY_CODE,
  type CareSymbolDef,
  type CategoryId,
} from "./symbols";

export type Level = "ok" | "caution" | "forbidden" | "unknown";

export type Basis = {
  code: string;
  name: string;
  meaning: string;
  /** 記号番号が未確認のものは、番号を表示しない */
  numberUnverified?: boolean;
};

export type Section = {
  id: string;
  title: string;
  level: Level;
  /** 見出しになる一文（上限・可否の語彙で書く） */
  headlines: string[];
  /** 補足・誤解しやすい点 */
  notes: string[];
  /** 導出根拠となった記号 */
  basis: Basis[];
};

export type Plan = {
  sections: Section[];
  /** 記号の組み合わせとして不自然なものへの警告 */
  conflicts: string[];
  /** 選ばれた記号の数 */
  selectedCount: number;
};

/** カテゴリ → 選択された記号コード */
export type Selection = Partial<Record<CategoryId, string>>;

const UNKNOWN_NOTE =
  "この分類の記号が選ばれていません。表示がない＝「情報がない」であって「何をしてもよい」ではありません。手元のタグを確認してください。";

function basisOf(defs: (CareSymbolDef | undefined)[]): Basis[] {
  return defs
    .filter((d): d is CareSymbolDef => Boolean(d))
    .map((d) => ({
      code: d.code,
      name: d.name,
      meaning: d.meaning,
      numberUnverified: d.numberUnverified,
    }));
}

function pick(sel: Selection, cat: CategoryId): CareSymbolDef | undefined {
  const code = sel[cat];
  return code ? SYMBOL_BY_CODE[code] : undefined;
}

/**
 * 1つの工程に複数の手段がある（乾かす=タンブル+自然、専門店=ドライ+ウェット）とき、
 * 工程全体のバッジをどうするか。
 *   全部だめ → forbidden / 一部でもだめ、または注意付き → caution / 全部素直に可 → ok
 * 「タンブル禁止だが自然乾燥はできる」を "不可" と出すと誤読させるため。
 */
function combine(levels: Level[]): Level {
  const known = levels.filter((l) => l !== "unknown");
  if (known.length === 0) return "unknown";
  if (known.every((l) => l === "forbidden")) return "forbidden";
  if (known.some((l) => l === "forbidden" || l === "caution")) return "caution";
  return "ok";
}

/** 「洗う」 */
function washSection(sel: Selection): Section {
  const def = pick(sel, "wash");
  const base = { id: "wash", title: "洗う", basis: basisOf([def]) };

  if (!def || def.facts.k !== "wash") {
    return { ...base, level: "unknown", headlines: [], notes: [UNKNOWN_NOTE] };
  }
  const f = def.facts;

  if (!f.allowed) {
    return {
      ...base,
      level: "forbidden",
      headlines: ["家庭では洗えません。"],
      notes: [
        "水洗いそのものができない衣類です。洗濯機・手洗いのどちらも不可。",
        "「専門店」の欄でドライ／ウェットクリーニングの可否を確認してください。",
      ],
    };
  }

  const t = f.maxTempC;
  const shared = [
    `${t}℃は上限であって推奨温度ではありません。温度を上げれば洗浄力は上がりますが、縮み・色落ち・型崩れのリスクも同時に上がります。迷うなら低い温度を選んでください。`,
  ];

  switch (f.action) {
    case "normal":
      return {
        ...base,
        level: "ok",
        headlines: [`液温は${t}℃まで。洗濯機の通常コースが使えます。`],
        notes: shared,
      };
    case "mild":
      return {
        ...base,
        level: "caution",
        headlines: [
          `液温は${t}℃まで。洗濯機は「弱い洗濯」に限ります。`,
        ],
        notes: [
          "機種により「手洗い」「ドライ」「おうちクリーニング」「デリケート」などの名前のコースが該当します。",
          "洗濯ネットの使用と、脱水時間を短くすることを推奨します。",
          ...shared,
        ],
      };
    case "veryMild":
      return {
        ...base,
        level: "caution",
        headlines: [
          `液温は${t}℃まで。洗濯機は「非常に弱い洗濯」に限ります。`,
        ],
        notes: [
          "水量を多く、機械的な力を最小限にするコースです。ネットは必須、脱水は最短に。",
          "「弱い洗濯」より一段階弱い指定です。通常コースは使えません。",
          ...shared,
        ],
      };
    case "hand":
      return {
        ...base,
        level: "caution",
        headlines: [`手洗いのみ。液温は${t}℃まで。`],
        notes: [
          "洗濯機は使えません。押し洗い・振り洗い程度にとどめ、もみ洗い・こすり洗い・ねじり絞りはしないでください。",
          ...shared,
        ],
      };
  }
}

/** 「漂白」 */
function bleachSection(sel: Selection): Section {
  const def = pick(sel, "bleach");
  const base = { id: "bleach", title: "漂白", basis: basisOf([def]) };

  if (!def || def.facts.k !== "bleach") {
    return { ...base, level: "unknown", headlines: [], notes: [UNKNOWN_NOTE] };
  }
  const f = def.facts;

  if (f.chlorine && f.oxygen) {
    return {
      ...base,
      level: "ok",
      headlines: ["塩素系・酸素系のどちらの漂白剤も使えます。"],
      notes: [
        "使えるという意味であって、毎回使う必要はありません。塩素系は繊維への負担が大きいため、必要なときだけに。",
      ],
    };
  }
  if (!f.chlorine && f.oxygen) {
    return {
      ...base,
      level: "caution",
      headlines: ["酸素系漂白剤のみ使えます。塩素系は使えません。"],
      notes: [
        "酸素系（過炭酸ナトリウム・過酸化水素など）と、塩素系（次亜塩素酸ナトリウム）は別物です。ボトルの成分表示で確認してください。",
        "「まぜるな危険」の表記があるものは塩素系です。",
      ],
    };
  }
  return {
    ...base,
    level: "forbidden",
    headlines: ["漂白はできません。"],
    notes: [
      "漂白剤を単体で使わないだけでなく、漂白剤が配合された洗剤も避けてください。",
      "色柄物なら、蛍光増白剤の入っていない洗剤のほうが色あせを抑えられます。",
    ],
  };
}

/** 「乾かす」（タンブル乾燥＋自然乾燥をまとめる） */
function drySection(sel: Selection): Section {
  const tumble = pick(sel, "tumble");
  const natural = pick(sel, "natural");
  const base = { id: "dry", title: "乾かす", basis: basisOf([tumble, natural]) };

  const headlines: string[] = [];
  const notes: string[] = [];
  const levels: Level[] = [];

  if (tumble && tumble.facts.k === "tumble") {
    const f = tumble.facts;
    if (!f.allowed) {
      levels.push("forbidden");
      headlines.push("タンブル乾燥はできません。");
      notes.push(
        "タンブル乾燥＝回転ドラムの熱風乾燥です。家庭の衣類乾燥機だけでなく、コインランドリーの乾燥機・洗濯乾燥機の乾燥運転も含みます。",
      );
    } else {
      levels.push(f.maxExhaustC <= 60 ? "caution" : "ok");
      headlines.push(`タンブル乾燥は排気温度${f.maxExhaustC}℃まで。`);
      if (f.maxExhaustC <= 60) {
        notes.push(
          "低温指定です。乾燥機の「高温」「標準」設定は使わず、低温／デリケートに相当する設定を選んでください。",
        );
      }
      notes.push(
        `${f.maxExhaustC}℃は上限です。これより低い温度で乾かして差し支えありません。`,
      );
    }
  }

  if (natural && natural.facts.k === "natural") {
    const f = natural.facts;
    levels.push(f.wet || f.shade || f.dir === "flat" ? "caution" : "ok");
    headlines.push(
      `自然乾燥は「${f.shade ? "日陰で" : ""}${f.wet ? "ぬれ" : ""}${f.dir === "flat" ? "平干し" : "つり干し"}」。`,
    );
    if (f.dir === "flat") {
      notes.push(
        "平干し＝平らに寝かせて干す。ハンガーにかけると自重で伸びて型崩れします。",
      );
    }
    if (f.wet) {
      notes.push(
        "「ぬれ」＝脱水せず、水を含んだまま干します。脱水によるシワ・型崩れが戻らない素材への指定です。水が落ちても支障のない場所で干してください。",
      );
    }
    if (f.shade) {
      notes.push("日陰指定＝直射日光で変色・黄変するおそれがあります。");
    }
  }

  if (!tumble && !natural) {
    return { ...base, level: "unknown", headlines: [], notes: [UNKNOWN_NOTE] };
  }
  if (!tumble) {
    notes.push(
      "タンブル乾燥の記号が選ばれていません。可否が不明なため、乾燥機の使用は避けるのが無難です。",
    );
  }
  if (!natural) {
    notes.push("自然乾燥の記号が選ばれていません。干し方の指定は確認できていません。");
  }

  return { ...base, level: combine(levels), headlines, notes };
}

/** 「アイロン」 */
function ironSection(sel: Selection): Section {
  const def = pick(sel, "iron");
  const base = { id: "iron", title: "アイロン", basis: basisOf([def]) };

  if (!def || def.facts.k !== "iron") {
    return { ...base, level: "unknown", headlines: [], notes: [UNKNOWN_NOTE] };
  }
  const f = def.facts;

  if (!f.allowed) {
    return {
      ...base,
      level: "forbidden",
      headlines: ["アイロンはかけられません。"],
      notes: ["スチームのみの当て方も含めて不可です。"],
    };
  }

  const label = f.maxSoleC >= 210 ? "高温" : f.maxSoleC >= 160 ? "中温" : "低温";
  const notes = [
    `${f.maxSoleC}℃は上限です。低い温度から試し、シワが取れなければ上げてください。`,
  ];
  if (!f.steam) {
    notes.unshift("スチームは使えません。ドライ（スチームなし）でかけてください。");
  }
  if (f.maxSoleC <= 120) {
    notes.push("当て布を使うと直接の熱が和らぎ、テカリを防げます。");
  }

  return {
    ...base,
    level: f.maxSoleC <= 120 ? "caution" : "ok",
    headlines: [`底面温度は${f.maxSoleC}℃まで（${label}）。`],
    notes,
  };
}

/** 「専門店」（ドライ＋ウェット） */
function proSection(sel: Selection): Section {
  const dry = pick(sel, "dryclean");
  const wet = pick(sel, "wetclean");
  const base = { id: "pro", title: "専門店にまかせる", basis: basisOf([dry, wet]) };

  const headlines: string[] = [];
  const notes: string[] = [];
  const levels: Level[] = [];

  if (dry && dry.facts.k === "dryclean") {
    const f = dry.facts;
    if (!f.allowed) {
      levels.push("forbidden");
      headlines.push("ドライクリーニングはできません。");
    } else {
      levels.push(f.action === "mild" || f.solvent === "petroleum" ? "caution" : "ok");
      const solvent =
        f.solvent === "pce+petroleum"
          ? "パークロロエチレンおよび石油系溶剤"
          : "石油系溶剤";
      headlines.push(
        `ドライクリーニングは${solvent}で可能${f.action === "mild" ? "（弱い操作に限る）" : ""}。`,
      );
      if (f.solvent === "petroleum") {
        notes.push(
          "石油系溶剤限定です。パークロロエチレンは使えません。受付で必ず伝えてください（店側の標準溶剤がパークの場合があります）。",
        );
      }
      if (f.action === "mild") {
        notes.push("「弱い操作」の指定があることを受付で伝えてください。");
      }
    }
  }

  if (wet && wet.facts.k === "wetclean") {
    const f = wet.facts;
    if (!f.allowed) {
      levels.push("forbidden");
      headlines.push("ウェットクリーニングはできません。");
    } else {
      levels.push(f.action === "normal" ? "ok" : "caution");
      const a =
        f.action === "normal"
          ? ""
          : f.action === "mild"
            ? "（弱い操作に限る）"
            : "（非常に弱い操作に限る）";
      headlines.push(`ウェットクリーニングが可能${a}。`);
      notes.push(
        "ウェットクリーニング＝専門店が特殊な技術で行う水洗いです。家庭での水洗いの可否とは別の指定なので、「洗う」の欄と混同しないでください。",
      );
    }
  }

  if (!dry && !wet) {
    return { ...base, level: "unknown", headlines: [], notes: [UNKNOWN_NOTE] };
  }
  if (!dry) notes.push("ドライクリーニングの記号が選ばれていません。");
  if (!wet) notes.push("ウェットクリーニングの記号が選ばれていません。");

  return { ...base, level: combine(levels), headlines, notes };
}

function detectConflicts(sel: Selection): string[] {
  const out: string[] = [];
  const wash = pick(sel, "wash");
  const dry = pick(sel, "dryclean");
  const wet = pick(sel, "wetclean");

  const washNo = wash?.facts.k === "wash" && !wash.facts.allowed;
  const dryNo = dry?.facts.k === "dryclean" && !dry.facts.allowed;
  const wetNo = wet?.facts.k === "wetclean" && !wet.facts.allowed;

  if (washNo && dryNo && wetNo) {
    out.push(
      "家庭洗濯・ドライ・ウェットのすべてが「禁止」になっています。3つとも不可の衣類はほとんど存在しません。記号の読み取りを見直してください。",
    );
  }
  if (washNo && !dry && !wet) {
    out.push(
      "家庭洗濯が禁止ですが、専門店の記号（ドライ／ウェット）が選ばれていません。この衣類をどう洗うかが確定できません。",
    );
  }
  const tumble = pick(sel, "tumble");
  if (
    washNo &&
    tumble?.facts.k === "tumble" &&
    tumble.facts.allowed
  ) {
    out.push(
      "家庭洗濯は禁止ですが、タンブル乾燥は可となっています。読み取り間違いの可能性があるため、タグを再確認してください。",
    );
  }
  return out;
}

export function buildPlan(sel: Selection): Plan {
  return {
    sections: [
      washSection(sel),
      bleachSection(sel),
      drySection(sel),
      ironSection(sel),
      proSection(sel),
    ],
    conflicts: detectConflicts(sel),
    selectedCount: CATEGORIES.filter((c) => sel[c.id]).length,
  };
}

export const DISCLAIMER =
  "この結果は、選ばれた記号を JIS L 0001 の定義にもとづいて機械的に言い換えたものです。素材・染色・装飾によって最適な扱いは変わります。最終的には衣類に付いているタグの表示と、メーカーの指示に従ってください。";
