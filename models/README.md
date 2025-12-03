# Models

このディレクトリに YOLOv8 の ONNX モデルを配置してください。推奨ファイル名:

- `yolov8n-quantized.onnx` (CPU/WASM 推奨)
- `yolov8n.onnx`
- `yolov8m.onnx`
- `yolov8l.onnx`

ファイルサイズが大きいためリポジトリには含めていません。Ultralytics 公式のエクスポート機能や事前量子化済みモデルをダウンロードして配置してください。`npm run fetch:yolo` を実行すると `models/yolov8n.onnx` を自動取得します（ネット接続が必要）。

※ モデルが未配置の場合でも、ブラウザ実行時に Hugging Face (`onnx-community` コレクション) から同等モデルを自動ダウンロードするフォールバックを備えています。
