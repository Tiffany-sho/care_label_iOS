// carelabel/lib を mobile と web で共有しているので、
// Metro にリポジトリのルートも監視させる。
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [repoRoot];

// 依存の探索起点は mobile/node_modules。
//
// かつて disableHierarchicalLookup = true も付けていたが、これは外した。
// SDK 57 では依存がすべてトップレベルに巻き上げられていて動いていたものの、
// SDK 54 では expo-asset などが node_modules/expo/node_modules に入れ子になり、
// 入れ子の探索を止めると解決できなくなる（実際にバンドルが失敗した）。
//
// 上位ディレクトリには Next.js 側の node_modules があるが、共有している
// carelabel/lib は npm パッケージを一切 import していない（相対 import と
// JSON のみ）ので、そこから React が二重に引かれることはない。
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
