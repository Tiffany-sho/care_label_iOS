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

/**
 * インクが明るいか暗いかを決める。**画像の縁を背景とみなす**。
 *
 * 「インクは背景より暗い」と決め打っていたが、実写 test_4（黒い生地に
 * 白いプリント）でそれが破綻した。記号が全部背景側に回り、検出 2/6 になっていた。
 *
 * 縁を基準にする根拠: この関数は「タグの切り出し範囲」か「記号1個の外接矩形＋余白」
 * にしか呼ばれない。どちらも枠のいちばん外側は背景である。
 * 「インクは少数派」という基準も試したが、記号1個に切り詰めるとインクの
 * 占有率が5割に近づき、判定が反転することがあった（実写でmeanCorrが下がった）。
 * 縁なら切り出しの大きさに左右されない。
 *
 * 黒印字（=これまでの全データ）では縁が明るいので挙動は変わらない。
 * 合成データの数値と Python とのパリティはそのまま保たれる。
 */
export function inkIsDark(
  flat: Uint8Array,
  threshold: number,
  w: number,
  h: number,
): boolean {
  let dark = 0;
  let total = 0;
  for (let x = 0; x < w; x++) {
    dark += flat[x] <= threshold ? 1 : 0;
    dark += flat[(h - 1) * w + x] <= threshold ? 1 : 0;
    total += 2;
  }
  for (let y = 1; y < h - 1; y++) {
    dark += flat[y * w] <= threshold ? 1 : 0;
    dark += flat[y * w + w - 1] <= threshold ? 1 : 0;
    total += 2;
  }
  // 縁が暗い = 背景が暗い = インクは明るい側
  return dark * 2 <= total;
}

/**
 * 記号1個ぶんの切り抜きでは、縁を見る判定が破綻する。
 *
 * 実写で測って分かったこと: 枠を記号にぴったり合わせると、四角い記号
 * （自然乾燥・タンブル乾燥）は輪郭線が切り抜きの四辺に触れる。すると
 * 縁の画素の6〜7割がインクになり、inkIsDark が「背景が暗い」と判定して
 * **極性がまるごと反転する**。反転すると記号が背景側に回り、穴埋めも相関も
 * 全部が無意味になる（test_1#3 / test_2#3 / test_3#3 で実際に起きていた）。
 *
 * 縁を見る根拠そのものは正しい。壊れるのは「記号1個に切り詰めた画像」に
 * 対して使うからで、**タグ全体なら縁は必ず生地**である。
 * よってタグの段階で1回だけ決めて、記号1個ずつの二値化にはそれを配る。
 */
export function decideInkDark(img: GrayImage): boolean {
  const flat = flattenBackground(img);
  const t = otsuThreshold(flat);
  return inkIsDark(flat, t, img.width, img.height);
}

/**
 * 二値化。inkDark を渡さないときは、この画像の縁から自分で決める
 * （合成データと Python 参照実装との一致を保つため、既定の挙動は変えない）。
 */
export function binarize(img: GrayImage, inkDark?: boolean): Mask {
  const flat = flattenBackground(img);
  const t = otsuThreshold(flat);
  const dark = inkDark ?? inkIsDark(flat, t, img.width, img.height);
  const mask = new Uint8Array(flat.length);
  for (let i = 0; i < flat.length; i++) {
    mask[i] = (flat[i] <= t) === dark ? 1 : 0;
  }
  return mask;
}

/**
 * 画像そのものをぼかした複製を返す。生地の織り目を消すために使う。
 *
 * 実写で効いたのは、しきい値やテンプレートをいじることではなく
 * **入力画像を先にならすこと**だった（tools/SCAN.md）。
 * 中央値フィルタも試したが、箱ぼかしのほうが結果が良く、しかも
 * 累積和で1画素あたり定数時間で済む（端末で回すのでこれは効く）。
 */
export function blurGray(img: GrayImage, radius: number): GrayImage {
  if (radius <= 0) return img;
  const src = new Float64Array(img.width * img.height);
  for (let i = 0; i < src.length; i++) src[i] = img.data[i];
  const out = boxBlur3(src, img.width, img.height, radius);
  const data = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    data[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }
  return { data, width: img.width, height: img.height };
}
