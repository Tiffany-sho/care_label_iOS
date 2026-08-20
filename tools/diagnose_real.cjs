/**
 * 実写で「答えは候補の何位にいるのか」を見る。
 *
 * 棄却されているのが閾値のせいなのか、そもそもテンプレートが合っていない
 * せいなのかで、次にやることが変わる。上位3件と正解の順位を出す。
 *
 * 使い方: node tools/diagnose_real.cjs [raw_dir]
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision/vision");
const { readTag } = require(path.join(V, "pipeline.js"));
const { loadTemplates, normaliseImage } = require(path.join(V, "match.js"));
const { cropGray } = require(path.join(V, "segment.js"));

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/truth.json"), "utf-8"));
const rawDir = process.argv[2] || "tools/.build/realraw";
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));

const rankHist = new Map();
let boxes = 0;
let noVector = 0;

for (const it of meta.items) {
  const want = truth[it.name];
  if (!want) continue;
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = {
    data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h),
    width: it.w,
    height: it.h,
  };
  const tag = readTag(img, templates);
  console.log(`\n${it.name}  正解 ${want.codes.join(",")}`);
  const pool = [...want.codes];

  for (const b of tag.seg.boxes) {
    boxes++;
    const v = normaliseImage(cropGray(img, b, 3));
    if (v === null) {
      noVector++;
      console.log("    (ベクトル化できず)");
      continue;
    }
    const scored = templates
      .map((t) => {
        let acc = 0;
        for (let i = 0; i < v.length; i++) acc += v[i] * t.vector[i];
        return { code: t.code, corr: acc };
      })
      .sort((a, b2) => b2.corr - a.corr);

    // この箱に対応する正解を、まだ使っていないものから一番順位の高いもので当てる
    let bestRank = -1;
    let bestCode = null;
    for (const c of pool) {
      const r = scored.findIndex((x) => x.code === c);
      if (r >= 0 && (bestRank < 0 || r < bestRank)) {
        bestRank = r;
        bestCode = c;
      }
    }
    if (bestCode !== null) pool.splice(pool.indexOf(bestCode), 1);
    const key = bestRank < 0 ? "圏外" : bestRank === 0 ? "1位" : bestRank <= 2 ? "2-3位" : bestRank <= 9 ? "4-10位" : "11位以下";
    rankHist.set(key, (rankHist.get(key) ?? 0) + 1);
    console.log(
      `    top3 ${scored.slice(0, 3).map((x) => `${x.code}:${x.corr.toFixed(2)}`).join("  ")}` +
        `   | 正解 ${bestCode ?? "-"} は ${bestRank < 0 ? "圏外" : bestRank + 1}位`,
    );
  }
}

console.log(`\n箱 ${boxes} 個（うちベクトル化できず ${noVector}）`);
for (const k of ["1位", "2-3位", "4-10位", "11位以下", "圏外"]) {
  console.log(`  正解が ${k.padEnd(8)} : ${rankHist.get(k) ?? 0}`);
}
