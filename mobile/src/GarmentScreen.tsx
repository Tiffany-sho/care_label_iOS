/**
 * ⑨ 服の詳細。
 *
 * 保存してあるのは記号だけ。洗い方は開くたびに lib/plan.ts で計算し直す。
 * 規則を直せば、過去に保存した服にもその場で反映される。
 */

import React from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CATEGORIES, SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import type { Garment } from "./closet";
import { colorOf } from "./closet";
import PlanView from "./PlanView";
import { T, TYPE } from "./theme";
import { Icon, NavBar } from "./ui";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function GarmentScreen({
  garment,
  onBack,
  onEditSymbols,
  onEditInfo,
  onDelete,
}: {
  garment: Garment;
  onBack: () => void;
  onEditSymbols: () => void;
  onEditInfo: () => void;
  onDelete: () => void;
}) {
  const color = colorOf(garment.color);

  return (
    <View style={s.root}>
      <NavBar
        left="‹ マイクローゼット"
        onLeft={onBack}
        right="記号を編集"
        onRight={onEditSymbols}
      />

      <ScrollView contentContainerStyle={s.body}>
        <View style={s.photo}>
          {garment.photoUri === null ? (
            <>
              <Icon name="image" size={28} color={T.muted} width={1.5} />
              <Text style={s.photoHint}>写真はこの端末の中だけに保存されます</Text>
            </>
          ) : (
            <Image source={{ uri: garment.photoUri }} style={s.photoImg} resizeMode="cover" />
          )}
        </View>

        <View style={s.pad}>
          <View style={s.nameRow}>
            <Text style={s.name}>{garment.name}</Text>
            <Pressable onPress={onEditInfo} hitSlop={8}>
              <Text style={s.edit}>直す</Text>
            </Pressable>
          </View>
          <Text style={s.meta}>
            {formatDate(garment.savedAt)} に保存 ・{" "}
            {garment.source === "scan" ? "読み取りから" : "手で選んで"}
            {color === null ? "" : ` ・ ${color.label}`}
            {garment.kind === null ? "" : ` ・ ${garment.kind}`}
          </Text>

          <View style={s.strip}>
            {CATEGORIES.map((c) => {
              const code = garment.selection[c.id];
              const def = code ? SYMBOL_BY_CODE[code] : undefined;
              return (
                <View key={c.id} style={s.slot}>
                  {def !== undefined ? (
                    <CareSymbolNative glyph={def.glyph} size={30} />
                  ) : (
                    <View style={s.slotEmpty} />
                  )}
                  <Text style={s.slotLabel} numberOfLines={1}>
                    {c.tab}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={s.h2}>洗い方</Text>
          <Text style={s.lead}>
            数字は「ここまでなら大丈夫」という上限です。おすすめの温度ではありません。
          </Text>

          <View style={s.plan}>
            <PlanView selection={garment.selection} />
          </View>

          <Pressable
            style={s.delete}
            onPress={() =>
              Alert.alert("この服を削除しますか", `「${garment.name}」を消します。`, [
                { text: "やめる", style: "cancel" },
                { text: "削除", style: "destructive", onPress: onDelete },
              ])
            }
          >
            <Icon name="trash" size={16} color={T.danger} width={1.8} />
            <Text style={s.deleteText}>この服を削除</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingBottom: 28 },
  photo: {
    height: 150,
    backgroundColor: T.surface3,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  photoImg: { width: "100%", height: "100%" },
  photoHint: { fontSize: 12, color: T.muted },

  pad: { padding: 16 },
  nameRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  name: { flex: 1, fontSize: TYPE.h1, fontWeight: "700", color: T.ink },
  edit: { fontSize: TYPE.small, color: T.accent },
  meta: { fontSize: TYPE.small, color: T.muted, marginTop: 3 },

  strip: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    padding: 10,
    backgroundColor: T.surface2,
    borderRadius: T.radiusLg,
  },
  slot: { alignItems: "center", gap: 4, width: 44 },
  slotEmpty: {
    width: 30,
    height: 33,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.borderStrong,
    borderRadius: 4,
    backgroundColor: T.surface3,
  },
  slotLabel: { fontSize: 10, color: T.muted },

  h2: { fontSize: TYPE.h2, fontWeight: "700", color: T.ink, marginTop: 18 },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 4 },
  plan: { marginTop: 12 },

  delete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
  },
  deleteText: { fontSize: TYPE.body, color: T.danger, fontWeight: "600" },
});
