/**
 * 【診断】基本形を指定して、上位候補の記号番号と相関、数えた属性を並べる。
 *
 * 「なぜこの記号を取り違えたのか」を1件ずつ見るための汎用の道具。
 * 使い方: node tools/diag_candidates.cjs [tub|triangle|tumble|natural|iron|circle]
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision");
const { binarize, decideInkDark, blurGray } = require(path.join(V, "vision/binarize.js"));
const { labelComponents } = require(path.join(V, "vision/components.js"));
const { rotateGray } = require(path.join(V, "vision/rotate.js"));
const { cropGray } = require(path.join(V, "vision/segment.js"));
const M = require(path.join(V, "vision/match.js"));
const F = require(path.join(V, "vision/features.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));
const templates = M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")));
const WANT = (process.argv[2] || "iron").split(",");
const rawDir = "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));
const boxes = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/boxes.json"), "utf-8"));
const ANGLES = [-6, -3, 0, 3, 6];
for (const it of meta.items) {
  const list = boxes[it.name];
  if (!Array.isArray(list)) continue;
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = { data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h), width: it.w, height: it.h };
  const inkDark = decideInkDark(img);
  list.forEach((entry, i) => {
    if (!entry.code || !SYMBOL_BY_CODE[entry.code]) return;
    const g = SYMBOL_BY_CODE[entry.code].glyph;
    if (!WANT.includes(g.base)) return;
    const [x0, y0, x1, y1] = entry.box;
    const crop = cropGray(img, { x0, y0, x1, y1 }, 3);
    const soft = blurGray(crop, Math.max(1, Math.round(Math.min(crop.width, crop.height) / 18)));
    let bv = null, bc = -2, bd = 0;
    for (const src of [crop, soft]) {
      for (const deg of ANGLES) {
        const gg = deg === 0 ? src : rotateGray(src, deg);
        const v = M.normalise(binarize(gg, inkDark), gg.width, gg.height);
        if (!v) continue;
        const hit = M.bestMatchRaw(v, templates);
        if (hit && hit.correlation > bc) { bc = hit.correlation; bv = v; bd = deg; }
      }
    }
    if (!bv) return;
    const corrs = new Map();
    for (const t of templates) {
      let acc = 0;
      for (let k = 0; k < bv.length; k++) acc += bv[k] * t.vector[k];
      if (!corrs.has(t.code) || acc > corrs.get(t.code)) corrs.set(t.code, acc);
    }
    const top = [...corrs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sharp = bd === 0 ? crop : rotateGray(crop, bd);
    const mask = binarize(sharp, inkDark);
    const lab = labelComponents(mask, sharp.width, sharp.height);
    console.log(
      `${it.name}#${i} truth=${entry.code} dots=${F.countDots(lab)} bars=${F.countBars(mask, lab, sharp.width, sharp.height)} deg=${bd} px=${crop.width}x${crop.height}  ` +
        top.map(([c, v]) => `${c}:${v.toFixed(3)}`).join(" "),
    );
  });
}
