/** 【実験】実装した shadeScore（左上−右上）を実写の自然乾燥で測る。 */
const fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"..");const V=path.join(ROOT,"tools/.build/vision");
const {binarize,decideInkDark,blurGray}=require(path.join(V,"vision/binarize.js"));
const {labelComponents}=require(path.join(V,"vision/components.js"));
const {rotateGray}=require(path.join(V,"vision/rotate.js"));
const {cropGray}=require(path.join(V,"vision/segment.js"));
const M=require(path.join(V,"vision/match.js"));const S=require(path.join(V,"vision/shape.js"));
const I=require(path.join(V,"vision/inside.js"));
const {SYMBOL_BY_CODE}=require(path.join(V,"symbols.js"));
const templates=M.loadTemplates(JSON.parse(fs.readFileSync(path.join(ROOT,"lib/vision/templates.json"),"utf-8")));
const meta=JSON.parse(fs.readFileSync("tools/.build/realraw/index.json","utf-8"));
const boxes=JSON.parse(fs.readFileSync(path.join(ROOT,"eval/boxes.json"),"utf-8"));
const rows=[];
for(const it of meta.items){const list=boxes[it.name];if(!Array.isArray(list))continue;
 const buf=fs.readFileSync(path.join("tools/.build/realraw",it.file));
 const img={data:new Uint8Array(buf.buffer,buf.byteOffset,it.w*it.h),width:it.w,height:it.h};
 const inkDark=decideInkDark(img);
 list.forEach((entry,i)=>{if(!entry.code||!SYMBOL_BY_CODE[entry.code])return;
  const g=SYMBOL_BY_CODE[entry.code].glyph;if(g.base!=="natural")return;
  const [x0,y0,x1,y1]=entry.box;const crop=cropGray(img,{x0,y0,x1,y1},3);
  const soft=blurGray(crop,Math.max(1,Math.round(Math.min(crop.width,crop.height)/18)));
  let bc=-2,bd=0;
  for(const src of [crop,soft])for(const deg of [-6,-3,0,3,6]){const gg=deg===0?src:rotateGray(src,deg);
   const v=M.normalise(binarize(gg,inkDark),gg.width,gg.height);if(!v)continue;
   const hit=M.bestMatchRaw(v,templates);if(hit&&hit.correlation>bc){bc=hit.correlation;bd=deg;}}
  const sharp=bd===0?crop:rotateGray(crop,bd);
  const mask=binarize(sharp,inkDark);const lab=labelComponents(mask,sharp.width,sharp.height);
  const body=S.bodyComponent(lab);
  const sc=body?I.shadeScore(mask,sharp.width,sharp.height,body):null;
  rows.push({key:`${it.name}#${i}`,code:entry.code,shade:Boolean(g.shade),sc});
  console.log(`${it.name}#${i} ${entry.code} shade=${g.shade?"Y":"n"} score=${sc===null?"-":sc.toFixed(4)}`);
 });}
const y=rows.filter(r=>r.shade&&r.sc!==null).map(r=>r.sc),n=rows.filter(r=>!r.shade&&r.sc!==null).map(r=>r.sc);
console.log(`shade  min=${Math.min(...y).toFixed(3)} 下位3件 ${y.slice().sort((a,b)=>a-b).slice(0,3).map(v=>v.toFixed(3)).join(" ")}`);
console.log(`none   ${n.map(v=>v.toFixed(3)).join(" ")}`);
