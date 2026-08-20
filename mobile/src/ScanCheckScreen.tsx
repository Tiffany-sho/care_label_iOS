/**
 * ⑤ 読み取りの確認。ここを通らずに確定できる経路は作らない。
 *
 * 左に「認識器が実際に見た切り抜き」、右に「読み取り結果」を並べる。
 * 撮った写真ではなく切り抜きを見せるのは、失敗の原因（小さい・切れている・
 * 文字を拾っている）が人の目にも同時に分かるため。
 *
 * 確信度が低い行は行ごと目立たせる。押せば選び直せる。
 */

import React, { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Selection } from "../../lib/plan";
import { CATEGORIES, SYMBOL_BY_CODE, type CategoryId } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { adoptedSymbols, hitsToSelection, type ScanResult } from "./scan";
import { CategorySheet } from "./SymbolPicker";
import { T, TYPE } from "./theme";
import { Badge, Icon, LinkButton, NavBar, PrimaryButton } from "./ui";

function tabOf(cat: CategoryId): string {
  return CATEGORIES.find((c) => c.id === cat)?.tab ?? cat;
}

export default function ScanCheckScreen({
  result,
  onConfirm,
  onManual,
  onRetake,
  onRecrop,
}: {
  result: ScanResult;
  onConfirm: (selection: Selection, needsCheck: boolean) => void;
  onManual: (selection: Selection) => void;
  onRetake: () => void;
  onRecrop: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(() => hitsToSelection(result.hits));
  const [sheetCat, setSheetCat] = useState<CategoryId | null>(null);
  const [chooser, setChooser] = useState(false);
  /** 人が触った分類は「要確認」を解除する */
  const [fixed, setFixed] = useState<Set<CategoryId>>(new Set());

  const rows = useMemo(() => adoptedSymbols(result), [result]);
  const missing = CATEGORIES.filter((c) => !selection[c.id]);
  const lowCount = rows.filter(
    (r) => r.code !== null && r.confidence === "low" && !fixed.has(r.category as CategoryId),
  ).length;

  function pick(cat: CategoryId, code: string) {
    setSelection((prev) => ({ ...prev, [cat]: code }));
    setFixed((prev) => new Set(prev).add(cat));
    setSheetCat(null);
  }

  function clear(cat: CategoryId) {
    setSelection((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
    setFixed((prev) => new Set(prev).add(cat));
    setSheetCat(null);
  }

  return (
    <View style={s.root}>
      <NavBar title="このタグで合っていますか" left="‹ 撮り直す" onLeft={onRetake} />

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.lead}>
          読み取りはまだ下書きです。写真と見比べて、違うものは押して直してください。
        </Text>

        {result.boxes === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>記号を1つも見つけられませんでした</Text>
            <Text style={s.emptyBody}>
              白い枠に記号の列だけが入っていたか確認してください。うまくいかないときは、
              写真の上で範囲を自分で囲めます。
            </Text>
            <Pressable style={s.emptyBtn} onPress={onRecrop}>
              <Text style={s.emptyBtnText}>範囲を自分で囲む</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.legend}>左がオレンジの枠で切り出した部分、右が読み取り結果</Text>

            <View style={s.card}>
              {rows.map((sym, i) => {
                const cat = sym.category;
                const shownCode = cat !== null ? selection[cat] : undefined;
                const def = shownCode ? SYMBOL_BY_CODE[shownCode] : undefined;
                const low =
                  sym.code !== null && sym.confidence === "low" && cat !== null && !fixed.has(cat);
                return (
                  <Pressable
                    key={`${i}-${sym.code ?? "unknown"}`}
                    style={[s.row, i > 0 && s.rowBorder, low && s.rowLow]}
                    onPress={() => {
                      if (cat !== null) setSheetCat(cat);
                      else setChooser(true);
                    }}
                  >
                    <View style={s.thumb}>
                      <Image source={{ uri: sym.uri }} style={s.thumbImg} resizeMode="contain" />
                    </View>

                    {def !== undefined ? (
                      <CareSymbolNative glyph={def.glyph} size={30} />
                    ) : (
                      <View style={s.emptyGlyph} />
                    )}

                    <View style={s.rowText}>
                      <Text style={s.rowCat}>
                        {cat === null ? "読めなかった記号" : tabOf(cat)}
                      </Text>
                      <Text style={def === undefined ? s.rowNameNone : s.rowName}>
                        {def === undefined ? "どの記号にも当てはまりません" : def.name}
                      </Text>
                      {low && sym.note !== "" && <Text style={s.rowNote}>{sym.note}</Text>}
                    </View>

                    {def === undefined ? (
                      <Text style={s.rowAction}>選ぶ</Text>
                    ) : low ? (
                      <Badge label="要確認" bg={T.surface} fg={T.warn} />
                    ) : (
                      <Badge label="確定" bg={T.okWeak} fg={T.ok} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {lowCount > 0 && (
              <Text style={s.warnLine}>
                {lowCount}個は、よく似た記号と迷っています。押して選び直せます。
              </Text>
            )}

            {missing.length > 0 && (
              <Text style={s.missing}>
                {missing.map((c) => c.tab).join("・")}
                の記号は見つかりませんでした。「表示なし」のまま進みます。タグにあれば、次の画面で足せます。
              </Text>
            )}

            {result.warnings.length > 0 && (
              <View style={s.warnBox}>
                {result.warnings.map((w) => (
                  <View key={w} style={s.warnRow}>
                    <Icon name="info" size={15} color={T.warn} width={1.9} />
                    <Text style={s.warnText}>{w}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={s.footer}>
        <PrimaryButton
          label="この内容で確定する"
          onPress={() => onConfirm(selection, lowCount > 0)}
        />
        <LinkButton label="手で選び直す" onPress={() => onManual(selection)} />
      </View>

      <CategorySheet
        category={sheetCat}
        tab={sheetCat === null ? "" : tabOf(sheetCat)}
        selected={sheetCat === null ? undefined : selection[sheetCat]}
        onPick={(code) => sheetCat !== null && pick(sheetCat, code)}
        onClear={() => sheetCat !== null && clear(sheetCat)}
        onClose={() => setSheetCat(null)}
      />

      <Modal
        visible={chooser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setChooser(false)}
      >
        <View style={s.root}>
          <NavBar title="どの分類の記号ですか" left="閉じる" onLeft={() => setChooser(false)} />
          <ScrollView contentContainerStyle={s.chooserBody}>
            <Text style={s.lead}>
              形から選んでください。桶なら洗濯、三角なら漂白、四角なら乾かし方です。
            </Text>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.id}
                style={s.chooserRow}
                onPress={() => {
                  setChooser(false);
                  setSheetCat(c.id);
                }}
              >
                <Text style={s.chooserName}>{c.tab}</Text>
                <Text style={s.chooserShape}>{c.shape}</Text>
                <Icon name="chevron" size={16} color={T.muted} width={1.8} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { padding: 16, paddingBottom: 24 },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted },
  legend: { fontSize: TYPE.tiny, color: T.muted, marginTop: 12, marginBottom: 6 },

  card: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: T.border },
  rowLow: { backgroundColor: T.warnWeak },
  thumb: {
    width: 44,
    height: 44,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: 6,
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  emptyGlyph: {
    width: 30,
    height: 33,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.borderStrong,
    borderRadius: 4,
  },
  rowText: { flex: 1 },
  rowCat: { fontSize: TYPE.tiny, color: T.muted },
  rowName: { fontSize: TYPE.body, fontWeight: "600", color: T.ink },
  rowNameNone: { fontSize: TYPE.body, fontWeight: "600", color: T.muted },
  rowNote: { fontSize: TYPE.tiny, lineHeight: 17, color: T.warn, marginTop: 2 },
  rowAction: { fontSize: TYPE.small, color: T.accent, textDecorationLine: "underline" },

  warnLine: { fontSize: TYPE.small, lineHeight: 19, color: T.warn, marginTop: 10 },
  missing: { fontSize: TYPE.small, lineHeight: 19, color: T.muted, marginTop: 10 },
  warnBox: { marginTop: 12, gap: 8 },
  warnRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  warnText: { flex: 1, fontSize: 12, lineHeight: 18, color: T.ink2 },

  empty: {
    marginTop: 14,
    padding: 16,
    backgroundColor: T.warnWeak,
    borderRadius: T.radiusLg,
    gap: 8,
  },
  emptyTitle: { fontSize: TYPE.h2, fontWeight: "700", color: T.warn },
  emptyBody: { fontSize: TYPE.small, lineHeight: 20, color: T.ink2 },
  emptyBtn: {
    marginTop: 4,
    height: 44,
    borderRadius: T.radiusLg,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: { fontSize: 14.5, fontWeight: "700", color: T.ink },

  footer: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },

  chooserBody: { padding: 16, gap: 10 },
  chooserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
  },
  chooserName: { flex: 1, fontSize: TYPE.h2, fontWeight: "700", color: T.ink },
  chooserShape: { fontSize: TYPE.small, color: T.muted },
});
