/**
 * 【可視化】外形の切り出しと穴埋めが何を作っているかを画像に書き出す。
 *
 * **二値化の極性が反転している事故を見つけた道具。** 数字だけ見ていると
 * 気づけない種類の不具合があるので、おかしいときはまず目で見る。
 * 使い方: node tools/dump_body.cjs "test_9#0,test_6#0" && python tools/sheet_dumps.py
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const V = path.join(ROOT, "tools/.build/vision");
const { binarize, decideInkDark } = require(path.join(V, "vision/binarize.js"));
const { labelComponents } = require(path.join(V, "vision/components.js"));
const { cropGray } = require(path.join(V, "vision/segment.js"));
const S = require(path.join(V, "vision/shape.js"));

const rawDir = "tools/.build/realraw";
const outDir = "tools/.build/bodydump";
fs.mkdirSync(outDir, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf-8"));
const boxes = JSON.parse(fs.readFileSync(path.join(ROOT, "eval/boxes.json"), "utf-8"));
const want = (process.argv[2] || "test_1#1,test_1#3,test_3#3,test_2#3").split(",");
const out = [];
for (const it of meta.items) {
  const list = boxes[it.name];
  if (!Array.isArray(list)) continue;
  const buf = fs.readFileSync(path.join(rawDir, it.file));
  const img = { data: new Uint8Array(buf.buffer, buf.byteOffset, it.w * it.h), width: it.w, height: it.h };
  const inkDark = decideInkDark(img);
  list.forEach((entry, i) => {
    const key = `${it.name}#${i}`;
    if (!want.includes(key)) return;
    const [x0, y0, x1, y1] = entry.box;
    const crop = cropGray(img, { x0, y0, x1, y1 }, 3);
    const mask = binarize(crop, inkDark);
    const lab = labelComponents(mask, crop.width, crop.height);
    const body = S.bodyComponent(lab);
    const sub = S.componentMask(lab, crop.width, body);
    const filled = S.fillHoles(sub.mask, sub.w, sub.h);
    const write = (name, data, w, h, scale255) => {
      const b = Buffer.alloc(w * h);
      for (let k = 0; k < w * h; k++) b[k] = scale255 ? (data[k] ? 255 : 0) : data[k];
      fs.writeFileSync(path.join(outDir, name + ".raw"), b);
      out.push({ file: name + ".raw", w, h, label: name });
    };
    write(`${key.replace("#", "_")}_gray`, crop.data, crop.width, crop.height, false);
    write(`${key.replace("#", "_")}_mask`, mask, crop.width, crop.height, true);
    write(`${key.replace("#", "_")}_body`, sub.mask, sub.w, sub.h, true);
    write(`${key.replace("#", "_")}_fill`, filled, sub.w, sub.h, true);
    console.log(`${key} code=${entry.code} crop=${crop.width}x${crop.height} body=${sub.w}x${sub.h} comps=${lab.comps.size}`);
  });
}
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ items: out }, null, 1));
