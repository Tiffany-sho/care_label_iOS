import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  availabilityMessage,
  checkCameraAvailability,
  WEB_CAMERA_CAVEAT,
  type CameraAvailability,
} from "./cameraAvailability";
import { loadGrayFromUri } from "./decodeImage";
import { scanGray, type ScanResult } from "./scan";
import { T } from "./theme";

type Shot = { uri: string; width: number; height: number };

export default function CaptureScreen({
  onDone,
  onCancel,
}: {
  onDone: (result: ScanResult) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [availability, setAvailability] = useState<CameraAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  /** 撮った直後の写真。人が見て納得してから読み取る */
  const [shot, setShot] = useState<Shot | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    let alive = true;
    checkCameraAvailability().then((a) => {
      if (alive) setAvailability(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function readShot(s: Shot) {
    setBusy(true);
    setError(null);
    try {
      const gray = await loadGrayFromUri(s.uri);
      onDone(scanGray(gray));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    if (busy || cameraRef.current === null) return;
    setBusy(true);
    setError(null);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!picture?.uri) throw new Error("撮影に失敗しました");
      setShot({
        uri: picture.uri,
        width: picture.width ?? 0,
        height: picture.height ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    if (busy) return;
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
      if (res.canceled || res.assets.length === 0) return;
      const a = res.assets[0];
      setShot({ uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function askForCamera() {
    setError(null);
    try {
      const res = await requestPermission();
      // 拒否されたときに何も出さないと、ボタンが無反応に見える
      if (!res.granted) setDenied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDenied(true);
    }
  }

  // ── 撮った写真の確認 ────────────────────────────────
  if (shot !== null) {
    return (
      <View style={s.previewRoot}>
        <View style={s.previewHeader}>
          <Text style={s.previewTitle}>この写真で読み取りますか？</Text>
          <Text style={s.previewHint}>
            記号の列がはっきり写っているか確認してください。ぼやけている・記号が小さい
            ときは撮り直したほうが早いです。
          </Text>
          {shot.width > 0 && (
            <Text style={s.previewMeta}>
              写真 {shot.width}×{shot.height}px
              {shot.width < 1200
                ? " ・小さめです。記号が1つ100px以上必要なので、寄って撮り直すと確実です。"
                : ""}
            </Text>
          )}
        </View>

        <Image source={{ uri: shot.uri }} style={s.preview} resizeMode="contain" />

        {error !== null && (
          <View style={s.error}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={s.previewActions}>
          <Pressable
            style={[s.secondaryBtn, busy && s.disabled]}
            onPress={() => {
              setShot(null);
              setError(null);
            }}
            disabled={busy}
          >
            <Text style={s.secondaryBtnText}>撮り直す</Text>
          </Pressable>
          <Pressable
            style={[s.primaryBtn, busy && s.disabled]}
            onPress={() => readShot(shot)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>この写真で読み取る</Text>
            )}
          </Pressable>
        </View>
        <Pressable onPress={onCancel} disabled={busy}>
          <Text style={s.linkCenter}>手で選ぶ</Text>
        </Pressable>
      </View>
    );
  }

  if (permission === null || availability === null) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // ── 許可がまだ、または取れなかった ──────────────────────
  if (!permission.granted) {
    const availMsg = availabilityMessage(availability);
    const cameraUsable = availability.kind === "ok";
    const cannotAskAgain = permission.canAskAgain === false;

    return (
      <ScrollView contentContainerStyle={s.center}>
        <Text style={s.msg}>
          タグを読み取るにはカメラの許可が必要です。写真は端末の外に送られません。
        </Text>

        {availMsg !== null && (
          <View style={s.info}>
            <Text style={s.infoText}>{availMsg}</Text>
          </View>
        )}

        {denied && cameraUsable && (
          <View style={s.warn}>
            <Text style={s.warnText}>
              {cannotAskAgain
                ? "カメラが拒否されています。ブラウザ／OSの設定でこのアプリのカメラを許可してから、もう一度開いてください。"
                : "カメラを使えませんでした。許可ダイアログを閉じた、または端末がカメラを返しませんでした。"}
            </Text>
          </View>
        )}

        {Platform.OS === "web" && cameraUsable && (
          <Text style={s.caveat}>{WEB_CAMERA_CAVEAT}</Text>
        )}

        {cameraUsable && !cannotAskAgain && (
          <Pressable style={s.primary} onPress={askForCamera}>
            <Text style={s.primaryText}>カメラを許可する</Text>
          </Pressable>
        )}

        <Pressable style={s.secondary} onPress={pickFromLibrary}>
          <Text style={s.secondaryText}>写真から選ぶ</Text>
        </Pressable>
        <Text style={s.hintSmall}>
          スマホで撮ったタグの写真を読み込ませれば、カメラなしでも読み取りを試せます。
        </Text>

        {error !== null && (
          <View style={s.error}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <Pressable onPress={onCancel}>
          <Text style={s.link}>手で選ぶ</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── カメラ ────────────────────────────────────────
  return (
    <View style={s.fill}>
      {/*
        autofocus は "on" が「一度合わせて固定」、"off" が「必要に応じて合わせ続ける」。
        名前と意味が逆なので注意。以前 "on" を指定していたせいで最初に合った距離で
        ピントが固定され、タグに近づけてもぼやけたままだった。
      */}
      <CameraView ref={cameraRef} style={s.fill} facing="back" autofocus="off" />

      <View pointerEvents="none" style={s.overlay}>
        <View style={s.frame} />
        <Text style={s.hint}>
          記号の列を枠に入れてください。{"\n"}
          近づけすぎるとピントが合いません（10cm以上離す）。
        </Text>
      </View>

      <View style={s.bar}>
        <Pressable onPress={onCancel} hitSlop={12} style={s.sideBtn}>
          <Text style={s.cancel}>手で選ぶ</Text>
        </Pressable>
        <Pressable style={[s.shutter, busy && s.disabled]} onPress={capture}>
          {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterDot} />}
        </Pressable>
        <Pressable onPress={pickFromLibrary} hitSlop={12} style={s.sideBtnRight}>
          <Text style={s.cancel}>写真から</Text>
        </Pressable>
      </View>

      {error !== null && (
        <View style={[s.error, s.errorFloating]}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: T.bg,
  },
  msg: { color: T.ink, fontSize: 14, lineHeight: 22, textAlign: "center" },
  info: {
    backgroundColor: T.surface2,
    borderRadius: T.radius,
    padding: 12,
    width: "100%",
  },
  infoText: { color: T.ink2, fontSize: 12.5, lineHeight: 19 },
  warn: {
    backgroundColor: T.warnWeak,
    borderRadius: T.radius,
    padding: 12,
    width: "100%",
  },
  warnText: { color: T.warn, fontSize: 12.5, lineHeight: 19, fontWeight: "600" },
  caveat: { color: T.muted, fontSize: 11.5, lineHeight: 18, textAlign: "center" },
  primary: {
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondary: {
    backgroundColor: T.ink,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  secondaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  hintSmall: { color: T.muted, fontSize: 11.5, lineHeight: 18, textAlign: "center" },
  link: { color: T.accent, textDecorationLine: "underline", fontSize: 13 },
  linkCenter: {
    color: T.accent,
    textDecorationLine: "underline",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
  },

  // 確認画面
  previewRoot: { flex: 1, backgroundColor: T.bg, padding: 16 },
  previewHeader: { gap: 6, marginBottom: 12 },
  previewTitle: { fontSize: 17, fontWeight: "700", color: T.ink },
  previewHint: { fontSize: 12.5, color: T.muted, lineHeight: 19 },
  preview: {
    flex: 1,
    width: "100%",
    // 黒地だと余白が大きく見えて写真の判断がしづらいので、面の色に寄せる
    backgroundColor: T.surface3,
    borderRadius: T.radius,
  },
  previewMeta: { fontSize: 11.5, color: T.ink2, lineHeight: 18 },
  previewActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 2,
    backgroundColor: T.ink,
    borderRadius: T.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: T.surface,
    borderColor: T.borderStrong,
    borderWidth: 1,
    borderRadius: T.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: T.ink, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.55 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: "80%",
    aspectRatio: 3,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 8,
  },
  hint: {
    color: "#fff",
    fontSize: 13,
    marginTop: 14,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  sideBtn: { width: 72 },
  sideBtnRight: { width: 72, alignItems: "flex-end" },
  cancel: { color: "#fff", fontSize: 14 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterDot: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#fff" },
  error: {
    backgroundColor: T.danger,
    borderRadius: T.radius,
    padding: 12,
    width: "100%",
    marginTop: 10,
  },
  errorFloating: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 132,
    width: undefined,
  },
  errorText: { color: "#fff", fontSize: 12.5, lineHeight: 19 },
});
