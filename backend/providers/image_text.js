const visionUrl = () =>
  process.env.VISION_LLM_URL ||
  "http://127.0.0.1:8081/v1/chat/completions";

const visionModel = () =>
  process.env.VISION_LLM_MODEL ||
  "local-vision";

export async function describeImage({ image }) {
  if (!image) {
    return "";
  }

  const response = await fetch(visionUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: visionModel(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "これは現在の配信画面です。",
                "画面に映っている内容を日本語で簡潔に説明してください。",
                "見えない内容を推測しないでください。",
                "人物を特定しないでください。",
                "視聴者コメントは生成せず、画面の説明だけを返してください。",
              ].join("\n"),
            },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 150,
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      `画像モデルエラー ${response.status}: ${detail}`,
    );
  }

  const result = await response.json();

  return (
    result.choices?.[0]?.message?.content?.trim() ||
    ""
  );
}