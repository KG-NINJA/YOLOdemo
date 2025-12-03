export class UIController {
  constructor() {
    this.elements = this.#grabElements();
    this.modelStatus = 'IDLE';
    this.backend = 'CPU';
    this.onToggle = null;
    this.onThresholdChange = null;
    this.onModelChange = null;
    this.onExportFrame = null;
    this.onExportTelemetry = null;
  }

  bind({ toggle, threshold, modelChange, exportFrame, exportTelemetry }) {
    this.onToggle = toggle;
    this.onThresholdChange = threshold;
    this.onModelChange = modelChange;
    this.onExportFrame = exportFrame;
    this.onExportTelemetry = exportTelemetry;
    this.#wireEvents();
  }

  #wireEvents() {
    this.elements.toggleBtn.addEventListener('click', () => this.onToggle?.());
    this.elements.threshold.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      this.elements.thresholdVal.textContent = `${Math.round(v * 100)}%`;
      this.onThresholdChange?.(v);
    });
    this.elements.modelSelect.addEventListener('change', (e) => this.onModelChange?.(e.target.value));
    this.elements.exportFrame.addEventListener('click', () => this.onExportFrame?.());
    this.elements.exportTelemetry.addEventListener('click', () => this.onExportTelemetry?.());
  }

  updateStatus(text) {
    this.modelStatus = text;
    this.elements.modelStatus.textContent = text;
  }

  updateBackend(text) {
    this.backend = text;
    this.elements.backend.textContent = text;
  }

  setRunning(running) {
    this.elements.toggleBtn.textContent = running ? '停止' : '開始';
    this.elements.status.textContent = running ? 'LIVE' : '待機中';
  }

  updateClock() {
    const now = new Date();
    const pad = (n) => `${n}`.padStart(2, '0');
    this.elements.clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  updateTelemetry(panelText, metricText, detectionOverlay) {
    this.elements.panel.textContent = panelText;
    this.elements.ambient.textContent = metricText.ambient;
    this.elements.contrast.textContent = metricText.contrast;
    this.elements.color.textContent = metricText.color;
    this.elements.ev.textContent = `EV ${metricText.ev}`;
    this.elements.detectionSummary.textContent = `Top: ${detectionOverlay.top || '--'} / Total ${detectionOverlay.totals || '--'} / Avg ${detectionOverlay.avgConfidence}`;
  }

  updatePerformance({ inferenceTime, fps }) {
    this.elements.performance.textContent = `Inference: ${inferenceTime.toFixed(1)} ms · FPS ${fps.toFixed(1)}`;
  }

  #grabElements() {
    return {
      toggleBtn: document.getElementById('toggle'),
      status: document.getElementById('status'),
      clock: document.getElementById('clock'),
      threshold: document.getElementById('threshold'),
      thresholdVal: document.getElementById('thVal'),
      modelSelect: document.getElementById('modelSelect'),
      panel: document.getElementById('panel-text'),
      ambient: document.getElementById('ambient'),
      contrast: document.getElementById('contrast'),
      color: document.getElementById('color'),
      ev: document.getElementById('evCode'),
      performance: document.getElementById('performance'),
      detectionSummary: document.getElementById('detectionSummary'),
      modelStatus: document.getElementById('modelStatus'),
      backend: document.getElementById('backend'),
      exportFrame: document.getElementById('exportFrame'),
      exportTelemetry: document.getElementById('exportTelemetry'),
    };
  }
}
