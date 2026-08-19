"""Generate a synthetic, degraded care-symbol dataset from the clean renders.

Why this exists
---------------
"Can an AI read a care label from a photo?" cannot be answered by opinion.
It needs a labelled set to measure on. Real tags are also useless on their own
as an evaluation set, because the symbol distribution is extremely skewed:
40C-normal / tumble-forbidden / iron-medium show up constantly, while 95C or
"drip flat dry" essentially never do. So we synthesise, sweep the degradation
strength, and find where accuracy collapses.

Degradation axes (roughly ordered by how much they hurt the counting task):
  1. resolution loss   - the symbol occupies few pixels in a real phone photo
  2. blur              - focus / motion
  3. ink bleed         - printing on textile spreads or breaks the strokes
  4. contrast loss     - grey ink on off-white fabric
  5. fabric texture    - low frequency + per pixel noise
  6. rotation          - the tag is never axis aligned
  7. JPEG artefacts

Console output is ASCII only (Windows console is cp932).

Usage:
  python tools/degrade.py dataset/clean dataset/synth [variants_per_image]
"""

import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

SEVERITIES = [0, 1, 2, 3, 4, 5]

# Longest side of the symbol after the "shot from a distance" downscale.
# This is the single most damaging axis, so it is stated explicitly rather
# than hidden inside a formula.
TARGET_PX = {0: 200, 1: 150, 2: 112, 3: 84, 4: 62, 5: 46}


def affine_jitter(img: Image.Image, sev: int, rng: np.random.Generator) -> Image.Image:
    """Rotate and shift slightly. Paper is white, so fill with white."""
    max_deg = 1.5 + 2.5 * sev
    deg = float(rng.uniform(-max_deg, max_deg))
    out = img.rotate(deg, resample=Image.BICUBIC, fillcolor=255, expand=False)

    max_shift = int(round((0.01 + 0.015 * sev) * max(img.size)))
    if max_shift > 0:
        dx = int(rng.integers(-max_shift, max_shift + 1))
        dy = int(rng.integers(-max_shift, max_shift + 1))
        out = out.transform(
            out.size,
            Image.AFFINE,
            (1, 0, -dx, 0, 1, -dy),
            resample=Image.BICUBIC,
            fillcolor=255,
        )
    return out


def ink_weight(img: Image.Image, sev: int, rng: np.random.Generator) -> Image.Image:
    """Simulate ink bleeding into the fabric, or a starved print.

    Ink is dark, so a local MIN filter thickens strokes (bleed) and a local
    MAX filter thins them (starved). Both merge or break the fine features
    that carry the meaning: the 1-vs-2 bars and the 1-vs-2-vs-3 dots.
    """
    if sev == 0:
        return img
    p = 0.15 + 0.12 * sev
    r = rng.random()
    if r < p:
        return img.filter(ImageFilter.MinFilter(3))  # bleed
    if r < 2 * p:
        return img.filter(ImageFilter.MaxFilter(3))  # starved
    return img


def downscale(img: Image.Image, sev: int, target: int | None = None) -> Image.Image:
    target = TARGET_PX[sev] if target is None else target
    w, h = img.size
    scale = target / max(w, h)
    return img.resize((max(8, round(w * scale)), max(8, round(h * scale))), Image.LANCZOS)


def blur(img: Image.Image, sev: int, rng: np.random.Generator) -> Image.Image:
    radius = 0.15 + 0.30 * sev + float(rng.uniform(0, 0.25 * sev + 0.1))
    return img.filter(ImageFilter.GaussianBlur(radius))


def contrast_and_texture(
    arr: np.ndarray, sev: int, rng: np.random.Generator
) -> np.ndarray:
    """Squeeze the dynamic range, then lay fabric texture and sensor noise on top."""
    ink = 8.0 + 17.0 * sev  # black -> dark grey
    paper = 255.0 - 6.0 * sev  # white -> off white
    a = ink + (arr / 255.0) * (paper - ink)

    h, w = a.shape
    # Low frequency: weave / shadow / uneven lighting.
    lf_h, lf_w = max(2, h // 10), max(2, w // 10)
    lf = rng.normal(0.0, 1.0, size=(lf_h, lf_w)).astype(np.float32)
    lf = np.asarray(
        Image.fromarray(lf, mode="F").resize((w, h), Image.BICUBIC), dtype=np.float32
    )
    a = a + lf * (2.0 + 4.0 * sev)

    # High frequency: sensor noise.
    a = a + rng.normal(0.0, 1.0 + 3.0 * sev, size=(h, w))
    return np.clip(a, 0, 255).astype(np.uint8)


def jpeg(img: Image.Image, sev: int) -> Image.Image:
    q = int(95 - 13 * sev)
    buf = io.BytesIO()
    img.convert("L").save(buf, format="JPEG", quality=max(15, q))
    buf.seek(0)
    return Image.open(buf).convert("L")


def degrade(
    img: Image.Image,
    sev: int,
    rng: np.random.Generator,
    target: int | None = None,
) -> Image.Image:
    """`target` overrides the severity's downscale size, so that resolution can
    be swept on its own while every other nuisance is held fixed."""
    x = affine_jitter(img, sev, rng)
    x = ink_weight(x, sev, rng)
    x = downscale(x, sev, target)
    if sev > 0:
        x = blur(x, sev, rng)
    arr = contrast_and_texture(np.asarray(x, dtype=np.float32), sev, rng)
    return jpeg(Image.fromarray(arr, mode="L"), sev)


def main() -> None:
    clean_dir = sys.argv[1]
    out_dir = sys.argv[2]
    variants = int(sys.argv[3]) if len(sys.argv) > 3 else 3

    with open(os.path.join(clean_dir, "index.json"), encoding="utf-8") as f:
        index = json.load(f)

    rng = np.random.default_rng(20260819)
    manifest = []

    for sev in SEVERITIES:
        sev_dir = os.path.join(out_dir, "s%d" % sev)
        os.makedirs(sev_dir, exist_ok=True)
        for item in index["items"]:
            src = Image.open(os.path.join(clean_dir, item["file"])).convert("L")
            for v in range(variants):
                out = degrade(src, sev, rng)
                name = "%s_v%d.png" % (item["file"][:-4], v)
                out.save(os.path.join(sev_dir, name))
                rec = dict(item)
                rec["file"] = "s%d/%s" % (sev, name)
                rec["severity"] = sev
                rec["target_px"] = TARGET_PX[sev]
                manifest.append(rec)

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"items": manifest, "target_px": TARGET_PX}, f, indent=2)

    print("wrote %d images across %d severities" % (len(manifest), len(SEVERITIES)))


if __name__ == "__main__":
    main()
