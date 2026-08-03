//要約モデル
const summaryLlmUrl = () =>
  process.env.SUMMARY_LLM_URL ||
  "http://127.0.0.1:8083/v1/chat/completions";

const summaryLlmModel = () =>
  process.env.SUMMARY_LLM_MODEL ||
  "local-summary";

const SYSTEM_PROMPT = [
  "あなたはライブ配信の要約担当です。",
  "視聴者コメントのログから主要な話題を2〜4個選んでください。",
  "入力にない出来事を追加しないでください。",
  "視聴者の質問や予想を、実際に起きた事実として書かないでください。",
  "似た内容はまとめ、できるだけ時系列に沿ってください。",
  "1段落、3文程度の自然な日本語で要約だけを返してください。",
].join("\n");

export async function summarize({
  logText,
}) {
  if (!logText?.trim()) {
    return "コメントがまだありませんでした。";
  }

  const controller = new AbortController();

  const timeoutMs = Number(
    process.env.SUMMARY_LLM_TIMEOUT_MS ||
      120000,
  );

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(
      summaryLlmUrl(),
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: summaryLlmModel(),

          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                "【今回の配信コメントログ】",
                logText.trim(),
              ].join("\n"),
            },
          ],

          temperature: 0.2,
          max_tokens: 350,
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `要約モデルエラー ${response.status}: ` +
          detail.slice(0, 500),
      );
    }

    const result = await response.json();

    const summary =
      result.choices?.[0]?.message?.content
        ?.trim();

    if (!summary) {
      throw new Error(
        "要約モデルの応答が空です",
      );
    }

    return summary
      .replace(/^```(?:text)?/i, "")
      .replace(/```$/i, "")
      .trim();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `要約モデルが${timeoutMs}ms以内に応答しませんでした`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}