/**
 * 【一回きりの実験】基本形の正解率を、線の太さ・傾き・ぼかしの組み合わせで振る。
 *
 * **結果は lib/vision/reader.ts の READ_ANGLES / READ_BLUR_DIVISOR と
 * lib/vision/match.ts の STROKE_VARIANTS に反映済み。**
 *   何もしない 84.6% -> 太さ [-2,0,2,4] 91.2% -> ＋傾き±6度 94.5%
 *   -> ＋ぼかし（短辺/18）97.8%
 * テンプレートや正規化の寸法を変えたときだけ、振り直すために回す。
 *
 * 使い方: BLURS=0,18 ROTS=-6,-3,0,3,6 VARIANTS=-2,0,2,4 node tools/sweep_transforms.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision");
const { binarize, decideInkDark, blurGray } = require(path.join(V, "vision/binarize.js"));
const { labelComponents } = require(path.join(V, "vision/components.js"));
const { cropGray } = require(path.join(V, "vision/segment.js"));
const M = require(path.join(V, "vision/match.js"));
const S = require(path.join(V, "vision/shape.js"));
const { rotateGray } = require(path.join(V, "vision/rotate.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));

const CW = M.CANON_W, CH = M.CANON_H;
const VARIANTS = (process.env.VARIANTS || "-2,0,2").split(",").map(Number);

function morph(patch, steps) {
  if (steps === 0) return patch;
  const grow = steps > 0;
  let cur = patch;
  for (let s = 0; s < Math.abs(steps); s++) {
    const out = new Uint8Array(cur.length);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        let hit = grow ? 0 : 1;
        for (let dy = -1; dy <= 1 && hit === (grow ? 0 : 1); dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = Math.min(Math.max(y + dy, 0), CH - 1);
            const xx = Math.min(Math.max(x + dx, 0), CW - 1);
            const on = cur[yy * CW + xx] > 127;
            if (grow ? on : !on) { hit = grow ? 1 : 0; break; }
          }
        }
        out[y * CW + x] = hit ? 255 : 0;
      }
    }
    cur = out;
  }
  return cur;
}
function toVec(raw) {
  const n = raw.length;
  const v = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += raw[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) { v[i] = raw[i] - mean; sq += v[i] * v[i]; }
  const norm = Math.max(Math.sqrt(sq), 1e-6);
  for (let i = 0; i < n; i++) v[i] /= norm;
  return v;
}
function patchOf(mask, w, h) {
  const p = M.canonicalPatch(mask, w, h);
  if (!p) return null;
  const raw = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) raw[i] = Math.max(0, Math.min(255, Math.round(p[i])));
  return raw;
}

function parts(img, inkDark) {
  const mask = binarize(img, inkDark);
  const lab = labelComponents(mask, img.width, img.height);
  const body = S.bodyComponent(lab);
  if (!body) return null;
  const sub = S.componentMask(lab, img.width, body);
  return { mask, lab, body, sub };
}

const cdir = "tools/.build/cleanraw";
const cmeta = JSON.parse(fs.readFileSync(path.join(cdir, "index.json"), "utf-8"));
const tplA = [], tplB = [];
for (const it of cmeta.items) {
  if (process.env.FONT0 === "1" && it.font !== 0) continue;
  const buf = fs.readFileSync(path.join(cdir, it.file));
  const img = { data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h), width: it.w, height: it.h };
  const p = parts(img);
  const g = SYMBOL_BY_CODE[it.code].glyph;
  const rawA = patchOf(p.mask, img.width, img.height);
  const rawB = patchOf(p.sub.mask, p.sub.w, p.sub.h);
  for (const s of VARIANTS) {
    if (rawA) tplA.push({ code: it.code, base: g.base, forb: Boolean(g.forbidden), vec: toVec(morph(rawA, s)) });
    if (rawB) tplB.push({ code: it.code, base: g.base, forb: Boolean(g.forbidden), vec: toVec(morph(rawB, s)) });
  }
}
console.log(`templates A=${tplA.length} B=${tplB.length}`);

const rawDir = "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));
const boxes = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/boxes.json"), "utf-8"));
const norm = (s) => (s === "tumble" || s === "natural" ? "square" : s);

function best(v, list, filt) {
  let b = null, bc = -2;
  for (const t of list) {
    if (filt && t.forb !== filt.forb) continue;
    let acc = 0;
    for (let i = 0; i < v.length; i++) acc += v[i] * t.vec[i];
    if (acc > bc) { bc = acc; b = t; }
  }
  return { t: b, corr: bc };
}

const TOLS = [0.02, 0.03, 0.04, 0.05];
const xstat = TOLS.map(() => ({ vals: [] }));
let n = 0;
const score = { A: 0, B: 0, C: 0, code: 0, forb: 0 };
const wrongB = new Map();
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
    const [x0, y0, x1, y1] = entry.box;
    const crop = cropGray(img, { x0, y0, x1, y1 }, 3);
    const p = parts(crop, inkDark);
    if (!p) return;
    let va = M.normalise(p.mask, crop.width, crop.height);
    const ROTS = (process.env.ROTS || "0").split(",").map(Number);
    let raBest = null;
    const BLURS = (process.env.BLURS || "0").split(",").map(Number);
    for (const div of BLURS) {
      const base = div <= 0 ? crop : blurGray(crop, Math.max(1, Math.round(Math.min(crop.width, crop.height) / div)));
      for (const deg of ROTS) {
        const g2 = deg === 0 ? base : rotateGray(base, deg);
        const m2 = binarize(g2, inkDark);
        const v2 = M.normalise(m2, g2.width, g2.height);
        if (!v2) continue;
        const r2 = best(v2, tplA);
        if (!raBest || r2.corr > raBest.corr) raBest = r2;
      }
    }
    const vb = M.normalise(p.sub.mask, p.sub.w, p.sub.h);
    if (!va || !vb) return;
    n++;
    const ra = raBest || best(va, tplA);
    const rb = best(vb, tplB);
    if (ra.t.code === entry.code) score.code++;
    if (Boolean(SYMBOL_BY_CODE[ra.t.code].glyph.forbidden) === Boolean(g.forbidden)) score.forb++;
    if (norm(ra.t.base) === norm(g.base)) score.A++;
    else console.log(`  A-NG ${it.name}#${i} truth=${entry.code}(${g.base}) got=${ra.t.code}(${ra.t.base}) corr=${ra.corr.toFixed(2)}`);
    if (norm(rb.t.base) === norm(g.base)) score.B++;
    else {
      wrongB.set(`${g.base}->${rb.t.base}`, (wrongB.get(`${g.base}->${rb.t.base}`) || 0) + 1);
    }
    TOLS.forEach((tol, k) => {
      const c = S.crossScore(p.sub.mask, p.sub.w, p.sub.h, tol);
      xstat[k].vals.push({ forb: Boolean(g.forbidden), v: Math.min(c[0], c[1]) });
    });
    rows.push({ name: `${it.name}#${i}`, code: entry.code, base: g.base, forb: Boolean(g.forbidden), vb, corrB: rb.corr, gotB: rb.t });
  });
}
console.log(`\nbase A (whole glyph): ${score.A}/${n} ${((100 * score.A) / n).toFixed(1)}%`);
console.log(`forbidden via NCC  : ${score.forb}/${n} ${((100 * score.forb) / n).toFixed(1)}%`);
console.log(`code top-1         : ${score.code}/${n} ${((100 * score.code) / n).toFixed(1)}%`);
console.log(`base B (body only)  : ${score.B}/${n} ${((100 * score.B) / n).toFixed(1)}%`);
console.log("B wrong: " + [...wrongB.entries()].map(([a, b]) => `${a}:${b}`).join("  "));

console.log("\ncrossScore separation by tolerance:");
TOLS.forEach((tol, k) => {
  const yes = xstat[k].vals.filter((r) => r.forb).map((r) => r.v);
  const no = xstat[k].vals.filter((r) => !r.forb).map((r) => r.v);
  let bestTh = 0, bestAcc = 0;
  for (let th = 0.5; th <= 1.0; th += 0.01) {
    const acc = yes.filter((v) => v >= th).length + no.filter((v) => v < th).length;
    if (acc > bestAcc) { bestAcc = acc; bestTh = th; }
  }
  console.log(`  tol=${tol}  forbidden ${Math.min(...yes).toFixed(2)}..${Math.max(...yes).toFixed(2)}  normal ${Math.min(...no).toFixed(2)}..${Math.max(...no).toFixed(2)}  best th=${bestTh.toFixed(2)} acc=${bestAcc}/${yes.length + no.length}`);
});
