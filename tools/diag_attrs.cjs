/**
 * 実写15枚を「属性ごと」に採点する。
 *
 * score_real.cjs は最終的な記号番号の一致だけを見るので、
 * 「基本形は当たっているのに下線だけ外した」のか「基本形から違う」のかが分からない。
 * 属性（基本形 / 禁止の× / 下線 / 点 / 温度 / 文字 / 自然乾燥の向き・本数・日陰）に
 * 分解して、どこで落としているかを数字にする。
 *
 * 位置で対応づける（記号列は左上から右下の順で、truth.json も同じ順）。
 * 切り出し個数が正解の個数と違う写真は、対応づけが信用できないので別枠にする。
 *
 * 使い方:
 *   node tools/build_vision.cjs
 *   node tools/diag_attrs.cjs [raw_dir]
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision");
const { readTag } = require(path.join(V, "vision/pipeline.js"));
const { resolveReading } = require(path.join(V, "vision/resolve.js"));
const { loadTemplates } = require(path.join(V, "vision/match.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/truth.json"), "utf-8"));

const rawDir = process.argv[2] || "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));

/** 記号番号 -> 属性 */
function attrs(code) {
  const def = SYMBOL_BY_CODE[code];
  if (!def) return null;
  const g = def.glyph;
  return {
    base: g.base,
    forbidden: Boolean(g.forbidden),
    bars: "bars" in g ? g.bars : 0,
    dots: "dots" in g ? g.dots : 0,
    temp: g.temp ?? null,
    hand: Boolean(g.hand),
    letter: g.letter ?? null,
    dir: g.dir ?? null,
    lines: g.lines ?? null,
    shade: g.shade ?? null,
    slashes: Boolean(g.slashes),
  };
}

const KEYS = ["base", "forbidden", "bars", "dots", "temp", "hand", "letter", "dir", "lines", "shade", "slashes"];
const tally = new Map();
for (const k of KEYS) tally.set(k, { n: 0, ok: 0, wrong: new Map() });
let aligned = 0;
let codeOk = 0;
const skipped = [];

for (const it of meta.items) {
  const want = truth[it.name];
  if (!want) continue;
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = {
    data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h),
    width: it.w,
    height: it.h,
  };
  const tag = readTag(img, templates);
  if (tag.readings.length !== want.codes.length) {
    skipped.push(`${it.name} boxes=${tag.readings.length} truth=${want.codes.length}`);
    continue;
  }
  console.log(`-- ${it.name}`);
  for (let i = 0; i < want.codes.length; i++) {
    const w = attrs(want.codes[i]);
    const r = tag.readings[i];
    const res = resolveReading(r);
    const p = r.code ? attrs(r.code) : null;
    aligned++;
    if (res.code === want.codes[i]) codeOk++;
    for (const k of KEYS) {
      // その基本形が持ちえない属性は数えない（正解側の基本形で判断）
      if (k === "bars" && !["tub", "circle"].includes(w.base)) continue;
      if (k === "dots" && !["tumble", "iron"].includes(w.base)) continue;
      if (k === "temp" && w.base !== "tub") continue;
      if (k === "hand" && w.base !== "tub") continue;
      if (k === "letter" && w.base !== "circle") continue;
      if ((k === "dir" || k === "lines" || k === "shade") && w.base !== "natural") continue;
      if (k === "slashes" && w.base !== "triangle") continue;
      const t = tally.get(k);
      t.n++;
      // 下線・点は測定値（reading）を優先して見る。無ければテンプレート由来。
      let got;
      if (k === "bars") got = r.bars !== null ? r.bars : p ? p.bars : null;
      else if (k === "dots") got = r.dots !== null ? r.dots : p ? p.dots : null;
      else got = p ? p[k] : null;
      if (got === w[k]) t.ok++;
      else {
        const key = `${w[k]}->${got}`;
        t.wrong.set(key, (t.wrong.get(key) || 0) + 1);
      }
    }
    const okMark = res.code === want.codes[i] ? "ok " : "NG ";
    console.log(
      `   ${okMark} truth=${want.codes[i]} match=${r.code ?? "-"} resolved=${res.code ?? "-"} ` +
        `base=${p ? p.base : "-"}/${w.base} bars=${r.bars}/${w.bars} dots=${r.dots}/${w.dots} ` +
        `corr=${r.correlation ? r.correlation.toFixed(2) : "-"} mg=${r.margin ? r.margin.toFixed(3) : "-"}`,
    );
  }
}

console.log("\n=== attribute accuracy (aligned symbols only) ===");
console.log(`aligned=${aligned}  final code correct=${codeOk} (${((100 * codeOk) / Math.max(1, aligned)).toFixed(1)}%)`);
for (const k of KEYS) {
  const t = tally.get(k);
  if (t.n === 0) continue;
  const worst = [...t.wrong.entries()].sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a}:${b}`).join("  ");
  console.log(`${k.padEnd(10)} ${String(t.ok).padStart(3)}/${String(t.n).padEnd(3)} ${((100 * t.ok) / t.n).toFixed(1).padStart(5)}%   ${worst}`);
}
if (skipped.length) {
  console.log("\nskipped (box count != truth count):");
  for (const s of skipped) console.log("  " + s);
}
