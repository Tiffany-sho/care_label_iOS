/**
 * ① 入口。カメラで読むか、手で選ぶかの二択。
 *
 * どちらの経路でも行き先は同じ（洗い方の画面）で、
 * どちらも「人が確定を押すまでは下書き」という扱いを変えない。
 */

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SOURCE_NOTE } from "./PlanView";
import { T, TYPE } from "./theme";
import { Icon, type IconName } from "./ui";

function Choice({
  icon,
  title,
  body,
  dark,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  dark?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.choice} onPress={onPress}>
      <View style={[s.choiceIcon, dark === true ? s.choiceIconDark : s.choiceIconLight]}>
        <Icon name={icon} size={26} color={dark === true ? "#fff" : T.ink} width={1.6} />
      </View>
      <View style={s.choiceText}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceBody}>{body}</Text>
      </View>
      <Icon name="chevron" size={18} color={T.muted} width={1.8} />
    </Pressable>
  );
}

export default function HomeScreen({
  onCamera,
  onManual,
}: {
  onCamera: () => void;
  onManual: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.root}>
      <View>
        <Text style={s.eyebrow}>CARELABEL</Text>
        <Text style={s.title}>タグを読み取る</Text>
        <Text style={s.lead}>
          タグの記号から、この服の洗い方がわかります。数字は「ここまで大丈夫」という上限です。
        </Text>
      </View>

      <View style={s.choices}>
        <Choice
          icon="camera"
          title="カメラで読み取る"
          body="タグを撮ると記号を読み取ります。確定する前に、写真と見比べられます。"
          dark
          onPress={onCamera}
        />
        <Choice
          icon="list"
          title="手で選ぶ"
          body="7種類を順番に1つずつ。タグに無いものは「無い」と記録します。"
          onPress={onManual}
        />
        <View style={s.note}>
          <Text style={s.noteText}>
            どちらで確定しても、次に洗い方の注意点が出ます。そのまま服として保存できます。
          </Text>
        </View>
      </View>

      <Text style={s.source}>{SOURCE_NOTE}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flexGrow: 1, padding: 16, gap: 18 },
  eyebrow: { fontSize: TYPE.tiny, fontWeight: "700", letterSpacing: 1.3, color: T.muted },
  title: { fontSize: TYPE.title, fontWeight: "700", color: T.ink, marginTop: 6 },
  lead: { fontSize: TYPE.bodyLead, lineHeight: 21, color: T.muted, marginTop: 4 },

  choices: { flex: 1, justifyContent: "center", gap: 12, paddingBottom: 24 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.radiusLg,
  },
  choiceIcon: {
    width: 52,
    height: 52,
    borderRadius: T.radiusLg,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceIconDark: { backgroundColor: T.ink },
  choiceIconLight: {
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.borderStrong,
  },
  choiceText: { flex: 1 },
  choiceTitle: { fontSize: TYPE.h2, fontWeight: "700", color: T.ink },
  choiceBody: { fontSize: 13, lineHeight: 20, color: T.muted, marginTop: 3 },

  note: { padding: 14, backgroundColor: T.surface2, borderRadius: T.radiusLg, marginTop: 4 },
  noteText: { fontSize: TYPE.small, lineHeight: 20, color: T.ink2 },

  source: { fontSize: TYPE.tiny, lineHeight: 17, color: T.muted },
});
