# tools/ — 合成データ生成と測定

「写真からAIで洗濯表示を読めるか」に、意見ではなく数字で答えるための一式。

実タグだけを評価セットにしても意味がない。記号の出現頻度が極端に偏っていて
（40℃通常・タンブル禁止・アイロン中温ばかりで、95℃や「ぬれ平干し」はまず出ない）、
41記号のうち大半が1件も評価されないまま「精度90%」のような数字が出てしまう。
なので合成でセットを作り、劣化を掃引して**どこで壊れるか**を見る。

## 実行手順

```bash
# 0) 記号定義を tsc で JS に落とす（幾何は lib/glyphSvg.ts が単一の情報源）
npx tsc lib/symbols.ts lib/glyphSvg.ts --outDir tools/.build --module commonjs --target es2020

# 1) 41記号 x 3フォントをクリーン画像に焼く（Playwright が要る）
node tools/render.cjs dataset/clean

# 2) 劣化データセットを作る（severity 0..5 x 3変種 = 2214枚）
python tools/degrade.py dataset/clean dataset/synth 3

# 3) 古典CVの特徴カウントを severity 掃引で測る
python tools/features.py dataset/synth tools/BENCHMARK.md

# 4) 解像度だけを振って閾値を出す（他のノイズは固定）
python tools/sweep_resolution.py dataset/clean tools/RESOLUTION.md

# 5) 学習なしのテンプレートマッチングのベースライン
python tools/match.py dataset/clean tools/TEMPLATE_MATCH.md

# 6) アプリ用にテンプレートを書き出す
python tools/export_templates.py dataset/clean lib/vision/templates.json

# 7) TypeScript 版の認識コアが Python 参照実装と一致するか（2214枚）
python tools/dump_raw.py dataset/synth tools/.build/parity
node tools/build_vision.cjs
node tools/verify_ts.cjs

# 8) 合成タグ帯で Stage 1〜4 を通しで実行
python tools/synth_tag.py dataset/clean tools/.build/tags 10
node tools/verify_scan.cjs tools/SCAN.md
```

`dataset/` は生成物なので git 管理しない。

## ファイル

| ファイル | 役割 |
|---|---|
| `render.cjs` | `lib/glyphSvg.ts` の幾何を SVG に落とし、Chromium で PNG に焼く |
| `degrade.py` | 解像度・ぼけ・インク滲み・コントラスト・生地テクスチャ・回転・JPEG を掛ける |
| `features.py` | 下線本数と点の個数を古典CVで数える参照実装＋severity掃引の評価 |
| `sweep_resolution.py` | 解像度のみを振る制御実験 |
| `match.py` | 41テンプレートとの最近傍（学習なし）のベースライン |
| `export_templates.py` | アプリ側が同じパッチを使えるよう書き出す |
| `dump_raw.py` | 移植検証用に、生グレースケールと Python 側の出力を吐く |
| `build_vision.cjs` | `lib/` の TS を Node 用にコンパイル（出力レイアウトを固定する） |
| `verify_ts.cjs` | TS 実装 ⇔ Python 参照実装 の一致検証（2214枚） |
| `synth_tag.py` | 6記号を横一列に並べた「タグの帯」を合成する |
| `verify_scan.cjs` | 合成タグ帯で Stage 1〜4 を通しで実行 |

## 測定の前提（数字を過大に読まないために）

- **合成劣化であって実写ではない**。ぼけ・解像度・コントラストへの感度を測るもので、
  実物のタグでの精度を保証しない。刺繍タグ・光沢生地・折れ・退色は未評価。
- 単体記号の測定は **記号が既に1個ずつ切り出され、基本形が既知**という前提。
  検出と切り出し（Stage 1）は `lib/vision/segment.ts` に実装したが、
  合成タグ帯でしか評価しておらず、**実写では未評価**。工数とリスクはそこに集中する。
- **テンプレートの形状そのものが未検証**（`README.md` 参照）。
  記号SVGが公式と違えば、どれだけ精度を測っても意味がない。

## 主要な結果

要約は [../IOS.md](../IOS.md)。生の表は `BENCHMARK.md` / `RESOLUTION.md` / `TEMPLATE_MATCH.md`。

1. 基本形・下線・点は、**学習モデルなしで 97〜100%**（1記号120px時）
2. 41クラス完全一致の残り約19%の誤りは、**ほぼ全部が記号の中の文字**（温度数字と P/F）
3. 律速は下線で、**1記号100px以上なら100%、60px以下では常時0と答えるベースラインまで落ちる**
4. **過大予測は全条件で0%**。誤りは常に「あるのに無いと言う」方向
