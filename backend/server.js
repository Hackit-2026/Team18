// AIRS - AI-ReactionStream
// バックエンド: 映像フレーム/音声を受け取り、OpenAI APIで
// 「大勢の視聴者がコメントしているような」リアクションを生成して返す。

import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI, { toFile } from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// ---- OpenAI クライアント（キーは .env の OPENAI_API_KEY を使用）----
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "\n[警告] OPENAI_API_KEY が設定されていません。" +
      "\n  .env.example を .env にコピーしてキーを設定してください。\n"
  );
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VISION_MODEL = process.env.VISION_MODEL || "gpt-4o-mini";
const TEXT_MODEL = process.env.TEXT_MODEL || "gpt-4o-mini";
const STT_MODEL = process.env.STT_MODEL || "whisper-1";
const PORT = process.env.PORT || 3000;

// ---- Express セットアップ ----
const app = express();
app.use(express.json({ limit: "12mb" })); // 画像を base64 で受けるので大きめに
app.use(express.static(path.join(__dirname, "..", "frontend")));

const upload = multer({ storage: multer.memoryStorage() });

// ---- 視聴者名のプール（ランダムに割り当てて「別人が書いている感」を出す）----
const VIEWER_NAMES = [
  "みかん", "ぽんた", "しお", "くろねこ", "たぬき", "あおい", "りん",
  "もぐもぐ", "ぷりん", "こまち", "そら", "ゆき", "はると", "なぎ",
  "とまと", "ちび", "まる", "こはく", "れもん", "ふうか", "だいふく",
  "ぺんぎん", "みどり", "かえで", "しろくま", "ここあ", "ひなた",
];
function randomName() {
  return VIEWER_NAMES[Math.floor(Math.random() * VIEWER_NAMES.length)];
}

// モードごとにコメントの雰囲気を少し変える
const MODE_HINT = {
  auto: "画面の状況を自分で判断して、その場に合ったコメントをする。",
  meal: "食事の場面。料理の見た目・おいしそうさ・雰囲気に触れる。",
  walk: "散歩・旅行の場面。景色・場所・移動先への興味に触れる。",
  work: "作業・勉強の場面。集中を応援したり、進み具合を気にかける。",
  workout: "運動の場面。頑張りを応援したり、フォームや調子に触れる。",
};

// ---- 視聴者コメント生成の共通システムプロンプト ----
function buildSystemPrompt(mode) {
  const hint = MODE_HINT[mode] || MODE_HINT.auto;
  return [
    "あなたは、一人で配信している配信者の『視聴者たち』です。",
    "配信画面や配信者の発言を見て、まるで大勢の別々の視聴者がチャットに書き込んでいるかのように、短いコメントを返します。",
    "",
    "【今の場面のヒント】" + hint,
    "",
    "【コメントのルール】",
    "・1回につき 1〜3 件のコメントを返す。",
    "・1件は日本語で、だいたい20文字以内の短い口語。丁寧すぎず、チャットっぽいカジュアルさで。",
    "・種類をまぜる: 感想(例「おいしそう」「すごい綺麗！」) / 問いかけ(例「今休憩中？」「次どこ行くの？」) / 相槌(例「うんうん」「そうだね」)。",
    "・毎回ぜんぶ感想にせず、たまに問いかけや相槌をはさむ。",
    "・直近のコメント履歴と同じような内容・語尾の繰り返しは避ける。",
    "・実在の人物名や特定の個人情報には触れない。ネガティブな中傷はしない。",
    "・映っている内容が読み取れないときは、無理に決めつけず軽い相槌や問いかけにする。",
    "",
    "【出力形式】",
    '必ず次のJSONだけを返す（前後に文章やコードブロックを付けない）:',
    '{"comments":[{"name":"視聴者名","text":"コメント本文","type":"感想|問いかけ|相槌"}]}',
    "name は自由な短いハンドルネームでよい（こちらで上書きすることもある）。",
  ].join("\n");
}

// 直近履歴を短い文字列にする
function historyText(history = []) {
  if (!history.length) return "（まだコメントなし）";
  return history
    .slice(-8)
    .map((c) => `${c.name || "誰か"}: ${c.text}`)
    .join("\n");
}

// OpenAI の返答から JSON を安全に取り出す
function parseComments(raw) {
  if (!raw) return [];
  let text = raw.trim();
  // ```json ... ``` が付いていた場合に備えて剥がす
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const obj = JSON.parse(text);
    const list = Array.isArray(obj) ? obj : obj.comments || [];
    return list
      .filter((c) => c && typeof c.text === "string" && c.text.trim())
      .slice(0, 3)
      .map((c) => ({
        name: (c.name && String(c.name).slice(0, 12)) || randomName(),
        text: String(c.text).slice(0, 60),
        type: c.type || "感想",
      }));
  } catch (e) {
    console.error("JSON parse 失敗:", text.slice(0, 200));
    return [];
  }
}

// ============================================================
// POST /api/react
// 映像フレーム(base64 dataURL)を受け取り、視聴者コメントを生成
// body: { image: "data:image/jpeg;base64,...", mode, history: [{name,text}] }
// ============================================================
app.post("/api/react", async (req, res) => {
  try {
    const { image, mode = "auto", history = [] } = req.body;
    if (!image) return res.status(400).json({ error: "image がありません" });

    const userContent = [
      {
        type: "text",
        text:
          "これが今の配信画面です。視聴者としてコメントしてください。\n" +
          "直近のコメント履歴:\n" +
          historyText(history),
      },
      { type: "image_url", image_url: { url: image, detail: "low" } },
    ];

    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.9,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(mode) },
        { role: "user", content: userContent },
      ],
    });

    const comments = parseComments(completion.choices[0]?.message?.content);
    res.json({ comments });
  } catch (err) {
    console.error("/api/react エラー:", err.message);
    res.status(500).json({ error: "コメント生成に失敗しました", detail: err.message });
  }
});

// ============================================================
// POST /api/voice
// マイク音声(webm等)を受け取り、Whisperで文字起こし → その発言に
// 反応する視聴者コメントを生成（疑似会話）
// multipart/form-data: audio(ファイル), mode, history(JSON文字列)
// ============================================================
app.post("/api/voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "audio がありません" });
    const mode = req.body.mode || "auto";
    let history = [];
    try {
      history = JSON.parse(req.body.history || "[]");
    } catch {}

    // 1) 文字起こし
    const file = await toFile(req.file.buffer, "speech.webm", {
      type: req.file.mimetype || "audio/webm",
    });
    const transcription = await client.audio.transcriptions.create({
      file,
      model: STT_MODEL,
      language: "ja",
    });
    const transcript = (transcription.text || "").trim();

    if (!transcript) {
      return res.json({ transcript: "", comments: [] });
    }

    // 2) 発言に反応するコメントを生成
    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.9,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(mode) },
        {
          role: "user",
          content:
            "配信者がマイクでこう発言しました:\n" +
            `「${transcript}」\n\n` +
            "直近のコメント履歴:\n" +
            historyText(history) +
            "\n\nこの発言に対して、視聴者として反応してください。" +
            "特に、会話が広がるような『問いかけ』を中心に返してください" +
            "（例: どこで食べたの？ / 何を頼んだの？ / 味はどうだった？ / 一人で行ったの？）。" +
            "1件は短い感想や相槌でもよいですが、少なくとも1件は具体的な質問にしてください。",
        },
      ],
    });

    const comments = parseComments(completion.choices[0]?.message?.content);
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

    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "あなたは配信の振り返りをまとめる係です。視聴者コメントのログから、" +
            "盛り上がった場面や話題を、配信者本人に向けて温かく3〜4文で振り返ってください。" +
            "箇条書きは使わず、やさしい口語で。",
        },
        { role: "user", content: "今回の配信のコメントログ:\n" + logText },
      ],
    });

    res.json({ summary: completion.choices[0]?.message?.content?.trim() || "" });
  } catch (err) {
    console.error("/api/summary エラー:", err.message);
    res.status(500).json({ error: "振り返りの生成に失敗しました", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nAIRS 起動: http://localhost:${PORT}`);
  console.log(`  Vision: ${VISION_MODEL} / Text: ${TEXT_MODEL} / STT: ${STT_MODEL}\n`);
});
