(() => {
  const SAMPLE_W = 160;
  const SAMPLE_H = 120;
  const PANEL_INTERVAL = 300;
  const HR_SAMPLE_MS = 50;
  const HR_WINDOW_SEC = 12;
  const HR_MIN_HZ = 0.8;
  const HR_MAX_HZ = 3.0;
  const HR_STEP_HZ = 0.02;

  const $ = (sel) => document.querySelector(sel);
  const video = $('#video');
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const btn = $('#toggle');
  const statusEl = $('#status');
  const clockEl = $('#clock');
  const th = $('#threshold');
  const thVal = $('#thVal');
  const cooldown = $('#cooldown');
  const testSpeak = $('#testSpeak');
  const voiceModeSel = $('#voiceMode');
  const zone = $('#zone');
  const zoneVal = $('#zoneVal');
  const minArea = $('#minArea');
  const minVal = $('#minVal');
  const warningTextInput = $('#warningText');

  const panelText = $('#panel-text');
  const ambientEl = $('#ambient');
  const contrastEl = $('#contrast');
  const colorEl = $('#color');
  const phaseEl = $('#phase');
  const bpmEl = $('#bpm');
  const bpmPhraseEl = $('#bpmPhrase');

  const sampleCanvas = $('#sample');
  const sampleCtx = sampleCanvas.getContext('2d');

  let running = false;
  let sampleTimer = null;
  let hrTimer = null;
  let lastWarnAt = 0;
  let model = null;
  let lastBrightness = null;
  let lastHeartSpeakAt = 0;
  let heartSignal = [];
  let heartTime = [];

  const targetSet = new Set(['person', 'cat', 'dog']);
  const labelMap = {
    person: '人物',
    cat: '猫',
    dog: '犬',
  };

  const toPercent = (value) => Math.min(100, Math.max(0, value)).toFixed(1);

  const resetMetrics = () => {
    panelText.textContent = 'H ---%\nE ----\nS ----\nEV ---';
    ambientEl.textContent = '--.- % / min -- / max --';
    contrastEl.textContent = 'std --.- / motion --.-';
    colorEl.textContent = 'R --.- / G --.- / B --.-';
    phaseEl.textContent = 'IDLE';
    bpmEl.textContent = '-- bpm';
    bpmPhraseEl.textContent = '心拍計測が開始されると、状態に合わせたボイスが流れます。';
  };

  const computeMetrics = () => {
    if (!video.videoWidth || !video.videoHeight) return null;
    sampleCtx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
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

      rSum += r;
      gSum += g;
      bSum += b;

      if (lastBrightness && lastBrightness[p] !== undefined) {
        motionAccum += Math.abs(brightness - lastBrightness[p]);
      }
    }

    const mean = sum / pixelCount;
    const variance = sumSq / pixelCount - mean * mean;
    const stddev = Math.sqrt(Math.max(variance, 0));
    const motionScore = lastBrightness ? (motionAccum / (pixelCount * 255)) * 100 : 0;
    lastBrightness = currentBrightness;

    const rMean = rSum / pixelCount;
    const gMean = gSum / pixelCount;
    const bMean = bSum / pixelCount;

    return { mean, min, max, stddev, motionScore, rMean, gMean, bMean };
  };

  const deriveCodes = (metrics) => {
    const { mean, stddev, motionScore, rMean, gMean, bMean } = metrics;
    const ambientPercent = (mean / 255) * 100;
    const contrastCode = stddev < 15 ? 'L' : stddev < 40 ? 'M' : 'H';
    const motionCode = motionScore < 1 ? 'S' : motionScore < 5 ? 'M' : 'A';

    let bias = 'N';
    const rg = rMean - gMean;
    const gb = gMean - bMean;
    const rb = rMean - bMean;
    const threshold = 5;
    if (rg > threshold && rb > threshold) bias = 'R';
    else if (gb > threshold && -rg > threshold) bias = 'G';
    else if (-rb > threshold && -gb > threshold) bias = 'B';

    const envCode = ambientPercent < 20 ? 'DK' : ambientPercent > 80 ? 'BR' : 'NM';
    const ev = `${envCode}/${bias}`;

    const panel = [
      `H ${toPercent(ambientPercent)}%`,
      `E ${SAMPLE_W}x${SAMPLE_H} M${motionCode} C${contrastCode}`,
      `S ${running ? 'LIVE' : 'IDLE'}`,
      `EV ${ev}`
    ].join('\n');

    return { panel, ambientPercent, ev };
  };

  const updateMetrics = () => {
    if (!running) return;
    const metrics = computeMetrics();
    if (!metrics) return;
    const { mean, min, max, stddev, motionScore, rMean, gMean, bMean } = metrics;
    const { panel, ambientPercent, ev } = deriveCodes(metrics);

    panelText.textContent = panel;
    ambientEl.textContent = `${toPercent(ambientPercent)} % / min ${min.toFixed(0)} / max ${max.toFixed(0)}`;
    contrastEl.textContent = `std ${stddev.toFixed(1)} / motion ${motionScore.toFixed(1)}`;
    colorEl.textContent = `R ${rMean.toFixed(1)} / G ${gMean.toFixed(1)} / B ${bMean.toFixed(1)}`;
    phaseEl.textContent = `${running ? 'LIVE' : 'IDLE'} · EV ${ev}`;
  };

  const beep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const audioCtx = new Ctx();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = 1800;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      o.start();
      o.stop(audioCtx.currentTime + 0.42);
    } catch (_) { }
  };

  const speak = (text) => {
    try {
      const now = Date.now();
      const cooldownMs = Math.max(1000, Number(cooldown.value) * 1000);
      if (now - lastWarnAt < cooldownMs) return;
      if (voiceModeSel.value === 'tts') {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } else if (voiceModeSel.value === 'beep') {
        beep();
      }
      lastWarnAt = now;
    } catch (e) { }
  };

  const collectHeartSample = () => {
    if (!running || !video.videoWidth || !video.videoHeight) return;
    sampleCtx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const cx = Math.floor(SAMPLE_W * 0.25);
    const cy = Math.floor(SAMPLE_H * 0.25);
    const w = Math.floor(SAMPLE_W * 0.5);
    const h = Math.floor(SAMPLE_H * 0.5);
    const { data } = sampleCtx.getImageData(cx, cy, w, h);
    let gSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      gSum += data[i + 1];
    }
    const meanG = gSum / (data.length / 4);
    const now = performance.now();
    heartSignal.push(meanG);
    heartTime.push(now);

    // keep window
    const cutoff = now - HR_WINDOW_SEC * 1000;
    while (heartTime.length > 0 && heartTime[0] < cutoff) {
      heartTime.shift();
      heartSignal.shift();
    }
  };

  const estimateHeartRate = () => {
    if (heartSignal.length < 30) return null;
    const n = heartSignal.length;
    const durationSec = (heartTime[n - 1] - heartTime[0]) / 1000;
    if (durationSec < 4) return null;
    const mean = heartSignal.reduce((a, b) => a + b, 0) / n;
    const values = heartSignal.map((v) => v - mean);
    const dt = durationSec / (n - 1);
    let best = { f: 0, power: 0 };
    for (let f = HR_MIN_HZ; f <= HR_MAX_HZ; f += HR_STEP_HZ) {
      let re = 0, im = 0;
      const omega = -2 * Math.PI * f * dt;
      for (let i = 0; i < n; i++) {
        const phi = omega * i;
        re += values[i] * Math.cos(phi);
        im += values[i] * Math.sin(phi);
      }
      const power = (re * re + im * im) / n;
      if (power > best.power) {
        best = { f, power };
      }
    }
    if (best.f === 0) return null;
    return { bpm: Math.round(best.f * 60), strength: best.power };
  };

  const heartPhrase = (bpm) => {
    if (!bpm || Number.isNaN(bpm)) return '計測中...';
    if (bpm < 60) return 'リラックス状態です。穏やかな呼吸を維持しましょう。';
    if (bpm < 90) return '安定しています。このままキープ。';
    if (bpm < 110) return '少し高めです。深呼吸で落ち着けます。';
    return '高心拍を検知。少し休憩してください。';
  };

  const updateHeartRate = () => {
    const est = estimateHeartRate();
    if (!est) return;
    const { bpm, strength } = est;
    const phrase = heartPhrase(bpm);
    bpmEl.textContent = `${bpm} bpm`;
    bpmPhraseEl.textContent = phrase;

    const now = Date.now();
    if (strength > 0.1 && now - lastHeartSpeakAt > 8000) {
      speak(`心拍数 ${bpm}、${phrase}`);
      lastHeartSpeakAt = now;
    }
  };

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await new Promise((r) => (video.onloadedmetadata = () => r()));
    await video.play();
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
  };

  const draw = (preds) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    preds.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.class === 'person' ? '#ff4136' : '#2ecc40';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.strokeRect(x, y, w, h);
      const tag = `${p.class} ${(p.score * 100).toFixed(0)}%`;
      ctx.font = '16px sans-serif';
      const tw = ctx.measureText(tag).width + 8;
      ctx.globalAlpha = 0.7; ctx.fillRect(x, Math.max(0, y - 20), tw, 20); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.fillText(tag, x + 4, Math.max(14, y - 6));
    });

    const cw = canvas.width, ch = canvas.height;
    const m = (Number(zone.value) / 100);
    const ix = m * cw, iy = m * ch, iw = cw - ix * 2, ih = ch - iy * 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(ix, iy, iw, ih);
    ctx.setLineDash([]);

    const d = new Date();
    const fmt2 = (n) => (n < 10 ? '0' + n : '' + n);
    const ts = `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())} ${fmt2(d.getHours())}:${fmt2(d.getMinutes())}:${fmt2(d.getSeconds())}`;
    ctx.font = '16px sans-serif';
    const pad = 6;
    const boxW = ctx.measureText(ts).width + pad * 2;
    const boxH = 22;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(cw - boxW - 10, 10, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.fillText(ts, cw - boxW - 10 + pad, 10 + boxH - 6);
  };

  const loop = async () => {
    if (!running || !model) return;
    try {
      const detections = await model.detect(video);
      const cw = canvas.width || 1, ch = canvas.height || 1;
      const margin = Number(zone.value) / 100;
      const ix = margin * cw, iy = margin * ch, iw = cw - ix * 2, ih = ch - iy * 2;
      const minAreaPx = (Number(minArea.value) / 100) * cw * ch;

      const filtered = detections.filter((d) => {
        if (d.score < Number(th.value)) return false;
        if (!targetSet.has(d.class)) return false;
        const [x, y, w, h] = d.bbox;
        if (w * h < minAreaPx) return false;
        const cx = x + w / 2, cy = y + h / 2;
        if (!(cx >= ix && cx <= ix + iw && cy >= iy && cy <= iy + ih)) return false;
        return true;
      });

      draw(detections);
      if (filtered.length > 0) {
        const msg = (() => {
          const base = (warningTextInput.value || '警告：ここは立入禁止です。直ちに立ち去ってください。').trim();
          const counts = new Map();
          filtered.forEach((d) => {
            const label = labelMap[d.class] || d.class;
            counts.set(label, (counts.get(label) || 0) + 1);
          });
          if (counts.size === 0) return base;
          const parts = Array.from(counts.entries()).map(([label, count]) => (count > 1 ? `${label} ${count}件` : label));
          return `${base} 検知対象: ${parts.join('、')}。`;
        })();
        speak(msg);
        statusEl.textContent = `検知: ${filtered.length}件 / しきい値 ${Math.round(Number(th.value) * 100)}%`;
      } else {
        statusEl.textContent = `検知なし / しきい値 ${Math.round(Number(th.value) * 100)}%`;
      }
    } catch (e) { }
    requestAnimationFrame(loop);
  };

  th.addEventListener('input', () => (thVal.textContent = `${Math.round(Number(th.value) * 100)}%`));
  zone.addEventListener('input', () => (zoneVal.textContent = `${Number(zone.value)}`));
  minArea.addEventListener('input', () => (minVal.textContent = `${Number(minArea.value)}`));
  testSpeak.addEventListener('click', () => speak('テスト: 警告ボイスの確認です'));

  const fmt = (n) => (n < 10 ? '0' + n : '' + n);
  const tick = () => {
    const d = new Date();
    const s = `${d.getFullYear()}-${fmt(d.getMonth()+1)}-${fmt(d.getDate())} ${fmt(d.getHours())}:${fmt(d.getMinutes())}:${fmt(d.getSeconds())}`;
    if (clockEl) clockEl.textContent = s;
  };
  tick();
  setInterval(tick, 1000);

  document.querySelectorAll('.targets input[type="checkbox"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const c = e.target.value;
      if (e.target.checked) targetSet.add(c); else targetSet.delete(c);
    });
  });

  const startMetrics = () => {
    if (sampleTimer) clearInterval(sampleTimer);
    sampleTimer = setInterval(updateMetrics, PANEL_INTERVAL);
    if (hrTimer) clearInterval(hrTimer);
    hrTimer = setInterval(() => {
      collectHeartSample();
      updateHeartRate();
    }, HR_SAMPLE_MS);
  };

  const stopMetrics = () => {
    if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
    if (hrTimer) { clearInterval(hrTimer); hrTimer = null; }
    lastBrightness = null;
    heartSignal = [];
    heartTime = [];
    lastHeartSpeakAt = 0;
    resetMetrics();
  };

  btn.addEventListener('click', async () => {
    if (!running) {
      try {
        statusEl.textContent = 'モデル読込中...';
        if (!model) {
          model = await cocoSsd.load({ modelUrl: './models/coco-ssd/model.json' });
        }
        statusEl.textContent = 'カメラ初期化中...';
        await startCamera();
        running = true;
        btn.textContent = '停止';
        statusEl.textContent = '稼働中';
        phaseEl.textContent = 'LIVE';
        startMetrics();
        requestAnimationFrame(loop);
      } catch (e) {
        statusEl.textContent = `エラー: ${e?.message || e}`;
        running = false; btn.textContent = '開始';
        stopMetrics();
      }
    } else {
      running = false;
      btn.textContent = '開始';
      const tracks = (video.srcObject && video.srcObject.getTracks && video.srcObject.getTracks()) || [];
      tracks.forEach((t) => t.stop());
      video.srcObject = null;
      stopMetrics();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
    }
  });

  resetMetrics();
})();
