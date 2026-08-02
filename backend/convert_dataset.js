// 学習用データ変換スクリプト
// AIRSが集めた dataset.jsonl を、Unsloth の SFT ノートブックが読める
// 「conversations 形式」に変換する。
//
// 変換前（収集データ）:
//   {"input":"今日はパスタを作ります","output":[{"name":"ともや","text":"..."},...]}
// 変換後（学習用）:
//   {"conversations":[
//      {"role":"system","content":"（視聴者としての指示）"},
//      {"role":"user","content":"今日はパスタを作ります"},
//      {"role":"assistant","content":"{\"comments\":[{\"name\":\"ともや\",\"text\":\"...\"}]}"}
//   ]}
//
// 使い方（backend フォルダで実行）:
//   node convert_dataset.js data/dataset.jsonl data/airs_train.jsonl

import fs from "fs";

// ---- 視聴者としての役割を教えるシステムプロンプト ----
// （AIRSの openai.js のシステムプロンプトを、学習用に簡潔にしたもの）
const SYSTEM_PROMPT = [
  "あなたは、一人で配信している配信者の『視聴者たち』です。",
  "配信者の発言に対して、大勢の別々の視聴者がチャットに書き込んでいるように、短いコメントを返します。",
  "1回につき1〜3件。1件は日本語で20文字前後の口語。感想・問いかけ・相槌をまぜる。",
  "視聴者名は自然な日本語のハンドルネームにする。",
  '出力は必ず次のJSONだけ: {"comments":[{"name":"視聴者名","text":"コメント本文"}]}',
].join("\n");

// コマンドライン引数
const inPath = process.argv[2] || "data/dataset.jsonl";
const outPath = process.argv[3] || "data/airs_train.jsonl";

const lines = fs.readFileSync(inPath, "utf8").split("\n").filter((l) => l.trim());

let ok = 0;
let skip = 0;
const outLines = [];

for (const line of lines) {
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    skip++;
    continue; // 壊れた行は飛ばす
  }

  const input = rec.input;
  const output = rec.output;

  // 発言が空、コメントが無いものは学習に使えないので飛ばす
  if (!input || !Array.isArray(output) || output.length === 0) {
    skip++;
    continue;
  }

  // assistant が出すべき答え = 今のAIRSと同じ {"comments":[...]} の形の文字列
  // name と text だけ残す（type は学習では使わない）
  const comments = output.map((c) => ({ name: c.name, text: c.text }));
  const assistantContent = JSON.stringify({ comments });

  const conversations = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: input },
    { role: "assistant", content: assistantContent },
  ];

  outLines.push(JSON.stringify({ conversations }));
  ok++;
}

fs.writeFileSync(outPath, outLines.join("\n") + "\n", "utf8");

console.log(`変換完了: ${ok} 件を書き出し / ${skip} 件スキップ`);
console.log(`入力: ${inPath}`);
console.log(`出力: ${outPath}`);