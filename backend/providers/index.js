//ここでは画像と音声をテキスト化している。コメントはローカルGGUFで生成するようにする

import * as openai from "./openai.js";
import * as imageText from "./image_text.js";
import * as localGguf from "./local.js";
import * as audioText from "./audio_text.js";

export default {
  // 画像
  // OpenAIで画像をテキスト化
  // → ローカルGGUFでコメント生成
  async reactToImage({ image, historyText }) {
  const description =
    await imageText.describeImage({ image });

  console.log("ローカル画像説明:", description);

  if (!description) {
    return [];
  }

  return localGguf.generateComments({
    inputText: description,
    historyText,
    sourceType: "image",
  });
},

  // 音声からテキストはOpenAI
  transcribeAudio: (args) =>
    audioText.transcribeAudio(args),

  // 文字起こし後のコメントはローカルGGUF
  reactToTranscript: ({
    transcript,
    historyText,
  }) =>
    localGguf.generateComments({
      inputText: transcript,
      historyText,
      sourceType: "speech",
    }),

  // 配信終了時のまとめは、ひとまずOpenAIのまま
  summarize: (args) =>
    openai.summarize(args),
};