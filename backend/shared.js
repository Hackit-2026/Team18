// どのAIプロバイダーを使っても共通で使うユーティリティ

// 視聴者名のフォールバック用プール（配信チャットにいそうなハンドル名）
export const VIEWER_NAMES = [
  "neko_22", "もちもち3", "sora_cafe", "夜更かし民", "kuma_live", "Rin5",
  "みずたま", "taku_09", "あおいろ", "pixelゆう", "mika_ch", "natsu7",
  "しろくまP", "haru_cam", "こめつぶ", "Luna_11", "箱推し太郎", "ramen_x",
  "yuzu_net", "まるい人", "sleepy_k", "nao_stream", "匿名の佐藤", "pino_8",
  "ほうじ茶", "kai_log", "minami2", "まったり勢", "orbit_n", "りんご飴",
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
