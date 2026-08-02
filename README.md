summary_raw.jsonl：自動収集した未確認データ
summary_train.jsonl：人が確認・修正した学習データ
summary_valid.jsonl：学習に使わない評価用データ


## 要約モデルの選定理由
要約モデルにはLiquidAI/LFM2.5-1.2B-Instructを採用した。
主な理由は次のとおりである。
日本語と指示形式の文章生成に対応している
約1.2Bの軽量モデルで、Mac上でローカル実行しやすい
UnslothによるLoRA追加学習に対応している
GGUFへ変換してllama.cppから実行できる
既存のコメントモデルと同じ学習・実行環境を再利用できる
コメント生成と要約では目的が異なるため、同じベースモデルから要約専用モデルを別に作成する。長い配信ログは区間ごとに要約し、最後に統合する方式で処理する。



collectors/summary_collector.jsでデータ収集
