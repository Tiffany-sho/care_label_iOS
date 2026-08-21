/**
 * 【一回きりの実験】日陰の斜線の閾値を、**出荷する実装で**合成データから引き直す。
 *
 * いままでの 0.145 は測定側の Python 実装（tools/probe_shade.py）で出した値だった。
 * その実装は**フラットフィールド補正をしない素の大津**で二値化しているのに対し、
 * 出荷する lib/vision/inside.ts の shadeScore は補正後のマスクを見る。
 * **同じ量を測っていないので、閾値をそのまま持ってくるのは校正がずれる。**
 * 実写の負例1件で 0.121（Python）と 0.1444（TS）と食い違ったのがその現れ。
 *
 * 使い方:
 *   python tools/dump_raw.py dataset/synth tools/.build/parity
 *   node tools/build_vision.cjs
 *   node tools/sweep_shade.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision");
const { binarize } = require(path.join(V, "vision/binarize.js"));
const { labelComponents } = require(path.join(V, "vision/components.js"));
const S = require(path.join(V, "vision/shape.js"));
const I = require(path.join(V, "vision/inside.js"));
const { SYMBOL_BY_CODE } = require(path.join(V, "symbols.js"));

const meta = JSON.parse(fs.readFileSync("tools/.build/parity.json", "utf-8"));
const bin = fs.readFileSync("tools/.build/parity.bin");
const rows = [];
for (const r of meta.records) {
  const g = SYMBOL_BY_CODE[r.code]?.glyph;
  if (!g || g.base !== "natural") continue;
  const img = {
    data: new Uint8Array(bin.buffer, bin.byteOffset + r.offset, r.w * r.h),
    width: r.w,
    height: r.h,
  };
  const mask = binarize(img);
  const lab = labelComponents(mask, r.w, r.h);
  const body = S.bodyComponent(lab);
  if (!body) continue;
  const sc = I.shadeScore(mask, r.w, r.h, body);
  if (sc === null) continue;
  rows.push({ sev: Number(r.file.slice(1, 2)), shade: Boolean(g.shade), sc });
}
const q = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { min: s[0], p50: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
};
console.log(`自然乾燥 ${rows.length}件（合成、劣化度 s0〜s5）`);
for (let sev = 0; sev <= 5; sev++) {
  const y = rows.filter((r) => r.sev === sev && r.shade).map((r) => r.sc);
  const n = rows.filter((r) => r.sev === sev && !r.shade).map((r) => r.sc);
  if (!y.length || !n.length) continue;
  const a = q(y);
  const b = q(n);
  const sep = a.min > b.max ? "分離" : "重なる";
  console.log(
    `  s${sev}  日陰あり ${a.min.toFixed(3)}/${a.p50.toFixed(3)}/${a.max.toFixed(3)}  ` +
      `日陰なし ${b.min.toFixed(3)}/${b.p50.toFixed(3)}/${b.max.toFixed(3)}  ${sep}`,
  );
}
const yes = rows.filter((r) => r.shade).map((r) => r.sc);
const no = rows.filter((r) => !r.shade).map((r) => r.sc);
console.log(`\n全体  日陰あり n=${yes.length}  日陰なし n=${no.length}`);
let best = { th: 0, ok: -1, fp: 0, fn: 0 };
for (let th = -0.2; th <= 0.6; th += 0.005) {
  const fp = no.filter((v) => v >= th).length;
  const fn = yes.filter((v) => v < th).length;
  const ok = yes.length + no.length - fp - fn;
  if (ok > best.ok) best = { th, ok, fp, fn };
}
console.log(
  `最良の閾値 ${best.th.toFixed(3)}  誤り ${best.fp + best.fn}/${rows.length}` +
    `（誤検出 ${best.fp} / 見落とし ${best.fn}）`,
);
for (const th of [0.10, 0.12, 0.145, 0.16, 0.18, 0.20, 0.25]) {
  const fp = no.filter((v) => v >= th).length;
  const fn = yes.filter((v) => v < th).length;
  console.log(`  閾値 ${th.toFixed(3)}: 誤検出 ${fp} / 見落とし ${fn}  計 ${fp + fn}`);
}
