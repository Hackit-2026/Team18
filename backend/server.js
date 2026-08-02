// AIRS - AI-ReactionStream
// バックエンド: 映像フレーム/音声を受け取り、AIプロバイダー(providers/)経由で
// 「大勢の視聴者がコメントしているような」リアクションを生成して返す。

import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import provider from "./providers/index.js";
import { historyText } from "./shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 3000;
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "\n[警告] OPENAI_API_KEY が設定されていません。" +
      "\n画像認識と音声文字起こしにはAPIキーが必要です。\n",
  );
}

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "\n[警告] OPENAI_API_KEY が設定されていません。" +
      "\n  .env に OPENAI_API_KEY を設定してください。\n"
  );
}

// ---- Express セットアップ ----
const app = express();
app.use(express.json({ limit: "12mb" })); // 画像を base64 で受けるので大きめに
app.use(express.static(path.join(__dirname, "..", "frontend")));

const upload = multer({ storage: multer.memoryStorage() });

// ============================================================
// POST /api/react
// 映像フレーム(base64 dataURL)を受け取り、視聴者コメントを生成
// body: { image: "data:image/jpeg;base64,...", history: [{name,text}] }
// ============================================================
app.post("/api/react", async (req, res) => {
  try {
    const { image, history = [] } = req.body;
    if (!image) return res.status(400).json({ error: "image がありません" });

    const comments = await provider.reactToImage({
      image,
      historyText: historyText(history),
    });
    res.json({ comments });
  } catch (err) {
    console.error("/api/react エラー:", err.message);
    res.status(500).json({ error: "コメント生成に失敗しました", detail: err.message });
  }
});

// ============================================================
// POST /api/voice
// マイク音声(webm等)を受け取り、文字起こし → その発言に
// 反応する視聴者コメントを生成（疑似会話）
// multipart/form-data: audio(ファイル), history(JSON文字列)
// ============================================================
app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "audio がありません" });
    let history = [];
    try {
      history = JSON.parse(req.body.history || "[]");
    } catch {}

    const transcript = await provider.transcribeAudio({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });

    if (!transcript) {
      return res.json({ transcript: "", comments: [] });
    }

    const comments = await provider.reactToTranscript({
      transcript,
      historyText: historyText(history),
    });
    res.json({ transcript, comments });
  } catch (err) {
    console.error("/api/voice エラー:", err.message);
    res.status(500).json({ error: "音声処理に失敗しました", detail: err.message });
  }
});

// ============================================================
// POST /api/summary
// 配信ログを受け取り、盛り上がった場面を短く振り返る
// body: { log: [{name,text}] }
// ============================================================
app.post("/api/summary", async (req, res) => {
  try {
    const { log = [] } = req.body;
    if (!log.length) return res.json({ summary: "コメントがまだありませんでした。" });

    const logText = log
      .slice(-60)
      .map((c) => `${c.name || "誰か"}: ${c.text}`)
      .join("\n");

    const summary = await provider.summarize({ logText });
    res.json({ summary });
  } catch (err) {
    console.error("/api/summary エラー:", err.message);
    res.status(500).json({ error: "振り返りの生成に失敗しました", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nAIRS 起動: http://localhost:${PORT}`);
  console.log("  画像認識: OpenAI");
  console.log("  音声文字起こし: OpenAI");
  console.log("  コメント生成: ローカル model.gguf");
  console.log(
    `  ローカルLLM: ${
      process.env.LOCAL_LLM_URL ||
      "http://127.0.0.1:8080/v1/chat/completions"
    }\n`,
  );
});