import { YOLODetector } from './detector.js';
import { TelemetryGenerator } from './telemetry.js';
import { UIController } from './ui.js';

const labelMap = {
  0: 'person', 1: 'bicycle', 2: 'car', 3: 'motorcycle', 4: 'airplane', 5: 'bus', 6: 'train', 7: 'truck', 8: 'boat', 9: 'traffic light',
};

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const sampleCanvas = document.getElementById('sample');

const ui = new UIController();
const detector = new YOLODetector(canvas, labelMap);
const telemetry = new TelemetryGenerator(sampleCanvas);

let running = false;
let detectionThreshold = 0.35;
let telemetryHistory = [];

window.yoloLoader = detector.loader;

detector.onStatus((status) => {
  ui.updateStatus(status);
  const backend = detector.getBackend();
  if (backend) {
    ui.updateBackend(backend.toUpperCase());
  }
});

ui.bind({
  toggle: toggle,
  threshold: (v) => detectionThreshold = v,
  modelChange: (v) => reloadModel(v),
  exportFrame: () => exportFrame(),
  exportTelemetry: () => exportTelemetry(),
});

ui.updateStatus('IDLE');
ui.updateBackend('detecting…');
ui.updateClock();
setInterval(() => ui.updateClock(), 1000);

async function reloadModel(variant) {
  try {
    await initializeYOLO(variant);
  } catch (e) {
    ui.updateStatus('ERROR');
  }
}

function toggle() {
  if (running) {
    running = false;
    ui.setRunning(false);
    return;
  }
  start();
}

async function start() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    await reloadModel('yolov8n');
    running = true;
    ui.setRunning(true);
    loop();
  } catch (err) {
    console.error(err);
    ui.updateStatus('CAMERA_ERROR');
  }
}

async function loop() {
  if (!running) return;
  try {
    const detections = await detector.detectFrame(video, detectionThreshold);
    detector.renderFrame(video, detections);

    const stats = summarizeDetections(detections);
    const panelData = telemetry.generate(video, stats);
    ui.updateTelemetry(
      panelData.panel,
      formatMetrics(panelData.metrics),
      panelData.overlays
    );
    ui.updatePerformance({ inferenceTime: detector.inferenceTime, fps: detector.fps });

    telemetryHistory.push({ ...panelData.metrics, timestamp: Date.now() });
    if (telemetryHistory.length > 300) telemetryHistory.shift();
  } catch (error) {
    console.error('Detection failed:', error);
  }

  requestAnimationFrame(loop);
}

async function initializeYOLO(modelVariant = 'yolov8n') {
  ui.updateStatus('LOADING');
  updateModelStatus?.('Loading YOLO model...');

  const loadPromise = detector.loadModel(modelVariant);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Model load timeout')), 30000)
  );

  try {
    await Promise.race([loadPromise, timeoutPromise]);
    ui.updateStatus('READY');
    modelReady?.();
  } catch (error) {
    console.error('Model initialization failed:', error);
    modelError?.(error);
    ui.updateStatus('ERROR');
    // Optional: place holder for COCO-SSD fallback
    throw error;
  }
}

function summarizeDetections(detections) {
  const counts = {};
  let avg = 0;
  detections.forEach((det) => {
    const name = labelMap[det.classId] || `cls${det.classId}`;
    counts[name] = (counts[name] || 0) + 1;
    avg += det.score;
  });
  avg = detections.length ? avg / detections.length : 0;
  const topClasses = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  return { detections, avgConfidence: avg, topClasses, countsByClass: counts };
}

function formatMetrics(metrics) {
  return {
    ambient: `${metrics.ambientPercent.toFixed(1)} % / min ${metrics.min.toFixed(0)} / max ${metrics.max.toFixed(0)}`,
    contrast: `std ${metrics.stddev.toFixed(1)} / motion ${metrics.motionScore.toFixed(1)}`,
    color: `R ${metrics.rMean.toFixed(1)} / G ${metrics.gMean.toFixed(1)} / B ${metrics.bMean.toFixed(1)}`,
    ev: metrics.ev,
  };
}

function exportFrame() {
  const link = document.createElement('a');
  link.download = `yolo-frame-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function exportTelemetry() {
  const header = 'timestamp,ambientPercent,stddev,motionScore,rMean,gMean,bMean,ev\n';
  const lines = telemetryHistory.map((row) => [
    row.timestamp,
    row.ambientPercent?.toFixed?.(2),
    row.stddev?.toFixed?.(2),
    row.motionScore?.toFixed?.(2),
    row.rMean?.toFixed?.(2),
    row.gMean?.toFixed?.(2),
    row.bMean?.toFixed?.(2),
    row.ev
  ].join(','));
  const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'telemetry.csv';
  link.click();
}
