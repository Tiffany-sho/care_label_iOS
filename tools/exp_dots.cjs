/**
 * 【実験】点の個数を、並び方（同じ高さに並ぶ・大きさがそろう）で絞って数える。
 * いまは大きさと縦横比だけで数えているので、生地の織り目の粒を点に数える
 * （実測で 2個を3個と数える誤りが2件）。
 */
const fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"..");const V=path.join(ROOT,"tools/.build/vision");
const {binarize,decideInkDark,blurGray}=require(path.join(V,"vision/binarize.js"));
const {labelComponents}=require(path.join(V,"vision/components.js"));
const {rotateGray}=require(path.join(V,"vision/rotate.js"));
const {cropGray}=require(path.join(V,"vision/segment.js"));
const M=require(path.join(V,"vision/match.js"));const F=require(path.join(V,"vision/features.js"));
const {SYMBOL_BY_CODE}=require(path.join(V,"symbols.js"));
const templates=M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT,"lib/vision/templates.json"),"utf-8")));
const BAND=Number(process.env.BAND||0.25), AREA=Number(process.env.AREA||2.5);

function dotsGrouped(labelled){
 const comps=[...labelled.comps.values()];
 if(!comps.length)return 0;
 let outline=null,ba=-1;
 for(const c of comps){const a=(c.x1-c.x0+1)*(c.y1-c.y0+1);if(a>ba){ba=a;outline=c;}}
 const box=Math.max(1,(outline.x1-outline.x0+1)*(outline.y1-outline.y0+1));
 const oh=outline.y1-outline.y0+1;
 const cand=[];
 for(const c of comps){
  if(c===outline)continue;
  if(!(outline.x0<=c.x0&&c.x1<=outline.x1))continue;
  if(!(outline.y0<=c.y0&&c.y1<=outline.y1))continue;
  const rel=c.area/box;
  if(!(rel>=0.0012&&rel<=0.03))continue;
  const w=c.x1-c.x0+1,h=c.y1-c.y0+1;
  const aspect=w/Math.max(1,h);
  if(!(aspect>=0.45&&aspect<=2.2))continue;
  if(c.area/Math.max(1,w*h)<0.4)continue;
  cand.push({cy:(c.y0+c.y1)/2,area:c.area});
 }
 if(cand.length<=1)return cand.length;
 // 同じ高さの帯にあって、面積がそろっている最大の集合を採る
 let best=1;
 for(const seed of cand){
  const grp=cand.filter(c=>Math.abs(c.cy-seed.cy)<=BAND*oh
    &&c.area<=AREA*seed.area&&seed.area<=AREA*c.area);
  if(grp.length>best)best=grp.length;
 }
 return Math.min(best,3);
}

const meta=JSON.parse(fs.readFileSync("tools/.build/realraw/index.json","utf-8"));
const boxes=JSON.parse(fs.readFileSync(path.join(ROOT,"eval/boxes.json"),"utf-8"));
let n=0,okOld=0,okNew=0;const bad=[];
for(const it of meta.items){const list=boxes[it.name];if(!Array.isArray(list))continue;
 const buf=fs.readFileSync(path.join("tools/.build/realraw",it.file));
 const img={data:new Uint8Array(buf.buffer,buf.byteOffset,it.w*it.h),width:it.w,height:it.h};
 const inkDark=decideInkDark(img);
 list.forEach((entry,i)=>{if(!entry.code||!SYMBOL_BY_CODE[entry.code])return;
  const g=SYMBOL_BY_CODE[entry.code].glyph;if(!["tumble","iron"].includes(g.base))return;
  const [x0,y0,x1,y1]=entry.box;const crop=cropGray(img,{x0,y0,x1,y1},3);
  const soft=blurGray(crop,Math.max(1,Math.round(Math.min(crop.width,crop.height)/18)));
  let bc=-2,bd=0;
  for(const src of [crop,soft])for(const deg of [-6,-3,0,3,6]){const gg=deg===0?src:rotateGray(src,deg);
   const v=M.normalise(binarize(gg,inkDark),gg.width,gg.height);if(!v)continue;
   const hit=M.bestMatchRaw(v,templates);if(hit&&hit.correlation>bc){bc=hit.correlation;bd=deg;}}
  const sharp=bd===0?crop:rotateGray(crop,bd);
  const mask=binarize(sharp,inkDark);const lab=labelComponents(mask,sharp.width,sharp.height);
  const oldN=F.countDots(lab),newN=dotsGrouped(lab);
  n++;if(oldN===g.dots)okOld++;if(newN===g.dots)okNew++;
  else bad.push(`${it.name}#${i} ${entry.code} want=${g.dots} old=${oldN} new=${newN}`);
 });}
console.log(`BAND=${BAND} AREA=${AREA}  dots old ${okOld}/${n} ${((100*okOld)/n).toFixed(1)}%  new ${okNew}/${n} ${((100*okNew)/n).toFixed(1)}%`);
if(process.env.SHOW==="1")for(const b of bad)console.log("  "+b);
