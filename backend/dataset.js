// 学習用データセットの収集
// 配信者の発言(transcript)と、それに対してAIが生成した視聴者コメントの
// ペアを JSONL形式(1行1件)で追記していく。
// あとで LiquidAI などのチューニング用データに変換して使う。
 
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));
 
// 保存先: backend/data/dataset.jsonl
const DATA_DIR = path.join(__dirname, "data");
const DATASET_PATH = path.join(DATA_DIR, "dataset.jsonl");
 
// data フォルダが無ければ作る
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}
 
// 1件を JSONL として追記する（低レベル関数）
// record: 保存したいオブジェクト
export function appendRecord(record) {
  try {
    ensureDir();
    const line = JSON.stringify(record) + "\n";
    fs.appendFileSync(DATASET_PATH, line, "utf8");
  } catch (err) {
    // データ収集の失敗で配信そのものを止めたくないので、
    // エラーはログに出すだけにして、握りつぶす。
    console.error("データセット保存に失敗:", err.message);
  }
}
 
// 「配信者の発言 → 視聴者コメント」のペアを1件保存する。
// transcript: 配信者の発言テキスト（input）
// comments:   [{name,text,type}] AIが生成した視聴者コメント（output）
// context:    任意。そのときの直近コメント履歴の文字列（文脈）
export function saveTranscriptPair({ transcript, comments, context = "" }) {
  // 発言が空、またはコメントが無いものは学習に使えないので保存しない
  if (!transcript || !Array.isArray(comments) || comments.length === 0) return;
 
  appendRecord({
    type: "voice",                       // どの経路で集めたか（後で選別できるように）
    input: transcript,                   // 配信者の発言
    output: comments.map((c) => ({       // AIが返した視聴者コメント
      name: c.name,
      text: c.text,
      type: c.type,
    })),
    context,                             // そのときの直近履歴（文脈）
    createdAt: new Date().toISOString(), // いつ集めたか
  });
}