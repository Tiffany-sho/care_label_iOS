/**
 * ⑩ まとめて洗う。
 *
 * 判定の中身は lib/combine.ts。ここは見せ方だけ。
 * 「一緒に洗える」と言い切るのは、全部の分類で条件が揃ったときだけ。
 * 分からない分類があるときは、分からないと書く。
 */

import React, { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { combineWash, type CombineItem } from "../../lib/combine";
import { buildHighlight } from "../../lib/summary";
import { SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import type { Garment } from "./closet";
import { T, TYPE } from "./theme";
import { Icon, NavBar, OutlineButton, PrimaryButton } from "./ui";

export default function CombineScreen({
  items,
  onGoScan,
}: {
  items: Garment[];
  onGoScan: () => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  const chosen = useMemo(
    () => ids.map((id) => items.find((g) => g.id === id)).filter((g): g is Garment => !!g),
    [ids, items],
  );

  const result = useMemo(
    () =>
      combineWash(
        chosen.map<CombineItem>((g) => ({ id: g.id, name: g.name, selection: g.selection })),
      ),
    [chosen],
  );

  function toggle(id: string) {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const stops = result.notices.filter((n) => n.severity === "stop");
  const warns = result.notices.filter((n) => n.severity === "warn");

  return (
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.title}>まとめて洗う</Text>
      <Text style={s.lead}>選んだ服の記号だけから決めます。</Text>

      {items.length < 2 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>まだ2点そろっていません</Text>
          <Text style={s.emptyBody}>
            マイクローゼットに2点以上あると、一緒に洗えるかを判定できます。
          </Text>
          <PrimaryButton label="タグを読み取る" onPress={onGoScan} />
        </View>
      ) : (
        <>
          <View style={s.pickHead}>
            <Text style={s.pickCount}>選んだ服 {chosen.length}点</Text>
            <Pressable onPress={() => setPicking(true)} hitSlop={8}>
              <Text style={s.pickLink}>
                {chosen.length === 0 ? "服をえらぶ" : "選び直す"}
              </Text>
            </Pressable>
          </View>

          <View style={s.chips}>
            {chosen.map((g) => (
              <Pressable key={g.id} style={s.chip} onPress={() => toggle(g.id)}>
                <View style={s.chipThumb}>
                  {g.photoUri !== null && (
                    <Image source={{ uri: g.photoUri }} style={s.chipImg} resizeMode="cover" />
                  )}
                </View>
                <Text style={s.chipName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Icon name="close" size={12} color={T.muted} width={2.2} />
              </Pressable>
            ))}
            {chosen.length === 0 && (
              <Pressable style={s.chipAdd} onPress={() => setPicking(true)}>
                <Icon name="plus" size={14} color={T.ink} width={2.2} />
                <Text style={s.chipAddText}>服をえらぶ</Text>
              </Pressable>
            )}
          </View>

          {chosen.length >= 2 && (
            <>
              <View style={[s.verdict, result.ok ? s.verdictOk : s.verdictNo]}>
                <View style={s.verdictTag}>
                  <Text style={[s.verdictTagText, { color: result.ok ? T.ok : T.danger }]}>
                    {result.headline}
                  </Text>
                </View>
                <Text style={s.verdictBody}>{result.summary}</Text>
              </View>

              {result.ok ? (
                <>
                  <View style={s.card}>
                    {result.rows.map((r, i) => (
                      <View key={r.key} style={[s.row, i > 0 && s.rowBorder]}>
                        <Text style={s.rowLabel}>{r.label}</Text>
                        <View style={s.rowRight}>
                          <Text style={s.rowValue}>{r.value}</Text>
                          <Text style={s.rowWhy}>{r.why}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={s.card2}>
                    <Text style={s.cardTitle}>ここからは服ごとに</Text>
                    <Text style={s.cardLead}>
                      干し方とアイロンは1着ずつのことなので、まとめません。
                    </Text>
                    {result.perGarment.map((p, i) => (
                      <View key={p.id} style={[s.perRow, i > 0 && s.rowBorder]}>
                        <Text style={s.perName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.naturalCode !== undefined && (
                          <CareSymbolNative
                            glyph={SYMBOL_BY_CODE[p.naturalCode].glyph}
                            size={20}
                          />
                        )}
                        {p.ironCode !== undefined && (
                          <CareSymbolNative glyph={SYMBOL_BY_CODE[p.ironCode].glyph} size={20} />
                        )}
                        <Text style={s.perText} numberOfLines={2}>
                          {p.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={s.card}>
                  {stops.map((n, i) => (
                    <View key={`${n.id}-${n.kind}`} style={[s.noticeRow, i > 0 && s.rowBorder]}>
                      {n.code !== undefined ? (
                        <CareSymbolNative glyph={SYMBOL_BY_CODE[n.code].glyph} size={26} />
                      ) : (
                        <View style={s.noticeEmpty} />
                      )}
                      <View style={s.noticeText}>
                        <Text style={s.noticeTitle}>{n.title}</Text>
                        <Text style={s.noticeBody}>{n.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {warns.length > 0 && (
                <View style={s.warnCard}>
                  {warns.map((n) => (
                    <View key={`${n.id}-${n.kind}`} style={s.warnRow}>
                      <Icon name="info" size={16} color={T.warn} width={1.9} />
                      <View style={s.noticeText}>
                        <Text style={s.warnTitle}>{n.title}</Text>
                        <Text style={s.noticeBody}>{n.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {!result.ok && result.removable.rest >= 2 && (
                <View style={s.suggest}>
                  <Text style={s.suggestText}>
                    {result.removable.ids
                      .map((id) => `〈${items.find((g) => g.id === id)?.name ?? ""}〉`)
                      .join("と")}
                    を外せば、残り{result.removable.rest}点は判定できます。
                  </Text>
                  <OutlineButton
                    label={`この${result.removable.rest}点で判定する`}
                    onPress={() => setIds((prev) => prev.filter((id) => !result.removable.ids.includes(id)))}
                  />
                </View>
              )}

              <Text style={s.foot}>
                色移りや素材の相性はタグの記号に書かれていないので、このアプリでは判断できません。
              </Text>
            </>
          )}

          {chosen.length === 1 && (
            <Text style={s.foot}>もう1点えらぶと判定できます。</Text>
          )}
        </>
      )}

      <Modal
        visible={picking}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPicking(false)}
      >
        <View style={s.sheet}>
          <NavBar
            title="一緒に洗う服をえらぶ"
            left="閉じる"
            onLeft={() => setPicking(false)}
            right="決定"
            onRight={() => setPicking(false)}
          />
          <ScrollView contentContainerStyle={s.sheetBody}>
            {items.map((g) => {
              const on = ids.includes(g.id);
              const high = buildHighlight(g.selection);
              return (
                <Pressable
                  key={g.id}
                  style={[s.pickRow, on && s.pickRowOn]}
                  onPress={() => toggle(g.id)}
                >
                  <View style={[s.check, on && s.checkOn]}>
                    {on && <Icon name="check" size={14} color="#fff" width={3.2} />}
                  </View>
                  <View style={s.pickThumb}>
                    {g.photoUri === null ? (
                      <Icon name="image" size={18} color="#a9a496" width={1.5} />
                    ) : (
                      <Image source={{ uri: g.photoUri }} style={s.chipImg} resizeMode="cover" />
                    )}
                  </View>
                  <View style={s.pickText}>
                    <Text style={s.pickName} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={s.pickShort}>{high.short}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: 16, paddingBottom: 28 },
  title: { fontSize: TYPE.title, fontWeight: "700", color: T.ink },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 4 },

  empty: {
    marginTop: 20,
    padding: 18,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
    gap: 10,
  },
  emptyTitle: { fontSize: TYPE.h2, fontWeight: "700", color: T.ink },
  emptyBody: { fontSize: TYPE.small, lineHeight: 20, color: T.muted },

  pickHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 16,
  },
  pickCount: { fontSize: TYPE.small, fontWeight: "700", color: T.muted },
  pickLink: { fontSize: TYPE.small, color: T.accent, textDecorationLine: "underline" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: 999,
    maxWidth: "100%",
  },
  chipThumb: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    overflow: "hidden",
  },
  chipImg: { width: "100%", height: "100%" },
  chipName: { fontSize: TYPE.small, fontWeight: "600", color: T.ink, flexShrink: 1 },
  chipAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: 999,
  },
  chipAddText: { fontSize: TYPE.small, fontWeight: "700", color: T.ink },

  verdict: { marginTop: 12, padding: 14, borderRadius: T.radiusLg },
  verdictOk: { backgroundColor: T.okWeak },
  verdictNo: { backgroundColor: T.dangerWeak },
  verdictTag: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: T.surface,
  },
  verdictTagText: { fontSize: TYPE.tiny, fontWeight: "700" },
  verdictBody: { fontSize: 16, fontWeight: "700", lineHeight: 26, color: T.ink, marginTop: 8 },

  card: {
    marginTop: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
    overflow: "hidden",
  },
  card2: {
    marginTop: 10,
    padding: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
  },
  cardTitle: { fontSize: TYPE.body, fontWeight: "700", color: T.ink },
  cardLead: { fontSize: TYPE.small, lineHeight: 19, color: T.muted, marginTop: 4, marginBottom: 6 },
  row: { flexDirection: "row", gap: 12, padding: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: T.border },
  rowLabel: { width: 72, fontSize: TYPE.small, fontWeight: "700", color: T.muted, paddingTop: 2 },
  rowRight: { flex: 1 },
  rowValue: { fontSize: 15, fontWeight: "600", color: T.ink },
  rowWhy: { fontSize: TYPE.tiny, lineHeight: 17, color: T.muted, marginTop: 2 },

  perRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  perName: { width: 84, fontSize: TYPE.small, fontWeight: "600", color: T.ink },
  perText: { flex: 1, fontSize: 12, color: T.ink2 },

  noticeRow: { flexDirection: "row", gap: 10, padding: 12 },
  noticeEmpty: {
    width: 26,
    height: 29,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.borderStrong,
    borderRadius: 4,
  },
  noticeText: { flex: 1 },
  noticeTitle: { fontSize: TYPE.bodyLead, fontWeight: "700", color: T.ink },
  noticeBody: { fontSize: TYPE.small, lineHeight: 19, color: T.ink2, marginTop: 3 },

  warnCard: {
    marginTop: 10,
    padding: 12,
    backgroundColor: T.warnWeak,
    borderRadius: T.radiusLg,
    gap: 10,
  },
  warnRow: { flexDirection: "row", gap: 10 },
  warnTitle: { fontSize: TYPE.bodyLead, fontWeight: "700", color: T.warn },

  suggest: {
    marginTop: 10,
    padding: 14,
    backgroundColor: T.surface2,
    borderRadius: T.radiusLg,
    gap: 10,
  },
  suggestText: { fontSize: 13, lineHeight: 20, color: T.ink2 },

  foot: { fontSize: 12, lineHeight: 19, color: T.muted, marginTop: 12 },

  sheet: { flex: 1, backgroundColor: T.bg },
  sheetBody: { padding: 16, gap: 8 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
  },
  pickRowOn: { borderColor: T.accent, backgroundColor: T.accentWeak },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: T.borderStrong,
    backgroundColor: T.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: T.accent, borderColor: T.accent },
  pickThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: T.surface3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pickText: { flex: 1 },
  pickName: { fontSize: TYPE.body, fontWeight: "700", color: T.ink },
  pickShort: { fontSize: 12, color: T.muted, marginTop: 2 },
});
