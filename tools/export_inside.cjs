/**
 * 記号の「中身」のテンプレートを書き出す（桶の温度の数字と、円の文字だけ）。
 *
 * 中身の切り出しは、中身が外形から離れている記号でしか使えない。
 * 実測（実写91記号）: 桶の数字 7/9、円の文字 9/10。一方、手洗いの手と
 * 禁止の×は輪郭とつながって別成分にならず、切り出せない（0/5、0/9）。
 * よって**桶の数字と円の文字に限って**テンプレートを持つ。
 *
 * 使い方:
 *   python tools/clean_raw.py dataset/clean tools/.build/cleanraw
 *   node tools/export_inside.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision");
const { binarize } = require(path.join(V, "vision/binarize.js"));
const { labelComponents } = require(path.join(V, "vision/components.js"));
const I = require(path.join(V, "vision/inside.js"));
const S = require(path.join(V, "vision/shape.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));

const dir = "tools/.build/cleanraw";
const meta = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf-8"));
const seen = new Set();
const out = [];
for (const it of meta.items) {
  const g = SYMBOL_BY_CODE[it.code].glyph;
  let cls = null;
  if (g.base === "tub" && !g.forbidden && !g.hand && g.temp !== undefined) cls = String(g.temp);
  if (g.base === "circle" && !g.forbidden && g.letter) cls = g.letter;
  if (cls === null) continue;
  const key = `${g.base}|${cls}|${it.font}`;
  if (seen.has(key)) continue;
  const buf = fs.readFileSync(path.join(dir, it.file));
  const img = { data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h), width: it.w, height: it.h };
  const mask = binarize(img);
  const lab = labelComponents(mask, img.width, img.height);
  const body = S.bodyComponent(lab);
  if (!body) continue;
  const patch = I.insideByComponents(lab, img.width, img.height, body);
  if (!patch) continue;
  const [cw, ch] = I.insideCanonSize(g.base);
  const raw = I.insideBytes(patch, cw, ch);
  if (!raw) continue;
  seen.add(key);
  out.push({ base: g.base, cls, font: it.font, patch: Buffer.from(raw).toString("base64") });
}
const bundle = {
  _note: "記号の中身（桶の温度の数字・円の文字）のテンプレート。tools/export_inside.cjs が書き出す。",
  tubWidth: I.insideCanonSize("tub")[0],
  tubHeight: I.insideCanonSize("tub")[1],
  circleWidth: I.insideCanonSize("circle")[0],
  circleHeight: I.insideCanonSize("circle")[1],
  items: out,
};
const dest = path.join(ROOT, "lib/vision/inside.json");
fs.writeFileSync(dest, JSON.stringify(bundle, null, 1), "utf-8");
console.log(`wrote ${out.length} inside templates to ${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
const byCls = new Map();
for (const o of out) byCls.set(`${o.base}:${o.cls}`, (byCls.get(`${o.base}:${o.cls}`) || 0) + 1);
console.log([...byCls.entries()].map(([k, v]) => `${k}x${v}`).join("  "));
