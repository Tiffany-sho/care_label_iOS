/**
 * 画面をまたいで使う部品。
 *
 * 絵は react-native-svg で描く。アイコンフォントを足すと Expo Go のまま動かなく
 * なるものがあるうえ、線の太さをテーマに合わせられない。
 */

import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { T, TYPE } from "./theme";

// ── アイコン ───────────────────────────────────────

type IconShape = {
  d?: string[];
  circles?: { cx: number; cy: number; r: number }[];
  rects?: { x: number; y: number; w: number; h: number; rx: number }[];
};

export const ICONS = {
  scan: {
    d: [
      "M3 8V5a2 2 0 0 1 2-2h3",
      "M16 3h3a2 2 0 0 1 2 2v3",
      "M21 16v3a2 2 0 0 1-2 2h-3",
      "M8 21H5a2 2 0 0 1-2-2v-3",
      "M3 12h18",
    ],
  },
  hanger: {
    d: [
      "M12 6.5a2 2 0 1 1 2 2c-1.1 0-2 .9-2 2V12",
      "M12 12 3.6 17.3A1 1 0 0 0 4.2 19h15.6a1 1 0 0 0 .6-1.7L12 12z",
    ],
  },
  basket: {
    d: [
      "M4 9h16l-1.3 9.1a2 2 0 0 1-2 1.9H7.3a2 2 0 0 1-2-1.9L4 9z",
      "M8.5 9 12 3.5 15.5 9",
      "M9.5 13v3",
      "M14.5 13v3",
    ],
  },
  camera: {
    d: ["M4 9a2 2 0 0 1 2-2h2.3l1.2-2h5l1.2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z"],
    circles: [{ cx: 12, cy: 13, r: 3.4 }],
  },
  list: {
    d: [
      "M10 6h10",
      "M10 12h10",
      "M10 18h10",
      "m3.5 6 1.5 1.5L8 4.5",
      "m3.5 12 1.5 1.5L8 10.5",
      "m3.5 18 1.5 1.5L8 16.5",
    ],
  },
  chevron: { d: ["m9 6 6 6-6 6"] },
  check: { d: ["m5 13 5 5L19 7"] },
  close: { d: ["M6 6l12 12", "M18 6 6 18"] },
  plus: { d: ["M12 5v14", "M5 12h14"] },
  image: {
    d: ["m21 16-5-5L5 20"],
    circles: [{ cx: 8.5, cy: 9.5, r: 1.5 }],
    rects: [{ x: 3, y: 4, w: 18, h: 16, rx: 2 }],
  },
  lock: {
    d: ["M8 10V7a4 4 0 0 1 8 0v3"],
    rects: [{ x: 4, y: 10, w: 16, h: 10, rx: 2 }],
  },
  bulb: {
    d: [
      "M9 18h6",
      "M10 21h4",
      "M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .9 1.7h5.4c.1-.7.4-1.3.9-1.7A6 6 0 0 0 12 3z",
    ],
  },
  info: {
    d: ["M12 8.2v4.6", "M12 16h.01"],
    circles: [{ cx: 12, cy: 12, r: 9 }],
  },
  sun: {
    d: [
      "M12 3v2",
      "M12 19v2",
      "M3 12h2",
      "M19 12h2",
      "m5.6 5.6 1.4 1.4",
      "m17 17 1.4 1.4",
      "m18.4 5.6-1.4 1.4",
      "m7 17-1.4 1.4",
    ],
    circles: [{ cx: 12, cy: 12, r: 4 }],
  },
  flat: { d: ["M4 8c2.7 2.4 5.3 2.4 8 0s5.3-2.4 8 0", "M4 16h16"] },
  front: {
    d: ["M3.5 12h17"],
    rects: [{ x: 3.5, y: 6, w: 17, h: 12, rx: 2 }],
  },
  hang: { d: ["M3 6h18", "M7.5 6v7", "M12 6v10", "M16.5 6v7"] },
  iron: {
    d: ["M4 15.5h16a4 4 0 0 0-4-4H9.5L8.3 9.3H6.2A2.2 2.2 0 0 0 4 11.5v4z", "M3.5 18.5h17"],
  },
  washer: {
    d: ["M8 6.5h.01", "M11 6.5h.01"],
    rects: [{ x: 4, y: 3, w: 16, h: 18, rx: 3 }],
    circles: [{ cx: 12, cy: 13.5, r: 4.2 }],
  },
  bleach: { d: ["M12 4.5 20.5 19.5h-17L12 4.5z", "M12 10.5v3.5", "M12 16.8h.01"] },
  shop: {
    d: [
      "M4.5 9.5h15V19a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V9.5z",
      "m4.5 9.5 1.8-5h11.4l1.8 5",
      "M10 20v-5.5h4V20",
    ],
  },
  trash: { d: ["M4 7h16", "M9 7V5h6v2", "M6 7l1 13h10l1-13"] },
} satisfies Record<string, IconShape>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color = T.ink,
  width = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: string;
  width?: number;
}) {
  const shape: IconShape = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {shape.rects?.map((r, i) => (
        <Rect
          key={`r${i}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={r.rx}
          stroke={color}
          strokeWidth={width}
        />
      ))}
      {shape.circles?.map((c, i) => (
        <Circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r} stroke={color} strokeWidth={width} />
      ))}
      {shape.d?.map((d, i) => (
        <Path
          key={`p${i}`}
          d={d}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

// ── ボタン ────────────────────────────────────────

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = "accent",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "accent" | "ink";
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        s.primary,
        { backgroundColor: tone === "accent" ? T.accent : T.ink },
        disabled === true && s.disabled,
        style,
      ]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.outline, disabled === true && s.disabled, style]}
    >
      <Text style={s.outlineText}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({
  label,
  onPress,
  align = "center",
}: {
  label: string;
  onPress: () => void;
  align?: "center" | "left";
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[s.link, { textAlign: align }]}>{label}</Text>
    </Pressable>
  );
}

// ── ヘッダー ───────────────────────────────────────

export function NavBar({
  title,
  left,
  onLeft,
  right,
  onRight,
  dark,
}: {
  title?: string;
  left?: string;
  onLeft?: () => void;
  right?: string;
  onRight?: () => void;
  dark?: boolean;
}) {
  return (
    <View style={[s.nav, dark === true && s.navDark]}>
      <View style={s.navSide}>
        {left !== undefined && (
          <Pressable onPress={onLeft} hitSlop={10}>
            <Text style={[s.navAction, dark === true && s.navActionDark]}>{left}</Text>
          </Pressable>
        )}
      </View>
      <Text style={[s.navTitle, dark === true && s.navTitleDark]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[s.navSide, s.navSideRight]}>
        {right !== undefined && (
          <Pressable onPress={onRight} hitSlop={10}>
            <Text style={[s.navAction, dark === true && s.navActionDark]}>{right}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── 下のタブ ───────────────────────────────────────

export type TabId = "scan" | "closet" | "combine";

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "scan", label: "読み取る", icon: "scan" },
  { id: "closet", label: "マイクローゼット", icon: "hanger" },
  { id: "combine", label: "まとめて洗う", icon: "basket" },
];

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <View style={s.tabBar}>
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Pressable key={t.id} style={s.tabItem} onPress={() => onChange(t.id)}>
            <Icon name={t.icon} size={24} color={on ? T.ink : T.muted} />
            <Text style={[s.tabLabel, on && s.tabLabelOn]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── 小物 ──────────────────────────────────────────

export function Badge({
  label,
  bg,
  fg,
}: {
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletMark}>・</Text>
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

export function NoteBox({ text, icon = "info" }: { text: string; icon?: IconName }) {
  return (
    <View style={s.noteBox}>
      <Icon name={icon} size={16} color={T.muted} width={1.9} />
      <Text style={s.noteText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  primary: {
    height: 52,
    borderRadius: T.radiusLg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  outline: {
    height: 48,
    borderRadius: T.radiusLg,
    borderWidth: 1,
    borderColor: T.ink,
    backgroundColor: T.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { color: T.ink, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  link: {
    color: T.accent,
    fontSize: 13,
    textDecorationLine: "underline",
    paddingVertical: 10,
  },

  nav: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: 16,
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  navDark: { backgroundColor: "transparent", borderBottomWidth: 0 },
  navSide: { flex: 1 },
  navSideRight: { alignItems: "flex-end" },
  navAction: { color: T.accent, fontSize: TYPE.body },
  navActionDark: { color: "#fff" },
  navTitle: { fontSize: 16, fontWeight: "700", color: T.ink },
  navTitleDark: { color: "#fff" },

  tabBar: {
    flexDirection: "row",
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 2 },
  tabLabel: { fontSize: TYPE.tiny, color: T.muted, fontWeight: "500" },
  tabLabelOn: { color: T.ink, fontWeight: "700" },

  badge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { fontSize: 12, fontWeight: "700" },

  bulletRow: { flexDirection: "row", gap: 3, marginTop: 6 },
  bulletMark: { fontSize: TYPE.body, lineHeight: 23, color: T.ink2 },
  bulletText: { flex: 1, fontSize: TYPE.body, lineHeight: 23, color: T.ink2 },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: T.surface2,
    borderRadius: T.radius,
  },
  noteText: { flex: 1, fontSize: TYPE.small, lineHeight: 19, color: T.muted },
});
