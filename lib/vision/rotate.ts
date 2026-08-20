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
 * 画像を中心まわりに angleDeg だけ回す（双一次補間、はみ出しは端の画素を延長）。
 *
 * はみ出しを白(255)で埋めていたが、これは黒い生地に白いプリントのタグで壊れる:
 * 二値化は「縁にあるほうが背景」でインクの明暗を決めるので
 * （lib/vision/binarize.ts）、暗いタグの縁を白で埋めると判定が反転する。
 * かといって縁の中央値で埋めると、枠に服の影が入っている写真で暗い額縁を
 * 作ってしまい、実写の一致が 33 -> 30 に落ちた。
 * 端の画素をそのまま延長すれば、明るいタグでも暗いタグでも周りと地続きになる。
 * 出力の大きさは入力と同じ。傾きは数度なので端が切れても記号は残る。
 */
export function rotateGray(img: GrayImage, angleDeg: number): GrayImage {
  const { data, width: w, height: h } = img;
  const out = new Uint8Array(w * h);
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
      const sxf = Math.min(Math.max(cos * dx + sin * dy + cx, 0), w - 1);
      const syf = Math.min(Math.max(-sin * dx + cos * dy + cy, 0), h - 1);
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

/** 傾いた長方形。中心・大きさ・角度（度、時計回りが正） */
export type OrientedRect = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angleDeg: number;
};

/**
 * 傾いた長方形の中身だけを、まっすぐな画像として取り出す。
 *
 * 利用者が枠を傾けて囲めるようにするための土台。切り出し・回転・拡縮を
 * 別々にかけると、そのたびに補間が入って像が甘くなる。出力側の画素から
 * 元画像へ逆に引く一度きりの走査にすれば、補間は1回で済む。
 *
 * `outW`/`outH` を渡すとその大きさに収める（拡縮も同時に行う）。
 * 範囲外は端の画素を延長する（rotateGray と同じ理由）。
 */
export function sampleOrientedRect(
  img: GrayImage,
  rect: OrientedRect,
  outW: number,
  outH: number,
): GrayImage {
  const { data, width: w, height: h } = img;
  const out = new Uint8Array(outW * outH);
  const rad = (rect.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = rect.w / outW;
  const sy = rect.h / outH;

  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) * sy - rect.h / 2;
    for (let x = 0; x < outW; x++) {
      const u = (x + 0.5) * sx - rect.w / 2;
      const fx = Math.min(Math.max(cos * u - sin * v + rect.cx, 0), w - 1);
      const fy = Math.min(Math.max(sin * u + cos * v + rect.cy, 0), h - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const top = data[y0 * w + x0] * (1 - ax) + data[y0 * w + x1] * ax;
      const bot = data[y1 * w + x0] * (1 - ax) + data[y1 * w + x1] * ax;
      out[y * outW + x] = (top * (1 - ay) + bot * ay) | 0;
    }
  }
  return { data: out, width: outW, height: outH };
}

/** 傾いた長方形を覆う、軸に平行な最小の長方形 */
export function boundingBox(rect: OrientedRect): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const rad = (rect.angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const bw = rect.w * c + rect.h * s;
  const bh = rect.w * s + rect.h * c;
  return { x: rect.cx - bw / 2, y: rect.cy - bh / 2, w: bw, h: bh };
}
