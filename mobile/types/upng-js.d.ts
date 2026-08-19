/**
 * upng-js は型定義を同梱していないので、使う分だけ宣言する。
 * 実装は node_modules/upng-js/UPNG.js（純JSのPNGデコーダ）。
 */
declare module "upng-js" {
  export type UPNGImage = {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    data: Uint8Array;
    frames: unknown[];
    tabs: Record<string, unknown>;
  };

  /** PNG のバイト列をデコードする */
  export function decode(buffer: ArrayBuffer): UPNGImage;

  /** フレームごとの RGBA8 バッファを返す（静止画なら [0] のみ） */
  export function toRGBA8(image: UPNGImage): ArrayBuffer[];

  const UPNG: {
    decode: typeof decode;
    toRGBA8: typeof toRGBA8;
  };
  export default UPNG;
}
