// AIプロバイダー実装の雛形: 自作モデル用
//
// 使い方: .env に AI_PROVIDER=custom と、必要なら CUSTOM_API_URL（自作APIのURL）を
// 設定すると、server.js は自動的にこちらを使うようになる（providers/index.js 参照）。
// 下の4つの関数を、自作APIの入出力形式に合わせて実装するだけでよい。
// server.js やフロントエンドは一切変更不要。

const CUSTOM_API_URL = process.env.CUSTOM_API_URL || "";

// 映像フレーム(画像)を見て、視聴者コメントを生成する。
// image: "data:image/jpeg;base64,..." という形式のdata URL
// historyText: 直近のコメント履歴をまとめた文字列
// 戻り値: [{ name: string, text: string, type?: string }] という配列
export async function reactToImage({ image, historyText }) {
  throw new Error(
    "providers/custom.js の reactToImage が未実装です。" +
      "CUSTOM_API_URL 宛にリクエストを送るなど、自作APIの呼び出しをここに実装してください。"
  );
}

// 音声(Buffer)を文字起こしする。
// buffer: 音声データ本体 / mimetype: 例 "audio/webm"
// 戻り値: 文字起こしテキスト（string）。無音などで結果が無ければ空文字を返す。
export async function transcribeAudio({ buffer, mimetype }) {
  throw new Error(
    "providers/custom.js の transcribeAudio が未実装です。自作APIの呼び出しをここに実装してください。"
  );
}

// 配信者の発言(文字起こし済み)に対する視聴者コメントを生成する。
// transcript: 配信者が話した内容 / historyText: 直近のコメント履歴の文字列
// 戻り値: [{ name: string, text: string, type?: string }] という配列
export async function reactToTranscript({ transcript, historyText }) {
  throw new Error(
    "providers/custom.js の reactToTranscript が未実装です。自作APIの呼び出しをここに実装してください。"
  );
}

// 配信ログ全体から、振り返り文章を生成する。
// logText: 配信中に表示されたコメントをまとめた文字列
// 戻り値: 振り返りテキスト（string）
export async function summarize({ logText }) {
  throw new Error(
    "providers/custom.js の summarize が未実装です。自作APIの呼び出しをここに実装してください。"
  );
}
