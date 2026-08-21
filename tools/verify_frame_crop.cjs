/**
 * カメラの白い枠 → 元画像の画素座標 の変換を確かめる。
 *
 * ここがずれると、白い枠に合わせたつもりの場所と違うところを読む。
 * 撮ってからでないと気づけない類の間違いなので、机上で押さえられる分は押さえる。
 *
 * ただし「実機のプレビューが本当に cover か」はここでは確かめられない。
 * それは実機で見るしかない（mobile/README.md の未検証に書いてある）。
 *
 * 出力は ASCII だけ（コンソールが cp932 のため）。
 */
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = "tools/.build/frame";

const tsc = require.resolve("typescript/bin/tsc");
execFileSync(
  process.execPath,
  [
    tsc,
    "mobile/src/frameCrop.ts",
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

const { frameToImageRect } = require(path.join(ROOT, OUT, "frameCrop.js"));

let failed = 0;
function near(a, b, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}
function check(name, actual, expected) {
  let ok;
  if (expected === null) {
    ok = actual === null;
  } else if (actual === null) {
    ok = false;
  } else {
    ok = ["cx", "cy", "w", "h", "angleDeg"].every((k) => near(actual[k], expected[k]));
  }
  if (ok) {
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}`);
    console.log(`  expected ${JSON.stringify(expected)}`);
    console.log(`  actual   ${JSON.stringify(actual)}`);
  }
}

// 縦長の写真を縦長のプレビューに cover で入れる（左右がはみ出して切れる）
// scale = max(390/3000, 600/4000) = 0.15 / 表示 450x600 / offX = -30
check(
  "portrait.cover",
  frameToImageRect({ x: 28, y: 200, width: 334, height: 128 }, { width: 390, height: 600 }, 3000, 4000),
  { cx: 1500, cy: 1760, w: 2226.6667, h: 853.3333, angleDeg: 0 },
);

// 横長の写真（上下がはみ出して切れる側）
// scale = max(390/4000, 600/3000) = 0.2 / 表示 800x600 / offX = -205
check(
  "landscape.cover",
  frameToImageRect({ x: 28, y: 200, width: 334, height: 128 }, { width: 390, height: 600 }, 4000, 3000),
  { cx: 2000, cy: 1320, w: 1670, h: 640, angleDeg: 0 },
);

// 枠が中央にあるなら、画像の中央に来る（左右対称に切れるので）
const centered = frameToImageRect(
  { x: 95, y: 250, width: 200, height: 100 },
  { width: 390, height: 600 },
  3000,
  4000,
);
check("centered.cx", { ...centered, cx: centered.cx, cy: centered.cy }, {
  cx: 1500,
  cy: 2000,
  w: centered.w,
  h: centered.h,
  angleDeg: 0,
});

// 画像からはみ出した分は落とす
check(
  "clamped",
  frameToImageRect({ x: -100, y: -50, width: 200, height: 100 }, { width: 390, height: 600 }, 390, 600),
  { cx: 50, cy: 25, w: 100, h: 50, angleDeg: 0 },
);

// 小さすぎる枠は切り出さない
check(
  "tooSmall",
  frameToImageRect({ x: 10, y: 10, width: 8, height: 8 }, { width: 390, height: 600 }, 390, 600),
  null,
);

// 寸法が取れていないうちは何もしない（初回レンダーで枠が 0x0 のことがある）
check("noPreview", frameToImageRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }, 390, 600), null);
check("noImage", frameToImageRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 390, height: 600 }, 0, 0), null);

// 等倍（プレビューと写真が同じ大きさ）なら、枠の値がそのまま出る
check(
  "identity",
  frameToImageRect({ x: 40, y: 100, width: 200, height: 80 }, { width: 390, height: 600 }, 390, 600),
  { cx: 140, cy: 140, w: 200, h: 80, angleDeg: 0 },
);

console.log(failed === 0 ? "ALL OK" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
