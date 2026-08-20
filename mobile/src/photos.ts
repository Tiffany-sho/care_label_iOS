/**
 * 服の写真を、消えない場所へ置く。
 *
 * カメラや写真ライブラリが返す URI はキャッシュ領域を指していて、OS が
 * 空き容量を作るときに黙って消す。マイクローゼットに保存した服の写真が
 * 数日後に欠けるのはそれが理由なので、保存のたびに書類ディレクトリへ複製する。
 *
 * 端末の中だけで完結する。どこにも送らない。
 */

import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

const DIR = "garments";

function extensionOf(uri: string): string {
  const m = /\.(jpe?g|png|heic|webp)(\?|$)/i.exec(uri);
  return m ? `.${m[1].toLowerCase()}` : ".jpg";
}

/**
 * 写真を複製して、新しい URI を返す。
 * 失敗したら元の URI をそのまま返す（写真が無いより、消えるかもしれない写真のほうがまし）。
 */
export async function persistPhoto(uri: string, name: string): Promise<string> {
  // web には書類ディレクトリが無い。ブラウザで動かすときは複製しない。
  if (Platform.OS === "web") return uri;
  try {
    const dir = new Directory(Paths.document, DIR);
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${name}${extensionOf(uri)}`);
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

/** 服を消すときに、複製した写真も片づける（失敗しても無視してよい） */
export function forgetPhoto(uri: string | null): void {
  if (uri === null || Platform.OS === "web") return;
  if (!uri.includes(`/${DIR}/`)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // 消せなくても実害は無い
  }
}
