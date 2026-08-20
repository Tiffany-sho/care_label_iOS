/**
 * 切り出しのしきい値を、机上ではなく実測で決める。
 *
 * 記号の viewBox 上の比率から「1.5 倍で足りるはず」と決めたら、
 * 文字入り・文字なしの両方で大きく悪化した。劣化・回転・二値化のあとでは
 * 比率が素直に効かないので、振って測る。
 *
 * 指標は「記号を過不足なく切り出せた帯の割合」と「確定できた率」。
 * 前者だけを見ると、多く切り出して確定できないだけの設定が勝ってしまう。
 *
 * 使い方:
 *   node tools/sweep_segment.cjs
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

function loadSet(prefix) {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, prefix + ".json"), "utf-8"));
  const blob = fs.readFileSync(path.join(ROOT, prefix + ".bin"));
  return meta.records.map((r) => ({
    img: {
      data: new Uint8Array(blob.buffer, blob.byteOffset + r.offset, r.w * r.h),
      width: r.w,
      height: r.h,
    },
    codes: r.codes,
  }));
}

function evaluate(records, opts) {
  let exact = 0;
  let resolved = 0;
  let wrong = 0;
  let expected = 0;
  for (const rec of records) {
    const seg = segmentSymbolsDebug(rec.img, opts);
    expected += rec.codes.length;
    if (seg.boxes.length !== rec.codes.length) continue;
    exact++;
    for (let i = 0; i < seg.boxes.length; i++) {
      const crop = cropGray(rec.img, seg.boxes[i], 3);
      const r = resolveReading(readSymbol(crop, templates));
      if (r.code === null) continue;
      resolved++;
      if (r.code !== rec.codes[i]) wrong++;
    }
  }
  return {
    exactPct: (100 * exact) / records.length,
    resolvedPct: (100 * resolved) / expected,
    correctPct: resolved === 0 ? 0 : (100 * (resolved - wrong)) / resolved,
  };
}

const labels = loadSet("tools/.build/labels");
const tags = loadSet("tools/.build/tags");

const grid = [];
for (const bandBelow of [0.45, 0.7]) {
  for (const maxHeightRatio of [1.6, 2.0, 2.4]) {
    for (const belowOutline of [0.2, 0.3, 0.4, 0.6]) {
      grid.push({ bandBelow, maxHeightRatio, topAlign: null, belowOutline });
    }
  }
}

const rows = [];
for (const opts of grid) {
  const L = evaluate(labels, opts);
  const T = evaluate(tags, opts);
  // 文字入り（実物に近い）を主、文字なしを従として見る
  const score = L.resolvedPct * 2 + L.exactPct + T.resolvedPct;
  rows.push({ opts, L, T, score });
}
rows.sort((a, b) => b.score - a.score);

console.log("band  maxH  below | labels: exact resolved correct | tags: exact resolved");
for (const r of rows.slice(0, 12)) {
  const o = r.opts;
  console.log(
    `${o.bandBelow.toFixed(2)}  ${o.maxHeightRatio.toFixed(1)}   ` +
      `${o.belowOutline.toFixed(2)}  | ` +
      `${r.L.exactPct.toFixed(0).padStart(5)}% ${r.L.resolvedPct.toFixed(0).padStart(8)}% ` +
      `${r.L.correctPct.toFixed(0).padStart(7)}% | ` +
      `${r.T.exactPct.toFixed(0).padStart(5)}% ${r.T.resolvedPct.toFixed(0).padStart(8)}%`,
  );
}
