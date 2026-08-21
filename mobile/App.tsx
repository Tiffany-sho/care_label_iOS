/**
 * 画面の行き先を決めるところ。
 *
 * 経路は2つだけ:
 *   カメラ  … 撮る前の注意 → カメラ（白い枠） → 読み取り中 → 読み取りの確認 →
 *   手入力  … 1分類ずつ7回 ────────────────────────────────→ 洗い方 → 保存
 *
 * どちらも「人が確定を押すまでは下書き」で、確認を飛ばせる近道は作らない。
 *
 * 画面遷移のライブラリは入れていない。行き先が10画面ほどで、
 * 戻り方も一本道なので、配列1本のほうが読める（ネイティブ依存も増えない）。
 */

import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";

import type { Selection } from "../lib/plan";
import CaptureScreen, { type Shot } from "./src/CaptureScreen";
import ClosetScreen from "./src/ClosetScreen";
import {
  addGarment,
  newId,
  removeGarment,
  untitledName,
  updateGarment,
  useCloset,
  type Garment,
} from "./src/closet";
import CombineScreen from "./src/CombineScreen";
import type { Rect } from "./src/CropBox";
import CropScreen from "./src/CropScreen";
import GarmentScreen from "./src/GarmentScreen";
import HomeScreen from "./src/HomeScreen";
import ManualScreen from "./src/ManualScreen";
import { forgetPhoto, persistPhoto } from "./src/photos";
import { getSkipTips } from "./src/prefs";
import ProcessingScreen from "./src/ProcessingScreen";
import ResultScreen from "./src/ResultScreen";
import SaveFormScreen, { type GarmentInfo } from "./src/SaveFormScreen";
import type { ScanResult } from "./src/scan";
import ScanCheckScreen from "./src/ScanCheckScreen";
import TipsScreen from "./src/TipsScreen";
import { T } from "./src/theme";
import { TabBar, type TabId } from "./src/ui";

/** 確定前の1着ぶん。保存するまではここにしか無い */
type Draft = {
  selection: Selection;
  source: "scan" | "manual";
  needsCheck: boolean;
  tagPhotoUri: string | null;
  /** 既にある服の記号を直しているときだけ入る */
  garmentId?: string;
};

type Route =
  | { k: "home" }
  | { k: "closet" }
  | { k: "combine" }
  | { k: "tips" }
  | { k: "capture" }
  /** オレンジの枠で読み取る範囲を決める。initial は前回の枠（読み取り直し用） */
  | { k: "trim"; shot: Shot; initial: Rect | null; fromFrame: boolean }
  | { k: "processing"; shot: Shot; crop: Rect }
  | { k: "check"; result: ScanResult; shot: Shot }
  | { k: "manual"; initial: Selection }
  | { k: "result" }
  | { k: "save"; garmentId?: string }
  | { k: "garment"; id: string };

const TAB_ROOT: Record<TabId, Route> = {
  scan: { k: "home" },
  closet: { k: "closet" },
  combine: { k: "combine" },
};

/** タブを出したままにする画面。撮影・読み取り・保存の途中では出さない */
const WITH_TABS = new Set(["home", "closet", "combine", "garment"]);

export default function App() {
  const [tab, setTab] = useState<TabId>("scan");
  const [stack, setStack] = useState<Route[]>([TAB_ROOT.scan]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [skipTips, setSkipTips] = useState(false);
  const { items, ready } = useCloset();

  useEffect(() => {
    getSkipTips().then(setSkipTips);
  }, []);

  const route = stack[stack.length - 1];
  const push = (r: Route) => setStack((s) => [...s, r]);
  const replace = (r: Route) => setStack((s) => [...s.slice(0, -1), r]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const resetTo = (t: TabId) => {
    setTab(t);
    setStack([TAB_ROOT[t]]);
  };

  /** 記号が確定したあと。洗い方の画面へ */
  function toResult(next: Draft) {
    setDraft(next);
    replace({ k: "result" });
  }

  async function saveGarment(info: GarmentInfo, garmentId?: string) {
    const id = garmentId ?? draft?.garmentId ?? newId();
    const photoUri =
      info.photoUri === null ? null : await persistPhoto(info.photoUri, id);
    const existing = items.find((g) => g.id === id);

    if (existing !== undefined) {
      await updateGarment(id, {
        name: info.name,
        photoUri,
        color: info.color,
        kind: info.kind,
        selection: draft?.selection ?? existing.selection,
        needsCheck: draft?.needsCheck ?? existing.needsCheck,
      });
    } else {
      const g: Garment = {
        id,
        name: info.name,
        photoUri,
        tagPhotoUri: draft?.tagPhotoUri ?? null,
        color: info.color,
        kind: info.kind,
        selection: draft?.selection ?? {},
        source: draft?.source ?? "manual",
        needsCheck: draft?.needsCheck ?? false,
        savedAt: new Date().toISOString(),
      };
      await addGarment(g);
    }
    setDraft(null);
    setTab("closet");
    setStack([TAB_ROOT.closet, { k: "garment", id }]);
  }

  function body() {
    switch (route.k) {
      case "home":
        return (
          <HomeScreen
            onCamera={() => push(skipTips ? { k: "capture" } : { k: "tips" })}
            onManual={() => push({ k: "manual", initial: {} })}
          />
        );

      case "tips":
        return (
          <TipsScreen onBack={pop} onOpenCamera={() => replace({ k: "capture" })} />
        );

      case "capture":
        return (
          <CaptureScreen
            onCancel={pop}
            onShot={(shot, fromFrame) =>
              // カメラなら白い枠で切り出したあとの画像、写真から選んだなら元の写真。
              // どちらもオレンジの枠で最後の範囲を決めてもらう。
              push({ k: "trim", shot, initial: null, fromFrame })
            }
          />
        );

      case "trim":
        return (
          <CropScreen
            shot={route.shot}
            initial={route.initial}
            fromFrame={route.fromFrame}
            onBack={pop}
            onRead={(crop) =>
              // 使った枠をこの画面の記録に残してから進む。
              // 読み取り直すときに、同じ枠から始められるようにするため。
              setStack((st) => [
                ...st.slice(0, -1),
                { ...route, initial: crop },
                { k: "processing", shot: route.shot, crop },
              ])
            }
          />
        );

      case "processing":
        return (
          <ProcessingScreen
            shot={route.shot}
            crop={route.crop}
            onCancel={pop}
            onDone={(result) => replace({ k: "check", result, shot: route.shot })}
          />
        );

      case "check":
        return (
          <ScanCheckScreen
            result={route.result}
            onRetake={() => setStack([TAB_ROOT.scan, { k: "capture" }])}
            // 1つ戻ると、さっきの枠が入ったままのオレンジの枠の画面に出る
            onRetry={pop}
            onConfirm={(selection, needsCheck) =>
              toResult({
                selection,
                source: "scan",
                needsCheck,
                tagPhotoUri: route.shot.uri,
              })
            }
            onManual={(selection) => replace({ k: "manual", initial: selection })}
          />
        );

      case "manual": {
        const editingId = draft?.garmentId;
        return (
          <ManualScreen
            initial={route.initial}
            onCancel={pop}
            onDone={(selection) => {
              if (editingId !== undefined) {
                // 保存済みの服の記号を直していた場合は、その場で書き戻す
                void updateGarment(editingId, { selection, needsCheck: false });
                setDraft(null);
                pop();
                return;
              }
              toResult({
                selection,
                source: draft?.source ?? "manual",
                needsCheck: false,
                tagPhotoUri: draft?.tagPhotoUri ?? null,
              });
            }}
          />
        );
      }

      case "result": {
        const sel = draft?.selection ?? {};
        return (
          <ResultScreen
            selection={sel}
            onChangeSelection={(next) =>
              setDraft((d) => (d === null ? d : { ...d, selection: next, needsCheck: false }))
            }
            onEditAll={() => push({ k: "manual", initial: sel })}
            onBack={pop}
            onSave={() => push({ k: "save" })}
          />
        );
      }

      case "save": {
        const editing =
          route.garmentId === undefined
            ? undefined
            : items.find((g) => g.id === route.garmentId);
        return (
          <SaveFormScreen
            selection={editing?.selection ?? draft?.selection ?? {}}
            initial={
              editing === undefined
                ? undefined
                : {
                    name: editing.name,
                    photoUri: editing.photoUri,
                    color: editing.color,
                    kind: editing.kind,
                  }
            }
            placeholderName={untitledName(items)}
            saveLabel={editing === undefined ? "マイクローゼットに登録" : "この内容で更新"}
            onBack={pop}
            onShowSymbols={pop}
            onSave={(info) => void saveGarment(info, route.garmentId)}
          />
        );
      }

      case "garment": {
        const g = items.find((x) => x.id === route.id);
        if (g === undefined) {
          // 削除直後など。一覧へ戻す
          return (
            <ClosetScreen
              items={items}
              ready={ready}
              onOpen={(id) => push({ k: "garment", id })}
              onAdd={() => resetTo("scan")}
            />
          );
        }
        return (
          <GarmentScreen
            garment={g}
            onBack={pop}
            onEditSymbols={() => {
              setDraft({
                selection: g.selection,
                source: g.source,
                needsCheck: g.needsCheck,
                tagPhotoUri: g.tagPhotoUri,
                garmentId: g.id,
              });
              push({ k: "manual", initial: g.selection });
            }}
            onEditInfo={() => {
              setDraft({
                selection: g.selection,
                source: g.source,
                needsCheck: g.needsCheck,
                tagPhotoUri: g.tagPhotoUri,
                garmentId: g.id,
              });
              push({ k: "save", garmentId: g.id });
            }}
            onDelete={() => {
              forgetPhoto(g.photoUri);
              void removeGarment(g.id);
              pop();
            }}
          />
        );
      }

      case "closet":
        return (
          <ClosetScreen
            items={items}
            ready={ready}
            onOpen={(id) => push({ k: "garment", id })}
            onAdd={() => resetTo("scan")}
          />
        );

      case "combine":
        return <CombineScreen items={items} onGoScan={() => resetTo("scan")} />;
    }
  }

  const dark = route.k === "capture";

  return (
    <SafeAreaView style={[s.root, dark && s.rootDark]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={s.body}>{body()}</View>
      {WITH_TABS.has(route.k) && (
        <TabBar
          active={tab}
          onChange={(t) => {
            setDraft(null);
            resetTo(t);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  rootDark: { backgroundColor: "#1b1a17" },
  body: { flex: 1 },
});
