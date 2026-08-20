/**
 * 実写10枚を正解表と突き合わせて点数にする。
 *
 * これまで実写の評価は本人の手集計に頼っていて、変更を1つ入れるたびに
 * 端末で撮り直してもらう必要があった。それでは回らないし、手集計の正解表
 * そのものにも取り違えがあった（`425` を `445` と書いてあるなど）。
 * eval/truth.json（写真を拡大して起こした正解）と突き合わせて、
 * 検出・確定・正解を機械的に出す。
 *
 * 使い方:
 *   node tools/build_vision.cjs
 *   node tools/score_real.cjs <raw_dir>
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision/vision");
const { readTag } = require(path.join(V, "pipeline.js"));
const { resolveReading } = require(path.join(V, "resolve.js"));
const { loadTemplates } = require(path.join(V, "match.js"));

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/truth.json"), "utf-8"));

const rawDir = process.argv[2] || "tools/.build/realraw";
const DIV = Number(process.env.BLUR_DIV || 0);
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));

let expected = 0;
let detected = 0;
let resolved = 0;
let correct = 0;
const missedByCode = new Map();
const wrongPairs = new Map();
const rows = [];

for (const it of meta.items) {
  const want = truth[it.name];
  if (!want) continue;
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = {
    data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h),
    width: it.w,
    height: it.h,
  };
  const tag = readTag(img, templates, DIV ? { blurDivisor: DIV } : {});
  const got = tag.readings.map((r) => resolveReading(r).code).filter(Boolean);

  // 多重集合として突き合わせる。同じ記号が2つ出るタグは無いので順序は見ない。
  const pool = [...want.codes];
  let hit = 0;
  for (const c of got) {
    const i = pool.indexOf(c);
    if (i >= 0) {
      pool.splice(i, 1);
      hit++;
    }
  }
  for (const c of pool) missedByCode.set(c, (missedByCode.get(c) ?? 0) + 1);
  for (const c of got) {
    if (!want.codes.includes(c)) {
      wrongPairs.set(c, (wrongPairs.get(c) ?? 0) + 1);
    }
  }

  expected += want.codes.length;
  detected += tag.readings.length;
  resolved += got.length;
  correct += hit;
  rows.push(
    `${it.name.padEnd(8)} 正解${String(want.codes.length).padStart(2)}  ` +
      `切出${String(tag.readings.length).padStart(2)}  確定${String(got.length).padStart(2)}  ` +
      `一致${String(hit).padStart(2)}   ${got.join(",") || "-"}`,
  );
}

console.log(rows.join("\n"));
console.log(
  `\n合計  正解${expected}  切出${detected}  確定${resolved}  一致${correct}` +
    `  (再現率 ${((100 * correct) / expected).toFixed(1)}%` +
    `, 確定分の正解率 ${resolved ? ((100 * correct) / resolved).toFixed(1) : "-"}%)`,
);
const fmt = (m) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ") || "なし";
console.log("取りこぼした記号  " + fmt(missedByCode));
console.log("余計に出した記号  " + fmt(wrongPairs));
