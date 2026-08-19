import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  CATEGORIES,
  SYMBOL_BY_CODE,
  symbolsOf,
  type CategoryId,
} from "../../lib/symbols";
import type { Selection } from "../../lib/plan";
import CareSymbolNative from "./CareSymbolNative";
import { T } from "./theme";

export default function SymbolPicker({
  selection,
  onToggle,
  onClear,
}: {
  selection: Selection;
  onToggle: (category: CategoryId, code: string) => void;
  onClear: () => void;
}) {
  const [tab, setTab] = useState<CategoryId>("wash");
  const selected = CATEGORIES.map((c) => selection[c.id]).filter(
    (v): v is string => Boolean(v),
  );

  return (
    <View style={s.card}>
      <Text style={s.h2}>1. タグの記号を選ぶ</Text>
      <Text style={s.sub}>
        タグに並んでいる記号を分類ごとに1つずつ。タグに無い分類は選ばないでください。
      </Text>

      <View style={s.selected}>
        {selected.length === 0 ? (
          <Text style={s.empty}>まだ何も選ばれていません</Text>
        ) : (
          <>
            {selected.map((code) => {
              const def = SYMBOL_BY_CODE[code];
              return (
                <Pressable
                  key={code}
                  style={s.pill}
                  onPress={() => onToggle(def.category, code)}
                >
                  <CareSymbolNative glyph={def.glyph} size={18} />
                  <Text style={s.pillText}>{def.name}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={onClear}>
              <Text style={s.clear}>すべて解除</Text>
            </Pressable>
          </>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs}>
        {CATEGORIES.map((c) => {
          const active = tab === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setTab(c.id)}
              style={[s.tab, active && s.tabActive]}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{c.tab}</Text>
              {selection[c.id] ? <View style={s.dot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={s.grid}>
        {symbolsOf(tab).map((def) => {
          const on = selection[def.category] === def.code;
          return (
            <Pressable
              key={def.code}
              onPress={() => onToggle(def.category, def.code)}
              style={[s.chip, on && s.chipOn]}
            >
              <CareSymbolNative glyph={def.glyph} size={42} />
              <Text style={s.chipLabel} numberOfLines={2}>
                {def.name}
              </Text>
              <Text style={s.chipCode}>{def.code}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius,
    padding: 16,
  },
  h2: { fontSize: 15, fontWeight: "700", color: T.ink, marginBottom: 4 },
  sub: { fontSize: 12.5, color: T.muted, lineHeight: 19, marginBottom: 14 },
  selected: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.surface2,
    borderRadius: T.radius,
    padding: 10,
    minHeight: 52,
    marginBottom: 14,
  },
  empty: { color: T.muted, fontSize: 12.5 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: T.surface,
    borderColor: T.borderStrong,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  pillText: { fontSize: 11.5, fontWeight: "600", color: T.ink },
  clear: { fontSize: 12, color: T.accent, textDecorationLine: "underline" },
  tabs: { marginBottom: 14 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderColor: T.border,
    borderWidth: 1,
    backgroundColor: T.surface2,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
    marginRight: 6,
  },
  tabActive: { backgroundColor: T.ink, borderColor: T.ink },
  tabText: { fontSize: 12.5, fontWeight: "600", color: T.ink2 },
  tabTextActive: { color: "#fff" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    width: "31%",
    alignItems: "center",
    gap: 6,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: T.surface,
  },
  chipOn: { borderColor: T.accent, backgroundColor: T.accentWeak },
  chipLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: T.ink,
    textAlign: "center",
    minHeight: 28,
  },
  chipCode: { fontSize: 9.5, color: T.muted },
});
