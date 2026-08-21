/**
 * 1分類ぶんの記号を並べたグリッドと、それを載せたシート。
 *
 * 手入力の画面（1分類ずつ進む）と、読み取りの確認画面から呼ぶ「直す」の
 * 両方で同じ見た目にするため、部品として切り出してある。
 *
 * 番号が未確認の記号（令和6年8月改正で増えたもの）は番号を出さない。
 * 出すと「JIS の番号」として通ってしまう。
 */

import React from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { symbolsOf, type CategoryId } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { T, TYPE } from "./theme";
import { NavBar, OutlineButton } from "./ui";

export function SymbolGrid({
  category,
  selected,
  onPick,
  size = 46,
}: {
  category: CategoryId;
  selected?: string;
  onPick: (code: string) => void;
  size?: number;
}) {
  return (
    <View style={s.grid}>
      {symbolsOf(category).map((def) => {
        const on = selected === def.code;
        return (
          <Pressable
            key={def.code}
            onPress={() => onPick(def.code)}
            style={[s.chip, on && s.chipOn]}
          >
            <CareSymbolNative glyph={def.glyph} size={size} />
            <Text style={s.chipLabel} numberOfLines={2}>
              {def.name}
            </Text>
            <Text style={s.chipCode}>
              {def.numberUnverified === true ? "番号未確認" : def.code}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** タブに書かれている分類名（洗濯・漂白…）を使った問いかけ */
export function questionOf(tab: string): string {
  return `${tab}の記号は？`;
}

export function CategorySheet({
  category,
  tab,
  selected,
  previewUri,
  onPick,
  onClear,
  onClose,
}: {
  category: CategoryId | null;
  tab: string;
  selected?: string;
  /**
   * 直そうとしている記号の切り抜き。
   * 選び直す画面に来た時点で「どんな形だったか」を忘れる。戻って見比べさせない。
   */
  previewUri?: string | null;
  onPick: (code: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={category !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.sheet}>
        <NavBar title={category === null ? "" : questionOf(tab)} left="閉じる" onLeft={onClose} />
        <ScrollView contentContainerStyle={s.sheetBody}>
          {previewUri != null && previewUri !== "" && (
            <View style={s.preview}>
              <Image source={{ uri: previewUri }} style={s.previewImg} resizeMode="contain" />
              <View style={s.previewText}>
                <Text style={s.previewTitle}>タグのこの部分</Text>
                <Text style={s.previewBody}>
                  読み取りに使った画像です。これと同じ形の記号を選んでください。
                </Text>
              </View>
            </View>
          )}
          <Text style={s.sheetLead}>
            タグにある記号を1つ選んでください。タグに無いときは「この分類はタグに無い」を押してください。
          </Text>
          {category !== null && (
            <SymbolGrid category={category} selected={selected} onPick={onPick} />
          )}
          <Text style={s.sheetNote}>
            「無い」は「表示なし」として記録します。「制限がない」という意味にはしません。
          </Text>
          <OutlineButton label="この分類はタグに無い" onPress={onClear} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    width: "31.5%",
    alignItems: "center",
    gap: 6,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radiusLg,
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: T.surface,
  },
  chipOn: { borderColor: T.accent, borderWidth: 2, backgroundColor: T.accentWeak },
  chipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: T.ink,
    textAlign: "center",
    minHeight: 32,
  },
  chipCode: { fontSize: 10.5, color: T.muted },

  sheet: { flex: 1, backgroundColor: T.bg },
  sheetBody: { padding: 16, paddingBottom: 40, gap: 14 },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: T.radiusLg,
  },
  previewImg: {
    width: 84,
    height: 84,
    backgroundColor: T.surface,
    borderRadius: 6,
  },
  previewText: { flex: 1 },
  previewTitle: { fontSize: TYPE.body, fontWeight: "700", color: T.ink },
  previewBody: { fontSize: TYPE.small, lineHeight: 19, color: T.muted, marginTop: 3 },
  sheetLead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted },
  sheetNote: { fontSize: 12, lineHeight: 18, color: T.muted },
});
