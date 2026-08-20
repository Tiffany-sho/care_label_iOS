#!/bin/bash
# glyphSvg.ts を直したあと、公式との一致度と縦横比をまとめて見る。
npx tsc lib/symbols.ts lib/glyphSvg.ts --outDir tools/.build --module commonjs --target es2020 >/dev/null 2>&1 || { echo "tsc FAILED"; exit 1; }
node tools/render.cjs dataset/clean >/dev/null 2>&1 || { echo "render FAILED"; exit 1; }
python tools/compare_official.py tools/.build/official dataset/clean tools/.build/look/official_sheet.png tools/.build/off_now.md >/dev/null 2>&1
python - <<'PY'
import io, re, glob, os
import numpy as np
from PIL import Image
src=io.open('tools/compare_official.py',encoding='utf-8').read()
rows=re.findall(r'\((\d+), (\d+), "(\d+)", "([^"]+)"\)', src)
files=sorted(glob.glob('tools/.build/official/*.png'))
md=io.open('tools/.build/off_now.md',encoding='utf-8').read()
corr={m.group(1): float(m.group(2)) for m in re.finditer(r'\| (\d+) \| ([0-9.]+) \|', md)}
def aspect(p):
    a=np.asarray(Image.open(p).convert('L'),dtype=np.uint8); ink=a<128
    ys,xs=np.nonzero(ink)
    return (xs.max()-xs.min()+1)/(ys.max()-ys.min()+1)
tot=[]
print("code   corr   aspect(off/ours)")
for x,idx,code,name in rows:
    cand=sorted(f for f in files if ('_x%04d_'%int(x)) in f)
    if int(idx)>=len(cand): continue
    mine='dataset/clean/%s__f0.png'%code
    if not os.path.exists(mine): continue
    o=aspect(cand[int(idx)]); m=aspect(mine); c=corr.get(code,0)
    tot.append(c)
    flag=' <<<' if abs(o-m)>0.08 else ''
    print("%-6s %.2f   %.3f / %.3f%s" % (code, c, o, m, flag))
print("平均 %.3f" % (sum(tot)/len(tot)))
PY
