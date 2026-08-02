# PORT設定

```
3000：AIRS
8080：コメント生成
8081：画像認識
8082：音声認識
```

# ローカルモデルの起動

## text→comment

Apple Silicon Macの場合：

```
llama-server \
  -m ./models/model.gguf \
  --alias local-comments \
  --host 127.0.0.1 \
  --port 8080 \
  -c 2048 \
  -ngl 99
 
```

## image→text

llama-server \
-hf LiquidAI/LFM2.5-VL-1.6B-GGUF:Q4_K_M \
--alias local-vision \
--host 127.0.0.1 \
--port 8081 \
-c 4096 \
-ngl 99

### 音声ー＞テキスト

FFmpegをインストールする

ブラウザから届くWebM音声をWAVへ変換するために使います。

brew install ffmpeg

### 起動方法

models/audio/runners/macos-arm64/llama-liquid-audio-macos-arm64/llama-liquid-audio-server \
-m models/audio/LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
-mm models/audio/mmproj-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
-mv models/audio/vocoder-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
--tts-speaker-file models/audio/tokenizer-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
--host 127.0.0.1 \
--port 8082

# 参考文献

テキストからコメント生成：https://unsloth.ai/docs/models/tutorials/lfm2.5

画像からテキスト：https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-GGUF

音声からテキスト：https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B-JP-GGUF
