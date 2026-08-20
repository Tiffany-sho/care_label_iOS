/**
 * ⑦ 服の情報を入れて登録。
 *
 * ここで入れるのは持ち主のための情報（写真・名前・色・種類）だけ。
 * 洗い方に関わる情報は1つも無い。タグの記号が唯一の根拠、という筋を崩さないため。
 *
 * 将来ここを「写真を撮るだけで自動入力」に置き換える想定。
 * そのときも、記号だけは自動入力の対象にしない。
 */

import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Selection } from "../../lib/plan";
import { CATEGORIES, SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { COLORS, KINDS } from "./closet";
import { T, TYPE } from "./theme";
import { Icon, NavBar, PrimaryButton } from "./ui";

export type GarmentInfo = {
  name: string;
  photoUri: string | null;
  color: string | null;
  kind: string | null;
};

export default function SaveFormScreen({
  selection,
  initial,
  placeholderName,
  onSave,
  onBack,
  onShowSymbols,
  saveLabel = "マイクローゼットに登録",
}: {
  selection: Selection;
  initial?: GarmentInfo;
  /** 名前が空のときに使う名前 */
  placeholderName: string;
  onSave: (info: GarmentInfo) => void;
  onBack: () => void;
  onShowSymbols: () => void;
  saveLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(initial?.photoUri ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [kind, setKind] = useState<string | null>(initial?.kind ?? null);
  const [error, setError] = useState<string | null>(null);

  async function takePhoto() {
    setError(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("カメラの許可がありません。設定から許可するか、「写真から選ぶ」を使ってください。");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!res.canceled && res.assets.length > 0) setPhotoUri(res.assets[0].uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickPhoto() {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!res.canceled && res.assets.length > 0) setPhotoUri(res.assets[0].uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const colorLabel = COLORS.find((c) => c.key === color)?.label ?? "選んでいません";

  return (
    <View style={s.root}>
      <NavBar title="服の情報" left="‹ 戻る" onLeft={onBack} />

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.photo}>
          {photoUri === null ? (
            <>
              <Icon name="image" size={26} color={T.muted} width={1.5} />
              <Text style={s.photoHint}>服の写真を1枚</Text>
            </>
          ) : (
            <Image source={{ uri: photoUri }} style={s.photoImg} resizeMode="cover" />
          )}
        </View>

        <View style={s.photoBtns}>
          <Pressable style={[s.photoBtn, s.photoBtnDark]} onPress={takePhoto}>
            <Text style={s.photoBtnDarkText}>写真を撮る</Text>
          </Pressable>
          <Pressable style={[s.photoBtn, s.photoBtnLight]} onPress={pickPhoto}>
            <Text style={s.photoBtnLightText}>写真から選ぶ</Text>
          </Pressable>
        </View>

        {error !== null && <Text style={s.error}>{error}</Text>}

        <View style={s.field}>
          <Text style={s.label}>名前</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder={placeholderName}
            placeholderTextColor={T.muted}
            maxLength={40}
          />
        </View>

        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={s.label}>色</Text>
            <Text style={s.labelValue}>{colorLabel}</Text>
          </View>
          <View style={s.swatches}>
            {COLORS.map((c) => {
              const on = color === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setColor(on ? null : c.key)}
                  style={[
                    s.swatch,
                    { backgroundColor: c.hex },
                    on && s.swatchOn,
                  ]}
                >
                  {c.striped === true && <View style={s.stripe} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>種類</Text>
          <View style={s.kinds}>
            {KINDS.map((k) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(on ? null : k)}
                  style={[s.kind, on && s.kindOn]}
                >
                  <Text style={[s.kindText, on && s.kindTextOn]}>{k}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable style={s.symbols} onPress={onShowSymbols}>
          <View style={s.symbolsLeft}>
            <Text style={s.label}>タグの記号</Text>
            <View style={s.symbolRow}>
              {CATEGORIES.map((c) => {
                const code = selection[c.id];
                return code ? (
                  <CareSymbolNative key={c.id} glyph={SYMBOL_BY_CODE[code].glyph} size={20} />
                ) : (
                  <View key={c.id} style={s.symbolEmpty} />
                );
              })}
            </View>
          </View>
          <Text style={s.symbolsLink}>見る</Text>
        </Pressable>
      </ScrollView>

      <View style={s.footer}>
        <Text style={s.footerNote}>
          名前を入れなければ「{placeholderName}」で登録します。写真と色はあとから足せます。
        </Text>
        <PrimaryButton
          label={saveLabel}
          onPress={() =>
            onSave({
              name: name.trim() === "" ? placeholderName : name.trim(),
              photoUri,
              color,
              kind,
            })
          }
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { padding: 16, paddingBottom: 28 },

  photo: {
    height: 150,
    borderRadius: T.radiusLg,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  photoImg: { width: "100%", height: "100%" },
  photoHint: { fontSize: TYPE.small, color: T.muted },
  photoBtns: { flexDirection: "row", gap: 8, marginTop: 8 },
  photoBtn: {
    flex: 1,
    height: 44,
    borderRadius: T.radiusLg,
    alignItems: "center",
    justifyContent: "center",
  },
  photoBtnDark: { backgroundColor: T.ink },
  photoBtnDarkText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  photoBtnLight: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
  },
  photoBtnLightText: { color: T.ink, fontSize: 14.5, fontWeight: "700" },
  error: { marginTop: 10, fontSize: TYPE.small, lineHeight: 19, color: T.danger },

  field: { marginTop: 16 },
  label: { fontSize: TYPE.small, fontWeight: "700", color: T.muted, marginBottom: 6 },
  labelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  labelValue: { fontSize: 12, color: T.muted },
  input: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: 14,
    fontSize: 15,
    color: T.ink,
  },

  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.borderStrong,
    overflow: "hidden",
  },
  swatchOn: { borderWidth: 3, borderColor: T.accent },
  stripe: {
    position: "absolute",
    left: -6,
    top: 14,
    width: 44,
    height: 4,
    backgroundColor: "#ffffff",
    transform: [{ rotate: "-45deg" }],
  },

  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kind: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.border,
  },
  kindOn: { backgroundColor: T.ink, borderColor: T.ink },
  kindText: { fontSize: TYPE.bodyLead, fontWeight: "600", color: T.ink2 },
  kindTextOn: { color: "#fff" },

  symbols: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 12,
    backgroundColor: T.surface2,
    borderRadius: T.radiusLg,
  },
  symbolsLeft: { flex: 1 },
  symbolRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  symbolEmpty: {
    width: 20,
    height: 22,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.borderStrong,
    borderRadius: 3,
  },
  symbolsLink: { fontSize: TYPE.small, color: T.accent, textDecorationLine: "underline" },

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
