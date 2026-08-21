/**
 * オレンジの枠で、読み取る範囲を最後に決めてもらう画面。
 *
 * カメラで撮ったときは、ここに出ているのが**白い枠で切り出したあとの画像**。
 * 白い枠は構図の目安でしかなく、手持ちで撮る以上どうしても余白や隣の文字が入る。
 * そこからもう一段、記号の列だけに寄せてもらう。
 *
 * 「写真から選ぶ」経路では白い枠が無いので、写真そのものがここに出る。
 *
 * 自動検出に逃げないための最後の受け皿でもある（README 約束5）。消さないこと。
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Shot } from "./CaptureScreen";
import CropBox, { type Rect } from "./CropBox";
import { T, TYPE } from "./theme";
import { NavBar, OutlineButton, PrimaryButton } from "./ui";

export default function CropScreen({
  shot,
  initial,
  fromFrame,
  onRead,
  onBack,
}: {
  shot: Shot;
  /** 前回の枠。読み取り直すときは、そこから始める */
  initial: Rect | null;
  /** 白い枠で切り出したあとの画像かどうか（案内の文言が変わる） */
  fromFrame: boolean;
  onRead: (crop: Rect) => void;
  onBack: () => void;
}) {
  const [crop, setCrop] = useState<Rect | null>(initial);
  const tooSmall = crop !== null && crop.h * 0.8 < 110;

  return (
    <View style={s.root}>
      <NavBar
        title="読み取る範囲を決める"
        left={fromFrame ? "‹ 撮り直す" : "‹ 戻る"}
        onLeft={onBack}
      />

      <View style={s.body}>
        <Text style={s.hint}>
          {fromFrame
            ? "白い枠の中を切り出しました。ここからオレンジの枠を動かして、記号の列だけに合わせてください。"
            : "オレンジの枠を動かして、記号の列だけを囲んでください。"}
          {"\n"}
          上下の文字まで入ると精度が落ちます。タグが傾いているときは「回転」を動かすと、
          文字を巻き込まずに囲めます。
        </Text>

        <CropBox
          uri={shot.uri}
          imageWidth={shot.width}
          imageHeight={shot.height}
          initial={initial}
          onChange={setCrop}
        />

        {crop !== null && (
          <Text style={[s.meta, tooSmall && s.metaWarn]}>
            枠の中 {Math.round(crop.w)}×{Math.round(crop.h)}px ・ 傾き{" "}
            {crop.angleDeg.toFixed(1)}度 ・ 記号1個あたり およそ {Math.round(crop.h * 0.8)}px
            {tooSmall ? " ・110px未満です。寄って撮り直してください" : ""}
          </Text>
        )}

        <View style={s.actions}>
          <OutlineButton
            label={fromFrame ? "撮り直す" : "戻る"}
            onPress={onBack}
            style={s.flex1}
          />
          <PrimaryButton
            label="この範囲で読み取る"
            tone="ink"
            disabled={crop === null}
            onPress={() => crop !== null && onRead(crop)}
            style={s.flex2}
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { flex: 1, padding: 16, gap: 12 },
  hint: { fontSize: TYPE.small, lineHeight: 19, color: T.muted },
  meta: { fontSize: 11.5, lineHeight: 18, color: T.ink2 },
  metaWarn: { color: T.warn, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
