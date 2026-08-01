// 使用するAIプロバイダーの切り替え口。
// .env の AI_PROVIDER で選べる（未指定なら "openai"）。
// 自作モデルを使う場合は providers/custom.js を実装し、AI_PROVIDER=custom にする。

import * as openai from "./openai.js";
import * as custom from "./custom.js";

const PROVIDERS = { openai, custom };

// AI_PROVIDER は .env 読み込み後に参照したいので、呼び出しのたびに読む
function currentProvider() {
  const name = process.env.AI_PROVIDER || "openai";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(
      `未知の AI_PROVIDER です: "${name}"（"openai" か "custom" を指定してください）`
    );
  }
  return provider;
}

export default {
  reactToImage: (args) => currentProvider().reactToImage(args),
  transcribeAudio: (args) => currentProvider().transcribeAudio(args),
  reactToTranscript: (args) => currentProvider().reactToTranscript(args),
  summarize: (args) => currentProvider().summarize(args),
};
