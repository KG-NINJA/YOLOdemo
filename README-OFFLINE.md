オフライン版（カメラ検出＋警告音）

このフォルダは、インターネット接続不要で動作するスタンドアロン版です。

構成:
- `index.html` … 画面/UI 本体
- `app.js` … 検出ループ（TFJS+coco-ssd）、音声（TTS/ビープ）
- `style.css` … スタイル
- `assets/` … ライブラリ（tf.min.js / coco-ssd.min.js）
- `models/coco-ssd/` … モデル（model.json と *.bin）
- `server.js` … ローカルHTTPサーバ（オフライン、LAN/外部通信不要）

初回セットアップ（モデル/JSの配置）:
1) ネットに接続した状態でこのフォルダの `fetch-assets.bat` もしくは `fetch-assets.ps1` を実行
   - 自動で TensorFlow.js / coco-ssd のUMDと coco-ssd モデル一式をダウンロードして配置します

起動手順:
1) ターミナルでこのフォルダに移動
2) `node server.js`
3) ブラウザで `http://localhost:8080/` を開く
4) 「開始」を押してカメラを許可

注意:
- ブラウザで `file://` 直接開くとモデル読込に失敗するため、必ず `node server.js` で提供される `http://localhost:8080` からアクセスしてください。
- 完全オフラインで動作します（LAN/外部通信は発生しません）。
