#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGETS = [
  {
    dest: path.join(__dirname, '..', 'models', 'yolov8n-quantized.onnx'),
    label: 'yolov8n-quantized.onnx (CPU/WASM)',
    sources: [
      'https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n-quantized.onnx',
      'https://huggingface.co/onnx-community/YOLOv8/resolve/main/yolov8n-quantized.onnx',
      'https://huggingface.co/ultralytics/yolov8n/resolve/main/yolov8n-quantized.onnx'
    ],
    optional: true
  },
  {
    dest: path.join(__dirname, '..', 'models', 'yolov8n.onnx'),
    label: 'yolov8n.onnx (fallback)',
    sources: [
      'https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.onnx',
      'https://huggingface.co/onnx-community/YOLOv8/resolve/main/yolov8n.onnx',
      'https://huggingface.co/ultralytics/yolov8n/resolve/main/yolov8n.onnx'
    ],
    optional: false
  }
];

function fetchWithRedirect(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchWithRedirect(res.headers.location, dest));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const temp = `${dest}.part`;
        const file = fs.createWriteStream(temp);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            const stats = fs.statSync(temp);
            if (stats.size < 1_000_000) {
              fs.rmSync(temp, { force: true });
              return reject(new Error(`Downloaded file is too small (${stats.size} bytes)`));
            }
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.renameSync(temp, dest);
            resolve(stats.size);
          });
        });
      })
      .on('error', reject);
  });
}

(async () => {
  let downloaded = false;

  for (const target of TARGETS) {
    console.log(`[fetch-yolo] Target: ${target.label}`);
    for (const url of target.sources) {
      try {
        console.log(`[fetch-yolo] Trying ${url} ...`);
        const bytes = await fetchWithRedirect(url, target.dest);
        console.log(`[fetch-yolo] Downloaded ${bytes} bytes to ${target.dest}`);
        downloaded = true;
        break;
      } catch (err) {
        console.warn(`[fetch-yolo] Failed from ${url}:`, err.message);
      }
    }

    if (downloaded) {
      console.log(`[fetch-yolo] ✓ Completed for ${target.label}`);
      break;
    }

    if (!downloaded && target.optional) {
      console.warn(`[fetch-yolo] Optional target ${target.label} could not be fetched; trying fallback...`);
      continue;
    }
  }

  if (!downloaded) {
    console.error('[fetch-yolo] All download sources failed. Please check your network or provide the file manually.');
    process.exit(1);
  }
})();
