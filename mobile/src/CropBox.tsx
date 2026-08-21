/**
 * 写真の上で「記号の列はここ」と囲んでもらう枠。傾けられる。
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
 * なぜ傾けられるようにしたか:
 *   タグは手で持って撮るので必ず傾く。軸に平行な枠しか引けないと、記号列を
 *   全部入れようとして上下の文字まで巻き込む。文字が混じると段の高さの
 *   見積もりが狂い、記号が候補から外れる（tools/SCAN.md）。
 *   枠ごと傾けられれば記号列だけをぴったり囲める。
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

/** 傾いた枠。中心・大きさ・角度（度、時計回りが正） */
export type Rect = { cx: number; cy: number; w: number; h: number; angleDeg: number };

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
/** 回転つまみを枠の右辺からどれだけ外に置くか。遠いほど細かく回せる */
const KNOB_GAP = 46;
const MAX_ANGLE = 45;

/** 枠の座標系から画面の座標系へ */
function toScreen(box: Rect, u: number, v: number): { x: number; y: number } {
  const rad = (box.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: box.cx + cos * u - sin * v, y: box.cy + sin * u + cos * v };
}

/** 画面の座標系から枠の座標系へ（回転ぶんだけ戻す） */
function toBox(angleDeg: number, dx: number, dy: number): { u: number; v: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { u: cos * dx + sin * dy, v: -sin * dx + cos * dy };
}

export default function CropBox({
  uri,
  imageWidth,
  imageHeight,
  initial,
  onChange,
}: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  /**
   * 前回の枠（画像の画素座標）。読み取り直すときに、同じ枠から始められるようにする。
   * 毎回引き直させると、直したいのは1箇所だけなのに全部やり直しになる。
   */
  initial?: Rect | null;
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
  const initialRef = useRef(initial);
  initialRef.current = initial;

  function publish(next: Rect) {
    const f = fitRef.current;
    boxRef.current = next;
    setBox(next);
    if (f.scale <= 0) return;
    onChangeRef.current({
      cx: (next.cx - f.offsetX) / f.scale,
      cy: (next.cy - f.offsetY) / f.scale,
      w: Math.max(1, next.w / f.scale),
      h: Math.max(1, next.h / f.scale),
      angleDeg: next.angleDeg,
    });
  }

  function clamp(r: Rect): Rect {
    const f = fitRef.current;
    // 画像の寸法がまだ分からないうちは、いじらずにそのまま返す。
    // ここで 0 にクランプすると枠が消える。
    if (f.scale <= 0 || f.w <= 0 || f.h <= 0) return r;
    // 傾いた枠は画像の隅からはみ出しうる。はみ出した分は端の画素を延長して
    // 埋めるので（lib/vision/rotate.ts）、中心が画像の中にあれば足りる。
    return {
      cx: Math.min(Math.max(r.cx, f.offsetX), f.offsetX + f.w),
      cy: Math.min(Math.max(r.cy, f.offsetY), f.offsetY + f.h),
      w: Math.min(Math.max(r.w, MIN_SIZE), f.w * 1.4),
      h: Math.min(Math.max(r.h, MIN_SIZE), f.h * 1.4),
      angleDeg: Math.min(Math.max(r.angleDeg, -MAX_ANGLE), MAX_ANGLE),
    };
  }

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    const f = fitRect(width, height, imageWidth, imageHeight);
    fitRef.current = f;
    if (f.scale <= 0) return;

    // 前回の枠があれば、そこから始める（読み取り直しのとき）
    const init = initialRef.current;
    if (init !== null && init !== undefined && init.w > 0 && init.h > 0) {
      publish(
        clamp({
          cx: f.offsetX + init.cx * f.scale,
          cy: f.offsetY + init.cy * f.scale,
          w: init.w * f.scale,
          h: init.h * f.scale,
          angleDeg: init.angleDeg,
        }),
      );
      return;
    }

    // 初期値は画像の中央付近を横長に。記号列はたいてい横一列なので。
    const w = f.w * 0.82;
    const h = Math.min(f.h * 0.6, w / 3.2);
    publish({ cx: f.offsetX + f.w / 2, cy: f.offsetY + f.h / 2, w, h, angleDeg: 0 });
  }

  function makeResponder(update: (start: Rect, dx: number, dy: number) => Rect) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = boxRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const st = startRef.current;
        if (st === null) return;
        publish(clamp(update(st, g.dx, g.dy)));
      },
      onPanResponderTerminationRequest: () => false,
    });
  }

  /** 角をつまんで大きさを変える。反対側の角は動かさない */
  function resizeFrom(sign: 1 | -1) {
    return (st: Rect, dx: number, dy: number): Rect => {
      const d = toBox(st.angleDeg, dx, dy);
      const w = Math.max(MIN_SIZE, st.w - sign * d.u);
      const h = Math.max(MIN_SIZE, st.h - sign * d.v);
      // 動かさない側の角。枠座標で (+w/2,+h/2) または (-w/2,-h/2)。
      const fixed = toScreen(st, (sign * st.w) / 2, (sign * st.h) / 2);
      const half = toBox(-st.angleDeg, (sign * w) / 2, (sign * h) / 2);
      return { cx: fixed.x - half.u, cy: fixed.y - half.v, w, h, angleDeg: st.angleDeg };
    };
  }

  const moveResponder = useRef(
    makeResponder((st, dx, dy) => ({ ...st, cx: st.cx + dx, cy: st.cy + dy })),
  ).current;
  const topLeftResponder = useRef(makeResponder(resizeFrom(1))).current;
  const bottomRightResponder = useRef(makeResponder(resizeFrom(-1))).current;
  const rotateResponder = useRef(
    makeResponder((st, dx, dy) => {
      // つまみは枠座標で (w/2 + KNOB_GAP, 0)。画面でのその向きは枠の角度そのものなので、
      // 中心からつまみへ向かう角度を測れば、それが新しい角度になる。
      const k = toScreen(st, st.w / 2 + KNOB_GAP, 0);
      const deg = (Math.atan2(k.y + dy - st.cy, k.x + dx - st.cx) * 180) / Math.PI;
      return { ...st, angleDeg: deg };
    }),
  ).current;

  const knob = box === null ? null : toScreen(box, box.w / 2 + KNOB_GAP, 0);
  const corner = (sign: 1 | -1) =>
    box === null ? { x: 0, y: 0 } : toScreen(box, (sign * box.w) / 2, (sign * box.h) / 2);

  return (
    <View style={s.root} onLayout={onLayout}>
      <Image source={{ uri }} style={s.image} resizeMode="contain" />

      {box !== null && knob !== null && (
        <>
          <View
            style={[
              s.box,
              {
                left: box.cx - box.w / 2,
                top: box.cy - box.h / 2,
                width: box.w,
                height: box.h,
                transform: [{ rotate: `${box.angleDeg}deg` }],
              },
            ]}
            {...moveResponder.panHandlers}
          />
          {([-1, 1] as const).map((sign) => {
            const p = corner(sign);
            return (
              <View
                key={sign}
                style={[s.handle, { left: p.x - HANDLE / 2, top: p.y - HANDLE / 2 }]}
                {...(sign === -1 ? topLeftResponder : bottomRightResponder).panHandlers}
              >
                <View style={s.handleDot} />
              </View>
            );
          })}
          <View
            style={[s.handle, { left: knob.x - HANDLE / 2, top: knob.y - HANDLE / 2 }]}
            {...rotateResponder.panHandlers}
          >
            <View style={s.rotateDot}>
              <Text style={s.rotateGlyph}>回転</Text>
            </View>
          </View>
        </>
      )}

      <Text style={s.caption}>
        {box === null
          ? "枠の中だけを読みます"
          : `枠の中だけを読みます ・ 傾き ${box.angleDeg.toFixed(1)} 度（「回転」を動かすと傾きます）`}
      </Text>
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
  rotateDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  rotateGlyph: { color: T.accent, fontSize: 11, fontWeight: "700" },
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
