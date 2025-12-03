/**
 * YOLOLoader is responsible for loading YOLOv8 ONNX models through onnxruntime-web.
 * The loader exposes a consistent detect API that returns boxes, scores, and class indices.
 */
export class YOLOLoader {
  constructor() {
    this.session = null;
    this.ready = false;
    this.statusListener = null;
    this.modelVariant = 'yolov8n-quantized.onnx';
  }

  /**
   * Register a callback for status updates.
   * @param {(status: string) => void} listener
   */
  onStatus(listener) {
    this.statusListener = listener;
  }

  /**
   * Pick an optimal model based on GPU availability and user selection.
   * @param {string} userChoice
   * @returns {string}
   */
  resolveModelPath(userChoice) {
    const gpuCapable = () => typeof navigator !== 'undefined' && !!navigator.gpu;
    const preferred = userChoice || this.modelVariant;
    const base = 'models/';

    if (gpuCapable()) {
      return `${base}yolov8n.onnx`;
    }
    if (preferred === 'yolov8m') return `${base}yolov8m.onnx`;
    if (preferred === 'yolov8l') return `${base}yolov8l.onnx`;
    if (preferred === 'yolov8n') return `${base}yolov8n.onnx`;
    return `${base}yolov8n-quantized.onnx`;
  }

  /**
   * Load an ONNX model using ort.InferenceSession.
   * @param {string} modelVariant
   */
  async load(modelVariant = 'yolov8n') {
    if (!window.ort) {
      throw new Error('onnxruntime-web (ort.min.js) is not available on window.');
    }
    this.modelVariant = modelVariant;
    const path = this.resolveModelPath(modelVariant);
    this.ready = false;
    this.#notify(`LOADING ${modelVariant}`);

    try {
      const start = performance.now();
      this.session = await ort.InferenceSession.create(path, {
        executionProviders: ['webgl', 'wasm']
      });
      const elapsed = Math.round(performance.now() - start);
      this.ready = true;
      this.#notify(`READY (${elapsed}ms)`);
    } catch (err) {
      console.error('YOLO load failed', err);
      this.ready = false;
      this.#notify('ERROR');
      throw err;
    }
  }

  /**
   * Run inference on an HTMLCanvasElement or HTMLVideoElement.
   * @param {HTMLCanvasElement|HTMLVideoElement} source
   * @returns {Promise<{boxes:number[][], scores:number[], classes:number[], inferenceTime:number}>}
   */
  async detect(source) {
    if (!this.session) throw new Error('Model is not loaded yet');
    const [inputTensor, meta] = this.#preprocess(source);

    const feeds = { [this.session.inputNames[0]]: inputTensor };
    const start = performance.now();
    const results = await this.session.run(feeds);
    const inferenceTime = performance.now() - start;
    const output = results[this.session.outputNames[0]];
    const parsed = this.#postprocess(output, meta);
    return { ...parsed, inferenceTime };
  }

  #preprocess(source) {
    const size = 640; // default YOLOv8 input
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const float = new Float32Array(size * size * 3);
    for (let i = 0, p = 0; i < data.length; i += 4) {
      float[p++] = data[i] / 255;     // R
      float[p++] = data[i + 1] / 255; // G
      float[p++] = data[i + 2] / 255; // B
    }
    const inputTensor = new ort.Tensor('float32', float, [1, 3, size, size]);
    return [inputTensor, { ratioX: source.videoWidth ? source.videoWidth / size : source.width / size, ratioY: source.videoHeight ? source.videoHeight / size : source.height / size }];
  }

  #postprocess(output, meta) {
    // YOLOv8 ONNX export typically returns [1, 84, N]
    const data = output.data;
    const [batch, channels, elements] = output.dims;
    if (channels < 84) return { boxes: [], scores: [], classes: [] };

    const boxes = [];
    const scores = [];
    const classes = [];

    for (let i = 0; i < elements; i++) {
      const x = data[i];
      const y = data[elements + i];
      const w = data[2 * elements + i];
      const h = data[3 * elements + i];
      let maxScore = -Infinity;
      let cls = -1;
      for (let c = 4; c < channels; c++) {
        const score = data[c * elements + i];
        if (score > maxScore) {
          maxScore = score;
          cls = c - 4;
        }
      }
      if (maxScore > 0) {
        boxes.push([
          (x - w / 2) * meta.ratioX,
          (y - h / 2) * meta.ratioY,
          w * meta.ratioX,
          h * meta.ratioY
        ]);
        scores.push(maxScore);
        classes.push(cls);
      }
    }

    return { boxes, scores, classes };
  }

  #notify(status) {
    if (this.statusListener) this.statusListener(status);
  }
}
