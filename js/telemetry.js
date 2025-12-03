const SAMPLE_W = 160;
const SAMPLE_H = 120;

export class TelemetryGenerator {
  constructor(sampleCanvas) {
    this.sampleCanvas = sampleCanvas;
    this.sampleCtx = sampleCanvas.getContext('2d');
    this.lastBrightness = null;
  }

  /**
   * Compute telemetry strings and aggregates from detections and the current video frame.
   * @param {HTMLVideoElement} video
   * @param {{detections: any[], avgConfidence: number, topClasses: string[], countsByClass: Record<string, number>}} detectionStats
   */
  generate(video, detectionStats) {
    const metrics = this.#computeMetrics(video);
    const density = detectionStats?.detections?.length || 0;
    const weightedAmbient = metrics.mean * (1 + density * 0.1);
    const panel = this.#derivePanel(metrics, detectionStats.avgConfidence, weightedAmbient);
    const ev = this.#evCode(metrics, detectionStats.avgConfidence, weightedAmbient);

    const ambientPercent = (weightedAmbient / 255) * 100;
    return {
      panel,
      metrics: {
        ambientPercent,
        min: metrics.min,
        max: metrics.max,
        stddev: metrics.stddev,
        motionScore: metrics.motionScore,
        rMean: metrics.rMean,
        gMean: metrics.gMean,
        bMean: metrics.bMean,
        ev
      },
      overlays: this.#overlayStats(detectionStats)
    };
  }

  #computeMetrics(video) {
    this.sampleCtx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = this.sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const pixelCount = SAMPLE_W * SAMPLE_H;

    let sum = 0;
    let sumSq = 0;
    let min = 255;
    let max = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    let motionAccum = 0;

    const currentBrightness = new Float32Array(pixelCount);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      currentBrightness[p] = brightness;
      sum += brightness;
      sumSq += brightness * brightness;
      if (brightness < min) min = brightness;
      if (brightness > max) max = brightness;
      rSum += r; gSum += g; bSum += b;
      if (this.lastBrightness && this.lastBrightness[p] !== undefined) {
        motionAccum += Math.abs(brightness - this.lastBrightness[p]);
      }
    }

    const mean = sum / pixelCount;
    const variance = sumSq / pixelCount - mean * mean;
    const stddev = Math.sqrt(Math.max(variance, 0));
    const motionScore = this.lastBrightness ? (motionAccum / (pixelCount * 255)) * 100 : 0;
    this.lastBrightness = currentBrightness;

    return {
      mean,
      min,
      max,
      stddev,
      motionScore,
      rMean: rSum / pixelCount,
      gMean: gSum / pixelCount,
      bMean: bSum / pixelCount,
    };
  }

  #derivePanel(metrics, avgConfidence, weightedAmbient) {
    const ambientPercent = (weightedAmbient / 255) * 100;
    const motionCode = metrics.motionScore < 1 ? 'S' : metrics.motionScore < 5 ? 'M' : 'A';
    const contrastCode = metrics.stddev < 15 ? 'L' : metrics.stddev < 40 ? 'M' : 'H';
    const confidenceStr = `CONF:${avgConfidence.toFixed(2)}`;

    return [
      `H ${this.#toPercent(ambientPercent)}%`,
      `E ${SAMPLE_W}x${SAMPLE_H}/${motionCode}${contrastCode}/${confidenceStr}`,
      `S ${avgConfidence > 0 ? 'LIVE' : 'IDLE'}`,
      `EV ${this.#evCode(metrics, avgConfidence, weightedAmbient)}`
    ].join('\n');
  }

  #evCode(metrics, avgConfidence, weightedAmbient) {
    const ambientPercent = (weightedAmbient / 255) * 100;
    const envCode = ambientPercent < 20 ? 'DK' : ambientPercent > 80 ? 'BR' : 'NM';
    const bias = this.#bias(metrics);
    let evScore = envCode === 'DK' ? 40 : envCode === 'BR' ? 70 : 55;
    let suffix = '';
    if (avgConfidence > 0.85) {
      evScore += 5;
      suffix = '_HIGH_CONF';
    }
    return `${evScore}_${bias}${suffix}`;
  }

  #bias(metrics) {
    const { rMean, gMean, bMean } = metrics;
    const rg = rMean - gMean;
    const gb = gMean - bMean;
    const rb = rMean - bMean;
    const threshold = 5;
    if (rg > threshold && rb > threshold) return 'R';
    if (gb > threshold && -rg > threshold) return 'G';
    if (-rb > threshold && -gb > threshold) return 'B';
    return 'N';
  }

  #overlayStats({ topClasses, countsByClass, avgConfidence }) {
    const entries = Object.entries(countsByClass || {});
    const totals = entries.map(([cls, count]) => `${cls}:${count}`).join(' ');
    const top = (topClasses || []).slice(0, 3).join(', ');
    return {
      top,
      totals,
      avgConfidence: avgConfidence.toFixed(2)
    };
  }

  #toPercent(value) {
    return Math.min(100, Math.max(0, value)).toFixed(1);
  }
}
