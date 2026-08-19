/**
 * TypeScript 版の認識コアが、Python 参照実装と一致するか検証する。
 *
 * 移植バグは「だいたい合っている」形で出るので、目視でも少数サンプルでも捕まらない。
 * 合成データ2214枚すべてで bars / dots / 最近傍テンプレートを突き合わせる。
 *
 * 使い方:
 *   python tools/dump_raw.py dataset/synth tools/.build/parity
 *   npx tsc lib/vision/*.ts --outDir tools/.build/vision --module commonjs \
 *       --target es2020 --skipLibCheck --downlevelIteration
 *   node tools/verify_ts.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PREFIX = path.join(ROOT, "tools/.build/parity");
const VISION = path.join(ROOT, "tools/.build/vision");

const { countOnly } = require(path.join(VISION, "vision/reader.js"));
const { binarize } = require(path.join(VISION, "vision/binarize.js"));
const { normalise, bestMatch, loadTemplates } = require(path.join(VISION, "vision/match.js"));

const meta = JSON.parse(fs.readFileSync(PREFIX + ".json", "utf-8"));
const blob = fs.readFileSync(PREFIX + ".bin");
const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8"));
const templates = loadTemplates(bundle);

let n = 0;
let barsBad = 0;
let dotsBad = 0;
let codeBad = 0;
let corrMaxDiff = 0;
const examples = [];

for (const r of meta.records) {
  const data = new Uint8Array(blob.buffer, blob.byteOffset + r.offset, r.w * r.h);
  const img = { data, width: r.w, height: r.h };

  const counts = countOnly(img);
  const v = normalise(binarize(img), r.w, r.h);
  // 足切りを無効にして、Python 側の argmax とそのまま比較する
  const hit =
    v === null ? null : bestMatch(v, templates, { minCorrelation: -2, minMargin: -2 });
  const code = hit === null ? null : hit.template.code;
  const corr = hit === null ? null : hit.correlation;

  n++;
  if (counts.bars !== r.bars) {
    barsBad++;
    if (examples.length < 5) {
      examples.push(`bars ${r.file}: py=${r.bars} ts=${counts.bars}`);
    }
  }
  if (counts.dots !== r.dots) {
    dotsBad++;
    if (examples.length < 5) {
      examples.push(`dots ${r.file}: py=${r.dots} ts=${counts.dots}`);
    }
  }
  if (code !== r.code) {
    codeBad++;
    if (examples.length < 5) {
      examples.push(`code ${r.file}: py=${r.code} ts=${code}`);
    }
  }
  if (corr !== null && r.corr !== null) {
    corrMaxDiff = Math.max(corrMaxDiff, Math.abs(corr - r.corr));
  }
}

console.log(`compared ${n} images against the Python reference`);
console.log(`  bars mismatches : ${barsBad}`);
console.log(`  dots mismatches : ${dotsBad}`);
console.log(`  code mismatches : ${codeBad}`);
console.log(`  max |corr diff| : ${corrMaxDiff.toExponential(3)}`);
for (const e of examples) console.log("  e.g. " + e);

const ok = barsBad === 0 && dotsBad === 0 && codeBad === 0;
console.log(ok ? "PARITY OK" : "PARITY FAILED");
process.exit(ok ? 0 : 1);
