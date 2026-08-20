/**
 * マイクローゼット（保存した服）。
 *
 * 保存するのは**記号だけ**で、洗い方の文章は保存しない。
 * 規則エンジン（lib/plan.ts）を直したときに、過去に保存した服にもその修正が
 * そのまま効くようにするため。文章を保存すると、直した日を境に古い服だけ
 * 古い言い回しのまま残る。
 *
 * 置き場所は端末の中（AsyncStorage）だけ。写真もサーバへ送らない。
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import type { Selection } from "../../lib/plan";

const KEY = "carelabel.closet.v1";

export type Garment = {
  id: string;
  /** 人が付けた名前。空なら「無題の服 N」を付ける */
  name: string;
  /** 服の写真（端末内のURI） */
  photoUri: string | null;
  /** タグの写真（読み取り経路のときだけ残る） */
  tagPhotoUri: string | null;
  /** 色（COLORS の key）。未選択は null */
  color: string | null;
  /** 種類（KINDS の key）。未選択は null */
  kind: string | null;
  selection: Selection;
  /** どちらの経路で確定したか */
  source: "scan" | "manual";
  /**
   * 読み取りに「要確認」の記号が含まれていたか。
   * 一覧で印を出すために持つ。人が選び直せば false になる。
   */
  needsCheck: boolean;
  /** 保存日時（ISO 8601） */
  savedAt: string;
};

export type ColorOption = { key: string; label: string; hex: string; striped?: boolean };

/** 服の色。タグの記号とは関係ない、持ち主のための情報 */
export const COLORS: ColorOption[] = [
  { key: "white", label: "白", hex: "#ffffff" },
  { key: "offwhite", label: "生成り", hex: "#efe9dc" },
  { key: "beige", label: "ベージュ", hex: "#cbb794" },
  { key: "gray", label: "グレー", hex: "#9b978d" },
  { key: "black", label: "黒", hex: "#2b2a26" },
  { key: "navy", label: "紺", hex: "#2f3a52" },
  { key: "blue", label: "青", hex: "#3f6fa8" },
  { key: "green", label: "緑", hex: "#4a6b4f" },
  { key: "red", label: "赤", hex: "#a83f3f" },
  { key: "pink", label: "ピンク", hex: "#d59aa4" },
  { key: "yellow", label: "黄", hex: "#d9c26a" },
  { key: "brown", label: "茶", hex: "#6b5442" },
  { key: "pattern", label: "柄", hex: "#9b978d", striped: true },
];

export const KINDS = [
  "トップス",
  "ボトムス",
  "アウター",
  "ワンピース",
  "インナー",
  "小物",
] as const;

export function colorOf(key: string | null): ColorOption | null {
  return COLORS.find((c) => c.key === key) ?? null;
}

// ── 保存先 ───────────────────────────────────────

let cache: Garment[] | null = null;
const listeners = new Set<(items: Garment[]) => void>();

function emit() {
  const snapshot = cache ?? [];
  for (const fn of listeners) fn(snapshot);
}

function isGarment(v: unknown): v is Garment {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Partial<Garment>;
  return typeof g.id === "string" && typeof g.selection === "object";
}

export async function loadCloset(): Promise<Garment[]> {
  if (cache !== null) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // 壊れた行があっても全部を失わない。読めた分だけ残す。
    cache = Array.isArray(parsed) ? parsed.filter(isGarment) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(next: Garment[]): Promise<void> {
  cache = next;
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても画面は動く。次の保存でまた試す。
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** 「無題の服 3」のような、まだ使われていない名前 */
export function untitledName(items: Garment[]): string {
  let n = 1;
  const used = new Set(items.map((g) => g.name));
  while (used.has(`無題の服 ${n}`)) n++;
  return `無題の服 ${n}`;
}

export async function addGarment(g: Garment): Promise<void> {
  const items = await loadCloset();
  await persist([g, ...items]);
}

export async function updateGarment(id: string, patch: Partial<Garment>): Promise<void> {
  const items = await loadCloset();
  await persist(items.map((g) => (g.id === id ? { ...g, ...patch, id: g.id } : g)));
}

export async function removeGarment(id: string): Promise<void> {
  const items = await loadCloset();
  await persist(items.filter((g) => g.id !== id));
}

/** 画面から使う。保存の読み込みが終わるまで ready は false */
export function useCloset(): { items: Garment[]; ready: boolean } {
  const [items, setItems] = useState<Garment[]>(cache ?? []);
  const [ready, setReady] = useState(cache !== null);

  useEffect(() => {
    let alive = true;
    listeners.add(setItems);
    loadCloset().then((list) => {
      if (!alive) return;
      setItems(list);
      setReady(true);
    });
    return () => {
      alive = false;
      listeners.delete(setItems);
    };
  }, []);

  return { items, ready };
}
