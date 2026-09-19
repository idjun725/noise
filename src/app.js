import { computeDisturbanceIndex, indexToDb, indexToScore, DEFAULT_PARAMS } from './indexCalculator.js';
import { classifyNoise } from './noiseClassifier.js';

const FFT_SIZE = 4096;
const PARAMS_KEY = 'noise-app-params';
const REPORTS_KEY = 'noise-app-reports';
const SMOOTHING = 0.3; // 지수이동평균 계수 (0~1, 클수록 최신 값에 민감)

const els = {
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  reportBtn: document.getElementById('reportBtn'),
  exportBtn: document.getElementById('exportBtn'),
  status: document.getElementById('status'),
  errorBox: document.getElementById('errorBox'),
  iRaw: document.getElementById('iRaw'),
  iDb: document.getElementById('iDb'),
  scoreBar: document.getElementById('scoreBar'),
  scoreValue: document.getElementById('scoreValue'),
  dominantFreq: document.getElementById('dominantFreq'),
  sourceLabel: document.getElementById('sourceLabel'),
  sourceDesc: document.getElementById('sourceDesc'),
  spectrumCanvas: document.getElementById('spectrumCanvas'),
  reportsBody: document.getElementById('reportsBody'),
  fc: document.getElementById('fc'),
  fcValue: document.getElementById('fcValue'),
  f0: document.getElementById('f0'),
  f0Value: document.getElementById('f0Value'),
  gamma: document.getElementById('gamma'),
  gammaValue: document.getElementById('gammaValue'),
};

const state = {
  audioCtx: null,
  stream: null,
  processor: null,
  source: null,
  silentGain: null,
  params: loadParams(),
  reports: loadReports(),
  smoothedI: null,
  latest: null, // 최근 계산 결과 (신고 버튼에서 사용)
};

function loadParams() {
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    if (!raw) return { ...DEFAULT_PARAMS };
    return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

function saveParams() {
  try {
    localStorage.setItem(PARAMS_KEY, JSON.stringify(state.params));
  } catch {
    // localStorage 사용 불가 환경(프라이빗 모드 등)에서는 조용히 무시
  }
}

function loadReports() {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReports() {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(state.reports));
  } catch {
    // 무시
  }
}

function setError(message) {
  els.errorBox.textContent = message ?? '';
  els.errorBox.hidden = !message;
}

function initParamControls() {
  els.fc.value = state.params.fc;
  els.f0.value = state.params.f0;
  els.gamma.value = state.params.gamma;
  syncParamLabels();

  els.fc.addEventListener('input', () => {
    state.params.fc = Number(els.fc.value);
    syncParamLabels();
    saveParams();
  });
  els.f0.addEventListener('input', () => {
    state.params.f0 = Number(els.f0.value);
    syncParamLabels();
    saveParams();
  });
  els.gamma.addEventListener('input', () => {
    state.params.gamma = Number(els.gamma.value);
    syncParamLabels();
    saveParams();
  });
}

function syncParamLabels() {
  els.fcValue.textContent = `${state.params.fc} Hz`;
  els.f0Value.textContent = `${state.params.f0} Hz`;
  els.gammaValue.textContent = state.params.gamma.toFixed(1);
}

async function startCapture() {
  setError(null);
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    setError(`마이크 접근에 실패했습니다: ${err.message}`);
    return;
  }

  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.source = state.audioCtx.createMediaStreamSource(state.stream);
  // ScriptProcessorNode는 표준상 폐기 예정(deprecated)이지만 별도 번들러 없이
  // 가장 간단하게 원시 PCM 프레임을 얻을 수 있어 이 MVP에서 사용한다.
  state.processor = state.audioCtx.createScriptProcessor(FFT_SIZE, 1, 1);
  // 마이크 소리가 스피커로 그대로 재생되지 않도록 무음 게인을 거쳐 destination에 연결한다.
  state.silentGain = state.audioCtx.createGain();
  state.silentGain.gain.value = 0;

  state.processor.onaudioprocess = (event) => {
    const samples = event.inputBuffer.getChannelData(0);
    processFrame(samples, state.audioCtx.sampleRate);
  };

  state.source.connect(state.processor);
  state.processor.connect(state.silentGain);
  state.silentGain.connect(state.audioCtx.destination);

  state.smoothedI = null;
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.reportBtn.disabled = false;
  els.status.textContent = '측정 중...';
}

function stopCapture() {
  if (state.processor) {
    state.processor.onaudioprocess = null;
    state.processor.disconnect();
  }
  if (state.source) state.source.disconnect();
  if (state.silentGain) state.silentGain.disconnect();
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  if (state.audioCtx) state.audioCtx.close();

  state.processor = null;
  state.source = null;
  state.silentGain = null;
  state.stream = null;
  state.audioCtx = null;

  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  els.reportBtn.disabled = true;
  els.status.textContent = '정지됨';
}

function processFrame(samples, sampleRate) {
  const result = computeDisturbanceIndex(samples, sampleRate, state.params);
  state.smoothedI =
    state.smoothedI === null ? result.I : state.smoothedI * (1 - SMOOTHING) + result.I * SMOOTHING;

  const iDb = indexToDb(state.smoothedI);
  const score = indexToScore(state.smoothedI);
  const classification = classifyNoise(result.dominant.freq);

  state.latest = {
    I: state.smoothedI,
    iDb,
    score,
    dominantFreq: result.dominant.freq,
    source: classification.label,
  };

  els.iRaw.textContent = state.smoothedI.toExponential(3);
  els.iDb.textContent = `${iDb.toFixed(1)} dB`;
  els.scoreBar.style.width = `${score}%`;
  els.scoreValue.textContent = `${score.toFixed(0)} / 100`;
  els.dominantFreq.textContent = `${result.dominant.freq.toFixed(0)} Hz`;
  els.sourceLabel.textContent = classification.label;
  els.sourceDesc.textContent = classification.description;

  drawSpectrum(result.bins);
}

function drawSpectrum(bins) {
  const canvas = els.spectrumCanvas;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const maxFreqDisplay = 5000;
  const bucketCount = 80;
  const sums = new Float64Array(bucketCount);
  const counts = new Int32Array(bucketCount);

  for (const bin of bins) {
    if (bin.freq <= 0 || bin.freq > maxFreqDisplay) continue;
    let idx = Math.floor((bin.freq / maxFreqDisplay) * bucketCount);
    if (idx >= bucketCount) idx = bucketCount - 1;
    sums[idx] += bin.magnitude;
    counts[idx] += 1;
  }

  let maxVal = 0;
  const averaged = new Float64Array(bucketCount);
  for (let i = 0; i < bucketCount; i++) {
    averaged[i] = counts[i] > 0 ? sums[i] / counts[i] : 0;
    maxVal = Math.max(maxVal, averaged[i]);
  }

  const bucketWidth = width / bucketCount;
  ctx.fillStyle = '#4f83cc';
  for (let i = 0; i < bucketCount; i++) {
    const barHeight = maxVal > 0 ? (averaged[i] / maxVal) * height : 0;
    ctx.fillRect(i * bucketWidth, height - barHeight, Math.max(bucketWidth - 1, 1), barHeight);
  }
}

function addReport() {
  if (!state.latest) return;
  const report = {
    timestamp: new Date().toISOString(),
    I: state.latest.I,
    iDb: state.latest.iDb,
    score: state.latest.score,
    dominantFreq: state.latest.dominantFreq,
    source: state.latest.source,
    params: { ...state.params },
  };
  state.reports.unshift(report);
  saveReports();
  renderReports();
}

function renderReports() {
  els.reportsBody.innerHTML = '';
  for (const r of state.reports) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.timestamp).toLocaleString()}</td>
      <td>${r.score.toFixed(0)}</td>
      <td>${r.iDb.toFixed(1)} dB</td>
      <td>${r.dominantFreq.toFixed(0)} Hz</td>
      <td>${r.source}</td>
    `;
    els.reportsBody.appendChild(tr);
  }
}

function exportReportsCsv() {
  const header = 'timestamp,score,I_dB,dominant_freq_hz,source,fc,f0,gamma\n';
  const rows = state.reports.map((r) =>
    [r.timestamp, r.score.toFixed(1), r.iDb.toFixed(2), r.dominantFreq.toFixed(1), r.source, r.params.fc, r.params.f0, r.params.gamma].join(',')
  );
  const csv = header + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noise-reports-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

els.startBtn.addEventListener('click', startCapture);
els.stopBtn.addEventListener('click', stopCapture);
els.reportBtn.addEventListener('click', addReport);
els.exportBtn.addEventListener('click', exportReportsCsv);

initParamControls();
renderReports();
