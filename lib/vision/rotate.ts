/**
 * 傾き補正。
 *
 * テンプレート照合は回転に弱い。実写のタグは手で持って撮るので数度は必ず傾き、
 * それだけで相関が 0.7 台から 0.3 台まで落ちる。記号列は横一直線に並ぶので、
 * 検出した記号の中心を通る直線から傾きを出して、まっすぐに戻してから読む。
 */

import type { GrayImage } from "./binarize";

/** 点列に最小二乗で直線を当てて、その傾きを度で返す */
export function fitAngleDeg(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const n = points.length;
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
  }
  if (sxx <= 1e-9) return 0;
  return (Math.atan(sxy / sxx) * 180) / Math.PI;
}

/**
 * 画像を中心まわりに angleDeg だけ回す（双一次補間、はみ出しは白）。
 * 出力の大きさは入力と同じ。傾きは数度なので端が切れても記号は残る。
 */
export function rotateGray(img: GrayImage, angleDeg: number): GrayImage {
  const { data, width: w, height: h } = img;
  const out = new Uint8Array(w * h).fill(255);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      // 出力(x,y) に対応する入力座標（逆回転）
      const sxf = cos * dx + sin * dy + cx;
      const syf = -sin * dx + cos * dy + cy;
      if (sxf < 0 || syf < 0 || sxf > w - 1 || syf > h - 1) continue;
      const x0 = Math.floor(sxf);
      const y0 = Math.floor(syf);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const fx = sxf - x0;
      const fy = syf - y0;
      const top = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
      const bot = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
      out[y * w + x] = (top * (1 - fy) + bot * fy) | 0;
    }
  }
  return { data: out, width: w, height: h };
}
