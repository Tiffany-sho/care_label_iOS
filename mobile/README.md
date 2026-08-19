# mobile/ — Expo アプリ

タグを撮って洗濯表示を読み、洗い方を出す iOS アプリ（Expo SDK 57）。

記号定義・規則エンジン・認識コアは `../lib/` を **Web 版とそのまま共有**している。
Expo（React Native）を選んだ最大の利点がこれで、Swift への移植が要らない。

## 起動

```bash
npm install
npx expo start
```

Expo Go で読み込める（ネイティブモジュールは expo-camera / expo-image-manipulator /
react-native-svg のみで、いずれも Expo Go に含まれる）。
カメラは実機でしか動かないので、シミュレータでは手入力のピッカーだけが使える。

## 検証コマンド

```bash
npm run typecheck                       # tsc --noEmit
npx expo export --platform ios          # Metro が実際にバンドルできるか
```

`../lib` を跨いで import しているので、**Metro の解決が壊れやすい**。
`metro.config.js` を触ったら必ず `expo export` を通すこと。型チェックだけでは検出できない。

## 構成

| ファイル | 役割 |
|---|---|
| `App.tsx` | 画面全体。選択状態と読み取り結果を持つ |
| `src/CaptureScreen.tsx` | カメラ。ガイド枠は「1記号110px以上」という実測要件のためにある |
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
  型チェックと Metro バンドルまでは通っている。
- **実物のタグでの精度は未評価。** 合成データでの測定しかない。
- Stage 3（記号の中の文字の読み取り）は未実装。桶の誤りの大半はこれが原因。
