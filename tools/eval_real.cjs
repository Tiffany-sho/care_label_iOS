/**
 * 実写のタグ写真でパイプラインを走らせ、何が起きているかを可視化する。
 *
 * 合成データでいくら測っても実物との差は埋まらない。本人が撮った10枚が
 * 手に入ったので、これを基準にする。
 *
 * 使い方:
 *   node tools/build_vision.cjs
 *   node tools/eval_real.cjs <raw_dir> <out_dir>
 *
 * raw_dir には tools/prep_real.py が吐いた .raw と .json を置く。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VISION = path.join(ROOT, "tools/.build/vision");
const { segmentSymbolsDebug, cropGray } = require(path.join(VISION, "vision/segment.js"));
const { readTag } = require(path.join(VISION, "vision/pipeline.js"));
const { readSymbol } = require(path.join(VISION, "vision/reader.js"));
const { resolveReading } = require(path.join(VISION, "vision/resolve.js"));
const { loadTemplates } = require(path.join(VISION, "vision/match.js"));

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);

const rawDir = process.argv[2];
const outDir = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));
const report = [];

for (const it of meta.items) {
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = {
    data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h),
    width: it.w,
    height: it.h,
  };
  const tag = readTag(img, templates);
  const seg = tag.seg;
  const angle0 = seg.angleDeg;
  const reads = tag.readings.map((r) => {
    const res = resolveReading(r);
    return {
      px: r.glyphPixels,
      match: r.code,
      corr: r.correlation,
      margin: r.margin,
      resolved: res.code,
    };
  });
  report.push({
    name: it.name,
    size: `${it.w}x${it.h}`,
    components: seg.components,
    candidates: seg.candidates,
    rowMembers: seg.rowMembers,
    rowHeight: seg.rowHeight,
    boxes: seg.boxes,
    reads,
  });
  console.log(
    `${it.name}  ${it.w}x${it.h}  cand=${seg.candidates} rows=${seg.rows} ` +
      `rowH=${seg.rowHeight} angle=${angle0.toFixed(1)} applied=${tag.appliedAngle.toFixed(1)} boxes=${seg.boxes.length} ` +
      `resolved=${reads.filter((r) => r.resolved).length} ` +
      `meanCorr=${(reads.filter((r) => r.corr).reduce((a, r) => a + r.corr, 0) / Math.max(1, reads.filter((r) => r.corr).length)).toFixed(2)}`,
  );
  for (const r of reads) {
    console.log(
      `    ${String(r.px).padStart(4)}px match=${r.match ?? "-"} ` +
        `corr=${r.corr?.toFixed(2) ?? "-"} margin=${r.margin?.toFixed(3) ?? "-"} ` +
        `-> ${r.resolved ?? "-"}`,
    );
  }
}

fs.writeFileSync(
  path.join(outDir, "report.json"),
  JSON.stringify({ items: report }, null, 1),
  "utf-8",
);
console.log("\nwrote " + path.join(outDir, "report.json"));
