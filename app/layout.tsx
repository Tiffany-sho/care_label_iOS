import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "carelabel — 洗濯表示から洗い方を出す",
  description:
    "JIS L 0001 の取扱い表示記号 41 種を選ぶと、洗い方を「上限」と「可否」の言葉で提示します。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
