/**
 * ④ 読み取り中。
 *
 * 待たせている間、何が起きているのかを隠さない。
 *   ・白い枠から切り出した画像そのもの（認識器が見ているもの）
 *   ・見つけた記号1つずつを囲むオレンジの枠
 *   ・進み具合と、洗濯表示の豆知識
 *
 * 進み具合は本当の工程に対応させている（切り出し → 探して照合 → 確認）。
 * 中身の無いアニメーションで時間を稼がない。読み取りそのものは JS を
 * 止めて走るので、工程の切れ目で1度だけ画面に描く隙を渡している。
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import type { Shot } from "./CaptureScreen";
import type { Rect } from "./CropBox";
import { loadGrayFromUri } from "./decodeImage";
import { scanGray, type ScanResult } from "./scan";
import { T, TYPE } from "./theme";
import { TRIVIA } from "./trivia";
import { Icon, NavBar } from "./ui";

/** 画面に描く隙を渡す。これが無いと、読み取り中の表示が一度も出ない */
function letItPaint(): Promise<void> {
  return new Promise((r) => setTimeout(r, 60));
}

type Stage = { label: string; progress: number };

const STAGES: Stage[] = [
  { label: "白い枠の中を切り出しています", progress: 0.12 },
  { label: "記号を探して、1つずつ照合しています", progress: 0.45 },
  { label: "読み取れた記号を確かめています", progress: 0.78 },
];

export default function ProcessingScreen({
  shot,
  crop,
  onDone,
  onCancel,
}: {
  shot: Shot;
  crop: Rect | null;
  onDone: (result: ScanResult) => void;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState(0);
  const cancelled = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  // 読み取り本体
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStage(0);
        await letItPaint();
        const gray = await loadGrayFromUri(shot.uri, {
          crop: crop ?? undefined,
          imageWidth: shot.width,
          imageHeight: shot.height,
        });
        if (!alive || cancelled.current) return;

        setStage(1);
        await letItPaint();
        const r = scanGray(gray);
        if (!alive || cancelled.current) return;

        setStage(2);
        setResult(r);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
    // shot/crop は入ってきたら変わらない
  }, [shot, crop]);

  // 見つけた記号を1つずつ出す。全部出たら次の画面へ。
  useEffect(() => {
    if (result === null) return;
    const total = result.symbols.length;
    if (total === 0) {
      const t = setTimeout(() => done.current(result), 600);
      return () => clearTimeout(t);
    }
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setRevealed(n);
      if (n >= total) {
        clearInterval(timer);
        setTimeout(() => done.current(result), 320);
      }
    }, 140);
    return () => clearInterval(timer);
  }, [result]);

  // 豆知識をめくる
  useEffect(() => {
    const t = setInterval(() => setTip((v) => (v + 1) % TRIVIA.length), 4200);
    return () => clearInterval(t);
  }, []);

  const total = result?.symbols.length ?? 0;
  const progress =
    result === null
      ? STAGES[stage].progress
      : 0.78 + (total === 0 ? 0.22 : (revealed / total) * 0.22);
  const trivia = TRIVIA[tip];

  return (
    <View style={s.root}>
      <NavBar title="読み取り中" left="キャンセル" onLeft={onCancel} />

      <View style={s.body}>
        {error !== null ? (
          <View style={s.error}>
            <Text style={s.errorTitle}>読み取れませんでした</Text>
            <Text style={s.errorText}>{error}</Text>
            <Text style={s.errorText}>
              「キャンセル」で戻って、もう一度撮り直してください。
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.h1}>タグを読み取っています</Text>
            <Text style={s.lead}>白い枠の中だけを切り出して、記号を1つずつ読んでいます。</Text>

            <View style={s.stripCard}>
              <View style={s.stripInner}>
                {result === null ? (
                  <View style={s.stripPlaceholder}>
                    <ActivityIndicator color={T.muted} />
                  </View>
                ) : (
                  <View
                    style={[
                      s.stripImageWrap,
                      { aspectRatio: Math.max(0.2, result.diag.imageW / result.diag.imageH) },
                    ]}
                  >
                    <Image
                      source={{ uri: result.stripUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="contain"
                    />
                    {result.symbols.map((sym, i) => {
                      const left = (sym.box.x0 / result.diag.imageW) * 100;
                      const top = (sym.box.y0 / result.diag.imageH) * 100;
                      const w = ((sym.box.x1 - sym.box.x0) / result.diag.imageW) * 100;
                      const h = ((sym.box.y1 - sym.box.y0) / result.diag.imageH) * 100;
                      const shown = i < revealed;
                      const active = i === revealed;
                      return (
                        <View
                          key={`${i}-${sym.code ?? "x"}`}
                          style={[
                            s.box,
                            {
                              left: `${left}%`,
                              top: `${top}%`,
                              width: `${w}%`,
                              height: `${h}%`,
                            },
                            shown && s.boxDone,
                            active && s.boxActive,
                          ]}
                        />
                      );
                    })}
                  </View>
                )}
              </View>
              <Text style={s.stripCaption}>
                白い枠から切り出した画像。オレンジの枠が、見つけた記号1つ分です。
              </Text>
            </View>

            <View style={s.progressWrap}>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <View style={s.progressRow}>
                <Text style={s.progressLabel}>{STAGES[stage].label}</Text>
                {result !== null && total > 0 && (
                  <Text style={s.progressCount}>
                    {revealed} / {total}
                  </Text>
                )}
              </View>
            </View>

            <View style={s.tipCard}>
              <View style={s.tipHead}>
                <Icon name="bulb" size={18} color={T.warn} width={1.8} />
                <Text style={s.tipEyebrow}>洗濯表示の豆知識</Text>
              </View>
              <Text style={s.tipTitle}>{trivia.title}</Text>
              <Text style={s.tipBody}>{trivia.body}</Text>
              <View style={s.dots}>
                {TRIVIA.map((t, i) => (
                  <View key={t.title} style={[s.dot, i === tip && s.dotOn]} />
                ))}
              </View>
            </View>

            <View style={s.privacy}>
              <Icon name="lock" size={16} color={T.muted} width={1.8} />
              <Text style={s.privacyText}>
                計算はこの端末の中だけで行っています。写真がどこかへ送られることはありません。
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { flex: 1, padding: 18, justifyContent: "center" },
  h1: { fontSize: TYPE.h1, fontWeight: "700", color: T.ink, lineHeight: 30 },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 5 },

  stripCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: T.radiusLg,
  },
  stripInner: {
    backgroundColor: "#f3f0e7",
    borderRadius: 6,
    padding: 8,
    justifyContent: "center",
  },
  stripPlaceholder: { height: 72, alignItems: "center", justifyContent: "center" },
  stripImageWrap: { width: "100%", position: "relative" },
  box: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 4,
  },
  boxDone: { borderColor: T.accent, backgroundColor: "rgba(217,119,87,0.10)" },
  boxActive: {
    borderColor: T.accent,
    borderWidth: 3,
    backgroundColor: "rgba(217,119,87,0.24)",
  },
  stripCaption: { fontSize: 11.5, color: T.muted, marginTop: 10, paddingHorizontal: 2 },

  progressWrap: { marginTop: 18 },
  track: { height: 8, borderRadius: 999, backgroundColor: T.surface3, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999, backgroundColor: T.accent },
  progressRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 9,
  },
  progressLabel: { flex: 1, fontSize: TYPE.body, fontWeight: "600", color: T.ink },
  progressCount: { fontSize: 13, fontWeight: "700", color: T.muted },

  tipCard: {
    marginTop: 22,
    padding: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
  },
  tipHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipEyebrow: { fontSize: 12, fontWeight: "700", color: T.warn, letterSpacing: 0.5 },
  tipTitle: { fontSize: 16, fontWeight: "700", color: T.ink, lineHeight: 26, marginTop: 10 },
  tipBody: { fontSize: TYPE.body, lineHeight: 23, color: T.ink2, marginTop: 6 },
  dots: { flexDirection: "row", gap: 6, marginTop: 14 },
  dot: { width: 5, height: 5, borderRadius: 999, backgroundColor: T.borderStrong },
  dotOn: { width: 18, backgroundColor: T.accent },

  privacy: { flexDirection: "row", gap: 8, marginTop: 16, paddingHorizontal: 2 },
  privacyText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: T.muted },

  error: {
    padding: 16,
    backgroundColor: T.dangerWeak,
    borderRadius: T.radiusLg,
    borderWidth: 1,
    borderColor: T.danger,
    gap: 8,
  },
  errorTitle: { fontSize: TYPE.h2, fontWeight: "700", color: T.danger },
  errorText: { fontSize: TYPE.small, lineHeight: 20, color: T.ink2 },
});
