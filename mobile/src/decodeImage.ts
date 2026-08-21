/**
 * 画像ファイル → グレースケールの生画素。
 *
 * Expo Go で完結させるため、ネイティブモジュールを足さずに
 * expo-image-manipulator（リサイズ）＋ 純JSのPNGデコーダで済ませている。
 * Skia を入れれば readPixels で一発だが、その時点で Expo Go では動かなくなり、
 * dev build が必須になる。最初の一歩を重くしないほうを取った。
 */

import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import UPNG from "upng-js";

import type { GrayImage } from "../../lib/vision/binarize";
import { boundingBox, sampleOrientedRect, type OrientedRect } from "../../lib/vision/rotate";

/**
 * ネイティブ側が抱えている画像の実体を、その場で手放す。
 *
 * 手放さないと、解放は JS の GC 任せになる。1回の読み取りで
 * 元画像・切り出し・PNG・base64 と数十MBを触るので、GC が追いつかないうちに
 * 次の読み取りが始まると iOS が画像を作れなくなり、saveAsync が
 * "Cannot create image data for given image format" で落ちる。
 * 実機で「何回か読み取ったあと、写真を選ぶと失敗する」形で出た。
 */
function release(obj: unknown): void {
  const o = obj as { release?: () => void };
  if (typeof o?.release === "function") {
    try {
      o.release();
    } catch {
      // web には release が無い実装がある。解放できなくても続けられる。
    }
  }
}

/** base64 を取り出した時点で、書き出された一時ファイルは用済み */
function deleteTemp(uri: string): void {
  if (Platform.OS === "web") return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // 消せなくてもキャッシュに残るだけ
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export type CropRect = OrientedRect;

async function renderGray(
  ctx: ReturnType<typeof ImageManipulator.manipulate>,
): Promise<GrayImage> {
  const ref = await ctx.renderAsync();
  let bytes: Uint8Array;
  try {
    if (Platform.OS === "web") {
      const saved = await ref.saveAsync({ format: SaveFormat.PNG, base64: true });
      if (!saved.base64) throw new Error("画像のエンコードに失敗しました");
      bytes = base64ToBytes(saved.base64);
    } else {
      // base64 を経由しない。1400px の PNG だと base64 の文字列だけで数MBあり、
      // 読み取りのたびに作ると iOS が画像を作れなくなる
      // （実機で "Cannot create image data for given image format" になった）。
      // 書き出したファイルをそのまま読んで、すぐ消す。
      const saved = await ref.saveAsync({ format: SaveFormat.PNG });
      bytes = await new File(saved.uri).bytes();
      deleteTemp(saved.uri);
    }
  } finally {
    // 成功しても失敗しても、ここでネイティブの画像を手放す
    release(ref);
    release(ctx);
  }
  // UPNG は ArrayBuffer を要求する。Uint8Array.buffer は ArrayBufferLike なので
  // 型でも実体でも確実な ArrayBuffer に詰め替える。
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const png = UPNG.decode(ab);
  const rgba = new Uint8Array(UPNG.toRGBA8(png)[0]);

  const w = png.width;
  const h = png.height;
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    // ITU-R BT.601 の輝度。切り捨てまで明示して、環境差で結果が変わらないようにする。
    gray[i] = ((rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000) | 0;
  }
  return { data: gray, width: w, height: h };
}

/**
 * 撮影画像を読み込んでグレースケールにする。
 *
 * `crop` は元画像の画素座標での傾いた長方形。渡されたときは、先に切り出してから
 * リサイズする。この順序が重要で、写真全体をそのまま縮めると、タグが画面の一部
 * しか占めていない場合に1記号が数十pxまで落ちる（実測で110px以上が必要、
 * lib/vision/reader.ts）。囲んでもらった範囲を原寸で切り出してから縮めれば、
 * 記号は大きいまま残る。処理する画素数も減るので、そのぶん速くなる。
 *
 * 枠が傾いているときは、外接する長方形をネイティブ側で切り出して縮め、
 * そこから傾いた中身だけを一度の走査で抜く。切り出し・回転・拡縮を別々に
 * かけると補間が3回入って像が甘くなるので、まとめて1回にする。
 *
 * `maxSide` は端末上で純JS処理する画素数の上限。
 */
type LoadOptions = {
  crop?: CropRect;
  maxSide?: number;
  imageWidth?: number;
  imageHeight?: number;
};

export async function loadGrayFromUri(
  uri: string,
  options: LoadOptions = {},
): Promise<GrayImage> {
  const maxSide = options.maxSide ?? 1400;
  try {
    return await loadGrayAt(uri, options, maxSide);
  } catch (e) {
    // メモリが足りずに画像を作れなかったときは、一段小さくしてもう一度だけ試す。
    // 何も出さずに失敗するより、粗くても読めたほうがよい。粗くなったことは
    // 「記号が小さすぎます」の警告として画面に出る（mobile/src/scan.ts）。
    if (maxSide <= 900) throw e;
    return await loadGrayAt(uri, options, Math.round(maxSide * 0.7));
  }
}

async function loadGrayAt(
  uri: string,
  options: LoadOptions,
  maxSide: number,
): Promise<GrayImage> {
  const crop = options.crop;

  if (crop === undefined || crop.w <= 0 || crop.h <= 0) {
    return renderGray(ImageManipulator.manipulate(uri).resize({ width: maxSide }));
  }

  // 傾いていないときは、これまでどおり切って縮めるだけ。補間を1回減らせる。
  if (Math.abs(crop.angleDeg) < 0.5) {
    const ctx = ImageManipulator.manipulate(uri).crop({
      originX: Math.round(crop.cx - crop.w / 2),
      originY: Math.round(crop.cy - crop.h / 2),
      width: Math.round(crop.w),
      height: Math.round(crop.h),
    });
    return renderGray(
      crop.w >= crop.h ? ctx.resize({ width: maxSide }) : ctx.resize({ height: maxSide }),
    );
  }

  const bb = boundingBox(crop);
  const x0 = Math.max(0, Math.floor(bb.x));
  const y0 = Math.max(0, Math.floor(bb.y));
  const x1 = Math.ceil(bb.x + bb.w);
  const y1 = Math.ceil(bb.y + bb.h);
  const bw = Math.max(1, (options.imageWidth ? Math.min(x1, options.imageWidth) : x1) - x0);
  const bh = Math.max(1, (options.imageHeight ? Math.min(y1, options.imageHeight) : y1) - y0);

  // 枠の長辺が maxSide になるように縮める（外接矩形はそのぶん少し大きくなる）
  const scale = Math.min(1, maxSide / Math.max(crop.w, crop.h));
  const ctx = ImageManipulator.manipulate(uri)
    .crop({ originX: x0, originY: y0, width: bw, height: bh })
    .resize({ width: Math.max(1, Math.round(bw * scale)) });
  const boxed = await renderGray(ctx);

  // リサイズは丸められるので、実際に出てきた寸法から倍率を割り出す
  const s = boxed.width / bw;
  const outW = Math.max(1, Math.round(crop.w * s));
  const outH = Math.max(1, Math.round(crop.h * s));
  return sampleOrientedRect(
    boxed,
    {
      cx: (crop.cx - x0) * s,
      cy: (crop.cy - y0) * s,
      w: crop.w * s,
      h: crop.h * s,
      angleDeg: crop.angleDeg,
    },
    outW,
    outH,
  );
}

/** 切り出した画像そのもの。人に見せて、さらに囲んでもらうために使う */
export type CroppedImage = { uri: string; width: number; height: number };

/**
 * 元画像から、軸に平行な範囲を切り出して1枚の画像として保存する。
 *
 * カメラの白い枠で切ったところを**人に見せる**ために要る。
 * 見せずにそのまま読むと、枠から外れていたことに誰も気づけない。
 * ここで切った画像の上で、もう一度オレンジの枠を動かしてもらう。
 */
export async function cropToUri(
  uri: string,
  rect: { x: number; y: number; w: number; h: number },
  imageWidth: number,
  imageHeight: number,
): Promise<CroppedImage> {
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(rect.x)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(rect.y)));
  const w = Math.max(1, Math.min(imageWidth - x, Math.round(rect.w)));
  const h = Math.max(1, Math.min(imageHeight - y, Math.round(rect.h)));

  const ctx = ImageManipulator.manipulate(uri).crop({
    originX: x,
    originY: y,
    width: w,
    height: h,
  });
  const ref = await ctx.renderAsync();
  try {
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
    return {
      uri: saved.uri,
      width: saved.width > 0 ? saved.width : w,
      height: saved.height > 0 ? saved.height : h,
    };
  } finally {
    release(ref);
    release(ctx);
  }
}
