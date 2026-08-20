/**
 * 画像ファイル → グレースケールの生画素。
 *
 * Expo Go で完結させるため、ネイティブモジュールを足さずに
 * expo-image-manipulator（リサイズ）＋ 純JSのPNGデコーダで済ませている。
 * Skia を入れれば readPixels で一発だが、その時点で Expo Go では動かなくなり、
 * dev build が必須になる。最初の一歩を重くしないほうを取った。
 */

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import UPNG from "upng-js";

import type { GrayImage } from "../../lib/vision/binarize";

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

export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * 撮影画像を読み込んでグレースケールにする。
 *
 * `crop` は元画像の画素座標。渡されたときは、先に切り出してからリサイズする。
 * この順序が重要で、写真全体をそのまま縮めると、タグが画面の一部しか
 * 占めていない場合に1記号が数十pxまで落ちる（実測で110px以上が必要、
 * lib/vision/reader.ts）。囲んでもらった範囲を原寸で切り出してから縮めれば、
 * 記号は大きいまま残る。処理する画素数も減るので、そのぶん速くなる。
 *
 * `maxSide` は端末上で純JS処理する画素数の上限。
 */
export async function loadGrayFromUri(
  uri: string,
  options: { crop?: CropRect; maxSide?: number } = {},
): Promise<GrayImage> {
  const maxSide = options.maxSide ?? 1400;
  const crop = options.crop;

  let ctx = ImageManipulator.manipulate(uri);
  if (crop && crop.w > 0 && crop.h > 0) {
    ctx = ctx.crop({
      originX: crop.x,
      originY: crop.y,
      width: crop.w,
      height: crop.h,
    });
  }
  // 長辺を maxSide に合わせる（resize は片方だけ渡すと比率を保つ）
  ctx =
    crop === undefined || crop.w >= crop.h
      ? ctx.resize({ width: maxSide })
      : ctx.resize({ height: maxSide });

  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.PNG, base64: true });
  if (!saved.base64) throw new Error("画像のエンコードに失敗しました");

  const bytes = base64ToBytes(saved.base64);
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
