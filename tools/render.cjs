/**
 * 41記号を「きれいな」PNG に焼く。合成データセットの元画像。
 *
 * 幾何は lib/glyphSvg.ts と共有する（tools/.build に tsc で落としたものを読む）。
 * ラスタライズは Playwright（Chromium）。SVG のテキスト要素にフォントが要るため。
 *
 * 使い方:
 *   npx tsc lib/symbols.ts lib/glyphSvg.ts --outDir tools/.build --module commonjs --target es2020
 *   node tools/render.cjs <出力ディレクトリ>
 *
 * 出力:
 *   <out>/<code>__f<fontIndex>.png   ... 記号 × フォント変種
 *   <out>/index.json                  ... 各画像の属性ラベル
 */

const fs = require("fs");
const path = require("path");
const { SYMBOLS } = require("./.build/symbols");
const { glyphNodes, VIEW_W, VIEW_H, STROKE_WIDTH } = require("./.build/glyphSvg");

/** レンダリング解像度（劣化前の原版。ここから縮小して低解像度を作る） */
const RENDER_W = 256;
const RENDER_H = Math.round((RENDER_W * VIEW_H) / VIEW_W);

/**
 * 実タグの印字フォントは製造元でばらつく。数字と P/F/W の字形は
 * 認識の当たり外れに直結するので、フォントを増補の軸に入れておく。
 */
const FONTS = [
  "Arial, Helvetica, sans-serif",
  "Georgia, 'Times New Roman', serif",
  "'Trebuchet MS', Verdana, sans-serif",
];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function nodeToSvg(n) {
  const sw = n.sw !== undefined ? ` stroke-width="${n.sw}"` : "";
  const fill = n.filled ? ` fill="black" stroke="none"` : "";
  switch (n.tag) {
    case "path":
      return `<path d="${n.d}"${sw}${fill}/>`;
    case "line":
      return `<line x1="${n.x1}" y1="${n.y1}" x2="${n.x2}" y2="${n.y2}"${sw} stroke="black"/>`;
    case "rect":
      return `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}"${
        n.rx !== undefined ? ` rx="${n.rx}"` : ""
      }${sw}${fill}/>`;
    case "circle":
      return `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}"${sw}${fill}/>`;
    case "text":
      return `<text x="${n.x}" y="${n.y}" text-anchor="middle" dominant-baseline="middle" font-size="${n.size}" font-weight="700" fill="black" stroke="none">${esc(n.value)}</text>`;
    default:
      throw new Error("unknown node " + JSON.stringify(n));
  }
}

function symbolSvg(sym, fontFamily) {
  const body = glyphNodes(sym.glyph).map(nodeToSvg).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" ` +
    `width="${RENDER_W}" height="${RENDER_H}" ` +
    `font-family="${fontFamily}" ` +
    `fill="none" stroke="black" stroke-width="${STROKE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

/** 規則エンジンではなく「見た目」の正解ラベル。CV/学習側はこれを当てにいく。 */
function labelOf(sym) {
  const g = sym.glyph;
  return {
    code: sym.code,
    category: sym.category,
    base: g.base,
    bars: "bars" in g ? g.bars : 0,
    dots: "dots" in g ? g.dots : 0,
    forbidden: "forbidden" in g && Boolean(g.forbidden),
    temp: "temp" in g && g.temp !== undefined ? g.temp : null,
    letter: "letter" in g && g.letter ? g.letter : null,
    lines: "lines" in g ? g.lines : null,
    dir: "dir" in g ? g.dir : null,
    shade: "shade" in g ? g.shade : null,
    slashes: "slashes" in g && Boolean(g.slashes),
  };
}

(async () => {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("usage: node tools/render.cjs <outDir>");
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: RENDER_W, height: RENDER_H },
  });

  const index = [];
  for (const sym of SYMBOLS) {
    for (let f = 0; f < FONTS.length; f++) {
      const svg = symbolSvg(sym, FONTS[f]);
      await page.setContent(
        `<html><body style="margin:0;background:#fff">${svg}</body></html>`,
      );
      const name = `${sym.code}__f${f}.png`;
      await page.locator("svg").screenshot({ path: path.join(outDir, name) });
      index.push({ file: name, font: f, ...labelOf(sym) });
    }
  }

  await browser.close();
  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify({ renderW: RENDER_W, renderH: RENDER_H, items: index }, null, 2),
  );
  console.log(`rendered ${index.length} images (${SYMBOLS.length} symbols x ${FONTS.length} fonts)`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
