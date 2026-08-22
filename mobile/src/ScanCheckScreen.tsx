/**
 * ⑤ 読み取りの確認。ここを通らずに確定できる経路は作らない。
 *
 * 左に「認識器が実際に見た切り抜き」、右に「読み取り結果」を並べる。
 * 撮った写真ではなく切り抜きを見せるのは、失敗の原因（小さい・切れている・
 * 文字を拾っている）が人の目にも同時に分かるため。
 *
 * 確信度が低い行は行ごと目立たせる。押せば選び直せる。
 */

import React, { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Selection } from "../../lib/plan";
import { CATEGORIES, SYMBOL_BY_CODE, type CategoryId } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { adoptedSymbols, hitsToSelection, symbolCrops, type ScanResult } from "./scan";
import { CategorySheet } from "./SymbolPicker";
import { T, TYPE } from "./theme";
import { Badge, Icon, NavBar, OutlineButton, PrimaryButton } from "./ui";

function tabOf(cat: CategoryId): string {
  return CATEGORIES.find((c) => c.id === cat)?.tab ?? cat;
}

export default function ScanCheckScreen({
  result,
  onConfirm,
  onManual,
  onRetake,
  onRetry,
}: {
  result: ScanResult;
  onConfirm: (selection: Selection, needsCheck: boolean) => void;
  onManual: (selection: Selection) => void;
  /** 撮り直す（カメラへ戻る） */
  onRetake: () => void;
  /** 枠を直して読み取り直す（オレンジの枠の画面へ、前回の枠のまま戻る） */
  onRetry: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(() => hitsToSelection(result.hits));
  const [sheetCat, setSheetCat] = useState<CategoryId | null>(null);
  const [chooser, setChooser] = useState(false);
  /** 人が触った分類は「要確認」を解除する */
  const [fixed, setFixed] = useState<Set<CategoryId>>(new Set());
  /**
   * 読めなかった行に、人がどの分類を当てたか（行番号 → 分類）。
   * これが無いと、選んだのに行は「読めなかった記号」のまま残る。
   * 選択そのものは selection に入っているのに、見た目だけ古い、という一番よくない状態になる。
   */
  const [assigned, setAssigned] = useState<Record<number, CategoryId>>({});
  /** いまシートで直している行。切り抜きをシートの上に出すために持つ */
  const [pickingRow, setPickingRow] = useState<number | null>(null);

  const rows = useMemo(() => adoptedSymbols(result), [result]);

  /**
   * 記号ごとの切り抜き。**この画面が出てから**作る。
   * 撮ってから結果が出るまでが待ち時間なので、そこに符号化を入れない。
   * 出来上がるまでの一瞬は、同じ大きさの枠だけを出しておく。
   */
  const [crops, setCrops] = useState<string[]>([]);
  useEffect(() => {
    setCrops([]);
    // 画面が実際に出てから走らせる（JSを止める処理なので、描画の前に置かない）
    const t = setTimeout(() => setCrops(symbolCrops(result)), 50);
    return () => clearTimeout(t);
  }, [result]);
  const missing = CATEGORIES.filter((c) => !selection[c.id]);
  const lowCount = rows.filter(
    (r) => r.code !== null && r.confidence === "low" && !fixed.has(r.category as CategoryId),
  ).length;

  function pick(cat: CategoryId, code: string) {
    setSelection((prev) => ({ ...prev, [cat]: code }));
    setFixed((prev) => new Set(prev).add(cat));
    // 読めなかった行に人が当てた分類を覚える。行の表示もこれで切り替わる。
    if (pickingRow !== null) {
      setAssigned((prev) => ({ ...prev, [pickingRow]: cat }));
    }
    setSheetCat(null);
    setPickingRow(null);
  }

  function clear(cat: CategoryId) {
    setSelection((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
    setFixed((prev) => new Set(prev).add(cat));
    if (pickingRow !== null) {
      setAssigned((prev) => {
        const next = { ...prev };
        delete next[pickingRow];
        return next;
      });
    }
    setSheetCat(null);
    setPickingRow(null);
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
              オレンジの枠に記号の列だけが入っていたか確認してください。枠を直して、
              もう一度読み取れます。
            </Text>
            <Pressable style={s.emptyBtn} onPress={onRetry}>
              <Text style={s.emptyBtnText}>枠を直して読み取り直す</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.legend}>左がオレンジの枠で切り出した部分、右が読み取り結果</Text>

            <View style={s.card}>
              {rows.map((sym, i) => {
                // 人が当てた分類があればそちらを使う（読めなかった行を直したとき）
                const cat = assigned[i] ?? sym.category;
                const shownCode = cat !== null ? selection[cat] : undefined;
                const def = shownCode ? SYMBOL_BY_CODE[shownCode] : undefined;
                const low =
                  sym.code !== null && sym.confidence === "low" && cat !== null && !fixed.has(cat);
                return (
                  <Pressable
                    key={`${i}-${sym.code ?? "unknown"}`}
                    style={[s.row, i > 0 && s.rowBorder, low && s.rowLow]}
                    onPress={() => {
                      setPickingRow(i);
                      if (cat !== null) setSheetCat(cat);
                      else setChooser(true);
                    }}
                  >
                    <View style={s.thumb}>
                      {crops[i] !== undefined && (
                        <Image
                          source={{ uri: crops[i] }}
                          style={s.thumbImg}
                          resizeMode="contain"
                        />
                      )}
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
        <View style={s.footerRow}>
          <OutlineButton label="もう一度読み取る" onPress={onRetry} style={s.flex1} />
          <OutlineButton
            label="手で選び直す"
            onPress={() => onManual(selection)}
            style={s.flex1}
          />
        </View>
        <Text style={s.footerNote}>
          「もう一度読み取る」は、さっきのオレンジの枠のまま戻ります。ずれていたところだけ直せます。
        </Text>
      </View>

      <CategorySheet
        category={sheetCat}
        tab={sheetCat === null ? "" : tabOf(sheetCat)}
        selected={sheetCat === null ? undefined : selection[sheetCat]}
        // タグのその部分を上に出す。戻って見比べなくても直せるように。
        previewUri={pickingRow === null ? null : (crops[pickingRow] ?? null)}
        onPick={(code) => sheetCat !== null && pick(sheetCat, code)}
        onClear={() => sheetCat !== null && clear(sheetCat)}
        onClose={() => {
          setSheetCat(null);
          setPickingRow(null);
        }}
      />

      <Modal
        visible={chooser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setChooser(false);
          setPickingRow(null);
        }}
      >
        <View style={s.root}>
          <NavBar
            title="どの分類の記号ですか"
            left="閉じる"
            onLeft={() => {
              setChooser(false);
              setPickingRow(null);
            }}
          />
          <ScrollView contentContainerStyle={s.chooserBody}>
            {pickingRow !== null && crops[pickingRow] !== undefined && (
              <View style={s.chooserPreview}>
                <Image
                  source={{ uri: crops[pickingRow] }}
                  style={s.chooserPreviewImg}
                  resizeMode="contain"
                />
                <Text style={s.chooserPreviewText}>タグのこの部分です</Text>
              </View>
            )}
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
    gap: 10,
  },
  footerRow: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  footerNote: { fontSize: 11.5, lineHeight: 17, color: T.muted },

  chooserBody: { padding: 16, gap: 10 },
  chooserPreview: {
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: T.radiusLg,
  },
  chooserPreviewImg: { width: 96, height: 96 },
  chooserPreviewText: { fontSize: TYPE.small, color: T.muted },
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
