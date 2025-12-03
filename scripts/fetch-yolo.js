#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEST = path.join(__dirname, '..', 'models', 'yolov8n.onnx');
const SOURCES = [
  'https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.onnx',
  'https://huggingface.co/onnx-community/YOLOv8/resolve/main/yolov8n.onnx',
  'https://huggingface.co/ultralytics/yolov8n/resolve/main/yolov8n.onnx'
];

function fetchWithRedirect(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchWithRedirect(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const temp = `${DEST}.part`;
        const file = fs.createWriteStream(temp);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            const stats = fs.statSync(temp);
            if (stats.size < 1_000_000) {
              fs.rmSync(temp, { force: true });
              return reject(new Error(`Downloaded file is too small (${stats.size} bytes)`));
            }
            fs.mkdirSync(path.dirname(DEST), { recursive: true });
            fs.renameSync(temp, DEST);
            resolve(stats.size);
          });
        });
      })
      .on('error', reject);
  });
}

(async () => {
  console.log('[fetch-yolo] Download destination:', DEST);
  for (const url of SOURCES) {
    try {
      console.log(`[fetch-yolo] Trying ${url} ...`);
      const bytes = await fetchWithRedirect(url);
      console.log(`[fetch-yolo] Downloaded ${bytes} bytes`);
      console.log('[fetch-yolo] ✓ Done');
      return;
    } catch (err) {
      console.warn(`[fetch-yolo] Failed from ${url}:`, err.message);
    }
  }
  console.error('[fetch-yolo] All download sources failed. Please check your network or provide the file manually.');
  process.exit(1);
})();
