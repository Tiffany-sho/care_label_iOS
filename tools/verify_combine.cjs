/**
 * lib/summary.ts と lib/combine.ts の規則を確かめる。
 *
 * 守らせたいのは文言ではなく判断:
 *   ・上限は最も低いものに、強さは最も弱い指定に合わせる
 *   ・手洗いの記号を洗濯機のコースに丸めない
 *   ・表示がない分類は「できる」ではなく「わからない」として伝播する
 *   ・干し方とアイロンは合成しない
 *
 * コンソールが cp932 なので、出力は ASCII だけにする（値は \u で逃がす）。
 */
const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = "tools/.build/rules";
const FILES = ["lib/symbols.ts", "lib/plan.ts", "lib/summary.ts", "lib/combine.ts"];

const tsc = require.resolve("typescript/bin/tsc");
execFileSync(
  process.execPath,
  [
    tsc,
    ...FILES,
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
    "--downlevelIteration",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

const { buildHighlight } = require(path.join(ROOT, OUT, "summary.js"));
const { combineWash } = require(path.join(ROOT, OUT, "combine.js"));

/** 非ASCIIを \uXXXX にして、cp932 のコンソールでも壊れないようにする */
function ascii(v) {
  return JSON.stringify(v).replace(/[^\x20-\x7e]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

let failed = 0;
function check(name, actual, expected) {
  const ok = ascii(actual) === ascii(expected);
  if (!ok) {
    failed++;
    console.log(`FAIL ${name}`);
    console.log(`  expected ${ascii(expected)}`);
    console.log(`  actual   ${ascii(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// ── まずこれだけ ────────────────────────────────
const knit = { wash: "151", bleach: "200", tumble: "300", natural: "445", iron: "510" };
const h1 = buildHighlight(knit);
check("highlight.headline", h1.headline, "40℃まで・弱いコースで洗えます");
check("highlight.forbidden", h1.forbidden, ["漂白剤", "乾燥機"]);
check("highlight.rows.count", h1.rows.length, 2);
check("highlight.missing", h1.missing, ["dryclean", "wetclean"]);
check("highlight.homeWashBlocked", h1.homeWashBlocked, false);

const coat = { wash: "100", bleach: "200", tumble: "300", natural: "425", iron: "500" };
const h2 = buildHighlight(coat);
check("highlight.nohome.blocked", h2.homeWashBlocked, true);
check("highlight.nohome.forbidden.has.iron", h2.forbidden.includes("アイロン"), true);

check("highlight.empty", buildHighlight({}).empty, true);

// ── まとめて洗う ────────────────────────────────
const shirt = { wash: "150", bleach: "210", tumble: "310", natural: "440", iron: "520" };
const denim = { wash: "140", bleach: "200", tumble: "300", natural: "440", iron: "520" };
const silk = { wash: "110", bleach: "200", tumble: "300", natural: "425", iron: "510" };
const hoodie = { wash: "150", tumble: "310", natural: "440", iron: "520" }; // 漂白の表示なし

const r1 = combineWash([
  { id: "a", name: "A", selection: shirt },
  { id: "b", name: "B", selection: denim },
  { id: "c", name: "C", selection: knit },
]);
check("combine.ok", r1.ok, true);
// 上限は最も低い 30℃、強さは最も弱い「弱いコース」
check("combine.temp", r1.rows.find((r) => r.key === "temp").value, "30℃まで");
check("combine.action", r1.rows.find((r) => r.key === "action").value, "弱いコース");
// 1着でも禁止なら漂白も乾燥機も不可
check("combine.bleach", r1.rows.find((r) => r.key === "bleach").value, "できません");
check("combine.tumble", r1.rows.find((r) => r.key === "tumble").value, "できません");
// 干し方とアイロンは服ごと
check("combine.perGarment.count", r1.perGarment.length, 3);

// 手洗いの服を混ぜたら、洗濯機のコースに丸めずに止める
const r2 = combineWash([
  { id: "a", name: "A", selection: shirt },
  { id: "s", name: "S", selection: silk },
]);
check("combine.hand.blocked", r2.ok, false);
check(
  "combine.hand.kind",
  r2.notices.filter((n) => n.severity === "stop").map((n) => n.kind),
  ["handOnly"],
);
check("combine.hand.removable", r2.removable.ids, ["s"]);

// 全部が手洗いなら、手洗いで一緒に洗える
const r3 = combineWash([
  { id: "s", name: "S", selection: silk },
  { id: "s2", name: "S2", selection: { ...silk, wash: "110" } },
]);
check("combine.allhand.ok", r3.ok, true);
check("combine.allhand.flag", r3.handOnly, true);

// 家庭洗濯禁止は必ず外す
const r4 = combineWash([
  { id: "a", name: "A", selection: shirt },
  { id: "c", name: "C", selection: coat },
]);
check("combine.nohome.blocked", r4.ok, false);
check(
  "combine.nohome.kind",
  r4.notices.filter((n) => n.severity === "stop").map((n) => n.kind),
  ["nohome"],
);

// 表示がない分類は「できる」にしない
const r5 = combineWash([
  { id: "a", name: "A", selection: shirt },
  { id: "h", name: "H", selection: hoodie },
]);
check("combine.unknown.ok", r5.ok, true);
check("combine.unknown.bleach", r5.rows.find((r) => r.key === "bleach").value, "わかりません");
check(
  "combine.unknown.notice",
  r5.notices.filter((n) => n.severity === "warn").map((n) => n.kind),
  ["noBleachSymbol"],
);

// 洗濯の記号が無い服は判定から外す（表示がない＝制限がない、ではない）
const r6 = combineWash([
  { id: "a", name: "A", selection: shirt },
  { id: "x", name: "X", selection: { bleach: "200" } },
]);
check("combine.nowash.blocked", r6.ok, false);
check(
  "combine.nowash.kind",
  r6.notices.filter((n) => n.severity === "stop").map((n) => n.kind),
  ["noWashSymbol"],
);

check("combine.single", combineWash([{ id: "a", name: "A", selection: shirt }]).ok, false);

console.log(failed === 0 ? "ALL OK" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
