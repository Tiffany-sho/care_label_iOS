import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Selection } from "../lib/plan";
import type { CategoryId } from "../lib/symbols";
import CaptureScreen from "./src/CaptureScreen";
import PlanView from "./src/PlanView";
import { hitsToSelection, type ScanResult } from "./src/scan";
import SymbolPicker from "./src/SymbolPicker";
import { T } from "./src/theme";

export default function App() {
  const [selection, setSelection] = useState<Selection>({});
  const [camera, setCamera] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);

  function toggle(category: CategoryId, code: string) {
    setSelection((prev) => ({
      ...prev,
      // 同じ記号をもう一度押したら解除。1分類1記号（実際のタグと同じ制約）。
      [category]: prev[category] === code ? undefined : code,
    }));
  }

  function applyScan(result: ScanResult) {
    setCamera(false);
    setScan(result);
    // 読み取り結果は答えではなく下書き。上書きしたうえで必ず人が確認する。
    setSelection((prev) => ({ ...prev, ...hitsToSelection(result.hits) }));
  }

  const lowConfidence = scan?.hits.filter((h) => h.confidence === "low") ?? [];

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.masthead}>
          <Text style={s.title}>carelabel</Text>
          <Text style={s.lead}>
            衣類のタグの取扱い表示記号（JIS L 0001・41種）から洗い方を出します。
            記号が示すのは<Text style={s.bold}>上限</Text>と
            <Text style={s.bold}>可否</Text>であって、推奨値ではありません。
          </Text>
        </View>

        <Pressable style={s.scanButton} onPress={() => setCamera(true)}>
          <Text style={s.scanButtonText}>タグを撮って読み取る</Text>
        </Pressable>

        {scan !== null && (
          <View style={s.scanReport}>
            <Text style={s.scanTitle}>
              読み取り: 記号 {scan.boxes} 個を検出、{scan.hits.length} 個を候補として反映
              {scan.unresolved > 0 ? `（${scan.unresolved} 個は未確定）` : ""}
            </Text>
            <Text style={s.scanNote}>
              これは下書きです。必ず手元のタグと見比べて、下のピッカーで直してください。
            </Text>
            {lowConfidence.map((h) => (
              <Text key={h.code} style={s.scanWarn}>
                ・{h.note || "確認してください"}
              </Text>
            ))}
            {scan.warnings
              .filter((w) => !lowConfidence.some((h) => w.includes(h.note)))
              .map((w) => (
                <Text key={w} style={s.scanWarn}>
                  ・{w}
                </Text>
              ))}
          </View>
        )}

        <SymbolPicker
          selection={selection}
          onToggle={toggle}
          onClear={() => {
            setSelection({});
            setScan(null);
          }}
        />

        <View style={{ height: 20 }} />
        <PlanView selection={selection} />
      </ScrollView>

      <Modal visible={camera} animationType="slide" presentationStyle="fullScreen">
        <CaptureScreen onDone={applyScan} onCancel={() => setCamera(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 64 },
  masthead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
    paddingBottom: 16,
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: "700", color: T.ink, marginBottom: 6 },
  lead: { fontSize: 13, color: T.muted, lineHeight: 21 },
  bold: { fontWeight: "700", color: T.ink2 },
  scanButton: {
    backgroundColor: T.ink,
    borderRadius: T.radius,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  scanButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  scanReport: {
    backgroundColor: T.warnWeak,
    borderRadius: T.radius,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  scanTitle: { fontSize: 13, fontWeight: "700", color: T.warn, lineHeight: 20 },
  scanNote: { fontSize: 12, color: T.ink2, lineHeight: 18 },
  scanWarn: { fontSize: 11.5, color: T.ink2, lineHeight: 18 },
});
