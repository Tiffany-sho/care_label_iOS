/**
 * 「傾けた枠で切り出す」経路が正しいかを、実写で確かめる。
 *
 * 傾き0で画像全体を取り直したものは元と同じ結果になるはず。
 * さらに、写真をわざと傾けてから同じ角度の枠で取り直したら、
 * 傾けていないときと同じくらい読めるはず。読めなければ符号か原点が違う。
 *
 * 使い方:
 *   node tools/build_vision.cjs
 *   node tools/verify_oriented.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision/vision");
const { readTag } = require(path.join(V, "pipeline.js"));
const { resolveReading } = require(path.join(V, "resolve.js"));
const { loadTemplates } = require(path.join(V, "match.js"));
const { rotateGray, sampleOrientedRect } = require(path.join(V, "rotate.js"));

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/truth.json"), "utf-8"));
const rawDir = process.argv[2] || "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));

function load(it) {
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  return {
    data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h),
    width: it.w,
    height: it.h,
  };
}

function hits(img, want) {
  const got = readTag(img, templates).readings.map((r) => resolveReading(r).code).filter(Boolean);
  const pool = [...want.codes];
  let n = 0;
  for (const c of got) {
    const i = pool.indexOf(c);
    if (i >= 0) {
      pool.splice(i, 1);
      n++;
    }
  }
  return n;
}

const TILT = 10;
let base = 0;
let flat = 0;
const recovered = { plus: 0, minus: 0 };
let total = 0;

for (const it of meta.items) {
  const want = truth[it.name];
  if (!want) continue;
  const img = load(it);
  total += want.codes.length;
  base += hits(img, want);

  // 傾き0で取り直す（元と同じはず）
  const whole = { cx: (img.width - 1) / 2, cy: (img.height - 1) / 2, w: img.width, h: img.height, angleDeg: 0 };
  flat += hits(sampleOrientedRect(img, whole, img.width, img.height), want);

  // わざと傾けてから、同じ角度の枠で取り直す
  const tilted = rotateGray(img, TILT);
  for (const sign of [1, -1]) {
    const r = { ...whole, angleDeg: sign * TILT };
    const key = sign > 0 ? "plus" : "minus";
    recovered[key] += hits(sampleOrientedRect(tilted, r, img.width, img.height), want);
  }
}

console.log(`正解 ${total}`);
console.log(`  そのまま               ${base}`);
console.log(`  傾き0で取り直し        ${flat}`);
console.log(`  ${TILT}度傾けて +${TILT}度の枠   ${recovered.plus}`);
console.log(`  ${TILT}度傾けて -${TILT}度の枠   ${recovered.minus}`);
