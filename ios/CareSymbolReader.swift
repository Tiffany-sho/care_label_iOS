//
//  CareSymbolReader.swift
//
//  tools/features.py と tools/match.py の Swift 移植（Stage 2 のコア）。
//  1記号ぶんに切り出し済みのグレースケール画像を受け取り、
//    - 下線の本数（通常 / 弱い / 非常に弱い）
//    - 点の個数（乾燥・アイロンの温度）
//    - 41テンプレートとの最近傍
//  を返す。推論なし・通信なし・決定的。
//
//  ⚠️ このファイルは Windows 上で書かれており、**コンパイル・実行の検証をしていない**。
//     Xcode に取り込んだうえで、必ず tools/ の Python 参照実装と同じ入力で
//     同じ出力になることを確認すること（回帰テストの作り方は ios/README.md）。
//
//  依存は Foundation のみ。UIKit / Vision に依存しないので、
//  swift test で純粋なユニットテストが書ける。
//

import Foundation

// MARK: - 画像

public struct GrayImage {
    public var pixels: [UInt8]
    public let width: Int
    public let height: Int

    public init(pixels: [UInt8], width: Int, height: Int) {
        precondition(pixels.count == width * height, "pixel count mismatch")
        self.pixels = pixels
        self.width = width
        self.height = height
    }

    @inline(__always)
    public func at(_ x: Int, _ y: Int) -> UInt8 { pixels[y * width + x] }
}

// MARK: - 二値化

enum Binarize {

    /// 分離可能な移動平均を3回かけてガウシアンを近似する。
    /// 照明ムラの推定にしか使わないので、この精度で十分。
    static func boxBlur(_ src: [Float], width w: Int, height h: Int, radius: Int) -> [Float] {
        var buf = src
        var tmp = [Float](repeating: 0, count: w * h)
        for _ in 0..<3 {
            // 横方向
            for y in 0..<h {
                var acc: Float = 0
                let row = y * w
                for x in -radius...radius {
                    acc += buf[row + min(max(x, 0), w - 1)]
                }
                let n = Float(2 * radius + 1)
                for x in 0..<w {
                    tmp[row + x] = acc / n
                    let out = min(max(x - radius, 0), w - 1)
                    let inn = min(max(x + radius + 1, 0), w - 1)
                    acc += buf[row + inn] - buf[row + out]
                }
            }
            // 縦方向
            for x in 0..<w {
                var acc: Float = 0
                for y in -radius...radius {
                    acc += tmp[min(max(y, 0), h - 1) * w + x]
                }
                let n = Float(2 * radius + 1)
                for y in 0..<h {
                    buf[y * w + x] = acc / n
                    let out = min(max(y - radius, 0), h - 1)
                    let inn = min(max(y + radius + 1, 0), h - 1)
                    acc += tmp[inn * w + x] - tmp[out * w + x]
                }
            }
        }
        return buf
    }

    /// 照明ムラ・生地の陰影を割り算で除去する（フラットフィールド補正）。
    /// これを挟まないと、タグの片隅が影になっただけで大域しきい値が破綻する。
    static func flattenBackground(_ img: GrayImage) -> GrayImage {
        let w = img.width, h = img.height
        let radius = max(4, max(w, h) / 6)
        let src = img.pixels.map { Float($0) }
        let bg = boxBlur(src, width: w, height: h, radius: radius)
        var out = [UInt8](repeating: 0, count: w * h)
        for i in 0..<(w * h) {
            let v = src[i] / max(bg[i], 1) * 200
            out[i] = UInt8(min(max(v, 0), 255))
        }
        return GrayImage(pixels: out, width: w, height: h)
    }

    static func otsuThreshold(_ img: GrayImage) -> Int {
        var hist = [Double](repeating: 0, count: 256)
        for p in img.pixels { hist[Int(p)] += 1 }
        let total = Double(img.pixels.count)
        var sumTotal: Double = 0
        for i in 0..<256 { sumTotal += Double(i) * hist[i] }

        var wB: Double = 0, sumB: Double = 0
        var bestVar = -1.0
        var bestT = 127
        for t in 0..<256 {
            wB += hist[t]
            if wB == 0 { continue }
            let wF = total - wB
            if wF <= 0 { break }
            sumB += Double(t) * hist[t]
            let mB = sumB / wB
            let mF = (sumTotal - sumB) / wF
            let v = wB * wF * (mB - mF) * (mB - mF)
            if v > bestVar { bestVar = v; bestT = t }
        }
        return bestT
    }

    /// true = インク（濃い側）
    static func mask(_ img: GrayImage) -> [Bool] {
        let flat = flattenBackground(img)
        let t = UInt8(otsuThreshold(flat))
        return flat.pixels.map { $0 <= t }
    }
}

// MARK: - 連結成分

struct Component {
    var area = 0
    var y0 = Int.max, y1 = -1, x0 = Int.max, x1 = -1

    var w: Int { x1 - x0 + 1 }
    var h: Int { y1 - y0 + 1 }
    var boxArea: Int { max(1, w * h) }
    var fill: Double { Double(area) / Double(boxArea) }

    mutating func add(_ x: Int, _ y: Int) {
        area += 1
        if y < y0 { y0 = y }
        if y > y1 { y1 = y }
        if x < x0 { x0 = x }
        if x > x1 { x1 = x }
    }
}

struct LabelResult {
    /// 各画素のルートラベル（インクでない画素は -1）
    var labels: [Int]
    var components: [Int: Component]
}

enum ConnectedComponents {

    /// ラスタ順の2パス・ラベリング（8近傍、union-find）
    static func label(mask: [Bool], width w: Int, height h: Int) -> LabelResult {
        var labels = [Int](repeating: -1, count: w * h)
        var parent: [Int] = []

        func find(_ a: Int) -> Int {
            var x = a
            while parent[x] != x {
                parent[x] = parent[parent[x]]
                x = parent[x]
            }
            return x
        }
        func union(_ a: Int, _ b: Int) {
            let ra = find(a), rb = find(b)
            if ra != rb { parent[rb] = ra }
        }

        let neighbours = [(-1, -1), (0, -1), (1, -1), (-1, 0)]  // (dx, dy)
        for y in 0..<h {
            for x in 0..<w {
                guard mask[y * w + x] else { continue }
                var best = -1
                for (dx, dy) in neighbours {
                    let nx = x + dx, ny = y + dy
                    guard nx >= 0, nx < w, ny >= 0, ny < h else { continue }
                    let lab = labels[ny * w + nx]
                    guard lab >= 0 else { continue }
                    if best < 0 { best = lab } else { union(best, lab) }
                }
                if best < 0 {
                    best = parent.count
                    parent.append(best)
                }
                labels[y * w + x] = best
            }
        }

        var comps: [Int: Component] = [:]
        for y in 0..<h {
            for x in 0..<w {
                let lab = labels[y * w + x]
                guard lab >= 0 else { continue }
                let root = find(lab)
                labels[y * w + x] = root
                comps[root, default: Component()].add(x, y)
            }
        }
        return LabelResult(labels: labels, components: comps)
    }
}

// MARK: - 特徴カウント

public enum CareFeatures {

    /// 下線（弱い操作 / 非常に弱い操作）の本数。0...2。
    ///
    /// 実測（tools/RESOLUTION.md）: 1記号100px以上で正解率100%、
    /// **過大予測は全条件で0%**。したがって「検出した本数」は信用してよいが、
    /// 「0本」は解像度が足りているときにしか信用してはいけない。
    public static func countBars(mask: [Bool], labelled: LabelResult, width w: Int, height h: Int) -> Int {
        guard let outline = labelled.components.max(by: { $0.value.boxArea < $1.value.boxArea })
        else { return 0 }
        let outlineMidY = Double(outline.value.y0 + outline.value.y1) / 2.0

        var candidateRoots = Set<Int>()
        for (root, c) in labelled.components where root != outline.key {
            if Double(c.w) >= 0.28 * Double(w),
               Double(c.h) <= 0.20 * Double(h),
               Double(c.y0) > outlineMidY {
                candidateRoots.insert(root)
            }
        }
        if candidateRoots.isEmpty { return 0 }

        // 行プロファイルのピーク数で数える。ぼけて2本が1成分に融合しても、
        // へこみが残っていれば2本として拾える。
        var profile = [Int](repeating: 0, count: h)
        for y in 0..<h {
            var n = 0
            for x in 0..<w where candidateRoots.contains(labelled.labels[y * w + x]) { n += 1 }
            profile[y] = n
        }
        let peak = profile.max() ?? 0
        if peak <= 0 { return 0 }

        let threshold = 0.45 * Double(peak)
        var runs = 0
        var prev = false
        for v in profile {
            let strong = Double(v) > threshold
            if strong && !prev { runs += 1 }
            prev = strong
        }
        return min(runs, 2)
    }

    /// タンブル乾燥の円／アイロン内部の点の個数。0...3。
    public static func countDots(labelled: LabelResult) -> Int {
        guard let outline = labelled.components.max(by: { $0.value.boxArea < $1.value.boxArea })?.value
        else { return 0 }
        let box = Double(outline.boxArea)
        var n = 0
        for (_, c) in labelled.components {
            if c.x0 == outline.x0 && c.y0 == outline.y0 && c.area == outline.area { continue }
            guard outline.x0 <= c.x0, c.x1 <= outline.x1,
                  outline.y0 <= c.y0, c.y1 <= outline.y1 else { continue }
            let rel = Double(c.area) / box
            guard rel >= 0.0012, rel <= 0.030 else { continue }
            let aspect = Double(c.w) / Double(max(1, c.h))
            guard aspect >= 0.45, aspect <= 2.2 else { continue }
            guard c.fill >= 0.40 else { continue }
            n += 1
        }
        return min(n, 3)
    }
}

// MARK: - テンプレートマッチング

public struct CareTemplate {
    public let code: String       // JIS L 0001 の記号番号
    public let base: String       // tub / triangle / tumble / natural / iron / circle
    public let vector: [Float]    // 平均0・ノルム1に正規化済み

    public init(code: String, base: String, vector: [Float]) {
        self.code = code
        self.base = base
        self.vector = vector
    }

    /// 下線（弱い操作）を持ちうるのは桶と円だけ
    public static let barBases: Set<String> = ["tub", "circle"]
    /// 点（温度）を持ちうるのはタンブル乾燥とアイロンだけ
    public static let dotBases: Set<String> = ["tumble", "iron"]
}

extension CareTemplate {
    private struct Bundle: Decodable {
        struct Item: Decodable {
            let code: String
            let base: String
            let bars: Int
            let dots: Int
            let patch: String  // base64, canonWidth*canonHeight bytes
        }
        let canonWidth: Int
        let canonHeight: Int
        let templates: [Item]
    }

    /// tools/export_templates.py が書き出した ios/templates.json を読む。
    /// Python 側と同じパッチを使うことが、測定値をそのまま引き継ぐ条件。
    public static func load(jsonData: Data) throws -> [CareTemplate] {
        let bundle = try JSONDecoder().decode(Bundle.self, from: jsonData)
        precondition(
            bundle.canonWidth == CareMatcher.canonWidth
                && bundle.canonHeight == CareMatcher.canonHeight,
            "template patch size does not match CareMatcher"
        )
        let n = bundle.canonWidth * bundle.canonHeight
        return try bundle.templates.map { item in
            guard let raw = Data(base64Encoded: item.patch), raw.count == n else {
                throw NSError(
                    domain: "CareTemplate", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "bad patch for \(item.code)"]
                )
            }
            var v = raw.map { Float($0) }
            let mean = v.reduce(0, +) / Float(n)
            for i in 0..<n { v[i] -= mean }
            let norm = sqrt(v.reduce(0) { $0 + $1 * $1 })
            for i in 0..<n { v[i] /= max(norm, 1e-6) }
            return CareTemplate(code: item.code, base: item.base, vector: v)
        }
    }
}

public enum CareMatcher {
    /// 正規化パッチの寸法。Python 側 (tools/match.py CANON) と一致させること。
    public static let canonWidth = 56
    public static let canonHeight = 64

    /// インクの外接矩形で切り出し → 正規サイズへ双一次補間 → 平均0・ノルム1。
    /// これで平行移動とスケールのばらつきが落ちる（回転はあえて残す）。
    public static func normalise(mask: [Bool], width w: Int, height h: Int) -> [Float]? {
        var x0 = Int.max, x1 = -1, y0 = Int.max, y1 = -1
        var ink = 0
        for y in 0..<h {
            for x in 0..<w where mask[y * w + x] {
                ink += 1
                if x < x0 { x0 = x }
                if x > x1 { x1 = x }
                if y < y0 { y0 = y }
                if y > y1 { y1 = y }
            }
        }
        guard ink >= 12, x1 >= x0, y1 >= y0 else { return nil }

        let cw = x1 - x0 + 1, ch = y1 - y0 + 1
        var out = [Float](repeating: 0, count: canonWidth * canonHeight)
        for ty in 0..<canonHeight {
            let sy = (Double(ty) + 0.5) * Double(ch) / Double(canonHeight) - 0.5
            let y0f = max(0, min(ch - 1, Int(sy.rounded(.down))))
            let y1f = min(ch - 1, y0f + 1)
            let wy = Float(max(0.0, min(1.0, sy - Double(y0f))))
            for tx in 0..<canonWidth {
                let sx = (Double(tx) + 0.5) * Double(cw) / Double(canonWidth) - 0.5
                let x0f = max(0, min(cw - 1, Int(sx.rounded(.down))))
                let x1f = min(cw - 1, x0f + 1)
                let wx = Float(max(0.0, min(1.0, sx - Double(x0f))))

                @inline(__always) func px(_ x: Int, _ y: Int) -> Float {
                    mask[(y0 + y) * w + (x0 + x)] ? 255.0 : 0.0
                }
                let top = px(x0f, y0f) * (1 - wx) + px(x1f, y0f) * wx
                let bot = px(x0f, y1f) * (1 - wx) + px(x1f, y1f) * wx
                out[ty * canonWidth + tx] = top * (1 - wy) + bot * wy
            }
        }

        let mean = out.reduce(0, +) / Float(out.count)
        for i in 0..<out.count { out[i] -= mean }
        let norm = sqrt(out.reduce(0) { $0 + $1 * $1 })
        guard norm > 1e-6 else { return nil }
        for i in 0..<out.count { out[i] /= norm }
        return out
    }

    /// 最近傍テンプレートと、その相関値（-1...1）。
    /// 相関が低いときは丸めずに nil を返し、上位で unknown 扱いにすること。
    public static func best(
        vector: [Float], templates: [CareTemplate], minCorrelation: Float = 0.45
    ) -> (template: CareTemplate, correlation: Float)? {
        var bestIdx = -1
        var bestCorr: Float = -2
        for (i, t) in templates.enumerated() {
            var acc: Float = 0
            let v = t.vector
            for k in 0..<vector.count { acc += vector[k] * v[k] }
            if acc > bestCorr { bestCorr = acc; bestIdx = i }
        }
        guard bestIdx >= 0, bestCorr >= minCorrelation else { return nil }
        return (templates[bestIdx], bestCorr)
    }
}

// MARK: - まとめ

public struct SymbolReading {
    /// その基本形が下線を持ちえない、または解像度が足りないときは nil。
    /// nil と 0 を混同してはいけない（0 は「下線が無い」という積極的な主張）。
    public var bars: Int?
    /// その基本形が点を持ちえないときは nil。
    public var dots: Int?
    public var matchedCode: String?
    public var matchedBase: String?
    public var correlation: Float?
    /// 1記号の長辺のピクセル数。撮影ガイドの判定にも使う。
    public var glyphPixels: Int
}

public enum CareSymbolReader {

    /// 実測に基づく下限（tools/RESOLUTION.md）。
    /// 100px で下線100%、90pxで97.8%、80pxで94.6%、60pxで74.6%（ベースライン56.5%）。
    /// 余裕を見て 110px を採用する。
    public static let minGlyphPixelsForBars = 110

    public static func read(image: GrayImage, templates: [CareTemplate]) -> SymbolReading {
        let mask = Binarize.mask(image)
        let labelled = ConnectedComponents.label(
            mask: mask, width: image.width, height: image.height
        )
        let glyphPx = max(image.width, image.height)

        var reading = SymbolReading(
            bars: nil, dots: nil, matchedCode: nil, matchedBase: nil,
            correlation: nil, glyphPixels: glyphPx
        )

        // 先に基本形を決める。カウンタは基本形で意味が変わるので、
        // 基本形が分からないうちに数えてはいけない。
        //
        // 実例: 桶の「95」を無条件に countDots へ通すと、数字が点2個として
        // 拾われる（tools 側の fixture で実際に起きた）。桶に点は存在しないので、
        // これは呼ぶ側の誤りであってカウンタのバグではない。
        guard let v = CareMatcher.normalise(mask: mask, width: image.width, height: image.height),
              let hit = CareMatcher.best(vector: v, templates: templates)
        else {
            return reading
        }
        reading.matchedCode = hit.template.code
        reading.matchedBase = hit.template.base
        reading.correlation = hit.correlation

        if CareTemplate.dotBases.contains(hit.template.base) {
            reading.dots = CareFeatures.countDots(labelled: labelled)
        }

        if CareTemplate.barBases.contains(hit.template.base) {
            // 過大予測は起きないと実測されているので、検出した本数はそのまま信用してよい。
            // 逆に「0本」は解像度が足りているときしか意味を持たない。
            let bars = CareFeatures.countBars(
                mask: mask, labelled: labelled, width: image.width, height: image.height
            )
            if bars > 0 || glyphPx >= minGlyphPixelsForBars {
                reading.bars = bars
            }
        }
        return reading
    }
}
