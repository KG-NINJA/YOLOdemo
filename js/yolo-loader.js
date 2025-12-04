/**
 * YOLOLoader is responsible for loading YOLOv8 ONNX models through onnxruntime-web.
 * The loader exposes a consistent detect API that returns boxes, scores, and class indices.
 */
export class YOLOLoader {
  constructor() {
    this.session = null;
    this.ready = false;
    this.statusListener = null;
    this.modelVariant = 'yolov8n';
    this.activeProvider = 'wasm';
    this.modelPath = './models/yolov8n-quantized.onnx';
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
    const preferred = userChoice || this.modelVariant;
    const base = 'models/';

    // CPU/WASM 専用: 量子化版を優先し、無い場合は通常版にフォールバック
    if (preferred === 'yolov8m') return `${base}yolov8m.onnx`;
    if (preferred === 'yolov8l') return `${base}yolov8l.onnx`;
    if (preferred === 'yolov8n') return `${base}yolov8n-quantized.onnx`;
    return `${base}yolov8n-quantized.onnx`;
  }

  /**
   * Load an ONNX model using ort.InferenceSession.
   * @param {string} modelVariant
   */
  async load(modelVariant = 'yolov8n', modelPath = null) {
    if (!window.ort) {
      throw new Error('onnxruntime-web (ort.min.js) is not available on window.');
    }
    this.modelVariant = modelVariant;
    this.ready = false;

    const preferredPath = modelPath || this.resolveModelPath(modelVariant);
    const fallbackLocalPaths = [];
    if (!modelPath && modelVariant === 'yolov8n') {
      // If the quantized file is missing, try the standard Nano model before hitting the CDN.
      fallbackLocalPaths.push('models/yolov8n.onnx');
    }

    const candidatePaths = [preferredPath, ...fallbackLocalPaths];
    const providers = await this.#availableProviders();
    let lastError = null;

    for (const candidate of candidatePaths) {
      this.modelPath = candidate;
      this.#notify(`LOADING ${modelVariant}`);
      console.log('[YOLO Loader] Attempting to load YOLO from:', candidate);
      try {
        const bufferResult = await this.#fetchModelBuffer(candidate);
        const start = performance.now();
        this.session = await ort.InferenceSession.create(bufferResult, {
          executionProviders: providers,
          graphOptimizationLevel: 'all'
        });
        const elapsed = Math.round(performance.now() - start);
        this.activeProvider = this.session.executionProvider || providers[0] || 'wasm';
        this.ready = true;
        this.#notify(`READY (${this.activeProvider}, ${elapsed}ms)`);
        console.log('✓ YOLO model loaded successfully', `(provider: ${this.activeProvider}, ${elapsed}ms)`);
        return this.session;
      } catch (error) {
        lastError = error;
        console.error('Failed to load from local path:', error);
      }
    }

    updateModelStatus?.('Local load failed, trying CDN...');
    try {
      const session = await this.#loadFromCDN();
      this.ready = true;
      return session;
    } catch (cdnErr) {
      this.ready = false;
      this.#notify('ERROR');
      console.error('CDN load failed:', cdnErr);
      throw lastError || new Error('Could not load YOLO model from local or CDN');
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
    const width = source.videoWidth || source.width;
    const height = source.videoHeight || source.height;

    // Letterbox resize to preserve aspect ratio (prevents warped detections)
    const scale = Math.min(size / width, size / height);
    const newW = Math.round(width * scale);
    const newH = Math.round(height * scale);
    const padX = Math.floor((size - newW) / 2);
    const padY = Math.floor((size - newH) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, width, height, padX, padY, newW, newH);
    const { data } = ctx.getImageData(0, 0, size, size);
    const float = new Float32Array(size * size * 3);
    for (let i = 0, p = 0; i < data.length; i += 4) {
      float[p++] = data[i] / 255;     // R
      float[p++] = data[i + 1] / 255; // G
      float[p++] = data[i + 2] / 255; // B
    }
    const inputTensor = new ort.Tensor('float32', float, [1, 3, size, size]);
    return [inputTensor, { scale, padX, padY, width, height }];
  }

  #postprocess(output, meta) {
    // YOLOv8 ONNX export typically returns either [1, 84, N] (channel-first)
    // or [1, N, 84] (channel-last). Handle both to avoid silent failures.
    const data = output.data;
    const dims = output.dims;
    if (dims.length !== 3) return { boxes: [], scores: [], classes: [] };

    const channelFirst = dims[1] === 84; // 1 x 84 x N
    const elements = channelFirst ? dims[2] : dims[1];
    const channels = channelFirst ? dims[1] : dims[2];
    if (channels < 20) return { boxes: [], scores: [], classes: [] }; // sanity check

    const getVal = (c, i) => channelFirst ? data[c * elements + i] : data[i * channels + c];

    const boxes = [];
    const scores = [];
    const classes = [];

    for (let i = 0; i < elements; i++) {
      const x = getVal(0, i);
      const y = getVal(1, i);
      const w = getVal(2, i);
      const h = getVal(3, i);
      const obj = this.#sigmoid(getVal(4, i));
      let maxScore = -Infinity;
      let cls = -1;
      for (let c = 5; c < channels; c++) {
        const clsProb = this.#sigmoid(getVal(c, i)) * obj;
        if (clsProb > maxScore) {
          maxScore = clsProb;
          cls = c - 5;
        }
      }
      if (maxScore > 0.25 && w > 0 && h > 0) {
        // Undo letterbox + scale
        const bx = (x - w / 2 - meta.padX) / meta.scale;
        const by = (y - h / 2 - meta.padY) / meta.scale;
        const bw = w / meta.scale;
        const bh = h / meta.scale;
        // clamp to frame bounds to avoid NaN/overflow drawing
        const clampedX = Math.max(0, Math.min(meta.width, bx));
        const clampedY = Math.max(0, Math.min(meta.height, by));
        const clampedW = Math.max(0, Math.min(meta.width - clampedX, bw));
        const clampedH = Math.max(0, Math.min(meta.height - clampedY, bh));
        boxes.push([clampedX, clampedY, clampedW, clampedH]);
        scores.push(maxScore);
        classes.push(cls);
      }
    }

    return { boxes, scores, classes };
  }

  getBackend() {
    return this.activeProvider;
  }

  #notify(status) {
    if (this.statusListener) this.statusListener(status);
  }

  async #availableProviders() {
    // CPU 専用: 常に WASM プロバイダのみを返す
    return ['wasm'];
  }

  #sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  async #fetchModelBuffer(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    console.log('[YOLO Loader] Model file loaded, size:', arrayBuffer.byteLength, 'bytes');
    return new Uint8Array(arrayBuffer);
  }

  async #loadFromCDN() {
    console.log('[YOLO Loader] Attempting to load YOLO from CDN...');
    updateModelStatus?.('Fetching YOLO model from CDN...');
    const sources = [
      'https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n-quantized.onnx',
      'https://huggingface.co/onnx-community/YOLOv8/resolve/main/yolov8n-quantized.onnx',
      'https://huggingface.co/ultralytics/yolov8n/resolve/main/yolov8n-quantized.onnx',
      // Fallback to non-quantized if the CPU-friendly model is unavailable
      'https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.onnx',
      'https://huggingface.co/onnx-community/YOLOv8/resolve/main/yolov8n.onnx',
      'https://huggingface.co/ultralytics/yolov8n/resolve/main/yolov8n.onnx'
    ];

    let lastError = null;
    for (const cdnUrl of sources) {
      try {
        const response = await fetch(cdnUrl, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`CDN error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength < 1024 * 1024) {
          throw new Error('CDN response is unexpectedly small; aborting.');
        }
        console.log('[YOLO Loader] Model loaded from CDN, size:', arrayBuffer.byteLength, 'bytes');
        const providers = await this.#availableProviders();
        const start = performance.now();
        this.session = await ort.InferenceSession.create(new Uint8Array(arrayBuffer), {
          executionProviders: providers,
          graphOptimizationLevel: 'all'
        });
        const elapsed = Math.round(performance.now() - start);
        this.activeProvider = this.session.executionProvider || providers[0] || 'wasm';
        this.#notify(`READY (${this.activeProvider}, ${elapsed}ms)`);
        console.log('✓ YOLO model loaded successfully from CDN');
        return this.session;
      } catch (err) {
        lastError = err;
        console.warn(`[YOLO Loader] CDN attempt failed (${cdnUrl}):`, err);
      }
    }

    throw lastError || new Error('Could not fetch YOLO model from any CDN source');
  }
}
