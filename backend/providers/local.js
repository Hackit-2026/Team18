import { randomName } from "../shared.js";

const localLlmUrl = () =>
  process.env.LOCAL_LLM_URL ||
  "http://127.0.0.1:8080/v1/chat/completions";

const localLlmModel = () =>
  process.env.LOCAL_LLM_MODEL || "local-comments";

const SYSTEM_PROMPT = [
  "あなたは、一人で配信している配信者の『視聴者たち』です。",
  "配信者の発言や配信画面の説明に対して、大勢の別々の視聴者がチャットに書き込んでいるように、短いコメントを返します。",
  "1回につき1〜3件。1件は日本語で20文字前後の口語。感想・問いかけ・相槌をまぜる。",
  "配信者が質問をしてきた場合は、その質問に答える。",
  "視聴者名は自然な日本語のハンドルネームにする。",
  '出力は必ず次のJSONだけ: {"comments":[{"name":"視聴者名","text":"コメント本文"}]}',
].join("\n");

function parseComments(raw) {
  if (!raw) return [];

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
      .map((comment) => ({
        name:
          String(comment.name || "").trim().slice(0, 12) ||
          randomName(),
        text: comment.text.trim().slice(0, 60),
        type: comment.type || "感想",
      }));
  } catch {
    console.error(
      "ローカルLLMのJSON解析に失敗:",
      text.slice(0, 300),
    );
    return [];
  }
}

export async function generateComments({
  inputText,
  historyText = "",
  sourceType = "speech",
}) {
  if (!inputText?.trim()) return [];

  const label =
    sourceType === "image"
      ? "現在の配信画面の説明"
      : "配信者の発言";

  const history =
    historyText &&
    historyText !== "（まだコメントなし）"
      ? [
          "",
          "",
          "直近のコメント履歴:",
          historyText,
          "同じ内容の繰り返しは避けてください。",
        ].join("\n")
      : "";

  const controller = new AbortController();
  const timeoutMs = Number(
    process.env.LOCAL_LLM_TIMEOUT_MS || 120000,
  );

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(localLlmUrl(), {
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
            content: `${label}:\n${inputText.trim()}${history}`,
          },
        ],
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 256,
        response_format: {
          type: "json_object",
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `llama-server応答エラー ${response.status}: ` +
          detail.slice(0, 300),
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