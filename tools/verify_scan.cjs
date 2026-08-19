/**
 * 合成タグ画像で Stage 1〜4 を通しで動かす。
 *
 * これは「実写で動く」証明ではない。合成の帯でしか測っていないので、
 * 言えるのは「コードが通り、記号数と符号がどのくらい取れるか」まで。
 * 実物のタグでの評価は未実施（tools/README.md 参照）。
 *
 * 使い方:
 *   python tools/synth_tag.py dataset/clean tools/.build/tags 10
 *   npx tsc lib/symbols.ts lib/vision/*.ts --outDir tools/.build/vision ...
 *   node tools/verify_scan.cjs [out.md]
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PREFIX = path.join(ROOT, "tools/.build/tags");
const VISION = path.join(ROOT, "tools/.build/vision");

const { segmentSymbols, cropGray } = require(path.join(VISION, "vision/segment.js"));
const { readSymbol } = require(path.join(VISION, "vision/reader.js"));
const { resolveReading } = require(path.join(VISION, "vision/resolve.js"));
const { loadTemplates } = require(path.join(VISION, "vision/match.js"));

const meta = JSON.parse(fs.readFileSync(PREFIX + ".json", "utf-8"));
const blob = fs.readFileSync(PREFIX + ".bin");
const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);

const stats = new Map();
for (const px of meta.px_per_symbol) {
  stats.set(px, { strips: 0, expected: 0, found: 0, exact: 0, resolved: 0, wrong: 0 });
}

for (const r of meta.records) {
  const data = new Uint8Array(blob.buffer, blob.byteOffset + r.offset, r.w * r.h);
  const img = { data, width: r.w, height: r.h };
  const boxes = segmentSymbols(img);

  const st = stats.get(r.px_per_symbol);
  st.strips++;
  st.expected += r.codes.length;
  st.found += boxes.length;
  if (boxes.length === r.codes.length) st.exact++;

  // 切り出しの左右順と正解の並び順を対応させる。数が合わない帯は
  // 位置合わせが曖昧になるので、符号の正誤は数が一致した帯だけで数える。
  if (boxes.length !== r.codes.length) continue;
  for (let i = 0; i < boxes.length; i++) {
    const crop = cropGray(img, boxes[i], 3);
    const resolved = resolveReading(readSymbol(crop, templates));
    if (resolved.code === null) continue;
    st.resolved++;
    if (resolved.code !== r.codes[i]) st.wrong++;
  }
}

const lines = [];
lines.push(
  "| 1記号のpx | 帯 | 記号を過不足なく切り出せた帯 | 確定できた率 | 確定分の正解率 | 確定分の誤り |",
);
lines.push("|---|---|---|---|---|---|");
const ascii = [];
for (const px of meta.px_per_symbol) {
  const st = stats.get(px);
  const okStrip = (100 * st.exact) / Math.max(1, st.strips);
  const resolveRate = (100 * st.resolved) / Math.max(1, st.expected);
  const codeAcc =
    st.resolved === 0 ? 0 : (100 * (st.resolved - st.wrong)) / st.resolved;
  lines.push(
    `| ${px}px | ${st.strips} | ${okStrip.toFixed(0)}% (${st.exact}/${st.strips}) | ` +
      `${resolveRate.toFixed(0)}% (${st.resolved}/${st.expected}) | ` +
      `${codeAcc.toFixed(1)}% (${st.resolved - st.wrong}/${st.resolved}) | ${st.wrong} |`,
  );
  ascii.push(
    `  ${String(px).padStart(3)}px  segmented ${okStrip.toFixed(0)}%  ` +
      `resolved ${resolveRate.toFixed(0)}%  correct ${codeAcc.toFixed(1)}%  wrong ${st.wrong}`,
  );
}

const report = lines.join("\n");
// コンソールは cp932 なので ASCII だけ出す。表は md ファイル側で読む。
console.log(ascii.join("\n"));

const out = process.argv[2];
if (out) {
  fs.writeFileSync(
    out,
    "# 合成タグ画像での通し実行（Stage 1〜4）\n\n" +
      "1記号ずつではなく、6記号を横一列に並べた帯を合成して、検出→切り出し→分類→射影まで通した。\n" +
      "ぼけ・コントラスト・ノイズ・回転は s2 相当に固定。\n\n" +
      "**これは実写での性能ではない。** 合成の帯で「コードが通り、どのくらい取れるか」を見ただけ。\n" +
      "実物のタグでの評価は未実施。\n\n" +
      report +
      "\n",
    "utf-8",
  );
  console.log("\nwrote " + out);
}
