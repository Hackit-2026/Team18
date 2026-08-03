// 音声モデルのテスト用

import fs from "node:fs";

const audioPath = process.argv[2] || "models/audio/test.wav";
const audioBase64 = fs.readFileSync(audioPath).toString("base64");

console.log("音声:", audioPath);
console.log("音声モデルへ送信中...\n");

const response = await fetch(
  "http://127.0.0.1:8082/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "",
      modalities: ["text"],
      messages: [
        {
          role: "system",
          content: "Perform ASR in japanese.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: audioBase64,
                format: "wav",
              },
            },
          ],
        },
      ],
      max_tokens: 512,
      stream: true,
    }),
  },
);

if (!response.ok) {
  const body = await response.text();
  throw new Error(`音声モデルエラー ${response.status}: ${body}`);
}

if (!response.body) {
  throw new Error("音声モデルから応答本文が返りませんでした");
}

console.log("文字起こし:");

const reader = response.body.getReader();
const decoder = new TextDecoder();

let buffer = "";
let transcription = "";

function processLine(rawLine) {
  const line = rawLine.trim();

  if (!line.startsWith("data:")) return;

  const data = line.slice(5).trim();

  if (!data || data === "[DONE]") return;

  try {
    const event = JSON.parse(data);
    const text = event.choices?.[0]?.delta?.content;

    if (text) {
      transcription += text;
      process.stdout.write(text);
    }
  } catch {
    // 空行やJSON以外のストリームイベントは無視する
  }
}

while (true) {
  const { done, value } = await reader.read();

  if (value) {
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      processLine(line);
    }
  }

  if (done) break;
}

if (buffer) {
  processLine(buffer);
}

console.log();

if (!transcription.trim()) {
  throw new Error("文字起こし結果が空でした");
}