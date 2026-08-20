/**
 * ⑧ マイクローゼット。持ち物が並ぶ見た目にする（写真の2列グリッド）。
 *
 * 写真の上に出す印は、行動が変わるものだけ（要確認・家で洗えない）。
 * 「タグに表示なし」は説明の下に小さく出す。件数が多いので、上に出すと
 * どのカードにも同じ印が付いて意味を失う。
 */

import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { buildHighlight } from "../../lib/summary";
import { CATEGORIES, SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import type { Garment } from "./closet";
import { T, TYPE } from "./theme";
import { Icon, PrimaryButton } from "./ui";

function Card({ g, onPress }: { g: Garment; onPress: () => void }) {
  const high = buildHighlight(g.selection);
  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={s.photo}>
        {g.photoUri === null ? (
          <Icon name="image" size={26} color="#a9a496" width={1.5} />
        ) : (
          <Image source={{ uri: g.photoUri }} style={s.photoImg} resizeMode="cover" />
        )}
        {high.homeWashBlocked ? (
          <View style={[s.flag, { backgroundColor: "rgba(207,34,46,0.92)" }]}>
            <Text style={s.flagText}>家で洗えない</Text>
          </View>
        ) : g.needsCheck ? (
          <View style={[s.flag, { backgroundColor: "rgba(154,103,0,0.92)" }]}>
            <Text style={s.flagText}>要確認</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.name} numberOfLines={1}>
        {g.name}
      </Text>

      <View style={s.symbols}>
        {CATEGORIES.map((c) => {
          const code = g.selection[c.id];
          return code === undefined ? null : (
            <CareSymbolNative key={c.id} glyph={SYMBOL_BY_CODE[code].glyph} size={18} />
          );
        })}
      </View>

      <Text style={s.short}>{high.short}</Text>
      {high.missing.length > 0 && (
        <Text style={s.missing}>タグに表示なし {high.missing.length}件</Text>
      )}
    </Pressable>
  );
}

export default function ClosetScreen({
  items,
  ready,
  onOpen,
  onAdd,
}: {
  items: Garment[];
  ready: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.root}>
      <View style={s.head}>
        <Text style={s.title}>マイクローゼット</Text>
        <Pressable style={s.add} onPress={onAdd}>
          <Icon name="plus" size={14} color={T.ink} width={2.2} />
          <Text style={s.addText}>追加</Text>
        </Pressable>
      </View>
      <Text style={s.count}>
        {ready ? `${items.length}点・新しい順` : "読み込んでいます…"}
      </Text>

      {ready && items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>まだ1着も入っていません</Text>
          <Text style={s.emptyBody}>
            タグを読み取って、そのまま保存できます。保存するのは記号なので、
            洗い方はいつ開いても今の規則で計算し直されます。
          </Text>
          <PrimaryButton label="タグを読み取る" onPress={onAdd} />
        </View>
      ) : (
        <View style={s.grid}>
          {items.map((g) => (
            <Card key={g.id} g={g} onPress={() => onOpen(g.id)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: 18, paddingBottom: 28 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: TYPE.title, fontWeight: "700", color: T.ink },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: 999,
  },
  addText: { fontSize: 13, fontWeight: "700", color: T.ink },
  count: { fontSize: 13, color: T.muted, marginTop: 5 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  card: { width: "47.5%" },
  photo: {
    height: 168,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: T.radiusLg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImg: { width: "100%", height: "100%" },
  flag: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  flagText: { color: "#fff", fontSize: TYPE.tiny, fontWeight: "700" },
  name: { fontSize: 15, fontWeight: "700", color: T.ink, marginTop: 8 },
  symbols: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, flexWrap: "wrap" },
  short: { fontSize: TYPE.small, color: T.ink2, marginTop: 5 },
  missing: { fontSize: TYPE.tiny, color: T.muted, marginTop: 3 },

  empty: {
    marginTop: 24,
    padding: 18,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
    gap: 10,
  },
  emptyTitle: { fontSize: TYPE.h2, fontWeight: "700", color: T.ink },
  emptyBody: { fontSize: TYPE.small, lineHeight: 20, color: T.muted },
});
