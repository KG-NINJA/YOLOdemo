# YOLO モデル セットアップガイド

## 方法 A: ローカルファイル（推奨）

### ステップ 1: モデルをダウンロード

```bash
mkdir -p models

# macOS/Linux
curl -L "https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.onnx" -o models/yolov8n.onnx

# Windows（PowerShell）
Invoke-WebRequest -Uri "https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.onnx" -OutFile "models/yolov8n.onnx"
```

### ステップ 2: ファイル確認

```bash
# ファイルサイズ確認（6-7MB が目安）
ls -lh models/yolov8n.onnx
```

### ステップ 3: ローカルサーバーで起動

```bash
# npm start を使用
npm start

# または直接 http-server
npx http-server -p 8000
```

### ステップ 4: ブラウザで開く

```
http://localhost:8000
```

---

## 方法 B: CDN から自動ダウンロード（インターネット接続必要）

コード内のフォールバック機構により、ローカルファイルがない場合、自動的に Hugging Face CDN からダウンロードされます。

初回のみ 5-10 秒かかります。

---

## トラブルシューティング

### Q: "failed to load external data file" エラーが出る
**A:** ローカルサーバーで起動してください（`npm start` または `http-server`）

### Q: "CPU vendor Unknown" 警告が出る
**A:** 無視して大丈夫です。CPU で正常に動作しています。

### Q: モデルが遅い
**A:** 別の軽量モデル（YOLOv8n-fp32）を使用してください。

---

## ファイル構造

```
YOLOv8-Telemetry-Demo/
├── index.html
├── js/
│   ├── main.js
│   ├── yolo-loader.js    ← 修正済み
│   ├── detector.js
│   ├── telemetry.js
│   └── ui.js
├── models/
│   └── yolov8n.onnx      ← 配置する
├── SETUP.md              ← この新規ファイル
└── package.json
```
