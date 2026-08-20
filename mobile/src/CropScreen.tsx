/**
 * 写真の上で、記号の列を人に囲んでもらう画面。
 *
 * カメラで撮ったときは白い枠がその役目をするので通らない。
 * ここを通るのは
 *   ・「写真から選ぶ」（枠が無い）
 *   ・白い枠でうまく取れなかったので囲み直す
 * の2つ。自動検出に逃げないための最後の受け皿なので、消さないこと。
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Shot } from "./CaptureScreen";
import CropBox, { type Rect } from "./CropBox";
import { T, TYPE } from "./theme";
import { NavBar, OutlineButton, PrimaryButton } from "./ui";

export default function CropScreen({
  shot,
  onRead,
  onBack,
}: {
  shot: Shot;
  onRead: (crop: Rect) => void;
  onBack: () => void;
}) {
  const [crop, setCrop] = useState<Rect | null>(null);
  const tooSmall = crop !== null && crop.h * 0.8 < 110;

  return (
    <View style={s.root}>
      <NavBar title="読み取る範囲を囲む" left="‹ 戻る" onLeft={onBack} />

      <View style={s.body}>
        <Text style={s.hint}>
          記号の列だけが入るように枠を動かしてください。枠の中だけを原寸で読みます。
          上下の文字まで入れると精度が落ちます。タグが傾いているときは「回転」を動かすと、
          文字を巻き込まずに囲めます。
        </Text>

        <CropBox
          uri={shot.uri}
          imageWidth={shot.width}
          imageHeight={shot.height}
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
          <OutlineButton label="戻る" onPress={onBack} style={s.flex1} />
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
