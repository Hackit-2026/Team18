セットアップ方法

この説明は、Apple Silicon（M1/M2/M3/M4）を搭載したMacを対象としている。初回のみソフトとモデルのダウンロードが必要だが、準備後の画像・音声・コメント・要約処理はすべてMac内で実行される。

### 1. 必要なもの

- メモリ32GB程度のApple Silicon Mac
- 15GB程度の空き容量
- 初回ダウンロード用のインターネット接続
- コメント生成用の学習済み `model.gguf`
- 要約用の学習済み `summary-model.gguf`

`model.gguf` と `summary-model.gguf` はこのプロジェクトで追加学習した独自モデルである。GitHubには大容量モデルを置かないため、プロジェクトメンバーから別途受け取る。

### 2. Homebrewを準備する

ターミナルを開き、次のコマンドでHomebrewが入っているか確認する。

```bash
brew --version
```

バージョンが表示されれば次へ進む。`command not found: brew` と表示された場合は、[Homebrew公式サイト](https://brew.sh/)の手順でインストールし、ターミナルを一度開き直す。

### 3. 必要なソフトをインストールする

```bash
brew install node ffmpeg llama.cpp hf
```

それぞれの役割は次のとおりである。

| ソフト | 役割 |
|---|---|
| Node.js / npm | バックエンドを動かす |
| ffmpeg | ブラウザの音声をWAVへ変換する |
| llama.cpp | コメント・画像・要約GGUFを動かす |
| Hugging Face CLI (`hf`) | 音声モデルをダウンロードする |

インストールを確認する。

```bash
node --version
npm --version
ffmpeg -version
llama-server --version
hf --help
```

### 4. プロジェクトを準備する

GitHubから取得したプロジェクトの `backend` へ移動する。以下はプロジェクトを `~/Desktop/No18/Team18` に置いた場合の例である。

```bash
cd ~/Desktop/No18/Team18/backend
npm install
cp .env.example .env
mkdir -p models
```

保存場所が違う場合は、`~/Desktop/No18/Team18` を実際の場所へ置き換える。

### 5. 独自学習済みモデルを配置する

受け取った2つのGGUFを次の名前で配置する。

```text
backend/
└── models/
    ├── model.gguf
    └── summary-model.gguf
```

配布するときにファイル名を `model.gguf` と `summary-model.gguf` にそろえておくと分かりやすい。両方のファイルがMacの「ダウンロード」フォルダにある場合は次のようにコピーする。

```bash
cp ~/Downloads/model.gguf \
  models/model.gguf

cp ~/Downloads/summary-model.gguf \
  models/summary-model.gguf
```

受け取ったファイルの名前が異なる場合は、コピー元を実際の名前へ変更する。配置できたか確認する。

```bash
ls -lh models/model.gguf models/summary-model.gguf
```

2つのファイル名と容量が表示されれば完了である。

### 6. 日本語音声モデルをダウンロードする

このプロジェクトでは `LiquidAI/LFM2.5-Audio-1.5B-JP-GGUF` のQ4_0版を使用する。音声モデルは本体だけでなく、音声認識用プロジェクター、トークナイザー、ボコーダーの合計4ファイルが必要になる。

`backend` にいる状態で次を実行する。

```bash
hf download LiquidAI/LFM2.5-Audio-1.5B-JP-GGUF \
  LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  mmproj-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  tokenizer-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  vocoder-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  runners/llama-liquid-audio-macos-arm64.zip \
  --local-dir ./models/audio
```

専用runnerを展開する。

```bash
mkdir -p models/audio/runners/macos-arm64

unzip models/audio/runners/llama-liquid-audio-macos-arm64.zip \
  -d models/audio/runners/macos-arm64
```

runnerを実行できるようにする。

```bash
chmod +x \
  models/audio/runners/macos-arm64/llama-liquid-audio-macos-arm64/llama-liquid-audio-cli

chmod +x \
  models/audio/runners/macos-arm64/llama-liquid-audio-macos-arm64/llama-liquid-audio-server
```

Macから「開発元を確認できない」と表示された場合だけ、次を実行する。

```bash
xattr -dr com.apple.quarantine \
  models/audio/runners/macos-arm64/llama-liquid-audio-macos-arm64
```

### 7. 4つのローカルAIサーバーを起動する

各モデルは別々のポートで待機する。4つのターミナルを開き、すべてのターミナルで最初に `backend` へ移動してから、それぞれのコマンドを1つずつ実行する。

```bash
cd ~/Desktop/No18/Team18/backend
```

#### ターミナル1：コメント生成（8080）

```bash
llama-server \
  --model models/model.gguf \
  --alias local-comments \
  --port 8080 \
  --ctx-size 2048
```

#### ターミナル2：画像説明（8081）

画像モデルは初回起動時にHugging Faceから自動ダウンロードされる。2回目以降はMac内のキャッシュが利用される。

```bash
llama-server \
  -hf LiquidAI/LFM2.5-VL-1.6B-GGUF:Q4_K_M \
  --alias local-vision \
  --port 8081 \
  --ctx-size 4096
```

#### ターミナル3：音声文字起こし（8082）

```bash
models/audio/runners/macos-arm64/llama-liquid-audio-macos-arm64/llama-liquid-audio-server \
  -m models/audio/LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  -mm models/audio/mmproj-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  -mv models/audio/vocoder-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  --tts-speaker-file models/audio/tokenizer-LFM2.5-Audio-1.5B-JP-Q4_0.gguf \
  --port 8082
```

#### ターミナル4：配信要約（8083）

```bash
llama-server \
  --model models/summary-model.gguf \
  --alias local-summary \
  --port 8083 \
  --ctx-size 4096
```

各コマンドは、モデルを読み込んだ後も終了せず待機し続ける。これは正常な状態なので、使用中は4つのターミナルを閉じない。

### 8. AIサーバーの起動を確認する

5つ目のターミナルを開いて次を実行する。

```bash
curl http://127.0.0.1:8080/v1/models
curl http://127.0.0.1:8081/v1/models
nc -z 127.0.0.1 8082 && echo "audio server OK"
curl http://127.0.0.1:8083/v1/models
```

8080、8081、8083ではモデル情報のJSON、8082では `audio server OK` が表示されれば準備完了である。

### 9. AIRSを起動する

同じ5つ目のターミナルで `backend` へ移動し、アプリを起動する。

```bash
cd ~/Desktop/No18/Team18/backend
npm start
```

次の表示が出れば起動成功である。

```text
AIRS 起動: http://localhost:3000
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く。初回はブラウザからカメラとマイクの使用許可を求められるため、「許可」を選ぶ。

### ポート一覧

| ポート | 用途 | モデル名 |
|---:|---|---|
| 8080 | コメント生成 | `local-comments` |
| 8081 | 画像説明 | `local-vision` |
| 8082 | 音声文字起こし | `LFM2.5-Audio-1.5B-JP` |
| 8083 | 配信要約 | `local-summary` |
| 3000 | AIRS本体 | Node.js / Express |

### 終了方法

各ターミナルで `Control + C` を押す。AIRS本体と4つのモデルサーバーをそれぞれ終了する。

### よくあるエラー

#### `curl: (7) Failed to connect` と表示される

そのポートのモデルサーバーが起動していない。対応するターミナルを確認し、モデルの読み込み完了まで待つ。

#### `Address already in use` と表示される

同じポートのサーバーがすでに動いている。以前開いたターミナルを探し、そこで `Control + C` を押してから再起動する。

#### `ffmpegを起動できませんでした` と表示される

```bash
brew install ffmpeg
```

#### `No such file or directory` と表示される

現在地またはモデル名が違う可能性がある。次のコマンドで確認する。

```bash
pwd
find models -maxdepth 4 -type f
```

#### モデルの読み込みに時間がかかる

初回はモデルのダウンロードとメモリへの読み込みがあるため数分かかる場合がある。`curl`による確認は、各サーバーの起動ログが止まり、待機状態になってから実行する。

## ローカルAIモデル

コメント生成と配信要約には、Liquid AIの小型言語モデル `LFM2.5-1.2B-Instruct` を基盤として使用している。独自に収集・整形したデータでLoRAファインチューニングを行い、Macで動かせるGGUF（Q4_K_M）形式へ変換した。コメント生成用と要約用は目的が異なるため、別々のGGUFとして管理する。

### 参考文献

- [LiquidAI/LFM2.5-1.2B-Instruct](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct)
- [LiquidAI/LFM2.5-VL-1.6B-GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-GGUF)
- [LiquidAI/LFM2.5-Audio-1.5B-JP-GGUF](https://huggingface.co/LiquidAI/LFM2.5-Audio-1.5B-JP-GGUF)
- [Unsloth版 LFM2.5-1.2B-Instruct](https://huggingface.co/unsloth/LFM2.5-1.2B-Instruct)
- [LFM2 Technical Report](https://arxiv.org/abs/2511.23404)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [Hugging Face CLI](https://huggingface.co/docs/huggingface_hub/en/guides/cli)
