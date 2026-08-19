// carelabel/lib を mobile と web で共有しているので、
// Metro にリポジトリのルートも監視させる。
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [repoRoot];
// 依存解決は mobile/node_modules だけに限定する。
// リポジトリ直下には Next.js 側の node_modules があり、React が二重になるため。
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
