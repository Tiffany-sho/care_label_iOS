import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { buildPlan, DISCLAIMER, type Selection } from "../../lib/plan";
import { SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { LEVEL_COLORS, LEVEL_LABEL, T } from "./theme";

export default function PlanView({ selection }: { selection: Selection }) {
  const plan = buildPlan(selection);

  return (
    <View style={s.card}>
      <Text style={s.h2}>2. 洗い方</Text>
      <Text style={s.sub}>
        記号が示すのは「上限」と「可否」です。推奨値ではありません。
      </Text>

      {plan.conflicts.map((c) => (
        <View key={c} style={s.conflict}>
          <Text style={s.conflictText}>{c}</Text>
        </View>
      ))}

      {plan.sections.map((sec) => {
        const colors = LEVEL_COLORS[sec.level];
        return (
          <View key={sec.id} style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.h3}>{sec.title}</Text>
              <View style={[s.badge, { backgroundColor: colors.bg }]}>
                <Text style={[s.badgeText, { color: colors.fg }]}>
                  {LEVEL_LABEL[sec.level]}
                </Text>
              </View>
            </View>

            {sec.headlines.map((h) => (
              <Text key={h} style={s.headline}>
                {h}
              </Text>
            ))}

            {sec.notes.map((n) => (
              <View key={n} style={s.noteRow}>
                <Text style={s.bullet}>・</Text>
                <Text style={s.note}>{n}</Text>
              </View>
            ))}

            {sec.basis.length > 0 && (
              <View style={s.basis}>
                <Text style={s.basisTitle}>この指示の根拠</Text>
                {sec.basis.map((b) => (
                  <View key={b.code} style={s.basisItem}>
                    <CareSymbolNative
                      glyph={SYMBOL_BY_CODE[b.code].glyph}
                      size={22}
                    />
                    <View style={s.basisTextWrap}>
                      <Text style={s.basisMeaning}>{b.meaning}</Text>
                      <Text style={s.basisCode}>JIS L 0001 記号 {b.code}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>{DISCLAIMER}</Text>
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
  section: {
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: T.radius,
    padding: 14,
    marginBottom: 10,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  h3: { fontSize: 14.5, fontWeight: "700", color: T.ink },
  badge: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  badgeText: { fontSize: 10.5, fontWeight: "700" },
  headline: {
    fontSize: 14.5,
    fontWeight: "600",
    color: T.ink,
    lineHeight: 22,
    marginBottom: 4,
  },
  noteRow: { flexDirection: "row", marginTop: 4 },
  bullet: { color: T.ink2, fontSize: 12.5, lineHeight: 20 },
  note: { flex: 1, color: T.ink2, fontSize: 12.5, lineHeight: 20 },
  basis: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.borderStrong,
    gap: 8,
  },
  basisTitle: { fontSize: 10.5, fontWeight: "700", color: T.muted },
  basisItem: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  basisTextWrap: { flex: 1 },
  basisMeaning: { fontSize: 11.5, color: T.ink2, lineHeight: 17 },
  basisCode: { fontSize: 10, color: T.muted },
  conflict: {
    backgroundColor: T.dangerWeak,
    borderColor: T.danger,
    borderWidth: 1,
    borderRadius: T.radius,
    padding: 12,
    marginBottom: 10,
  },
  conflictText: { color: T.danger, fontSize: 12.5, fontWeight: "600", lineHeight: 19 },
  disclaimer: {
    backgroundColor: T.surface2,
    borderRadius: T.radius,
    padding: 12,
    marginTop: 8,
  },
  disclaimerText: { color: T.muted, fontSize: 11.5, lineHeight: 18 },
});
