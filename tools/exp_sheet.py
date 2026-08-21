"""raw のダンプを1枚の PNG に並べる（目視用）。ASCII 出力のみ。"""
import io, json, os, sys
import numpy as np
from PIL import Image

d = sys.argv[1] if len(sys.argv) > 1 else "tools/.build/bodydump"
out = sys.argv[2] if len(sys.argv) > 2 else "tools/.build/bodydump.png"
idx = json.load(io.open(os.path.join(d, "index.json"), encoding="utf-8"))
cell = 190
cols = 4
items = idx["items"]
rows = (len(items) + cols - 1) // cols
sheet = Image.new("L", (cols * cell, rows * (cell + 14)), 255)
from PIL import ImageDraw
dr = ImageDraw.Draw(sheet)
for i, it in enumerate(items):
    a = np.fromfile(os.path.join(d, it["file"]), dtype=np.uint8).reshape(it["h"], it["w"])
    im = Image.fromarray(a).resize((cell - 8, cell - 8))
    r, c = divmod(i, cols)
    sheet.paste(im, (c * cell + 4, r * (cell + 14) + 4))
    dr.text((c * cell + 4, r * (cell + 14) + cell - 6), it["label"], fill=0)
sheet.save(out)
print("wrote " + out)
