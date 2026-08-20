/** 端末に覚えておく小さな設定。今は「撮る前に」を出すかどうかだけ。 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const SKIP_TIPS = "carelabel.tips.skip";

export async function getSkipTips(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SKIP_TIPS)) === "1";
  } catch {
    return false;
  }
}

export async function setSkipTips(v: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SKIP_TIPS, v ? "1" : "0");
  } catch {
    // 覚えられなくても、次回また案内が出るだけ
  }
}
