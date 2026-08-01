// データ収集スクリプト（方法B: 例文を流し込んで一気に集める）
//
// data/utterances.txt に書いた「配信者の発言」を1つずつAIに流し、
// 生成された視聴者コメントを dataset.js 経由で dataset.jsonl に保存する。
//
// 使い方（backend フォルダで実行）:
//   node collect.js                    … utterances.txt を全部流す
//   node collect.js data/utterances.txt 10   … 先頭10件だけ流す
//
// 事前準備: .env に OPENAI_API_KEY を設定し、AI_PROVIDER=openai にしておくこと。
 
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import provider from "./providers/index.js";
import { historyText } from "./shared.js";
import { saveTranscriptPair } from "./dataset.js";
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
 
// コマンドライン引数（無ければデフォルト値）
const listPath = process.argv[2] || path.join(__dirname, "data", "utterances.txt");
const limit = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;
 
// 少し待つ関数（API を連続で叩きすぎないように間隔を空ける）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
 
async function main() {
  // 発言リストを読み込む
  if (!fs.existsSync(listPath)) {
    console.error(`発言リストが見つかりません: ${listPath}`);
    process.exit(1);
  }
 
  const utterances = fs
    .readFileSync(listPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")) // 空行と # の行を除く
    .slice(0, limit);
 
  console.log(`\n発言 ${utterances.length} 件を流します。\n`);
 
  let ok = 0;
  let ng = 0;
 
  for (let i = 0; i < utterances.length; i++) {
    const transcript = utterances[i];
    const label = `[${i + 1}/${utterances.length}]`;
 
    try {
      // モデルに発言を渡してコメントを生成（履歴は空でよい＝独立した発言として扱う）
      const comments = await provider.reactToTranscript({
        transcript,
        historyText: historyText([]),
      });
 
      if (comments && comments.length > 0) {
        // dataset.jsonl に保存
        saveTranscriptPair({ transcript, comments, context: historyText([]) });
        ok++;
        const preview = comments.map((c) => c.text).join(" / ");
        console.log(`${label} ✅ 「${transcript}」\n        → ${preview}`);
      } else {
        ng++;
        console.log(`${label} ⚠️  コメントが空でした: 「${transcript}」`);
      }
    } catch (err) {
      ng++;
      console.log(`${label} ❌ 失敗: 「${transcript}」 (${err.message})`);
    }
 
    // 次の発言まで少し待つ（レート制限対策）
    await sleep(600);
  }
 
  console.log(`\n完了: 成功 ${ok} 件 / 失敗・空 ${ng} 件`);
  console.log(`保存先: backend/data/dataset.jsonl\n`);
}
 
main();