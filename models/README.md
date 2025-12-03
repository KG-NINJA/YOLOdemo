# Models

このディレクトリに YOLOv8 の ONNX モデルを配置してください。推奨ファイル名:

- `yolov8n-quantized.onnx` (CPU/WASM 推奨)
- `yolov8n.onnx`
- `yolov8m.onnx`
- `yolov8l.onnx`

ファイルサイズが大きいためリポジトリには含めていません。Ultralytics 公式のエクスポート機能や事前量子化済みモデルをダウンロードして配置してください。

※ モデルが未配置の場合でも、ブラウザ実行時に Hugging Face (`onnx-community` コレクション) から同等モデルを自動ダウンロードするフォールバックを備えています。
