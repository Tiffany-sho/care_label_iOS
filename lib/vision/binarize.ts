/**
 * 二値化。tools/features.py の flatten_background / otsu_threshold / binarize の移植。
 *
 * 平滑化に既製ライブラリのガウシアンを使わないのは意図的。
 * ライブラリ内部の近似は他言語で再現できず、「移植が正しいか」を
 * 検証できなくなる。ここは自前の box blur を3回かける、と決めて両言語で同じものを書く。
 * 検証は tools/verify_ts.cjs（合成2214枚で Python と一致するか）。
 */

export type GrayImage = {
  /** 行優先、1画素1バイト */
  data: Uint8Array;
  width: number;
  height: number;
};

/** インク=1 のマスク */
export type Mask = Uint8Array;

function clampIndex(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** 横方向1パス。端は複製で延長し、累積和で移動平均を取る。 */
function boxBlurH(src: Float64Array, w: number, h: number, r: number): Float64Array {
  const n = 2 * r + 1;
  const padW = w + 2 * r;
  const out = new Float64Array(w * h);
  const prefix = new Float64Array(padW + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    prefix[0] = 0;
    for (let i = 0; i < padW; i++) {
      prefix[i + 1] = prefix[i] + src[row + clampIndex(i - r, w)];
    }
    for (let x = 0; x < w; x++) {
      out[row + x] = (prefix[x + n] - prefix[x]) / n;
    }
  }
  return out;
}

/** 縦方向1パス。 */
function boxBlurV(src: Float64Array, w: number, h: number, r: number): Float64Array {
  const n = 2 * r + 1;
  const padH = h + 2 * r;
  const out = new Float64Array(w * h);
  const prefix = new Float64Array(padH + 1);
  for (let x = 0; x < w; x++) {
    prefix[0] = 0;
    for (let i = 0; i < padH; i++) {
      prefix[i + 1] = prefix[i] + src[clampIndex(i - r, h) * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (prefix[y + n] - prefix[y]) / n;
    }
  }
  return out;
}

/** box blur を3回でガウシアンを近似する。照明ムラの推定にしか使わない。 */
export function boxBlur3(
  src: Float64Array,
  w: number,
  h: number,
  r: number,
): Float64Array {
  let out = src;
  for (let i = 0; i < 3; i++) {
    out = boxBlurH(out, w, h, r);
    out = boxBlurV(out, w, h, r);
  }
  return out;
}

/**
 * 照明ムラ・生地の陰影を割り算で除去する（フラットフィールド補正）。
 * これを挟まないと、タグの片隅が影になっただけで大域しきい値が破綻する。
 */
export function flattenBackground(img: GrayImage): Uint8Array {
  const { width: w, height: h, data } = img;
  const radius = Math.max(4, Math.floor(Math.max(h, w) / 6));
  const src = new Float64Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = data[i];

  const bg = boxBlur3(src, w, h, radius);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = (data[i] / Math.max(bg[i], 1)) * 200;
    // numpy の astype(uint8) は切り捨て。同じ挙動にそろえる。
    out[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.floor(v);
  }
  return out;
}

export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]] += 1;
  const total = gray.length;
  let sumTotal = 0;
  for (let i = 0; i < 256; i++) sumTotal += i * hist[i];

  let wB = 0;
  let sumB = 0;
  let bestVar = -1;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF <= 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumTotal - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) {
      bestVar = v;
      bestT = t;
    }
  }
  return bestT;
}

export function binarize(img: GrayImage): Mask {
  const flat = flattenBackground(img);
  const t = otsuThreshold(flat);
  const mask = new Uint8Array(flat.length);
  for (let i = 0; i < flat.length; i++) mask[i] = flat[i] <= t ? 1 : 0;
  return mask;
}
