# YOLOv8 Telemetry Demo

COCO-SSD ベースのデモを YOLOv8 (ONNX + onnxruntime-web) に置き換えたスタンドアロンの Web カメラ検知アプリです。H/E/S/EV テレメトリに推論結果を反映し、**CPU/WASM 専用構成**として量子化モデルを優先して読み込みます（GPU/WebGL 実行は無効化）。

## 特長
- YOLOv8n/m/l/量子化モデルの切り替え
- 平均信頼度・クラス別件数・上位クラスのサマリ表示
- H/E/S/EV テレメトリに平均信頼度と環境コードを統合
- 推論時間/FPS、モデルロード状態、バックエンドの可視化
- フレーム PNG 保存・テレメトリ CSV エクスポート

## セットアップ
1. 依存ライブラリは CDN から読み込みます (`onnxruntime-web`).
2. `models/` ディレクトリに使用したい YOLOv8 ONNX ファイルを配置してください。
   - `yolov8n-quantized.onnx` (推奨 CPU / デフォルト)
   - `yolov8n.onnx` / `yolov8m.onnx` / `yolov8l.onnx`
   - `npm run fetch:yolo` で `models/yolov8n-quantized.onnx` の取得を試み、失敗した場合は `models/yolov8n.onnx` を自動ダウンロードします（ネット接続が必要）。
   - **量子化ファイルが無い場合は、ローカルの `yolov8n.onnx` に自動フォールバックし、それも無い場合のみ Hugging Face などからダウンロードを試みます。**
3. ローカルサーバを起動してブラウザでアクセスします。

```bash
npm install
npm start
# もしくは: node server.js
```

## 使い方
1. 「開始」を押してカメラを許可します。
2. モデルセレクタでバリアントを選択、しきい値スライダで信頼度下限を調整します。
3. 画面左上の OCR パネルと右側カードに H/E/S/EV と検出サマリが表示されます。
4. 「フレーム保存」で現在のキャンバスを PNG 保存、「テレメトリCSV」で直近データをダウンロードできます。

## テレメトリ仕様
- **H (Ambient Light)**: 平均輝度を表示し、物体密度に応じて EV コードへ重み付け。
- **E (Resolution + Motion)**: サンプル解像度、モーションコード、平均信頼度 (CONF) を併記。
- **S (Stream Status)**: モデルロード状態 (IDLE/READY) に連動。
- **EV (Event Code)**: 環境コード + カラーバイアス。平均信頼度が 0.85 以上で +5 の HIGH_CONF を付与。

## パフォーマンスのヒント
- 本リポジトリは CPU / WASM 専用構成に寄せてあり、実行プロバイダは常に `wasm` を指定します。
- `npm run fetch:yolo` で `models/yolov8n-quantized.onnx` の取得を試み、入手できない場合は `yolov8n.onnx` を自動でフォールバックします。
- モデルサイズを抑える場合は Nano (n) を推奨します。

## ライセンス
元の COCOSSDdemo に準拠します。
