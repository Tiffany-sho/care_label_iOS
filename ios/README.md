# ios/ — Stage 2 のコア（Swift 移植）

`tools/features.py` と `tools/match.py` の Swift 移植。
1記号ぶんに切り出し済みのグレースケール画像から、下線本数・点の個数・最近傍テンプレートを返す。
推論なし・通信なし・決定的。

## ⚠️ 検証状態

**このコードは Windows 上で書かれており、コンパイルも実行もしていない。**
Xcode / `swift build` に通す前提で読むこと。設計と数値は検証済み、Swift の文法と挙動は未検証。

## ファイル

| ファイル | 中身 |
|---|---|
| `CareSymbolReader.swift` | 二値化（フラットフィールド補正＋大津）、連結成分、下線カウント、点カウント、NCC |
| `templates.json` | 41テンプレートの正規化パッチ（56x64 の生バイトを base64、195KB） |
| `expected.json` | Python 参照実装の出力を固定した一致テスト用フィクスチャ（60件） |

再生成:

```bash
python tools/export_templates.py dataset/clean ios/templates.json
python tools/make_fixture.py dataset/synth ios/expected.json 37
```

## 最初にやるべきこと：Python との一致テスト

移植が正しいかは、**同じ入力に対して Python 参照実装と同じ出力になるか**でしか確認できない。
移植のバグは「だいたい合っている」形で出るので、目視では捕まらない。

1. `ios/expected.json` と、そこに列挙された PNG（`dataset/synth/` 配下）を
   Xcode のテストバンドルに入れる
2. `CareSymbolReader.read(image:templates:)` を回して `bars` / `dots` が一致することを assert する
   - `expected.json` の `bars` / `dots` が `null` のケースは、Swift 側も `nil` を返さなければならない
   - `true_bars` / `true_dots` との不一致（60件中6件）は**参照実装の誤りをそのまま固定したもの**。
     高severityでの過小カウントなので、Swift 側もこれを再現するのが正解
3. 一致しないケースが出たら、**まず二値化の出力（マスク）を比較**する。
   ずれはたいてい `boxBlur` によるガウシアン近似か、大津のしきい値の丸めから来る。

## 実測から来ている実装上の約束

`IOS.md` に根拠。ここは変えると安全性が壊れるので、変更するなら再測定すること。

1. **`minGlyphPixelsForBars = 110`**
   1記号110px未満のときは `bars` に `nil`（unknown）を返す。`0` を返してはいけない。
   実測で、下線の誤りは100%が過小方向（「1本あるのに0本」）であり、
   それは「弱い洗濯指定を通常洗濯だと言う」という最も危険な誤り方向に一致する。

2. **`minCorrelation = 0.45` を下回ったら `nil`**
   最近傍テンプレートに丸めない。「一番近い記号」は「その記号である」ではない。

3. **属性が揃わないときは 41記号へ射影しない**
   存在しない組み合わせが出たら、近い記号に寄せずに unknown にする。

## この先の実装で残っている部分

- **Stage 1（タグの検出と台形補正、記号列の切り出し）** — 未実装。ここが最大の難所
- **Stage 3（桶・円の中の文字の読み取り）** — 未実装。`VNRecognizeTextRequest` の結果を
  閉集合 `{30,40,50,60,70,95}` / `{P,F,W}` にスナップする案から試す
- **撮影UI** — ガイド枠、近接誘導、ラプラシアン分散によるピント判定
