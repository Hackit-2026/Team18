//ここでは画像と音声をテキスト化している。コメントはローカルGGUFで生成するようにする

import * as imageText from "./image_text.js";
import * as localGguf from "./local.js";
import * as audioText from "./audio_text.js";
import * as localSummary from "./summary.js";

export default {
  // 画像
  // ローカルVLMで画像をテキスト化
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

  // 音声からテキストはローカル音声LLM
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

  // 配信終了時のまとめはローカル要約モデル
  summarize: (args) =>
  localSummary.summarize(args),
};