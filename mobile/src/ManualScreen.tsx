/**
 * ②' 手で選ぶ。1分類ずつ、選んだら次へ。
 *
 * 7分類を1画面に並べると、押し忘れた分類が「無い」なのか「まだ見ていない」なのか
 * 本人にも分からなくなる。1つずつ進めれば、7回とも必ず答えたことになる。
 *
 * 「この分類はタグに無い」を選択肢と同じ強さで置くのが要。
 * 押すと〈表示なし〉として記録し、〈制限なし〉にはしない。
 */

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Selection } from "../../lib/plan";
import { CATEGORIES, SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { questionOf, SymbolGrid } from "./SymbolPicker";
import { T, TYPE } from "./theme";
import { NavBar, OutlineButton } from "./ui";

export default function ManualScreen({
  initial,
  onDone,
  onCancel,
}: {
  initial: Selection;
  onDone: (selection: Selection) => void;
  onCancel: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(initial);
  const [step, setStep] = useState(0);
  const cat = CATEGORIES[step];

  function advance(next: Selection) {
    setSelection(next);
    if (step + 1 >= CATEGORIES.length) onDone(next);
    else setStep(step + 1);
  }

  function pick(code: string) {
    advance({ ...selection, [cat.id]: code });
  }

  function skip() {
    const next = { ...selection };
    delete next[cat.id];
    advance(next);
  }

  return (
    <View style={s.root}>
      <NavBar
        title={`${step + 1} / ${CATEGORIES.length}`}
        left="‹ 戻る"
        onLeft={() => (step === 0 ? onCancel() : setStep(step - 1))}
        right="やめる"
        onRight={onCancel}
      />

      <View style={s.segments}>
        {CATEGORIES.map((c, i) => (
          <View
            key={c.id}
            style={[
              s.segment,
              i < step && s.segmentDone,
              i === step && s.segmentNow,
            ]}
          />
        ))}
      </View>

      <View style={s.strip}>
        {CATEGORIES.map((c, i) => {
          const code = selection[c.id];
          const def = code ? SYMBOL_BY_CODE[code] : undefined;
          const now = i === step;
          return (
            <Pressable key={c.id} style={s.slot} onPress={() => setStep(i)}>
              {def !== undefined ? (
                <CareSymbolNative glyph={def.glyph} size={26} />
              ) : (
                <View style={[s.slotEmpty, now && s.slotNow]} />
              )}
              <Text style={[s.slotLabel, now && s.slotLabelNow]} numberOfLines={1}>
                {c.tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h1}>{questionOf(cat.tab)}</Text>
        <Text style={s.lead}>
          タグにあるものを1つ選んでください。選ぶと次に進みます。
        </Text>
        <View style={s.grid}>
          <SymbolGrid category={cat.id} selected={selection[cat.id]} onPick={pick} />
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Text style={s.footerNote}>
          「無い」は「表示なし」として記録します。「制限がない」という意味にはしません。
        </Text>
        <OutlineButton label="この分類はタグに無い" onPress={skip} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  segments: { flexDirection: "row", gap: 3, paddingHorizontal: 16, marginTop: 12 },
  segment: { flex: 1, height: 3, borderRadius: 999, backgroundColor: T.border },
  segmentDone: { backgroundColor: T.ink },
  segmentNow: { backgroundColor: T.accent },

  strip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  slot: { alignItems: "center", gap: 4, width: 44 },
  slotEmpty: {
    width: 26,
    height: 29,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.borderStrong,
    borderRadius: 4,
  },
  slotNow: {
    borderStyle: "solid",
    borderWidth: 1.5,
    borderColor: T.accent,
    backgroundColor: T.accentWeak,
  },
  slotLabel: { fontSize: 9.5, color: T.muted },
  slotLabelNow: { color: T.accent, fontWeight: "700" },

  body: { padding: 16, paddingBottom: 24 },
  h1: { fontSize: TYPE.h1, fontWeight: "700", color: T.ink },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 5 },
  grid: { marginTop: 14 },

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
