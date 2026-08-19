import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node のデータ生成スクリプト。Next のアプリコードではないので
    // ブラウザ向けの規約（ESM 強制など）は当てない。
    "tools/**",
    "dataset/**",
  ]),
]);

export default eslintConfig;
