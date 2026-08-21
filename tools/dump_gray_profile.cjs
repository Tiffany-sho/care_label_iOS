/**
 * 【可視化】下線の帯を、行ごとの明るさとインク率で並べる。
 *
 * 二値化で2本の下線が融合したとき、元のグレー値に尾根が残っているかを見る。
 * 2026-08-21: test_9#0 では尾根が無く（26行にわたって 43〜45 で平ら）、
 * 作業解像度を 3024px まで上げても変わらなかった。
 * 使い方: node tools/dump_gray_profile.cjs "test_9#0"
 */
const fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"..");const V=path.join(ROOT,"tools/.build/vision");
const {binarize,decideInkDark,blurGray}=require(path.join(V,"vision/binarize.js"));
const {labelComponents}=require(path.join(V,"vision/components.js"));
const {rotateGray}=require(path.join(V,"vision/rotate.js"));
const {cropGray}=require(path.join(V,"vision/segment.js"));
const M=require(path.join(V,"vision/match.js"));const S=require(path.join(V,"vision/shape.js"));
const templates=M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT,"lib/vision/templates.json"),"utf-8")));
const meta=JSON.parse(fs.readFileSync("tools/.build/realraw/index.json","utf-8"));
const boxes=JSON.parse(fs.readFileSync(path.join(ROOT,"eval/boxes.json"),"utf-8"));
const want=(process.argv[2]||"test_9#0").split(",");
for(const it of meta.items){const list=boxes[it.name];if(!Array.isArray(list))continue;
 const buf=fs.readFileSync(path.join("tools/.build/realraw",it.file));
 const img={data:new Uint8Array(buf.buffer,buf.byteOffset,it.w*it.h),width:it.w,height:it.h};
 const inkDark=decideInkDark(img);
 list.forEach((entry,i)=>{if(!want.includes(`${it.name}#${i}`))return;
  const [x0,y0,x1,y1]=entry.box;const crop=cropGray(img,{x0,y0,x1,y1:Math.min(img.height-1,y1+Math.round(0.6*(y1-y0)))},3);
  const soft=blurGray(crop,Math.max(1,Math.round(Math.min(crop.width,crop.height)/18)));
  let bc=-2,bd=0;
  for(const src of [crop,soft])for(const deg of [-6,-3,0,3,6]){const gg=deg===0?src:rotateGray(src,deg);
   const v=M.normalise(binarize(gg,inkDark),gg.width,gg.height);if(!v)continue;
   const hit=M.bestMatchRaw(v,templates);if(hit&&hit.correlation>bc){bc=hit.correlation;bd=deg;}}
  const sharp=bd===0?crop:rotateGray(crop,bd);const w=sharp.width,h=sharp.height;
  const mask=binarize(sharp,inkDark);const lab=labelComponents(mask,w,h);
  const body=S.bodyComponent(lab);
  console.log(`${it.name}#${i} ${entry.code} body.y1=${body.y1} h=${h} deg=${bd}`);
  for(let y=body.y1-4;y<h;y++){
   let sum=0,n=0,ink=0;
   for(let x=body.x0+Math.round(0.25*(body.x1-body.x0));x<=body.x1-Math.round(0.25*(body.x1-body.x0));x++){sum+=sharp.data[y*w+x];n++;if(mask[y*w+x])ink++;}
   const g=n?sum/n:255;
   console.log(`  y=${y} gray=${g.toFixed(0)} ink=${(ink/Math.max(1,n)).toFixed(2)} ${"#".repeat(Math.max(0,Math.round((255-g)/6)))}`);
  }
 });}
