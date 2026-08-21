/** 【実験】箱のまわりを広く切り出して、下線が写真にそもそも写っているかを見る。 */
const fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"..");const V=path.join(ROOT,"tools/.build/vision");
const {cropGray}=require(path.join(V,"vision/segment.js"));
const {binarize,decideInkDark}=require(path.join(V,"vision/binarize.js"));
const meta=JSON.parse(fs.readFileSync("tools/.build/realraw/index.json","utf-8"));
const boxes=JSON.parse(fs.readFileSync(path.join(ROOT,"eval/boxes.json"),"utf-8"));
const want=(process.argv[2]||"test_9#5").split(",");
const outDir="tools/.build/bodydump";fs.mkdirSync(outDir,{recursive:true});
const out=[];
for(const it of meta.items){const list=boxes[it.name];if(!Array.isArray(list))continue;
 const buf=fs.readFileSync(path.join("tools/.build/realraw",it.file));
 const img={data:new Uint8Array(buf.buffer,buf.byteOffset,it.w*it.h),width:it.w,height:it.h};
 const inkDark=decideInkDark(img);
 list.forEach((entry,i)=>{const key=`${it.name}#${i}`;if(!want.includes(key))return;
  const [x0,y0,x1,y1]=entry.box;const h=y1-y0+1;
  const crop=cropGray(img,{x0,y0,x1,y1:Math.min(img.height-1,y1+Math.round(1.2*h))},6);
  const name=`${it.name}_${i}_wide`;
  fs.writeFileSync(path.join(outDir,name+".raw"),Buffer.from(crop.data));
  out.push({file:name+".raw",w:crop.width,h:crop.height,label:`${key} ${entry.code}`});
  const m=binarize(crop,inkDark);const mb=Buffer.alloc(m.length);
  for(let k=0;k<m.length;k++)mb[k]=m[k]?255:0;
  fs.writeFileSync(path.join(outDir,name+"_m.raw"),mb);
  out.push({file:name+"_m.raw",w:crop.width,h:crop.height,label:`${key} mask`});
  console.log(`${key} ${entry.code} ${crop.width}x${crop.height}`);
 });}
fs.writeFileSync(path.join(outDir,"index.json"),JSON.stringify({items:out},null,1));
