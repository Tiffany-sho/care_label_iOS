/**
 * 連結成分ラベリング（8近傍、union-find）。
 * tools/features.py の label_components の移植。
 *
 * 走査順・ラベル採番順・Map の挿入順を Python の dict と一致させてある。
 * 「面積最大の成分」を選ぶときに同点が出た場合、両言語とも最初のものを選ぶ必要があるため。
 */

import type { Mask } from "./binarize";

export type Comp = {
  root: number;
  area: number;
  y0: number;
  y1: number;
  x0: number;
  x1: number;
};

export type Labelled = {
  /** 各画素のルートラベル。インクでない画素は -1 */
  labels: Int32Array;
  /** 挿入順は「そのルートに属する最初の画素のラスタ順」 */
  comps: Map<number, Comp>;
};

export function compWidth(c: Comp): number {
  return c.x1 - c.x0 + 1;
}
export function compHeight(c: Comp): number {
  return c.y1 - c.y0 + 1;
}
export function compBoxArea(c: Comp): number {
  return Math.max(1, compWidth(c) * compHeight(c));
}
export function compFill(c: Comp): number {
  return c.area / compBoxArea(c);
}

export function labelComponents(mask: Mask, w: number, h: number): Labelled {
  const labels = new Int32Array(w * h).fill(-1);
  const parent: number[] = [];

  const find = (a: number): number => {
    let x = a;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // Python 側と同じ近傍・同じ順序
  const dy = [-1, -1, -1, 0];
  const dx = [-1, 0, 1, -1];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 0) continue;
      let best = -1;
      for (let k = 0; k < 4; k++) {
        const ny = y + dy[k];
        const nx = x + dx[k];
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
        const lab = labels[ny * w + nx];
        if (lab < 0) continue;
        if (best < 0) best = lab;
        else union(best, lab);
      }
      if (best < 0) {
        best = parent.length;
        parent.push(best);
      }
      labels[y * w + x] = best;
    }
  }

  const comps = new Map<number, Comp>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lab = labels[y * w + x];
      if (lab < 0) continue;
      const root = find(lab);
      labels[y * w + x] = root;
      let c = comps.get(root);
      if (c === undefined) {
        c = { root, area: 0, y0: y, y1: y, x0: x, x1: x };
        comps.set(root, c);
      }
      c.area += 1;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
    }
  }
  return { labels, comps };
}

/** 面積（外接矩形）最大の成分。同点なら挿入順で最初のもの（Python の max と同じ）。 */
export function largestComponent(comps: Map<number, Comp>): Comp | undefined {
  let best: Comp | undefined;
  let bestArea = -1;
  for (const c of comps.values()) {
    const a = compBoxArea(c);
    if (a > bestArea) {
      bestArea = a;
      best = c;
    }
  }
  return best;
}
