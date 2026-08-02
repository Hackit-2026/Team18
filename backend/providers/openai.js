// AIプロバイダー実装: OpenAI
// 自作モデルに差し替えたい場合は providers/custom.js に同じ関数を実装し、
// .env の AI_PROVIDER=custom に切り替えるだけでよい（providers/index.js 参照）。

import OpenAI, { toFile } from "openai";
import { randomName } from "../shared.js";

// クライアントとモデル名は呼び出し時に読む（.env の読み込みタイミングに依存しないように）
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        "\n[警告] OPENAI_API_KEY が設定されていません。" +
          "\n  .env に OPENAI_API_KEY を設定してください。\n"
      );
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const visionModel = () => process.env.VISION_MODEL || "gpt-4o-mini";
const textModel = () => process.env.TEXT_MODEL || "gpt-4o-mini";
const sttModel = () => process.env.STT_MODEL || "whisper-1";

// ---- 視聴者コメント生成の共通システムプロンプト ----
function buildSystemPrompt() {
  return [
    "あなたは、一人で配信している配信者の『視聴者たち』です。",
    "配信画面や配信者の発言を見て、まるで大勢の別々の視聴者がチャットに書き込んでいるかのように、短いコメントを返します。",
    "画面の状況を自分で判断して、その場に合ったコメントをする。",
    "",
    "【最優先ルール】",
    "・配信者の発言が質問・疑問・依頼を含む場合、ほかのすべてのルールより回答を優先する。",
    "・その場合、1件目のコメントは質問された内容への直接的な回答にする。",
    "・質問に答えず、感想・相槌・別の質問だけを返すことは禁止。",
    "・答えが分からない場合も無視せず、分からないことや確認が必要なことを正直に伝える。",
    "・疑問符がなくても、『何』『どこ』『いつ』『誰』『どう思う』『教えて』『知ってる』『おすすめ』『どっち』『〜ですか』『〜なの』などを質問として扱う。",
    "",
    "【コメントのルール】",
    "・1回につき 1〜3 件のコメントを返す。",
    "・質問がなければ感想や相槌を返す。",
    "・1件は日本語で、基本は20文字以内の短い口語。質問への回答に必要な場合は45文字程度まで使ってよい。",
    "・種類をまぜる: 感想(例「おいしそう」「すごい綺麗！」) / 問いかけ(例「今休憩中？」「次どこ行くの？」) / 相槌(例「うんうん」「そうだね」)。",
    "・毎回ぜんぶ感想にせず、たまに問いかけや相槌をはさむ。",
    "・直近のコメント履歴と同じような内容・語尾の繰り返しは避ける。",
    "・実在の人物名や特定の個人情報には触れない。ネガティブな中傷はしない。",
    "・映っている内容が読み取れないときは、無理に決めつけず軽い相槌や問いかけにする。",
    "",
    "【視聴者名について】",
    "name は、実在の人の名前としても違和感がない、自然な日本語のハンドルネームにする" +
      "（例: ゆうき、さくら、けんた、みさき など）。動物名や食べ物などの奇抜なあだ名は避ける。",
    "",
    "【出力形式】",
    "必ず次のJSONだけを返す（前後に文章やコードブロックを付けない）:",
    '{"comments":[{"name":"視聴者名","text":"コメント本文"}]}',
  ].join("\n");
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

// 映像フレーム(画像)を見て、視聴者コメントを生成する
export async function reactToImage({ image, historyText }) {
  const userContent = [
    {
      type: "text",
      text:
        "これが今の配信画面です。視聴者としてコメントしてください。\n" +
        "直近のコメント履歴:\n" + historyText,
    },
    { type: "image_url", image_url: { url: image, detail: "low" } },
  ];

  const completion = await getClient().chat.completions.create({
    model: visionModel(),
    temperature: 0.9,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userContent },
    ],
  });

  return parseComments(completion.choices[0]?.message?.content);
}

// 音声(Buffer)を文字起こしする
export async function transcribeAudio({ buffer, mimetype }) {
  const file = await toFile(buffer, "speech.webm", { type: mimetype || "audio/webm" });
  const transcription = await getClient().audio.transcriptions.create({
    file,
    model: sttModel(),
    language: "ja",
  });
  return (transcription.text || "").trim();
}

// 配信者の発言(文字起こし済み)に対する視聴者コメントを生成する。
// 直前の視聴者コメントへの「回答」であることが多いので、まずその内容への
// リアクションを返し、そのうえで会話を広げる問いかけも添える。
export async function reactToTranscript({ transcript, historyText }) {
  const completion = await getClient().chat.completions.create({
    model: textModel(),
    temperature: 0.5,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content:
          "配信者がマイクでこう発言しました:\n" +
          `「${transcript}」\n\n` +
          "直近のコメント履歴:\n" +
          historyText +
          "\n\nまず、この発言が質問・疑問・依頼かどうかを意味から判断してください。" +
          "疑問符が付いていなくても、答えを求めている発言なら質問として扱ってください。" +
          "質問・疑問・依頼の場合は、1件目を必ずその内容への直接的な回答にしてください。" +
          "感想、相槌、聞き返し、別の質問だけで済ませてはいけません。" +
          "正確に答えられない場合は、推測で断言せず、分からないことを明確に伝えてください。" +
          "質問ではない場合は、発言内容を具体的に踏まえた感想または相槌を返してください。" +
          "新しい問いかけは、直接回答または具体的なリアクションを返した後の2件目以降に限ります。",
      },
    ],
  });

  return parseComments(completion.choices[0]?.message?.content);
}

// 配信ログから振り返り文章を生成する
export async function summarize({ logText }) {
  const completion = await getClient().chat.completions.create({
    model: textModel(),
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

  return completion.choices[0]?.message?.content?.trim() || "";
}
