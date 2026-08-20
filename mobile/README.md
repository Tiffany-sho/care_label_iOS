# mobile/ — Expo アプリ

タグを撮って洗濯表示を読み、洗い方を出す iOS アプリ（**Expo SDK 54**）。

## SDK は 54 に固定している（上げないこと）

現代の Expo Go は **SDK を1つしかサポートしない**。実機の Expo Go が
「Supported SDK: 54」（Settings → App Info で確認できる）で、App Store に
更新が出てこなかったため、プロジェクト側を 54 に合わせている。

SDK を上げると実機で
「Project is incompatible with this version of Expo Go」になって起動できない。
上げるなら、先に実機の Expo Go の Supported SDK を確認すること。
コード側は SDK 54 と 57 で API 差が無く、動作も同一であることを確認済み。

記号定義・規則エンジン・認識コアは `../lib/` を **Web 版とそのまま共有**している。
Expo（React Native）を選んだ最大の利点がこれで、Swift への移植が要らない。

## 起動

```bash
npm install
npx expo start
```

Expo Go で読み込める（ネイティブモジュールは expo-camera / expo-image-manipulator /
expo-image-picker / react-native-svg のみで、いずれも Expo Go に含まれる）。

PC のブラウザでも開ける:

```bash
npx expo start --web --port 8088
```

ただし **PC のカメラでは1記号100px以上という要件を満たせない**ので、読み取りの確認には
「写真から選ぶ」（スマホで撮ったタグの写真を読み込ませる）を使う。
この経路はブラウザ上で合成タグ画像を流し込んで検証済み。

## 検証コマンド

```bash
npm run typecheck                       # tsc --noEmit
npx expo export --platform ios          # Metro が実際にバンドルできるか
```

`../lib` を跨いで import しているので、**Metro の解決が壊れやすい**。
`metro.config.js` を触ったら必ず `expo export` を通すこと。型チェックだけでは検出できない。

実例: `resolver.disableHierarchicalLookup = true` を付けていたせいで、SDK 54 で
`node_modules/expo/node_modules/expo-asset` を解決できずバンドルが落ちた。
SDK 57 では依存がトップレベルに巻き上げられていたので気づけなかった。

## 構成

| ファイル | 役割 |
|---|---|
| `App.tsx` | 画面全体。選択状態と読み取り結果を持つ |
| `src/CaptureScreen.tsx` | カメラ／写真選択。ガイド枠は「1記号110px以上」という実測要件のためにある |
| `src/cameraAvailability.ts` | カメラが使えない理由（非セキュアなオリジン／デバイス無し等）を切り分ける |
| `src/decodeImage.ts` | 撮影画像 → グレースケール生画素（expo-image-manipulator + 純JSのPNGデコーダ） |
| `src/scan.ts` | Stage 1〜4 の結線。出力は「答え」ではなく「ピッカーの下書き」 |
| `src/SymbolPicker.tsx` | 41記号のピッカー |
| `src/PlanView.tsx` | 洗い方の表示（`../lib/plan.ts` をそのまま使う） |
| `src/CareSymbolNative.tsx` | `../lib/glyphSvg.ts` の幾何を react-native-svg で描く |

## 設計上の約束（変えると安全性が壊れる）

`../IOS.md` に測定の根拠。数字を確かめずに緩めないこと。

1. **読み取り結果は下書き。** 必ずピッカーに流し込み、人が確定する。
2. **1記号110px未満なら下線の本数を `null` にする。** `0` を返してはいけない。
   実測で下線の誤りは100%が過小方向であり、それが「弱い洗濯指定を通常洗濯だと言う」という
   最も危険な誤り方向と一致する。
3. **1位と2位のテンプレート相関の差が0.03未満なら「要確認」表示。** 相関の絶対値では
   当たり外れが分離しないことを実測済み。
4. **存在しない記号の組み合わせを、近い記号へ丸めない。** unknown にする。

## 未検証

- **実機で動かしていない**（この開発環境に iOS 実機・シミュレータが無い）。
  型チェック・Metro バンドル・ブラウザでの通し実行（写真から選ぶ経路）までは通っている。
- **カメラでの撮影経路は未検証。** 「写真から選ぶ」経路と画像デコードは検証済みだが、
  `CameraView.takePictureAsync` から先は実機でしか確かめられない。
- **実物のタグでの精度は未評価。** 合成データでの測定しかない。
- Stage 3（記号の中の文字の読み取り）は未実装。桶の誤りの大半はこれが原因。
