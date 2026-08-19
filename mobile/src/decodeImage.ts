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

/**
 * 撮影画像を読み込んでグレースケールにする。
 *
 * `maxSide` は「1記号あたり110px以上」（lib/vision/reader.ts の実測値）を
 * 満たすための余裕を見た値。タグを画面いっぱいに撮れば、記号5個並びでも
 * 1記号あたり200px以上になる。
 */
export async function loadGrayFromUri(
  uri: string,
  maxSide = 1600,
): Promise<GrayImage> {
  const ref = await ImageManipulator.manipulate(uri)
    .resize({ width: maxSide })
    .renderAsync();
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
