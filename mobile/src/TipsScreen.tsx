/**
 * ② 撮る前に。失敗する条件を先に見せる。
 *
 * 4項目は思いつきではなく、実写の評価で実際に落ちた原因
 * （小さすぎる・暗い・湾曲・傾き）から取っている。増やさないこと。
 * 読まれない案内は、読まれない分だけ撮り直しを増やす。
 */

import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SYMBOL_BY_CODE } from "../../lib/symbols";
import CareSymbolNative from "./CareSymbolNative";
import { setSkipTips } from "./prefs";
import { T, TYPE } from "./theme";
import { Icon, NavBar, PrimaryButton, type IconName } from "./ui";

const SAMPLE = ["151", "200", "300"];

function MiniTag({ size }: { size: number }) {
  return (
    <View style={[s.miniTag, { width: size * 4.1, padding: size * 0.22 }]}>
      {SAMPLE.map((code) => (
        <CareSymbolNative key={code} glyph={SYMBOL_BY_CODE[code].glyph} size={size} />
      ))}
    </View>
  );
}

function Row({
  icon,
  title,
  body,
  first,
}: {
  icon: IconName;
  title: string;
  body: string;
  first?: boolean;
}) {
  return (
    <View style={[s.row, first !== true && s.rowBorder]}>
      <View style={s.rowIcon}>
        <Icon name={icon} size={20} color={T.warn} width={1.8} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function TipsScreen({
  onBack,
  onOpenCamera,
}: {
  onBack: () => void;
  onOpenCamera: () => void;
}) {
  const [skip, setSkip] = useState(false);

  return (
    <View style={s.root}>
      <NavBar title="撮る前に" left="‹ 戻る" onLeft={onBack} />

      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h1}>これだけ守ると、ほぼ読めます</Text>
        <Text style={s.lead}>
          記号が小さすぎる・暗い・曲がっている、のどれかだと読み取れません。
        </Text>

        <View style={s.examples}>
          <View style={s.example}>
            <View style={s.exampleBox}>
              <MiniTag size={34} />
              <View style={[s.tag, { backgroundColor: T.ok }]}>
                <Icon name="check" size={11} color="#fff" width={3.4} />
                <Text style={s.tagText}>よい</Text>
              </View>
            </View>
            <Text style={s.exampleCaption}>記号の列が画面いっぱい</Text>
          </View>

          <View style={s.example}>
            <View style={s.exampleBox}>
              <MiniTag size={12} />
              <View style={[s.tag, { backgroundColor: T.danger }]}>
                <Icon name="close" size={11} color="#fff" width={3.4} />
                <Text style={s.tagText}>読めない</Text>
              </View>
            </View>
            <Text style={s.exampleCaption}>服ごと撮ると小さすぎます</Text>
          </View>
        </View>

        <View style={s.rows}>
          <Row
            first
            icon="sun"
            title="明るいところで"
            body="自分の影が入ると、細い線が消えて読めなくなります。"
          />
          <Row
            icon="flat"
            title="タグを平らに伸ばして"
            body="丸まったタグは形がゆがみ、別の記号に読み違えます。"
          />
          <Row
            icon="front"
            title="まっすぐ、正面から"
            body="斜めから撮るほど当たらなくなります。真上から。"
          />
          <Row
            icon="scan"
            title="記号の列だけを枠に"
            body="サイズや素材の文字が入ると失敗しやすくなります。記号が2段のタグは、2段とも入れて大丈夫です。"
          />
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          style={s.check}
          onPress={() => {
            const next = !skip;
            setSkip(next);
            void setSkipTips(next);
          }}
        >
          <View style={[s.checkBox, skip && s.checkBoxOn]}>
            {skip && <Icon name="check" size={14} color="#fff" width={3.2} />}
          </View>
          <Text style={s.checkLabel}>次からは出さない</Text>
        </Pressable>
        <PrimaryButton label="カメラをひらく" onPress={onOpenCamera} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { padding: 16, paddingBottom: 24 },
  h1: { fontSize: TYPE.h1, fontWeight: "700", color: T.ink, lineHeight: 30 },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 5 },

  examples: { flexDirection: "row", gap: 10, marginTop: 14 },
  example: { flex: 1 },
  exampleBox: {
    height: 118,
    backgroundColor: T.surface3,
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: T.radiusLg,
    alignItems: "center",
    justifyContent: "center",
  },
  miniTag: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f7f5ee",
    borderWidth: 1,
    borderColor: T.borderStrong,
    borderRadius: 3,
  },
  tag: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  tagText: { color: "#fff", fontSize: TYPE.tiny, fontWeight: "700" },
  exampleCaption: { fontSize: TYPE.small, lineHeight: 19, color: T.ink2, marginTop: 7 },

  rows: { marginTop: 12 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 11 },
  rowBorder: { borderTopWidth: 1, borderTopColor: T.border },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: T.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: "700", color: T.ink },
  rowBody: { fontSize: 13, lineHeight: 20, color: T.ink2, marginTop: 2 },

  footer: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    gap: 12,
  },
  check: { flexDirection: "row", alignItems: "center", gap: 9 },
  checkBox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: T.borderStrong,
    borderRadius: 6,
    backgroundColor: T.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: T.accent, borderColor: T.accent },
  checkLabel: { fontSize: 13, color: T.ink2 },
});
