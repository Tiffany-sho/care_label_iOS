/**
 * 洗い方の表示。規則エンジン（lib/plan.ts）の出力をそのまま見せる。
 *
 * 1枚のカード（SectionCard）は、洗い方の画面ではタブで1つずつ、
 * 服の詳細では上から順に全部、という2通りの使われ方をする。
 *
 * JIS の番号と「液温」「タンブル乾燥」のような用語は「くわしく」の奥に畳む。
 * 消してはいけない（根拠を示すのがこのアプリの役目）が、
 * 洗濯機の前で最初に読む文章ではない。
 */

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buildPlan, DISCLAIMER, type Section, type Selection } from "../../lib/plan";
import { CATEGORIES, SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { LEVEL_COLORS, LEVEL_LABEL, T, TYPE } from "./theme";
import { Badge, Bullet, Icon, type IconName } from "./ui";

export const SECTION_ICON: Record<string, IconName> = {
  wash: "washer",
  bleach: "bleach",
  dry: "hang",
  iron: "iron",
  pro: "shop",
};

/** タブに出す短い名前（「専門店にまかせる」は幅に入らない） */
export const SECTION_TAB: Record<string, string> = {
  wash: "洗う",
  bleach: "漂白",
  dry: "乾かす",
  iron: "アイロン",
  pro: "クリーニング",
};

export function SectionCard({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const colors = LEVEL_COLORS[section.level];

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={[s.headIcon, { backgroundColor: colors.bg }]}>
          <Icon name={SECTION_ICON[section.id] ?? "info"} size={19} color={colors.fg} />
        </View>
        <Text style={s.h2}>{section.title}</Text>
        <Badge label={LEVEL_LABEL[section.level]} bg={colors.bg} fg={colors.fg} />
      </View>

      {section.headlines.map((h) => (
        <Text key={h} style={s.headline}>
          {h}
        </Text>
      ))}

      {section.notes.map((n) => (
        <Bullet key={n} text={n} />
      ))}

      {section.basis.length > 0 && (
        <>
          <Pressable style={s.basisBar} onPress={() => setOpen((v) => !v)}>
            <Text style={s.basisLabel}>タグのこの記号から</Text>
            {section.basis.map((b) => (
              <CareSymbolNative key={b.code} glyph={SYMBOL_BY_CODE[b.code].glyph} size={20} />
            ))}
            <View style={s.spacer} />
            <Text style={s.more}>{open ? "とじる" : "くわしく ›"}</Text>
          </Pressable>

          {open &&
            section.basis.map((b) => (
              <View key={`d-${b.code}`} style={s.basisItem}>
                <CareSymbolNative glyph={SYMBOL_BY_CODE[b.code].glyph} size={22} />
                <View style={s.basisTextWrap}>
                  <Text style={s.basisMeaning}>{b.meaning}</Text>
                  <Text style={s.basisCode}>
                    {b.numberUnverified === true
                      ? "JIS L 0001（記号番号は未確認）"
                      : `JIS L 0001 記号 ${b.code}`}
                  </Text>
                </View>
              </View>
            ))}
        </>
      )}
    </View>
  );
}

/** タグにあった記号の一覧。分類ごとに1行、無い分類は「タグに表示なし」 */
export function SymbolListCard({
  selection,
  onEdit,
}: {
  selection: Selection;
  onEdit?: (category: string) => void;
}) {
  return (
    <View style={s.list}>
      {CATEGORIES.map((c, i) => {
        const code = selection[c.id];
        const def = code ? SYMBOL_BY_CODE[code] : undefined;
        return (
          <Pressable
            key={c.id}
            style={[s.listRow, i > 0 && s.listRowBorder]}
            onPress={onEdit === undefined ? undefined : () => onEdit(c.id)}
          >
            {def !== undefined ? (
              <CareSymbolNative glyph={def.glyph} size={28} />
            ) : (
              <View style={s.emptyGlyph} />
            )}
            <View style={s.listText}>
              <Text style={s.listCat}>{c.tab}</Text>
              <Text style={def === undefined ? s.listNone : s.listMeaning}>
                {def === undefined ? "タグに表示なし" : def.meaning}
              </Text>
            </View>
            {onEdit !== undefined ? (
              <Text style={s.listAction}>{def === undefined ? "足す" : "直す"}</Text>
            ) : (
              <Text style={s.listCode}>
                {def === undefined ? "" : def.numberUnverified === true ? "—" : def.code}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** 記号の出どころ。どの改正を見ているのかを、どの画面でも小さく出す */
export const SOURCE_NOTE =
  "記号は経済産業省・消費者庁「衣類の取扱表示」（令和6年8月改正）と JIS L 0001 にもとづいています。";

export default function PlanView({ selection }: { selection: Selection }) {
  const plan = buildPlan(selection);

  return (
    <View style={{ gap: 10 }}>
      {plan.conflicts.map((c) => (
        <View key={c} style={s.conflict}>
          <Text style={s.conflictText}>{c}</Text>
        </View>
      ))}

      {plan.sections.map((sec) => (
        <SectionCard key={sec.id} section={sec} />
      ))}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>{DISCLAIMER}</Text>
        <Text style={s.sourceText}>{SOURCE_NOTE}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radiusLg,
    padding: 16,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  h2: { flex: 1, fontSize: TYPE.h2, fontWeight: "700", color: T.ink },
  headline: { fontSize: 16, fontWeight: "600", color: T.ink, lineHeight: 26 },

  basisBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  basisLabel: { fontSize: 12, color: T.muted },
  spacer: { flex: 1 },
  more: { fontSize: 12, color: T.accent },
  basisItem: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10 },
  basisTextWrap: { flex: 1 },
  basisMeaning: { fontSize: TYPE.small, color: T.ink2, lineHeight: 19 },
  basisCode: { fontSize: TYPE.tiny, color: T.muted, marginTop: 2 },

  list: {
    backgroundColor: T.surface,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radiusLg,
    overflow: "hidden",
  },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  listRowBorder: { borderTopWidth: 1, borderTopColor: T.border },
  emptyGlyph: {
    width: 28,
    height: 31,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.borderStrong,
    borderRadius: 5,
    backgroundColor: T.surface2,
  },
  listText: { flex: 1 },
  listCat: { fontSize: TYPE.tiny, color: T.muted },
  listMeaning: { fontSize: 13, lineHeight: 19, color: T.ink2 },
  listNone: { fontSize: 13, lineHeight: 19, color: T.muted },
  listCode: { fontSize: TYPE.tiny, color: T.muted },
  listAction: { fontSize: TYPE.small, color: T.accent },

  conflict: {
    backgroundColor: T.dangerWeak,
    borderColor: T.danger,
    borderWidth: 1,
    borderRadius: T.radiusLg,
    padding: 12,
  },
  conflictText: { color: T.danger, fontSize: TYPE.small, fontWeight: "600", lineHeight: 19 },
  disclaimer: {
    backgroundColor: T.surface2,
    borderRadius: T.radiusLg,
    padding: 14,
    gap: 6,
  },
  disclaimerText: { color: T.muted, fontSize: TYPE.small, lineHeight: 20 },
  sourceText: { color: T.muted, fontSize: TYPE.tiny, lineHeight: 17 },
});
