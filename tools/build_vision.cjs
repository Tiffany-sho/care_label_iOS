/**
 * lib/ の TypeScript を Node から使える CommonJS に落とす（検証ハーネス用）。
 * 出力レイアウトが揺れると verify_*.cjs の require パスが壊れるので、
 * コンパイルの入口をここ1箇所に固定する。
 */
const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "lib/symbols.ts",
  "lib/glyphSvg.ts",
  "lib/vision/binarize.ts",
  "lib/vision/components.ts",
  "lib/vision/features.ts",
  "lib/vision/match.ts",
  "lib/vision/reader.ts",
  "lib/vision/resolve.ts",
  "lib/vision/segment.ts",
  "lib/vision/rotate.ts",
  "lib/vision/pipeline.ts",
  "lib/vision/shape.ts",
  "lib/vision/inside.ts",
];

// Windows で .cmd を spawn すると EINVAL になるので、
// typescript のエントリを node で直接叩く。
const tsc = require.resolve("typescript/bin/tsc");

execFileSync(
  process.execPath,
  [
    tsc,
    ...FILES,
    "--outDir", "tools/.build/vision",
    "--module", "commonjs",
    "--target", "es2020",
    "--skipLibCheck",
    "--resolveJsonModule",
    "--esModuleInterop",
    "--downlevelIteration",
  ],
  { cwd: ROOT, stdio: "inherit" },
);
console.log("built tools/.build/vision");
