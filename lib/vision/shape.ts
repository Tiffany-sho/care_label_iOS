/**
 * 記号を「外形」と「中身」に分ける幾何の道具。
 *
 * なぜ要るか（測定にもとづく）:
 *   これまでは記号全体を 56x64 に正規化して1回の相関で41クラスを当てていた。
 *   実写ではこれが原理的に足りない。「30」と「40」の差はそのパッチ上で
 *   数十画素しかなく、150/170/180 の相関がほぼ同値になってマージンが崩れる。
 *   日陰の斜線・下線の本数・点の個数も同じ理由で全体相関からは分離できない。
 *   さらに、下線があると外接矩形が縦に伸びるので、**下線の有無が中身の
 *   正規化まで変えてしまう**（下線2本の桶は本体が7割に潰れる）。
 *
 *   そこで、外形（＝基本形を決めるもの）と中身（＝温度の数字・文字・点・線）を
 *   先に切り分ける。外形は穴を埋めたシルエットで見る。禁止の×は図形の**内側**に
 *   引かれるので、穴を埋めたシルエットはほとんど×の影響を受けない。
 *   以前試して取り下げられた「×を消してから照合する」案とは別物で、
 *   こちらは消さずに埋める。
 */

import type { Mask } from "./binarize";
import { compBoxArea, type Comp, type Labelled } from "./components";

export type Box = { x0: number; y0: number; x1: number; y1: number };

export function boxWidth(b: Box): number {
  return b.x1 - b.x0 + 1;
}
export function boxHeight(b: Box): number {
  return b.y1 - b.y0 + 1;
}

/**
 * 外形の成分。外接矩形の面積が最大のものを採る。
 *
 * 面積（画素数）ではなく外接矩形で選ぶのは、輪郭線が細いため。
 * 塗りつぶされた大きな汚れより、細い線でできた大きな枠のほうを外形としたい。
 * 禁止の×は輪郭と交差して同じ成分に融合するので、自然にここへ含まれる。
 */
export function bodyComponent(labelled: Labelled): Comp | null {
  let best: Comp | null = null;
  let bestArea = -1;
  for (const c of labelled.comps.values()) {
    const a = compBoxArea(c);
    if (a > bestArea) {
      bestArea = a;
      best = c;
    }
  }
  return best;
}

/** ある成分だけを 1 とした、その外接矩形ぶんのマスク。 */
export function componentMask(
  labelled: Labelled,
  w: number,
  comp: Comp,
): { mask: Mask; w: number; h: number } {
  const sw = comp.x1 - comp.x0 + 1;
  const sh = comp.y1 - comp.y0 + 1;
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      out[y * sw + x] = labelled.labels[(comp.y0 + y) * w + (comp.x0 + x)] === comp.root ? 1 : 0;
    }
  }
  return { mask: out, w: sw, h: sh };
}

/**
 * 縁から届かない背景画素（＝図形に囲まれた穴）を 1 にしたマスク。
 * 明示スタックで塗る（端末で再帰は深くしたくない）。
 */
export function holeMask(mask: Mask, w: number, h: number): Mask {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number): void => {
    if (mask[i] === 0 && seen[i] === 0) {
      seen[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const y = (i / w) | 0;
    const x = i - y * w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const holes = new Uint8Array(w * h);
  for (let i = 0; i < holes.length; i++) holes[i] = mask[i] === 0 && seen[i] === 0 ? 1 : 0;
  return holes;
}

/** 穴を埋めたシルエット。基本形はこれで見る。 */
export function fillHoles(mask: Mask, w: number, h: number): Mask {
  const holes = holeMask(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || holes[i];
  return out;
}

/**
 * いちばん大きな穴の外接矩形。＝図形の内側。
 * 桶なら水の入る部分、円なら円の内側。ここに温度の数字や P/F/W が載る。
 */
export function largestHoleBox(mask: Mask, w: number, h: number): Box | null {
  const holes = holeMask(mask, w, h);
  // 穴どうしは連結成分にせず、行ごとの塗り分けで数える必要はない。
  // 「いちばん大きな穴」を取るために、簡単な union-find ではなく
  // 4近傍の塗りつぶしで領域ごとに面積と外接矩形を出す。
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best: Box | null = null;
  let bestArea = 0;
  for (let s = 0; s < holes.length; s++) {
    if (holes[s] === 0 || seen[s] === 1) continue;
    let top = 0;
    seen[s] = 1;
    stack[top++] = s;
    let area = 0;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    while (top > 0) {
      const i = stack[--top];
      const y = (i / w) | 0;
      const x = i - y * w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && holes[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && holes[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack[top++] = i + 1;
      }
      if (y > 0 && holes[i - w] && !seen[i - w]) {
        seen[i - w] = 1;
        stack[top++] = i - w;
      }
      if (y < h - 1 && holes[i + w] && !seen[i + w]) {
        seen[i + w] = 1;
        stack[top++] = i + w;
      }
    }
    if (area > bestArea) {
      bestArea = area;
      best = { x0, y0, x1, y1 };
    }
  }
  return best;
}

/**
 * 対角線に沿ったインクの被覆率。禁止の×を見つけるために使う。
 *
 * ×は基本形ごとに大きさが違うが、どれも**外接矩形の対角線とほぼ重なる**
 * ように引かれている（lib/glyphSvg.ts の cross(...) の座標）。
 * 対角線上を等間隔にたどり、その近傍 tol 画素にインクがあれば当たりとする。
 * 線の太さと傾きのずれを吸収するために近傍を見る。
 *
 * 戻り値は2本の対角線それぞれの被覆率 [左上→右下, 右上→左下]。
 */
export function diagonalCoverage(
  mask: Mask,
  w: number,
  h: number,
  tol = 0,
): [number, number] {
  const radius = tol > 0 ? tol : Math.max(1, Math.round(Math.min(w, h) * 0.04));
  const steps = Math.max(16, Math.round(Math.max(w, h)));
  const hit = (cx: number, cy: number): boolean => {
    const x0 = Math.max(0, Math.round(cx) - radius);
    const x1 = Math.min(w - 1, Math.round(cx) + radius);
    const y0 = Math.max(0, Math.round(cy) - radius);
    const y1 = Math.min(h - 1, Math.round(cy) + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (mask[y * w + x]) return true;
      }
    }
    return false;
  };
  let a = 0;
  let b = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (hit(t * (w - 1), t * (h - 1))) a++;
    if (hit((1 - t) * (w - 1), t * (h - 1))) b++;
  }
  return [a / (steps + 1), b / (steps + 1)];
}

/**
 * 禁止の×を、図形の中心を通る直線として探す。
 *
 * 最初は外接矩形の対角線をそのままたどったが、実写の `200`（漂白不可）で
 * 被覆が 0.63〜0.75 までしか出ず、8件を取りこぼした。×の腕が矩形の角まで
 * 届いていない（印字ごとに大きさが違う）のが原因。
 * ×が必ず満たす性質は「**図形の中心を通る**斜めの直線が2方向ある」ことなので、
 * 角ではなく中心を固定して角度を振る。
 *
 * 戻り値は2つの角度帯（右下がり / 右上がり）それぞれの最大被覆率。
 */
export function crossScore(
  mask: Mask,
  w: number,
  h: number,
  tolRatio = 0.05,
): [number, number] {
  const d = crossDetail(mask, w, h, tolRatio);
  return [d.center[0], d.center[1]];
}

export type CrossDetail = {
  /** 中心を通る直線の最大被覆率 [右下がり, 右上がり] */
  center: [number, number];
  /** 同じ向きで中心から離した平行線の最大被覆率 */
  offset: [number, number];
};

/**
 * 中心を通る線と、そこから離した平行線の被覆を両方返す。
 *
 * 中心の被覆だけでは、**手洗いの手**（桶の内側を埋める塊）が
 * ×と同じ 0.94 まで上がってしまい、境目が 0.94 と 0.95 の間しかなくなる。
 * ×は「中心にだけ線がある」構造なので、中心から離した平行線の被覆は落ちる。
 * 塊なら離しても落ちない。この差を見れば境目が広がる。
 */
export function crossDetail(
  mask: Mask,
  w: number,
  h: number,
  tolRatio = 0.03,
): CrossDetail {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n === 0) return { center: [0, 0], offset: [0, 0] };
  const cx = sx / n;
  const cy = sy / n;
  const tol = Math.max(1, Math.round(Math.min(w, h) * tolRatio));
  const hit = (x: number, y: number): boolean => {
    const x0 = Math.max(0, Math.round(x) - tol);
    const x1 = Math.min(w - 1, Math.round(x) + tol);
    const y0 = Math.max(0, Math.round(y) - tol);
    const y1 = Math.min(h - 1, Math.round(y) + tol);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) if (mask[yy * w + xx]) return true;
    }
    return false;
  };
  // 中心から両側に伸ばし、図形の外接矩形の中に収まる範囲だけを見る
  const coverage = (deg: number, offX = 0, offY = 0): number => {
    const r = (deg * Math.PI) / 180;
    const dx = Math.cos(r);
    const dy = Math.sin(r);
    const px = cx + offX;
    const py = cy + offY;
    if (px < 0 || px > w - 1 || py < 0 || py > h - 1) return 0;
    // 矩形の縁に当たるまでの距離
    const lim = (d: number, c: number, size: number): number =>
      d === 0 ? Infinity : d > 0 ? (size - 1 - c) / d : -c / d;
    const tPos = Math.min(lim(dx, px, w), lim(dy, py, h));
    const tNeg = Math.min(lim(-dx, px, w), lim(-dy, py, h));
    const len = tPos + tNeg;
    if (!Number.isFinite(len) || len < 4) return 0;
    const steps = Math.max(16, Math.round(len));
    let ok = 0;
    for (let i = 0; i <= steps; i++) {
      const t = -tNeg + (len * i) / steps;
      if (hit(px + dx * t, py + dy * t)) ok++;
    }
    return ok / (steps + 1);
  };
  let a = 0;
  let b = 0;
  let ao = 0;
  let bo = 0;
  const shift = 0.3 * Math.min(w, h);
  for (let deg = 20; deg <= 70; deg += 2) {
    const v = coverage(deg);
    if (v > a) a = v;
    const u = coverage(180 - deg);
    if (u > b) b = u;
    for (const sgn of [-1, 1]) {
      const r = (deg * Math.PI) / 180;
      const p = coverage(deg, -Math.sin(r) * shift * sgn, Math.cos(r) * shift * sgn);
      if (p > ao) ao = p;
      const r2 = ((180 - deg) * Math.PI) / 180;
      const q = coverage(180 - deg, -Math.sin(r2) * shift * sgn, Math.cos(r2) * shift * sgn);
      if (q > bo) bo = q;
    }
  }
  return { center: [a, b], offset: [ao, bo] };
}

/**
 * 形の1次元記述子。行ごと・列ごとのインクの幅を n 個の帯に均して並べる。
 *
 * 2次元の相関は、実写だと線の太さと縁の荒れで 0.3〜0.6 までしか出ず、
 * 1位が入れ替わってしまう（基本形の判定で 81% しか出なかった）。
 * 一方「上が細くて下が広い（三角）」「一定（四角）」「弧（円）」といった
 * **輪郭の太り方**は、太さや荒れにほとんど影響されない。
 * 穴を埋めたシルエットに対して測ることで、中身（数字・点・線）にも左右されない。
 */
export function shapeProfile(mask: Mask, w: number, h: number, n = 24): Float64Array {
  const rows = new Float64Array(n);
  const cols = new Float64Array(n);
  const rowCount = new Float64Array(n);
  const colCount = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    }
    const bin = Math.min(n - 1, Math.floor((y * n) / h));
    rows[bin] += x0 < 0 ? 0 : (x1 - x0 + 1) / w;
    rowCount[bin]++;
  }
  for (let x = 0; x < w; x++) {
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      if (mask[y * w + x]) {
        if (y0 < 0) y0 = y;
        y1 = y;
      }
    }
    const bin = Math.min(n - 1, Math.floor((x * n) / w));
    cols[bin] += y0 < 0 ? 0 : (y1 - y0 + 1) / h;
    colCount[bin]++;
  }
  const out = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rowCount[i] > 0 ? rows[i] / rowCount[i] : 0;
    out[n + i] = colCount[i] > 0 ? cols[i] / colCount[i] : 0;
  }
  return out;
}

/**
 * 線の太さの見積り。水平走査でのインクの連なりの長さの中央値。
 *
 * 中身を切り出すために外形を内側へ削るとき、削る量を「短辺の何割」で
 * 決めると桶で失敗する。桶は線が太く、割合で削ると輪郭の切れ端が
 * 内側に残って、正規化パッチをそれが支配してしまう（実測: 桶 5/15）。
 * 削るべき量は図形の大きさではなく**線の太さ**で決まるので、そこを測る。
 *
 * 長すぎる連なり（外接矩形の4割超）は、塗りつぶしや下線なので数えない。
 */
export function strokeWidth(mask: Mask, w: number, h: number, box: Box): number {
  const bw = box.x1 - box.x0 + 1;
  const maxRun = Math.max(2, Math.round(0.4 * bw));
  const runs: number[] = [];
  for (let y = box.y0; y <= box.y1; y++) {
    let run = 0;
    for (let x = box.x0; x <= box.x1 + 1; x++) {
      const on = x <= box.x1 && mask[y * w + x] === 1;
      if (on) run++;
      else {
        if (run > 0 && run <= maxRun) runs.push(run);
        run = 0;
      }
    }
  }
  if (runs.length === 0) return Math.max(1, Math.round(bw / 20));
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)];
}
