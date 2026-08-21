/**
 * 【実験】記号でない箱（生地・文字）を、構造で見分けられるか。
 *
 * 43記号はすべて閉じた輪郭を持つので、必ず「囲まれた背景（穴）」がある。
 * 生地のテクスチャは小片に散り、日本語の文字は閉じた領域を持たないものが多い。
 */
const fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"..");const V=path.join(ROOT,"tools/.build/vision");
const {binarize,decideInkDark,blurGray}=require(path.join(V,"vision/binarize.js"));
const {labelComponents}=require(path.join(V,"vision/components.js"));
const {rotateGray}=require(path.join(V,"vision/rotate.js"));
const {cropGray}=require(path.join(V,"vision/segment.js"));
const M=require(path.join(V,"vision/match.js"));const S=require(path.join(V,"vision/shape.js"));
const {SYMBOL_BY_CODE}=require(path.join(V,"symbols.js"));
const templates=M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT,"lib/vision/templates.json"),"utf-8")));
const meta=JSON.parse(fs.readFileSync("tools/.build/realraw/index.json","utf-8"));
const boxes=JSON.parse(fs.readFileSync(path.join(ROOT,"eval/boxes.json"),"utf-8"));
const rows=[];
for(const it of meta.items){const list=boxes[it.name];if(!Array.isArray(list))continue;
 const buf=fs.readFileSync(path.join("tools/.build/realraw",it.file));
 const img={data:new Uint8Array(buf.buffer,buf.byteOffset,it.w*it.h),width:it.w,height:it.h};
 const inkDark=decideInkDark(img);
 list.forEach((entry,i)=>{
  const [x0,y0,x1,y1]=entry.box;const crop=cropGray(img,{x0,y0,x1,y1},3);
  const soft=blurGray(crop,Math.max(1,Math.round(Math.min(crop.width,crop.height)/18)));
  let bc=-2,bd=0;
  for(const src of [crop,soft])for(const deg of [-6,-3,0,3,6]){const gg=deg===0?src:rotateGray(src,deg);
   const v=M.normalise(binarize(gg,inkDark),gg.width,gg.height);if(!v)continue;
   const hit=M.bestMatchRaw(v,templates);if(hit&&hit.correlation>bc){bc=hit.correlation;bd=deg;}}
  const sharp=bd===0?crop:rotateGray(crop,bd);const w=sharp.width,h=sharp.height;
  const mask=binarize(sharp,inkDark);const lab=labelComponents(mask,w,h);
  const body=S.bodyComponent(lab);
  const area=w*h;
  let ink=0;for(let k=0;k<mask.length;k++)ink+=mask[k];
  const bodyBox=body?((body.x1-body.x0+1)*(body.y1-body.y0+1))/area:0;
  const bodyArea=body?body.area/Math.max(1,ink):0;
  // 穴（囲まれた背景）
  const holes=S.holeMask(mask,w,h);
  let hole=0;for(let k=0;k<holes.length;k++)hole+=holes[k];
  const kind=!entry.code?"?":(SYMBOL_BY_CODE[entry.code]?"sym":entry.code);
  rows.push({key:`${it.name}#${i}`,kind,ink:ink/area,bodyBox,bodyArea,hole:hole/area,comps:lab.comps.size,corr:bc});
 });}
const q=a=>{const s=[...a].sort((x,y)=>x-y);return [s[0],s[Math.floor(s.length*0.05)],s[Math.floor(s.length/2)],s[s.length-1]];};
for(const k of ["sym","junk","outoftable"]){
 const g=rows.filter(r=>r.kind===k);if(!g.length)continue;
 console.log(`${k} n=${g.length}`);
 console.log(`   ink      min/5%/中央/max ${q(g.map(r=>r.ink)).map(v=>v.toFixed(3)).join(" / ")}`);
 console.log(`   bodyBox  ${q(g.map(r=>r.bodyBox)).map(v=>v.toFixed(3)).join(" / ")}`);
 console.log(`   bodyArea ${q(g.map(r=>r.bodyArea)).map(v=>v.toFixed(3)).join(" / ")}`);
 console.log(`   hole     ${q(g.map(r=>r.hole)).map(v=>v.toFixed(3)).join(" / ")}`);
 console.log(`   comps    ${q(g.map(r=>r.comps)).join(" / ")}`);
}
console.log("\n記号でない箱の実測値:");
for(const r of rows.filter(r=>r.kind!=="sym"))console.log(`  ${r.key} ${r.kind} ink=${r.ink.toFixed(3)} bodyBox=${r.bodyBox.toFixed(3)} bodyArea=${r.bodyArea.toFixed(3)} hole=${r.hole.toFixed(3)} comps=${r.comps} corr=${r.corr.toFixed(2)}`);
console.log("\n記号側の下位5件（bodyArea 昇順）:");
for(const r of rows.filter(r=>r.kind==="sym").sort((a,b)=>a.bodyArea-b.bodyArea).slice(0,5))console.log(`  ${r.key} bodyArea=${r.bodyArea.toFixed(3)} bodyBox=${r.bodyBox.toFixed(3)} hole=${r.hole.toFixed(3)} comps=${r.comps}`);
console.log("\n記号側の下位5件（hole 昇順）:");
for(const r of rows.filter(r=>r.kind==="sym").sort((a,b)=>a.hole-b.hole).slice(0,5))console.log(`  ${r.key} hole=${r.hole.toFixed(3)} bodyArea=${r.bodyArea.toFixed(3)} comps=${r.comps}`);
