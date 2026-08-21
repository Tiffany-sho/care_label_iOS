/**
 * 画面上の白い枠 → 元画像の画素座標。
 *
 * カメラのプレビューは cover（縦横比を保って埋め、はみ出す分を中央で捨てる）で
 * 表示される前提。撮れた写真はプレビューより広い範囲を含むので、画面で見えている
 * 位置と写真の中の位置は一致しない。ここがずれると、白い枠に合わせたつもりの
 * ところと違う場所を読むことになる。
 *
 * React Native に依存させていないのは、この計算だけを机上で確かめられるように
 * するため（tools/verify_frame_crop.cjs）。実機のプレビューが本当に cover か
 * どうかは、ここでは確かめられない。それは実機で見るしかない。
 */

export type ScreenRect = { x: number; y: number; width: number; height: number };

/** 傾いた長方形（lib/vision/rotate.ts の OrientedRect と同じ形） */
export type ImageRect = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angleDeg: number;
};

/** 枠が小さすぎて切り出す意味がない、と判断する画素数 */
const MIN_PX = 16;

export function frameToImageRect(
  frame: ScreenRect,
  preview: { width: number; height: number },
  imgW: number,
  imgH: number,
): ImageRect | null {
  if (preview.width <= 0 || preview.height <= 0 || imgW <= 0 || imgH <= 0) return null;

  const scale = Math.max(preview.width / imgW, preview.height / imgH);
  const offX = (preview.width - imgW * scale) / 2;
  const offY = (preview.height - imgH * scale) / 2;

  let x0 = (frame.x - offX) / scale;
  let y0 = (frame.y - offY) / scale;
  let x1 = (frame.x + frame.width - offX) / scale;
  let y1 = (frame.y + frame.height - offY) / scale;

  // 画面外へはみ出した分は、写真に無いので落とす
  x0 = Math.max(0, Math.min(imgW, x0));
  x1 = Math.max(0, Math.min(imgW, x1));
  y0 = Math.max(0, Math.min(imgH, y0));
  y1 = Math.max(0, Math.min(imgH, y1));
  if (x1 - x0 < MIN_PX || y1 - y0 < MIN_PX) return null;

  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0,
    h: y1 - y0,
    angleDeg: 0,
  };
}
