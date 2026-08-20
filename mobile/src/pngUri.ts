/**
 * 読み取りに使った画像そのものを、画面に出せる形（data URI）に変える。
 *
 * 読み取り中の画面と確認の画面で見せているのは、撮った写真ではなく
 * **認識器が実際に見た画像**（白い枠で切り出し、縮めたグレースケール）。
 * 撮った写真を見せると、記号が小さすぎて読めなかったときに
 * 「ちゃんと写っているのに何で？」という食い違いが起きる。
 * 認識器と同じものを見せれば、小さい・暗い・切れているが人の目にも分かる。
 *
 * 符号化は upng-js（デコードにも使っている純JS実装）を使う。
 * ネイティブモジュールを足さずに済むので Expo Go のまま動く。
 */

import UPNG from "upng-js";

import type { GrayImage } from "../../lib/vision/binarize";
import type { SymbolBox } from "../../lib/vision/segment";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==";
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
}

export type Region = { x: number; y: number; w: number; h: number };

function clampRegion(img: GrayImage, r: Region): Region {
  const x = Math.max(0, Math.min(img.width - 1, Math.round(r.x)));
  const y = Math.max(0, Math.min(img.height - 1, Math.round(r.y)));
  const w = Math.max(1, Math.min(img.width - x, Math.round(r.w)));
  const h = Math.max(1, Math.min(img.height - y, Math.round(r.h)));
  return { x, y, w, h };
}

/**
 * グレースケールの一部を PNG の data URI にする。
 * `maxSide` を超える分は整数倍で間引く（拡大はしない）。
 */
export function grayToPngUri(
  img: GrayImage,
  region?: Region,
  maxSide = 512,
): string {
  const r = clampRegion(img, region ?? { x: 0, y: 0, w: img.width, h: img.height });
  const step = Math.max(1, Math.ceil(Math.max(r.w, r.h) / maxSide));
  const outW = Math.max(1, Math.floor(r.w / step));
  const outH = Math.max(1, Math.floor(r.h / step));

  const rgba = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = r.y + y * step;
    for (let x = 0; x < outW; x++) {
      const v = img.data[sy * img.width + (r.x + x * step)];
      const p = (y * outW + x) * 4;
      rgba[p] = v;
      rgba[p + 1] = v;
      rgba[p + 2] = v;
      rgba[p + 3] = 255;
    }
  }

  const ab = new ArrayBuffer(rgba.byteLength);
  new Uint8Array(ab).set(rgba);
  const png = UPNG.encode([ab], outW, outH, 0);
  return `data:image/png;base64,${bytesToBase64(new Uint8Array(png))}`;
}

/** 切り出した記号1個ぶん。周りに少し余白を付ける */
export function boxToRegion(box: SymbolBox, pad = 4): Region {
  return {
    x: box.x0 - pad,
    y: box.y0 - pad,
    w: box.x1 - box.x0 + pad * 2,
    h: box.y1 - box.y0 + pad * 2,
  };
}
