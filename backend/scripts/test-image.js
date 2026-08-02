//画像モデルのテスト用
import fs from "node:fs/promises";
import path from "node:path";

const imageArgument = process.argv[2];

if (!imageArgument) {
  console.error(
    "使い方: node scripts/test-image.js 画像ファイル",
  );
  process.exit(1);
}

const imagePath = path.resolve(imageArgument);
const extension = path.extname(imagePath).toLowerCase();

const mimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const mimeType = mimeTypes[extension];

if (!mimeType) {
  console.error(
    "対応画像は jpg、jpeg、png、webp です",
  );
  process.exit(1);
}

try {
  const imageBuffer = await fs.readFile(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const imageDataUrl =
    `data:${mimeType};base64,${imageBase64}`;

  const endpoint =
    process.env.VISION_LLM_URL ||
    "http://127.0.0.1:8081/v1/chat/completions";

  console.log("画像:", imagePath);
  console.log("送信先:", endpoint);
  console.log("画像モデルへ送信中...");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "local-vision",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "この画像に映っている内容を、日本語で簡潔に説明してください。",
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
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
  const description =
    result.choices?.[0]?.message?.content;

  console.log("\n画像の説明:");
  console.log(description || "説明を取得できませんでした");
} catch (error) {
  console.error("\nテスト失敗:");
  console.error(error.message);
  process.exit(1);
}