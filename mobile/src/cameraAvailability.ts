/**
 * 「カメラが使えない」を、理由まで含めて判定する。
 *
 * expo-camera の web 実装は getUserMedia の失敗をすべて DENIED に畳んでしまうので、
 * 「カメラが繋がっていない」「安全でないオリジンで開いている」「本人が拒否した」が
 * 区別できない。区別できないまま「許可が必要です」とだけ出すと、
 * 押しても何も起きないボタンになる（実際にそうなっていた）。
 */

import { Platform } from "react-native";

export type CameraAvailability =
  /** カメラを要求してよい状態 */
  | { kind: "ok" }
  /** http:// の LAN アクセスなど。ブラウザが getUserMedia を封じている */
  | { kind: "insecure" }
  /** ブラウザが getUserMedia を持たない */
  | { kind: "unsupported" }
  /** 映像入力デバイスが1つも無い */
  | { kind: "no-device" }
  | { kind: "unknown" };

export async function checkCameraAvailability(): Promise<CameraAvailability> {
  // ネイティブでは OS の許可ダイアログが理由を持っているので、ここでは判定しない
  if (Platform.OS !== "web") return { kind: "ok" };
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { kind: "unsupported" };
  }
  if (!window.isSecureContext) return { kind: "insecure" };
  if (!navigator.mediaDevices?.getUserMedia) return { kind: "unsupported" };
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasVideo = devices.some((d) => d.kind === "videoinput");
    return hasVideo ? { kind: "ok" } : { kind: "no-device" };
  } catch {
    return { kind: "unknown" };
  }
}

export function availabilityMessage(a: CameraAvailability): string | null {
  switch (a.kind) {
    case "ok":
      return null;
    case "insecure":
      return "このURLではブラウザがカメラを使わせてくれません（http でホスト名が localhost 以外のため）。http://localhost:8088 で開き直すか、スマホの Expo Go で試してください。";
    case "unsupported":
      return "このブラウザはカメラ取得に対応していません。スマホの Expo Go で試してください。";
    case "no-device":
      return "この端末にカメラが見つかりません。下の「写真から選ぶ」で、スマホで撮ったタグの写真を読み込ませることはできます。";
    case "unknown":
      return "カメラの状態を確認できませんでした。";
  }
}

/** web のカメラは、そもそもタグ読み取りの解像度要件を満たせない */
export const WEB_CAMERA_CAVEAT =
  "PCのカメラでは1記号あたり100px以上という要件を満たせないため、読み取りはほぼ失敗します。実際に試すなら Expo Go（実機）か、「写真から選ぶ」を使ってください。";
