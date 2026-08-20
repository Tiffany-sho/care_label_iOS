/**
 * 「中身のない丸」だけを読み飛ばし、**表にある記号は1つも落とさない**ことを確かめる。
 *
 * クリーニングの表示（丸に P / F / W、その禁止）は今までどおり出さなければならない。
 * 43記号すべてを readSymbol に通して、outOfTable が立たないことを見る。
 *
 * 使い方: node tools/verify_outoftable.cjs
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision/vision");
const { readSymbol } = require(path.join(V, "reader.js"));
const { loadTemplates } = require(path.join(V, "match.js"));
const sharp = require("sharp");

const templates = loadTemplates(
  JSON.parse(fs.readFileSync(path.join(ROOT, "lib/vision/templates.json"), "utf-8")),
);
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "dataset/clean/index.json"), "utf-8"));
const synth = JSON.parse(fs.readFileSync(path.join(ROOT, "dataset/synth/manifest.json"), "utf-8"));

async function run(dir, items, label) {
  let flagged = 0;
  const bad = new Map();
  for (const it of items) {
    const { data, info } = await sharp(path.join(ROOT, dir, it.file))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const r = readSymbol(
      { data: new Uint8Array(data), width: info.width, height: info.height },
      templates,
    );
    if (r.outOfTable) {
      flagged++;
      bad.set(it.code, (bad.get(it.code) ?? 0) + 1);
    }
  }
  const detail = [...bad.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`);
  // 落としてはいけないのはクリーニングの表示（6xx / 7xx）。
  // それ以外の基本形が丸と読み違えられて落ちるのは、もともと誤りだったもの。
  const cleaning = [...bad.entries()]
    .filter(([c]) => c.startsWith("6") || c.startsWith("7"))
    .reduce((a, [, n]) => a + n, 0);
  console.log(
    `${label}  ${items.length} 枚 / 読み飛ばされた ${flagged}` +
      (flagged ? "   " + detail.join(" ") : "") +
      `   うちクリーニングの表示 ${cleaning}`,
  );
  return cleaning;
}

(async () => {
  const a = await run("dataset/clean", index.items, "きれいな画像 ");
  const b = await run("dataset/synth", synth.items, "劣化させた画像");
  const total = a + b;
  console.log(
    total === 0
      ? "OK: クリーニングの表示は1枚も落ちていない"
      : `NG: クリーニングの表示を ${total} 枚で落としている`,
  );
  process.exit(total === 0 ? 0 : 1);
})();
