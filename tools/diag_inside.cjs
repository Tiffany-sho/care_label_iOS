/**
 * 【診断】桶の温度の数字・円の文字の当たり外れを、相関とマージンつきで並べる。
 *
 * lib/vision/inside.ts の INSIDE_MIN_CORRELATION（0.4）を決めた道具。
 * 中身のテンプレートを作り直したら回す。
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
const I = require(path.join(V, "vision/inside.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));
const templates = M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")));
const inside = I.loadInsideTemplates(JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/inside.json"), "utf-8")));
const rawDir = "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));
const boxes = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/boxes.json"), "utf-8"));
const ANGLES = [-6, -3, 0, 3, 6];
const rows = [];
for (const it of meta.items) {
  const list = boxes[it.name];
  if (!Array.isArray(list)) continue;
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = { data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h), width: it.w, height: it.h };
  const inkDark = decideInkDark(img);
  list.forEach((entry, i) => {
    if (!entry.code || !SYMBOL_BY_CODE[entry.code]) return;
    const g = SYMBOL_BY_CODE[entry.code].glyph;
    if (!["tub", "circle"].includes(g.base)) return;
    const want = g.base === "tub"
      ? (g.forbidden ? "X" : g.hand ? "hand" : String(g.temp))
      : (g.forbidden ? "X" : g.letter || "-");
    const [x0, y0, x1, y1] = entry.box;
    const crop = cropGray(img, { x0, y0, x1, y1 }, 3);
    const soft = blurGray(crop, Math.max(1, Math.round(Math.min(crop.width, crop.height) / 18)));
    let bc = -2, bd = 0;
    for (const src of [crop, soft]) for (const deg of ANGLES) {
      const gg = deg === 0 ? src : rotateGray(src, deg);
      const v = M.normalise(binarize(gg, inkDark), gg.width, gg.height);
      if (!v) continue;
      const hit = M.bestMatchRaw(v, templates);
      if (hit && hit.correlation > bc) { bc = hit.correlation; bd = deg; }
    }
    const sharp = bd === 0 ? crop : rotateGray(crop, bd);
    const mask = binarize(sharp, inkDark);
    const lab = labelComponents(mask, sharp.width, sharp.height);
    const m = I.classifyInside(lab, sharp.width, sharp.height, g.base, inside);
    rows.push({ key: `${it.name}#${i}`, code: entry.code, base: g.base, want, m });
    console.log(`${it.name}#${i} ${entry.code} ${g.base} want=${want} got=${m ? m.cls : "(none)"} corr=${m ? m.correlation.toFixed(3) : "-"} mg=${m ? m.margin.toFixed(3) : "-"}`);
  });
}
// 「切り出せた」ものだけを対象に、閾値ごとの当たり外れ
for (const th of [0, 0.2, 0.3, 0.4]) {
  for (const mg of [0, 0.05, 0.1]) {
    let acc = 0, used = 0, bad = 0;
    for (const r of rows) {
      if (!r.m || r.m.correlation < th || r.m.margin < mg) continue;
      used++;
      if (r.m.cls === r.want) acc++; else bad++;
    }
    console.log(`corr>=${th} margin>=${mg}: 採用${used}件 正解${acc} 誤り${bad}`);
  }
}
