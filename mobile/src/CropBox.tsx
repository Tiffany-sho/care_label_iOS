/**
 * 写真の上で「記号の列はここ」と囲んでもらう枠。
 *
 * なぜ人に囲ませるのか:
 *   写真のどこに記号列があるかを自動で見つける工程（Stage 1）が、実機で
 *   6個中1個しか当たらなかった。合成データを実物に近づけては閾値を直す、を
 *   繰り返しても差が埋まらない。一方、切り出し済みの記号を見分ける工程は
 *   実測で 97〜100% 出ている。難しいのは検出であって分類ではない。
 *
 *   囲んでもらえば、その難しい工程がまるごと消える。おまけに原寸で切り出せる
 *   ので、1記号あたりのピクセル数が上がり（実測で110px以上が必要）、
 *   処理する画素数も減って速くなる。
 *
 * 実装上の注意（一度これで壊した）:
 *   PanResponder は useRef で一度だけ作るので、その中のコードは**初回レンダー
 *   時の値を掴んだまま**になる。初回は画像サイズが未計測（0x0）なので、
 *   state を直接読むと枠の幅が0にクランプされて消える。
 *   ハンドラから触る値はすべて ref 経由で最新を読むこと。
 */

import React, { useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { T } from "./theme";

export type Rect = { x: number; y: number; w: number; h: number };

type Fit = { scale: number; offsetX: number; offsetY: number; w: number; h: number };

/** 表示中の画像が、コンテナのどこに contain で収まっているか */
function fitRect(cw: number, ch: number, iw: number, ih: number): Fit {
  if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0, w: 0, h: 0 };
  }
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { scale, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2, w, h };
}

const HANDLE = 44;
const MIN_SIZE = 40;

export default function CropBox({
  uri,
  imageWidth,
  imageHeight,
  onChange,
}: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  /** 画像の画素座標での切り出し範囲 */
  onChange: (rect: Rect) => void;
}) {
  // 枠は画面座標で持つ（指の動きと一致させるため）。確定時に画素座標へ直す。
  const [box, setBox] = useState<Rect | null>(null);

  // ハンドラから読む値はすべて ref に置く。PanResponder は作り直されないので、
  // state を直接読むと初回レンダーの値に固定される。
  const fitRef = useRef<Fit>({ scale: 0, offsetX: 0, offsetY: 0, w: 0, h: 0 });
  const boxRef = useRef<Rect | null>(null);
  const startRef = useRef<Rect | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function publish(next: Rect) {
    const f = fitRef.current;
    boxRef.current = next;
    setBox(next);
    if (f.scale <= 0) return;
    onChangeRef.current({
      x: Math.max(0, Math.round((next.x - f.offsetX) / f.scale)),
      y: Math.max(0, Math.round((next.y - f.offsetY) / f.scale)),
      w: Math.max(1, Math.round(next.w / f.scale)),
      h: Math.max(1, Math.round(next.h / f.scale)),
    });
  }

  function clamp(r: Rect): Rect {
    const f = fitRef.current;
    // 画像の寸法がまだ分からないうちは、いじらずにそのまま返す。
    // ここで 0 にクランプすると枠が消える。
    if (f.scale <= 0 || f.w <= 0 || f.h <= 0) return r;
    const w = Math.min(Math.max(r.w, MIN_SIZE), f.w);
    const h = Math.min(Math.max(r.h, MIN_SIZE), f.h);
    return {
      x: Math.min(Math.max(r.x, f.offsetX), f.offsetX + f.w - w),
      y: Math.min(Math.max(r.y, f.offsetY), f.offsetY + f.h - h),
      w,
      h,
    };
  }

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    const f = fitRect(width, height, imageWidth, imageHeight);
    fitRef.current = f;
    if (f.scale <= 0) return;
    // 初期値は画像の中央付近を横長に。記号列はたいてい横一列なので。
    const w = f.w * 0.86;
    const h = Math.min(f.h * 0.6, w / 3.2);
    publish({
      x: f.offsetX + (f.w - w) / 2,
      y: f.offsetY + (f.h - h) / 2,
      w,
      h,
    });
  }

  function makeResponder(update: (start: Rect, dx: number, dy: number) => Rect) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = boxRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = startRef.current;
        if (s === null) return;
        publish(clamp(update(s, g.dx, g.dy)));
      },
      onPanResponderTerminationRequest: () => false,
    });
  }

  const moveResponder = useRef(
    makeResponder((s, dx, dy) => ({ ...s, x: s.x + dx, y: s.y + dy })),
  ).current;
  const topLeftResponder = useRef(
    makeResponder((s, dx, dy) => ({
      x: s.x + dx,
      y: s.y + dy,
      w: s.w - dx,
      h: s.h - dy,
    })),
  ).current;
  const bottomRightResponder = useRef(
    makeResponder((s, dx, dy) => ({ ...s, w: s.w + dx, h: s.h + dy })),
  ).current;

  return (
    <View style={s.root} onLayout={onLayout}>
      <Image source={{ uri }} style={s.image} resizeMode="contain" />

      {box !== null && (
        <>
          <View
            style={[
              s.box,
              { left: box.x, top: box.y, width: box.w, height: box.h },
            ]}
            {...moveResponder.panHandlers}
          />
          <View
            style={[s.handle, { left: box.x - HANDLE / 2, top: box.y - HANDLE / 2 }]}
            {...topLeftResponder.panHandlers}
          >
            <View style={s.handleDot} />
          </View>
          <View
            style={[
              s.handle,
              {
                left: box.x + box.w - HANDLE / 2,
                top: box.y + box.h - HANDLE / 2,
              },
            ]}
            {...bottomRightResponder.panHandlers}
          >
            <View style={s.handleDot} />
          </View>
        </>
      )}

      <Text style={s.caption}>枠の中だけを読みます（角の丸を動かすと大きさが変わります）</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, width: "100%", backgroundColor: T.surface3, borderRadius: T.radius },
  image: { width: "100%", height: "100%", borderRadius: T.radius },
  box: {
    position: "absolute",
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: "rgba(217,119,87,0.12)",
    borderRadius: 4,
  },
  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    alignItems: "center",
    justifyContent: "center",
  },
  handleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: T.accent,
    borderWidth: 3,
    borderColor: "#fff",
  },
  caption: {
    position: "absolute",
    bottom: 6,
    alignSelf: "center",
    color: "#fff",
    fontSize: 11.5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
});
