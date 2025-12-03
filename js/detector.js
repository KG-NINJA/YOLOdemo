import { YOLOLoader } from './yolo-loader.js';

const COLOR_PALETTE = ['#6dd3ff', '#6fff9c', '#f6c177', '#ff9bd1', '#c9b6ff', '#ffb86c'];

/**
 * YOLODetector wires the video feed into the YOLOLoader and handles drawing results.
 */
export class YOLODetector {
  constructor(canvas, labelMap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.labelMap = labelMap;
    this.loader = new YOLOLoader();
    this.lastDetections = [];
    this.inferenceTime = 0;
    this.fps = 0;
    this.lastFrameAt = performance.now();
  }

  onStatus(listener) {
    this.loader.onStatus(listener);
  }

  async loadModel(variant) {
    await this.loader.load(variant);
  }

  async detectFrame(video, threshold = 0.35) {
    if (!this.loader.ready) return [];
    const { boxes, scores, classes, inferenceTime } = await this.loader.detect(video);
    this.inferenceTime = inferenceTime;
    const now = performance.now();
    this.fps = 1000 / Math.max(1, now - this.lastFrameAt);
    this.lastFrameAt = now;

    const detections = [];
    for (let i = 0; i < boxes.length; i++) {
      if (scores[i] < threshold) continue;
      detections.push({
        box: boxes[i],
        score: scores[i],
        classId: classes[i]
      });
    }
    this.lastDetections = detections;
    return detections;
  }

  renderFrame(video, detections) {
    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

    detections.forEach((det, idx) => {
      const [x, y, w, h] = det.box;
      const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(x, y, w, h);
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.fillRect(x, y - 22, w, 22);
      this.ctx.fillStyle = color;
      this.ctx.font = '14px "Roboto Mono", monospace';
      this.ctx.fillText(this.#label(det), x + 4, y - 6);
    });
  }

  #label(det) {
    const className = this.labelMap[det.classId] || `cls${det.classId}`;
    const score = det.score.toFixed(2);
    return `${className} ${score}`;
  }
}
