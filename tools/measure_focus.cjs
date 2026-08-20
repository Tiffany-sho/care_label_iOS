/**
 * ピントが読み取り精度にどれだけ効くかを測る。
 *
 * 「ピントが合わない」という報告を受けて、自動でピントの甘さを判定して
 * 警告を出そうとした。が、測ってみると想定と違った：
 *   - 1記号150px あれば、ぼかし半径5.0でも正解率は落ちない
 *   - 崩れるのは半径7.0（ほぼ判読不能な見た目）から
 * つまり、読み取りの律速は解像度であってピントではない。
 * 自前のラプラシアン分散も非単調で使い物にならなかったので、
 * 自動判定は入れず、この表だけ残す。
 *
 * 使い方:
 *   python tools/synth_focus.py dataset/clean tools/.build/focus 8
 *   node tools/build_vision.cjs
 *   node tools/measure_focus.cjs [out.md]
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VISION = path.join(ROOT, "tools/.build/vision");
const { segmentSymbolsDebug, cropGray } = require(path.join(VISION, "vision/segment.js"));
const { readSymbol } = require(path.join(VISION, "vision/reader.js"));
const { resolveReading } = require(path.join(VISION, "vision/resolve.js"));
const { loadTemplates } = require(path.join(VISION, "vision/match.js"));

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/.build/focus.json"), "utf-8"));
const blob = fs.readFileSync(path.join(ROOT, "tools/.build/focus.bin"));

const byBlur = new Map();
for (const r of meta.records) {
  const data = new Uint8Array(blob.buffer, blob.byteOffset + r.offset, r.w * r.h);
  const img = { data, width: r.w, height: r.h };
  const seg = segmentSymbolsDebug(img);
  let resolved = 0;
  let correct = 0;
  if (seg.boxes.length === r.codes.length) {
    for (let i = 0; i < seg.boxes.length; i++) {
      const res = resolveReading(readSymbol(cropGray(img, seg.boxes[i], 3), templates));
      if (res.code === null) continue;
      resolved++;
      if (res.code === r.codes[i]) correct++;
    }
  }
  if (!byBlur.has(r.blur)) byBlur.set(r.blur, { n: 0, seg: 0, resolved: 0, correct: 0, expected: 0 });
  const st = byBlur.get(r.blur);
  st.n++;
  st.expected += r.codes.length;
  if (seg.boxes.length === r.codes.length) st.seg++;
  st.resolved += resolved;
  st.correct += correct;
}

const lines = [];
lines.push("| ぼかし半径 | 記号を過不足なく切り出せた率 | 確定できた率 | 期待6個に対する正解数の割合 |");
lines.push("|---|---|---|---|");
const ascii = [];
for (const blur of [...byBlur.keys()].sort((a, b) => a - b)) {
  const st = byBlur.get(blur);
  const segPct = (100 * st.seg) / st.n;
  const resPct = (100 * st.resolved) / st.expected;
  const corPct = (100 * st.correct) / st.expected;
  lines.push(
    `| ${blur.toFixed(1)} | ${segPct.toFixed(0)}% | ${resPct.toFixed(0)}% | ${corPct.toFixed(0)}% |`,
  );
  ascii.push(
    `  blur ${blur.toFixed(1).padStart(4)}  segmented ${segPct.toFixed(0).padStart(3)}%  ` +
      `resolved ${resPct.toFixed(0).padStart(3)}%  correct ${corPct.toFixed(0).padStart(3)}%`,
  );
}
console.log(ascii.join("\n"));

const out = process.argv[2];
if (out) {
  fs.writeFileSync(
    out,
    "# ピントが読み取りに与える影響\n\n" +
      "1記号150px相当に固定し、ぼかし半径だけを変えた合成タグ（各8枚）。\n" +
      "ノイズは軽微に固定してあるので、変わっているのはピントだけ。\n\n" +
      lines.join("\n") +
      "\n\n## 結論\n\n" +
      "解像度が足りていれば、**ピントは想定よりずっと効かない**。\n" +
      "半径5.0（見た目にはかなりぼけている）でも正解率は落ちず、崩れるのは半径7.0から。\n" +
      "読み取りの律速は解像度（1記号100px以上、tools/RESOLUTION.md）であって、ピントではない。\n\n" +
      "そのため、自動のピント警告は入れていない。ラプラシアン分散による判定も試したが、\n" +
      "ぼかしに対して非単調（ぼかすほど値が上がる領域がある）で、警告として信用できなかった。\n" +
      "撮った写真は人が見て判断できるよう、読み取り前に確認画面を出す方針にした。\n",
    "utf-8",
  );
  console.log("\nwrote " + out);
}
