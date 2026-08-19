import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.msg}>
          タグを読み取るにはカメラの許可が必要です。写真は端末の外に送られません。
        </Text>
        <Pressable style={s.primary} onPress={requestPermission}>
          <Text style={s.primaryText}>カメラを許可する</Text>
        </Pressable>
        <Pressable onPress={onCancel}>
          <Text style={s.link}>手で選ぶ</Text>
        </Pressable>
      </View>
    );
  }

  async function capture() {
    if (busy || cameraRef.current === null) return;
    setBusy(true);
    setError(null);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!shot?.uri) throw new Error("撮影に失敗しました");
      const gray = await loadGrayFromUri(shot.uri);
      onDone(scanGray(gray));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        <View style={s.spacer} />
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 28,
    backgroundColor: T.bg,
  },
  msg: { color: T.ink, fontSize: 14, lineHeight: 22, textAlign: "center" },
  primary: {
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
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
    paddingHorizontal: 28,
  },
  cancel: { color: "#fff", fontSize: 14, width: 72 },
  spacer: { width: 72 },
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
  error: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 132,
    backgroundColor: T.danger,
    borderRadius: T.radius,
    padding: 12,
  },
  errorText: { color: "#fff", fontSize: 12.5, lineHeight: 19 },
});
