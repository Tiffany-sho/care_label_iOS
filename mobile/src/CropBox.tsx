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

/** 表示中の画像が、コンテナのどこに contain で収まっているか */
function fitRect(cw: number, ch: number, iw: number, ih: number) {
  if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0, w: cw, h: ch };
  }
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { scale, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2, w, h };
}

const HANDLE = 34;
const MIN_SIZE = 48;

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
  const [container, setContainer] = useState({ w: 0, h: 0 });
  // 枠は画面座標で持つ（指の動きと一致させるため）。確定時に画素座標へ直す。
  const [box, setBox] = useState<Rect | null>(null);
  const boxRef = useRef<Rect | null>(null);
  const startRef = useRef<Rect | null>(null);

  const fit = fitRect(container.w, container.h, imageWidth, imageHeight);

  function publish(next: Rect) {
    boxRef.current = next;
    setBox(next);
    if (fit.scale <= 0) return;
    onChange({
      x: Math.max(0, Math.round((next.x - fit.offsetX) / fit.scale)),
      y: Math.max(0, Math.round((next.y - fit.offsetY) / fit.scale)),
      w: Math.round(next.w / fit.scale),
      h: Math.round(next.h / fit.scale),
    });
  }

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setContainer({ w: width, h: height });
    if (boxRef.current === null && width > 0 && height > 0) {
      const f = fitRect(width, height, imageWidth, imageHeight);
      // 初期値は画像の中央付近を横長に。記号列はたいてい横一列なので。
      const w = f.w * 0.8;
      const h = Math.min(f.h * 0.5, w / 3.2);
      publishWith(
        { x: f.offsetX + (f.w - w) / 2, y: f.offsetY + (f.h - h) / 2, w, h },
        f,
      );
    }
  }

  /** onLayout の時点では fit がまだ state に無いので、明示的に渡す */
  function publishWith(next: Rect, f: ReturnType<typeof fitRect>) {
    boxRef.current = next;
    setBox(next);
    if (f.scale <= 0) return;
    onChange({
      x: Math.max(0, Math.round((next.x - f.offsetX) / f.scale)),
      y: Math.max(0, Math.round((next.y - f.offsetY) / f.scale)),
      w: Math.round(next.w / f.scale),
      h: Math.round(next.h / f.scale),
    });
  }

  function clampToImage(r: Rect): Rect {
    const left = fit.offsetX;
    const top = fit.offsetY;
    const right = fit.offsetX + fit.w;
    const bottom = fit.offsetY + fit.h;
    const w = Math.min(Math.max(r.w, MIN_SIZE), fit.w);
    const h = Math.min(Math.max(r.h, MIN_SIZE), fit.h);
    return {
      x: Math.min(Math.max(r.x, left), right - w),
      y: Math.min(Math.max(r.y, top), bottom - h),
      w,
      h,
    };
  }

  const moveResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = boxRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = startRef.current;
        if (s === null) return;
        publish(clampToImage({ ...s, x: s.x + g.dx, y: s.y + g.dy }));
      },
    }),
  ).current;

  const topLeftResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = boxRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = startRef.current;
        if (s === null) return;
        publish(
          clampToImage({
            x: s.x + g.dx,
            y: s.y + g.dy,
            w: s.w - g.dx,
            h: s.h - g.dy,
          }),
        );
      },
    }),
  ).current;

  const bottomRightResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = boxRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = startRef.current;
        if (s === null) return;
        publish(clampToImage({ ...s, w: s.w + g.dx, h: s.h + g.dy }));
      },
    }),
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

      <Text style={s.caption}>記号の列だけを枠で囲んでください</Text>
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
    backgroundColor: "rgba(217,119,87,0.14)",
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
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: T.accent,
    borderWidth: 2,
    borderColor: "#fff",
  },
  caption: {
    position: "absolute",
    bottom: 6,
    alignSelf: "center",
    color: "#fff",
    fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
});
