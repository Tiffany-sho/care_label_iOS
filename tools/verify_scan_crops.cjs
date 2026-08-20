/**
 * 読み取り結果に付ける「切り抜きの画像」を、実写で確かめる。
 *
 * 読み取り中の画面（④）と確認の画面（⑤）は、撮った写真ではなく
 * **認識器が実際に見た画像**を出す。その画像を作っているのが
 * mobile/src/pngUri.ts と mobile/src/scan.ts の symbols/stripUri。
 * ここがずれると、人は「合っているのに直せと言われる」ことになる。
 *
 * 使い方（先に実写の下ごしらえが要る）:
 *   python tools/prep_real.py eval/photos tools/.build/realraw eval/crops.json 1400
 *   node tools/verify_scan_crops.cjs
 *
 * 出力は ASCII だけ（コンソールが cp932 のため）。
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = "tools/.build/scan";
const RAW = path.join(ROOT, "tools/.build/realraw");

if (!fs.existsSync(path.join(RAW, "index.json"))) {
  console.log("SKIP: no prepared photos at tools/.build/realraw (run tools/prep_real.py first)");
  process.exit(0);
}

const tsc = require.resolve("typescript/bin/tsc");
execFileSync(
  process.execPath,
  [
    tsc,
    "mobile/src/scan.ts",
    "mobile/src/pngUri.ts",
    "mobile/types/upng-js.d.ts",
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--skipLibCheck",
    "--downlevelIteration",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

// upng-js は mobile/node_modules にしかない。出力先からは辿れないので橋を架ける。
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "upng-js") {
    return origResolve.call(this, path.join(ROOT, "mobile/node_modules/upng-js"), ...rest);
  }
  return origResolve.call(this, request, ...rest);
};
const UPNG = require(path.join(ROOT, "mobile/node_modules/upng-js"));
const { scanGray, adoptedSymbols } = require(path.join(ROOT, OUT, "mobile/src/scan.js"));

function decodeDataUri(uri) {
  const b64 = uri.slice(uri.indexOf(",") + 1);
  const buf = Buffer.from(b64, "base64");
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return UPNG.decode(ab);
}

let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail === undefined ? "" : " " + detail}`);
  }
}

const meta = JSON.parse(fs.readFileSync(path.join(RAW, "index.json"), "utf-8"));
let totalSymbols = 0;

for (const it of meta.items) {
  const buf = fs.readFileSync(path.join(RAW, it.file));
  const img = {
    data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h),
    width: it.w,
    height: it.h,
  };
  const t0 = Date.now();
  const r = scanGray(img);
  const ms = Date.now() - t0;
  totalSymbols += r.symbols.length;

  check(`${it.name}.symbols==boxes`, r.symbols.length === r.boxes, `${r.symbols.length}/${r.boxes}`);
  check(`${it.name}.strip.isPng`, r.stripUri.startsWith("data:image/png;base64,"));

  const strip = decodeDataUri(r.stripUri);
  // 長辺 640 に収める（整数間引きなので、ぴったりではなく「超えない」）
  check(
    `${it.name}.strip.size`,
    Math.max(strip.width, strip.height) <= 640 && strip.width > 0,
    `${strip.width}x${strip.height}`,
  );
  // 縦横比が元画像から大きく崩れていない（枠の位置合わせがずれる）
  const ar0 = img.width / img.height;
  const ar1 = strip.width / strip.height;
  check(`${it.name}.strip.aspect`, Math.abs(ar0 - ar1) / ar0 < 0.05, `${ar0.toFixed(3)} vs ${ar1.toFixed(3)}`);

  let boxesInside = true;
  let cropsOk = true;
  for (const sym of r.symbols) {
    if (
      sym.box.x0 < 0 ||
      sym.box.y0 < 0 ||
      sym.box.x1 > img.width ||
      sym.box.y1 > img.height ||
      sym.box.x1 <= sym.box.x0
    ) {
      boxesInside = false;
    }
    if (!sym.uri.startsWith("data:image/png;base64,")) {
      cropsOk = false;
      continue;
    }
    const px = decodeDataUri(sym.uri);
    if (px.width < 8 || px.height < 8) cropsOk = false;
  }
  check(`${it.name}.boxes.inside`, boxesInside);
  check(`${it.name}.crops.decode`, cropsOk);

  // 確認画面の行。捨てた候補は「読めなかった」として出す
  const rows = adoptedSymbols(r);
  check(`${it.name}.rows==symbols`, rows.length === r.symbols.length, `${rows.length}`);
  const cats = rows.filter((x) => x.category !== null).map((x) => x.category);
  check(`${it.name}.rows.oneEach`, new Set(cats).size === cats.length, cats.join(","));

  console.log(`     ${it.name}: ${it.w}x${it.h} boxes=${r.boxes} hits=${r.hits.length} ${ms}ms`);
}

console.log(`symbols total ${totalSymbols}`);
console.log(failed === 0 ? "ALL OK" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
