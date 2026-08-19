import Picker from "@/components/Picker";

export default function Home() {
  return (
    <main className="shell">
      <header className="masthead">
        <h1>carelabel</h1>
        <p>
          衣類のタグにある取扱い表示記号（JIS L 0001・41種）を選ぶと、洗い方を出します。
          記号が示すのは<strong>上限</strong>と<strong>可否</strong>であって、推奨値ではありません。
        </p>
      </header>
      <Picker />
    </main>
  );
}
