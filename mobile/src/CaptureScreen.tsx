/**
 * ③ カメラ。白い枠が、そのまま読み取る範囲になる。
 *
 * 以前は「撮ってから、写真の上で記号の列を指で囲む」手順だった。
 * 囲む作業そのものは残す価値がある（自動検出は実機で6個中1個しか当たらなかった）が、
 * 撮る前に枠を見せておけば、同じことを撮影の構図として済ませられる。
 * 人が範囲を決める、という約束は変えていない。決める時点が前に移っただけ。
 *
 * 白い枠 → 元画像の画素座標への変換は cover（中央で切り取り）を仮定している。
 * 端末によってプレビューの収まり方が違う可能性があるので、
 * 読み取り後の確認画面では**実際に切り出した画像**を必ず見せること。
 * ずれていれば人が気づける。ずれていたら「範囲を自分で囲む」に逃がす。
 */

import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  LayoutRectangle,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BUILD } from "./buildInfo";
import {
  availabilityMessage,
  checkCameraAvailability,
  WEB_CAMERA_CAVEAT,
  type CameraAvailability,
} from "./cameraAvailability";
import { cropToUri } from "./decodeImage";
import { frameToImageRect } from "./frameCrop";
import { T, TYPE } from "./theme";
import { NavBar } from "./ui";

export type Shot = { uri: string; width: number; height: number };

/**
 * 画像の大きさを、画像そのものから測る。
 *
 * 写真ライブラリやカメラが大きさを返さないことがある（web の ImagePicker は
 * 0 のまま返してきた）。大きさが 0 のままだと、次の画面で枠が出せず、
 * 「この範囲で読み取る」が押せないボタンになる。
 */
function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    );
  });
}

/** 大きさが分からない画像は、その場で測ってから次へ渡す */
async function sized(uri: string, width: number, height: number): Promise<Shot> {
  if (width > 0 && height > 0) return { uri, width, height };
  const m = await measure(uri);
  return { uri, width: m.width, height: m.height };
}

/** 有限時間で必ず決着させる。無反応のまま固まるのを防ぐ */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}


export default function CaptureScreen({
  onShot,
  onCancel,
}: {
  /**
   * 次の画面へ渡す画像。カメラで撮ったときは**白い枠で切り出したあとの画像**で、
   * fromFrame が true になる。写真から選んだときは元の写真そのまま。
   * どちらの場合も、次の画面でオレンジの枠をもう一度合わせてもらう。
   */
  onShot: (shot: Shot, fromFrame: boolean) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [availability, setAvailability] = useState<CameraAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  /** iOS で選べるレンズ。超広角があれば接写に使える */
  const [lenses, setLenses] = useState<string[]>([]);
  const [macro, setMacro] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  // 白い枠と、その入れ物の実寸。撮ったあとに画素座標へ直すのに要る。
  const preview = useRef({ width: 0, height: 0 });
  const frame = useRef<LayoutRectangle | null>(null);

  // iOS のサードパーティアプリは、標準カメラのようにマクロへ自動で切り替わらない。
  // 広角レンズは10cmほどより近いと合焦できないので、超広角があれば手動で選べるようにする。
  const ultraWide = lenses.find((l) => /ultra/i.test(l));

  useEffect(() => {
    let alive = true;
    checkCameraAvailability().then((a) => {
      if (alive) setAvailability(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function capture() {
    if (busy || cameraRef.current === null) return;
    setBusy(true);
    setError(null);
    try {
      // takePictureAsync が返ってこないと、シャッターが回り続けるだけで
      // 画面が変わらず、原因も分からない。必ず有限時間で抜ける。
      const picture = await withTimeout(
        cameraRef.current.takePictureAsync({ quality: 1 }),
        15000,
        "カメラが写真を返しませんでした（15秒待機）。アプリを再読み込みしてください。",
      );
      if (!picture?.uri) throw new Error("撮影はできましたが画像が空でした");
      const shot = await sized(picture.uri, picture.width ?? 0, picture.height ?? 0);
      const crop =
        frame.current === null
          ? null
          : frameToImageRect(frame.current, preview.current, shot.width, shot.height);

      if (crop === null) {
        // 枠の位置が測れなかった。写真ぜんぶを渡して、次の画面で囲んでもらう。
        onShot(shot, false);
        return;
      }

      // 白い枠の中だけを切り出して、その画像を次の画面に渡す。
      // 切り出したものを見せずに読むと、枠から外れていたことに誰も気づけない。
      try {
        const cropped = await cropToUri(
          shot.uri,
          { x: crop.cx - crop.w / 2, y: crop.cy - crop.h / 2, w: crop.w, h: crop.h },
          shot.width,
          shot.height,
        );
        onShot(cropped, true);
      } catch {
        // 切り出しに失敗しても、撮った写真は無駄にしない。
        // 写真ぜんぶを渡して、次の画面で囲んでもらう。
        onShot(shot, false);
      }
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
      // 写真には白い枠が無いので、切り出さずに渡して、次の画面で囲んでもらう
      onShot(await sized(a.uri, a.width ?? 0, a.height ?? 0), false);
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
      <NavBar
        dark
        title="タグを撮る"
        left="キャンセル"
        onLeft={onCancel}
        right={ultraWide === undefined ? undefined : macro ? "接写 ON" : "接写 OFF"}
        onRight={ultraWide === undefined ? undefined : () => setMacro((v) => !v)}
      />

      <View
        style={s.previewArea}
        onLayout={(e) => {
          preview.current = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
        }}
      >
        {/*
          autofocus は "on" が「一度合わせて固定」、"off" が「必要に応じて合わせ続ける」。
          名前と意味が逆なので注意。以前 "on" を指定していたせいで最初に合った距離で
          ピントが固定され、タグに近づけてもぼやけたままだった。
        */}
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="off"
          selectedLens={macro ? ultraWide : undefined}
          onAvailableLensesChanged={(e) => setLenses(e.lenses)}
          onCameraReady={() => {
            cameraRef.current
              ?.getAvailableLensesAsync()
              .then((l) => setLenses(l))
              // レンズ一覧が取れない端末でも、通常の撮影は続けられる
              .catch(() => undefined);
          }}
          onMountError={(e) => setError(`カメラを開始できません: ${e.message}`)}
        />

        <View
          pointerEvents="none"
          style={s.frame}
          onLayout={(e) => {
            frame.current = e.nativeEvent.layout;
          }}
        >
          <View style={[s.corner, s.tl]} />
          <View style={[s.corner, s.tr]} />
          <View style={[s.corner, s.bl]} />
          <View style={[s.corner, s.br]} />
        </View>

        <View pointerEvents="none" style={s.pillWrap}>
          <Text style={s.pill}>読み取るのは白い枠の中だけ ・ 1記号 110px 以上</Text>
        </View>
      </View>

      <View style={s.guide}>
        <Text style={s.guideTitle}>記号の列を白い枠いっぱいに入れてください</Text>
        <Text style={s.guideBody}>
          読み取るのは白い枠の中だけです。服全体が写ると、記号が小さすぎて読めません。
        </Text>
      </View>

      <View style={s.bar}>
        <Pressable onPress={pickFromLibrary} hitSlop={12} style={s.sideBtn}>
          <Text style={s.cancel}>写真から選ぶ</Text>
        </Pressable>
        <Pressable style={[s.shutter, busy && s.disabled]} onPress={capture}>
          {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterDot} />}
        </Pressable>
        <View style={s.sideBtnRight}>
          <Text style={s.build}>{BUILD}</Text>
        </View>
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
  fill: { flex: 1, backgroundColor: "#1b1a17" },
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
    backgroundColor: T.bg,
  },
  msg: { color: T.ink, fontSize: TYPE.body, lineHeight: 22, textAlign: "center" },
  info: {
    backgroundColor: T.surface2,
    borderRadius: T.radius,
    padding: 12,
    width: "100%",
  },
  infoText: { color: T.ink2, fontSize: TYPE.small, lineHeight: 19 },
  warn: {
    backgroundColor: T.warnWeak,
    borderRadius: T.radius,
    padding: 12,
    width: "100%",
  },
  warnText: { color: T.warn, fontSize: TYPE.small, lineHeight: 19, fontWeight: "600" },
  caveat: { color: T.muted, fontSize: 11.5, lineHeight: 18, textAlign: "center" },
  primary: {
    backgroundColor: T.accent,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: TYPE.body },
  secondary: {
    backgroundColor: T.ink,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  secondaryText: { color: "#fff", fontWeight: "700", fontSize: TYPE.body },
  hintSmall: { color: T.muted, fontSize: 11.5, lineHeight: 18, textAlign: "center" },
  link: { color: T.accent, textDecorationLine: "underline", fontSize: 13 },

  previewArea: { flex: 1, backgroundColor: "#2a2823", overflow: "hidden" },
  frame: {
    position: "absolute",
    left: 28,
    right: 28,
    top: "34%",
    aspectRatio: 2.6,
  },
  corner: { position: "absolute", width: 26, height: 26, borderColor: "#fff" },
  tl: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 4 },
  tr: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 4 },
  bl: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderBottomLeftRadius: 4,
  },
  br: {
    right: 0,
    bottom: 0,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderBottomRightRadius: 4,
  },
  pillWrap: { position: "absolute", left: 0, right: 0, bottom: 24, alignItems: "center" },
  pill: {
    color: "#fff",
    fontSize: 12.5,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(27,26,23,0.72)",
    overflow: "hidden",
  },

  guide: { paddingHorizontal: 24, paddingTop: 16, alignItems: "center" },
  guideTitle: { color: "#fff", fontSize: TYPE.body, fontWeight: "700", lineHeight: 22 },
  guideBody: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 4,
    textAlign: "center",
  },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 34,
  },
  sideBtn: { width: 84 },
  sideBtnRight: { width: 84, alignItems: "flex-end" },
  cancel: { color: "#fff", fontSize: 13 },
  build: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterDot: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  disabled: { opacity: 0.55 },
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
  errorText: { color: "#fff", fontSize: TYPE.small, lineHeight: 19 },
});
