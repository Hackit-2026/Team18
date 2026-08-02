import { randomName } from "../shared.js";

const localLlmUrl = () =>
  process.env.LOCAL_LLM_URL ||
  "http://127.0.0.1:8080/v1/chat/completions";

const localLlmModel = () =>
  process.env.LOCAL_LLM_MODEL ||
  "local-comments";

const COMMENT_TYPES = new Set([
  "感想",
  "質問",
  "相槌",
  "回答",
]);

// 学習時に使用したシステムプロンプトへ合わせる
const SYSTEM_PROMPT = [
  "あなたはライブ配信のAI視聴者です。",
  "入力された配信者の発言、または配信画面の画像説明に反応してください。",
  "2〜3件の短い日本語コメントを生成してください。",
  "感想・質問・相槌・回答を自然に混ぜてください。",
  "1件のコメント本文は20文字程度にしてください。",
  "入力内容の時制を変えないでください。",
  "入力に書かれていない天候・場所・出来事を推測しないでください。",
  "配信者が質問した場合は、少なくとも1件は具体的に回答してください。",
  "入力が質問の場合、直接答えるコメントのtypeは「回答」にしてください。",
  "出力は説明文やコードブロックを付けず、指定されたJSONだけにしてください。",
  '{"comments":[{"name":"視聴者名","text":"コメント本文","type":"感想・質問・相槌・回答のいずれか"}]}',
].join("\n");

const RESPONSE_FORMAT = {
  type: "json_object",

  schema: {
    title: "ViewerCommentsResponse",
    type: "object",

    properties: {
      comments: {
        type: "array",
        minItems: 1,
        maxItems: 3,

        items: {
          type: "object",

          properties: {
            name: {
              type: "string",
            },

            text: {
              type: "string",
            },

            type: {
              type: "string",
              enum: [
                "感想",
                "質問",
                "相槌",
                "回答",
              ],
            },
          },

          required: [
            "name",
            "text",
            "type",
          ],

          additionalProperties: false,
        },
      },
    },

    required: ["comments"],
    additionalProperties: false,
  },
};

function parseComments(raw) {
  if (!raw) {
    return [];
  }

  let text = String(raw)
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  // JSONの前後に文章が付いた場合にも対応
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(text);

    const comments = Array.isArray(parsed)
      ? parsed
      : parsed.comments || [];

    return comments
      .filter(
        (comment) =>
          comment &&
          typeof comment.text === "string" &&
          comment.text.trim(),
      )
      .slice(0, 3)
      .map((comment) => {
        const type = String(
          comment.type || "",
        ).trim();

        return {
          name:
            String(comment.name || "")
              .trim()
              .slice(0, 12) ||
            randomName(),

          text: comment.text
            .trim()
            .slice(0, 60),

          type: COMMENT_TYPES.has(type)
            ? type
            : "感想",
        };
      });
  } catch {
    console.error(
      "ローカルLLMのJSON解析に失敗:",
      text.slice(0, 500),
    );

    return [];
  }
}

export async function generateComments({
  inputText,
  historyText = "",
  sourceType = "speech",
}) {
  if (!inputText?.trim()) {
    return [];
  }

  // 学習データと同じ入力種別名を使用
  const inputLabel =
    sourceType === "image"
      ? "配信画面の画像説明"
      : "配信者の発言テキスト";

  // 学習データと同じユーザー入力形式を使用
  const userContent = [
    `【入力種別】${inputLabel}`,
    "【入力内容】",
    inputText.trim(),
    "",
    "【直近のコメント履歴】",
    historyText?.trim() ||
      "（まだコメントなし）",
  ].join("\n");

  const controller = new AbortController();

  const timeoutMs = Number(
    process.env.LOCAL_LLM_TIMEOUT_MS ||
      120000,
  );

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(
      localLlmUrl(),
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: localLlmModel(),

          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: userContent,
            },
          ],

          // JSONを安定させるため低めに設定
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 256,

          // llama.cppにJSON Schemaを強制させる
          response_format: RESPONSE_FORMAT,

          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `llama-server応答エラー ${response.status}: ` +
          detail.slice(0, 500),
      );
    }

    const result = await response.json();

    return parseComments(
      result.choices?.[0]?.message?.content,
    );
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `ローカルLLMが${timeoutMs}ms以内に応答しませんでした`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}