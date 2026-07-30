// どのAIプロバイダーを使っても共通で使うユーティリティ

// 視聴者名のフォールバック用プール（実在の人名として違和感のない、自然な名前）
export const VIEWER_NAMES = [
  "ゆうき", "さくら", "けんた", "みさき", "たくみ", "あかり", "しょうご", "なな",
  "りょうた", "ひなの", "だいすけ", "まゆ", "こうせい", "ゆづき", "はると", "ももか",
  "そうすけ", "えりか", "たいち", "みなみ", "しゅん", "あいり", "ゆうた", "かのん",
  "りく", "ののか",
];

export function randomName() {
  return VIEWER_NAMES[Math.floor(Math.random() * VIEWER_NAMES.length)];
}

// 直近履歴を短い文字列にする（プロンプトに埋め込む用）
export function historyText(history = []) {
  if (!history.length) return "（まだコメントなし）";
  return history
    .slice(-8)
    .map((c) => `${c.name || "誰か"}: ${c.text}`)
    .join("\n");
}
