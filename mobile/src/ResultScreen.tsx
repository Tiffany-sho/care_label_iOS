/**
 * ⑥ 洗い方と注意点。
 *
 * 一番上に「まずこれだけ」。洗濯機の前で最初に要るのは
 * 温度・コース・使えないもの・干し方・アイロン の5つだけ。
 * その下は分類ごとのカードをタブで1枚ずつ。タブで4分類が隠れるので、
 * タブの右上の点で「条件つき／できない／タグに表示なし」が一目で分かるようにしてある。
 * それより下（タグにあった記号・注意書き・保存）は読み物として残す。
 */

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { buildPlan, DISCLAIMER, type Selection } from "../../lib/plan";
import { buildHighlight, missingSentence } from "../../lib/summary";
import { CATEGORIES, type CategoryId } from "../../lib/symbols";
import {
  SectionCard,
  SECTION_ICON,
  SECTION_TAB,
  SOURCE_NOTE,
  SymbolListCard,
} from "./PlanView";
import { CategorySheet } from "./SymbolPicker";
import { DOT_COLORS, T, TYPE } from "./theme";
import { Icon, NavBar, NoteBox, PrimaryButton } from "./ui";

export default function ResultScreen({
  selection,
  onChangeSelection,
  onEditAll,
  onSave,
  onBack,
  saveLabel = "この服をマイクローゼットに保存",
  backLabel = "‹ 戻る",
}: {
  selection: Selection;
  onChangeSelection: (next: Selection) => void;
  onEditAll: () => void;
  onSave: () => void;
  onBack: () => void;
  saveLabel?: string;
  backLabel?: string;
}) {
  const plan = buildPlan(selection);
  const high = buildHighlight(selection);
  const [tab, setTab] = useState(0);
  const [sheetCat, setSheetCat] = useState<CategoryId | null>(null);

  const section = plan.sections[tab];
  const missingNote = missingSentence(high.missing);

  return (
    <View style={s.root}>
      <NavBar
        title="この服の洗い方"
        left={backLabel}
        onLeft={onBack}
        right="直す"
        onRight={onEditAll}
      />

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h1}>洗うときに気をつけること</Text>
        <Text style={s.lead}>
          数字は「ここまでなら大丈夫」という上限です。おすすめの温度ではありません。
        </Text>

        {plan.conflicts.map((c) => (
          <View key={c} style={s.conflict}>
            <Text style={s.conflictText}>{c}</Text>
          </View>
        ))}

        {/* ── まずこれだけ ────────────────────────── */}
        <View style={s.first}>
          <Text style={s.eyebrow}>まずこれだけ</Text>
          <Text style={s.firstHeadline}>{high.headline}</Text>

          {high.forbidden.length > 0 && (
            <>
              <Text style={s.firstLabel}>使えないもの</Text>
              <View style={s.pills}>
                {high.forbidden.map((f) => (
                  <View key={f} style={s.pill}>
                    <Icon name="close" size={12} color={T.danger} width={3} />
                    <Text style={s.pillText}>{f}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {high.rows.length > 0 && (
            <View style={s.firstRows}>
              {high.rows.map((r) => (
                <View key={r.key} style={s.firstRow}>
                  <Icon
                    name={r.key === "natural" ? "hang" : "iron"}
                    size={20}
                    color={T.muted}
                  />
                  <Text style={s.firstRowText}>
                    {r.label} <Text style={s.firstRowStrong}>{r.value}</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}

          {missingNote !== null && (
            <View style={s.firstNote}>
              <NoteBox text={missingNote} />
            </View>
          )}
        </View>

        {/* ── 分類ごと ──────────────────────────── */}
        <View style={s.tabs}>
          {plan.sections.map((sec, i) => {
            const on = i === tab;
            return (
              <Pressable
                key={sec.id}
                style={[s.tab, on && s.tabOn]}
                onPress={() => setTab(i)}
              >
                <Icon
                  name={SECTION_ICON[sec.id] ?? "info"}
                  size={20}
                  color={on ? "#fff" : T.muted}
                />
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>
                  {SECTION_TAB[sec.id] ?? sec.title}
                </Text>
                {sec.level !== "ok" && (
                  <View style={[s.tabDot, { backgroundColor: DOT_COLORS[sec.level] }]} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={s.legend}>
          {(["caution", "forbidden", "unknown"] as const).map((k) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: DOT_COLORS[k] }]} />
              <Text style={s.legendText}>
                {k === "caution" ? "条件つき" : k === "forbidden" ? "できない" : "タグに表示なし"}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.sectionWrap}>
          <SectionCard section={section} />
        </View>

        {/* ── タグにあった記号 ────────────────────── */}
        <View style={s.listHead}>
          <Text style={s.listTitle}>タグにあった記号</Text>
          <Pressable onPress={onEditAll} hitSlop={8}>
            <Text style={s.listEdit}>ぜんぶ選び直す</Text>
          </Pressable>
        </View>
        <SymbolListCard
          selection={selection}
          onEdit={(cat) => setSheetCat(cat as CategoryId)}
        />

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>{DISCLAIMER}</Text>
          <Text style={s.sourceText}>{SOURCE_NOTE}</Text>
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Text style={s.footerNote}>
          保存するのは記号です。洗い方は開くたびに、そこから計算し直します。
        </Text>
        <PrimaryButton label={saveLabel} onPress={onSave} />
      </View>

      <CategorySheet
        category={sheetCat}
        tab={sheetCat === null ? "" : CATEGORIES.find((c) => c.id === sheetCat)?.tab ?? ""}
        selected={sheetCat === null ? undefined : selection[sheetCat]}
        onPick={(code) => {
          if (sheetCat !== null) onChangeSelection({ ...selection, [sheetCat]: code });
          setSheetCat(null);
        }}
        onClear={() => {
          if (sheetCat !== null) {
            const next = { ...selection };
            delete next[sheetCat];
            onChangeSelection(next);
          }
          setSheetCat(null);
        }}
        onClose={() => setSheetCat(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { padding: 18, paddingBottom: 28 },
  h1: { fontSize: TYPE.h1, fontWeight: "700", color: T.ink, lineHeight: 30 },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 6 },

  conflict: {
    marginTop: 14,
    padding: 12,
    backgroundColor: T.dangerWeak,
    borderWidth: 1,
    borderColor: T.danger,
    borderRadius: T.radiusLg,
  },
  conflictText: { color: T.danger, fontSize: TYPE.small, fontWeight: "600", lineHeight: 19 },

  first: {
    marginTop: 14,
    padding: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: T.radiusLg,
  },
  eyebrow: { fontSize: 12, fontWeight: "700", color: T.muted, letterSpacing: 0.5 },
  firstHeadline: {
    fontSize: TYPE.h1,
    fontWeight: "700",
    color: T.ink,
    lineHeight: 30,
    marginTop: 6,
  },
  firstLabel: { fontSize: 12, fontWeight: "700", color: T.muted, marginTop: 14 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 7 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: T.dangerWeak,
  },
  pillText: { fontSize: TYPE.bodyLead, fontWeight: "700", color: T.danger },

  firstRows: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border, gap: 9 },
  firstRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  firstRowText: { flex: 1, fontSize: TYPE.body, color: T.ink2 },
  firstRowStrong: { fontWeight: "700", color: T.ink },
  firstNote: { marginTop: 12 },

  tabs: { flexDirection: "row", gap: 6, marginTop: 18 },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 2,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
  },
  tabOn: { backgroundColor: T.ink, borderColor: T.ink },
  tabText: { fontSize: 10.5, fontWeight: "700", color: T.muted },
  tabTextOn: { color: "#fff" },
  tabDot: { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 999 },

  legend: { flexDirection: "row", gap: 12, marginTop: 10, paddingLeft: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 999 },
  legendText: { fontSize: TYPE.tiny, color: T.muted },

  sectionWrap: { marginTop: 10 },

  listHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 10,
  },
  listTitle: { fontSize: TYPE.h2, fontWeight: "700", color: T.ink },
  listEdit: { fontSize: TYPE.small, color: T.accent },

  disclaimer: {
    marginTop: 14,
    padding: 14,
    backgroundColor: T.surface2,
    borderRadius: T.radiusLg,
    gap: 6,
  },
  disclaimerText: { color: T.muted, fontSize: TYPE.small, lineHeight: 20 },
  sourceText: { color: T.muted, fontSize: TYPE.tiny, lineHeight: 17 },

  footer: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    gap: 8,
  },
  footerNote: { fontSize: 12, lineHeight: 18, color: T.muted },
});
