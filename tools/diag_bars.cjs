/**
 * 【診断】下線の本数の数え方を比べる。`countBars` を触るたびに回す。
 *
 * 実写の tub / circle 全件で、いまの実装と別案を並べて数える。
 * 2026-08-21 時点: いまの実装 36/46（うち4件は禁止記号の棄却の巻き添えで、
 * 数えるところまで到達していない。到達したぶんでは 36/42 = 85.7%）。
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
const S = require(path.join(V, "vision/shape.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));
const templates = M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")));

const BAND = Number(process.env.BAND || 0.45);
const MINW = Number(process.env.MINW || 0.40);
const CUT = Number(process.env.CUT || 0.45);
const THICK = Number(process.env.THICK || 1.8);
const GMINW = Number(process.env.GMINW || 0.35);
const GCONTRAST = Number(process.env.GCONTRAST || 12);
const GSHARE = Number(process.env.GSHARE || 0.5);

/**
 * 外形の下にある帯を**縦方向に走査**して下線を数える。
 *
 * 行プロファイルで数えると、傾いた下線で2本が1つの塊に潰れる（実測で
 * 152 を 2->1、2->0 と数え落とす）。写真は必ず数度傾くので、これは常に起きる。
 * 1列だけ縦に見れば、傾いていても「線・すき間・線」の並びはそのまま残る。
 * 列ごとに数えて、いちばん多く出た本数を採る。
 */
function barsByColumn(mask, w, h, body, strokeW) {
  const bw = body.x1 - body.x0 + 1;
  const y0 = body.y1 + 1;
  const y1 = h - 1;
  if (y1 - y0 < 2) return 0;
  // 下線のある x 範囲を先に求める（外形より狭い）
  let bx0 = w, bx1 = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = body.x0; x <= body.x1; x++) {
      if (mask[y * w + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
    }
  }
  if (bx1 < 0 || bx1 - bx0 + 1 < MINW * bw) return 0;
  const pad = Math.round(0.2 * (bx1 - bx0 + 1));
  const counts = [];
  for (let x = bx0 + pad; x <= bx1 - pad; x++) {
    let runs = 0, prev = false, thick = 0;
    for (let y = y0; y <= y1; y++) {
      const on = mask[y * w + x] === 1;
      if (on && !prev) { runs++; thick = 1; }
      else if (on) thick++;
      // 2本がくっついた塊は、太さで2本とみなす
      if (!on && prev && thick > THICK * strokeW) runs++;
      prev = on;
    }
    if (prev && thick > THICK * strokeW) runs++;
    counts.push(Math.min(runs, 2));
  }
  if (counts.length === 0) return 0;
  const tally = [0, 0, 0];
  for (const c of counts) tally[c]++;
  let best = 0;
  for (let i = 1; i <= 2; i++) if (tally[i] > tally[best]) best = i;
  return best;
}

/**
 * 下線を**グレー画像の濃さ**で数える。
 *
 * 二値化すると、印字が近い2本の下線が1つの帯にくっついて、行プロファイルにも
 * 谷が残らない（実測 test_9#0 は28行の帯で、へこみが1つも無い）。
 * ところが元のグレー画像には、2本の間に明るい尾根がはっきり残っている。
 * 帯の行ごとの平均の明るさを見て、暗い区間がいくつあるかを数える。
 */
function barsByGray(gray, mask, w, h, body) {
  const bw = body.x1 - body.x0 + 1;
  const y0 = body.y1 + 1;
  if (y0 >= h - 2) return null;
  // 下線のある行と x 範囲を、まずマスクで見つける
  let ya = -1, yb = -1, bx0 = w, bx1 = -1;
  for (let y = y0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = body.x0; x <= body.x1; x++) if (mask[y * w + x]) { if (a < 0) a = x; b = x; }
    if (a < 0 || (b - a + 1) < GMINW * bw) continue;
    if (ya < 0) ya = y;
    yb = y;
    if (a < bx0) bx0 = a;
    if (b > bx1) bx1 = b;
  }
  if (ya < 0 || yb - ya < 3) return ya < 0 ? 0 : 1;
  const pad = Math.round(0.15 * (bx1 - bx0 + 1));
  const prof = new Float64Array(yb - ya + 1);
  for (let y = ya; y <= yb; y++) {
    let sum = 0, n = 0;
    for (let x = bx0 + pad; x <= bx1 - pad; x++) { sum += gray[y * w + x]; n++; }
    prof[y - ya] = n > 0 ? sum / n : 255;
  }
  let mn = Infinity, mx = -Infinity;
  for (const v of prof) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (mx - mn < GCONTRAST) return 1;
  const th = mn + GSHARE * (mx - mn);
  let runs = 0, prev = false;
  for (const v of prof) { const dark = v < th; if (dark && !prev) runs++; prev = dark; }
  return Math.min(Math.max(runs, 1), 2);
}

const rawDir = "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));
const boxes = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/boxes.json"), "utf-8"));
const ANGLES = [-6, -3, 0, 3, 6];
let n = 0, okOld = 0, okNew = 0;
const bad = [];
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
    const want = g.bars;
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
    const body = S.bodyComponent(lab);
    const oldN = F.countBars(mask, lab, sharp.width, sharp.height);
    const sw = S.strokeWidth(mask, sharp.width, sharp.height, { x0: body.x0, y0: body.y0, x1: body.x1, y1: body.y1 });
    // 連結成分で数えた結果が1本のときだけ、グレーの濃さで割れないかを見る
    let newN = oldN;
    if (oldN === 1) {
      const g = barsByGray(sharp.data, mask, sharp.width, sharp.height, body);
      if (g === 2) newN = 2;
    }
    n++;
    if (oldN === want) okOld++;
    if (newN === want) okNew++;
    else bad.push(`${it.name}#${i} ${entry.code} ${g.base} want=${want} old=${oldN} new=${newN}`);
  });
}
console.log(`BAND=${BAND} MINW=${MINW} CUT=${CUT}  bars old ${okOld}/${n} ${((100*okOld)/n).toFixed(1)}%  new ${okNew}/${n} ${((100*okNew)/n).toFixed(1)}%`);
if (process.env.SHOW === "1") for (const b of bad) console.log("  " + b);
