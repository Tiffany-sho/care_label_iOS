#!/bin/bash
# 禁止の×の大きさを、公式リーフレットとの一致度で決める。
# 使い方: bash tools/sweep_cross.sh <行番号> <コード> "候補1" "候補2" ...
LINE=$1; CODE=$2; shift 2
ORIG=$(sed -n "${LINE}p" lib/glyphSvg.ts)
for v in "$@"; do
  python - "$LINE" "$v" <<'PY'
import io,sys,re
line=int(sys.argv[1]); val=sys.argv[2]
p='lib/glyphSvg.ts'
ls=io.open(p,encoding='utf-8').read().split('\n')
ls[line-1]=re.sub(r'cross\([^)]*\)', 'cross(%s)'%val, ls[line-1])
io.open(p,'w',encoding='utf-8',newline='\n').write('\n'.join(ls))
PY
  npx tsc lib/symbols.ts lib/glyphSvg.ts --outDir tools/.build --module commonjs --target es2020 >/dev/null 2>&1
  node tools/render.cjs dataset/clean >/dev/null 2>&1
  python tools/compare_official.py tools/.build/official dataset/clean tools/.build/look/s.png tools/.build/off_s.md >/dev/null 2>&1
  echo "cross($v)  -> $(grep -E "\| $CODE \|" tools/.build/off_s.md | sed 's/.*| //')"
done
python - "$LINE" "$ORIG" <<'PY'
import io,sys
line=int(sys.argv[1]); orig=sys.argv[2]
p='lib/glyphSvg.ts'
ls=io.open(p,encoding='utf-8').read().split('\n')
ls[line-1]=orig
io.open(p,'w',encoding='utf-8',newline='\n').write('\n'.join(ls))
print("restored")
PY
