import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  /** 許可を要求したのに通らなかった、という事実。押しても無反応に見えるのを防ぐ */
  const [denied, setDenied] = useState(false);
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

  async function readFromUri(uri: string) {
    setBusy(true);
    setError(null);
    try {
      const gray = await loadGrayFromUri(uri);
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
      const shot = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!shot?.uri) throw new Error("撮影に失敗しました");
      setBusy(false);
      await readFromUri(shot.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    if (busy) return;
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
      if (res.canceled || res.assets.length === 0) return;
      await readFromUri(res.assets[0].uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function askForCamera() {
    setError(null);
    try {
      const res = await requestPermission();
      // ここが今回のバグの本体。拒否されたときに何も出さないと、
      // ボタンが無反応に見える。
      if (!res.granted) setDenied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDenied(true);
    }
  }

  const busyOverlay = busy ? (
    <View style={s.busy}>
      <ActivityIndicator color="#fff" />
      <Text style={s.busyText}>読み取り中…</Text>
    </View>
  ) : null;

  // ── 許可がまだ、または取れなかった ──────────────────────
  if (permission === null || availability === null) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

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
                ? "カメラが拒否されています。ブラウザ／OSの設定でこのサイト（アプリ）のカメラを許可してから、もう一度開いてください。"
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
        {busyOverlay}
      </ScrollView>
    );
  }

  // ── カメラが使える ────────────────────────────────
  return (
    <View style={s.fill}>
      <CameraView ref={cameraRef} style={s.fill} facing="back" autofocus="on" />

      {/* ガイド枠。実測で「1記号110px以上」が必要なので、
          タグを枠いっぱいに入れさせることが精度の前提になる。 */}
      <View pointerEvents="none" style={s.overlay}>
        <View style={s.frame} />
        <Text style={s.hint}>
          タグの記号の列を枠いっぱいに入れて、真正面から撮ってください
        </Text>
      </View>

      <View style={s.bar}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={s.cancel}>手で選ぶ</Text>
        </Pressable>
        <Pressable style={[s.shutter, busy && s.shutterBusy]} onPress={capture}>
          {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterDot} />}
        </Pressable>
        <Pressable onPress={pickFromLibrary} hitSlop={12} style={s.pickWrap}>
          <Text style={s.cancel}>写真から</Text>
        </Pressable>
      </View>

      {error !== null && (
        <View style={s.error}>
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
  caveat: {
    color: T.muted,
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: "center",
  },
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
  hintSmall: {
    color: T.muted,
    fontSize: 11.5,
    lineHeight: 18,
    textAlign: "center",
  },
  link: { color: T.accent, textDecorationLine: "underline", fontSize: 13 },
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
    width: "88%",
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
    paddingHorizontal: 28,
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
  cancel: { color: "#fff", fontSize: 14 },
  pickWrap: { alignItems: "flex-end", width: 72 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBusy: { opacity: 0.6 },
  shutterDot: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#fff",
  },
  busy: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  busyText: { color: "#fff", fontSize: 13 },
  error: {
    backgroundColor: T.danger,
    borderRadius: T.radius,
    padding: 12,
    width: "100%",
  },
  errorText: { color: "#fff", fontSize: 12.5, lineHeight: 19 },
});
