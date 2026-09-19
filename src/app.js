import { MIN_ANALYSIS_DURATION_SEC } from './config.js';

const els = {
  screens: document.querySelectorAll('.screen'),
  navButtons: document.querySelectorAll('[data-nav]'),

  recordStartBtn: document.getElementById('recordStartBtn'),
  recordStopBtn: document.getElementById('recordStopBtn'),
  recordTimer: document.getElementById('recordTimer'),
  recordMessage: document.getElementById('recordMessage'),
  recordResult: document.getElementById('recordResult'),

  uploadInput: document.getElementById('uploadInput'),
  uploadAnalyzeBtn: document.getElementById('uploadAnalyzeBtn'),
  uploadMessage: document.getElementById('uploadMessage'),
  uploadResult: document.getElementById('uploadResult'),

  refreshResultsBtn: document.getElementById('refreshResultsBtn'),
  resultsList: document.getElementById('resultsList'),
};

const recordState = {
  mediaRecorder: null,
  chunks: [],
  stream: null,
  startedAt: null,
  timerHandle: null,
};

function showScreen(id) {
  els.screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
}

els.navButtons.forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.nav));
});

function setMessage(el, text) {
  el.textContent = text ?? '';
  el.hidden = !text;
}

// 업로드/녹음된 오디오를 디코딩하여 모노 PCM 샘플로 변환한다.
async function decodeAudioBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const { numberOfChannels, length, sampleRate, duration } = audioBuffer;
    const mono = new Float32Array(length);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
    }
    return { samples: mono, sampleRate, durationSec: duration };
  } finally {
    audioCtx.close();
  }
}

async function analyzeViaBackend(samples, sampleRate, durationSec, source) {
  const params = new URLSearchParams({
    sampleRate: String(sampleRate),
    duration: String(durationSec),
    source,
  });
  const response = await fetch(`/api/analyze?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: samples.buffer,
  });
  const body = await response.json();
  if (!response.ok) {
    const err = new Error(body.error ?? 'analyze_failed');
    err.body = body;
    throw err;
  }
  return body;
}

function renderAnalysisSummary(container, record) {
  container.hidden = false;
  container.innerHTML = `
    <div class="fields">
      <div><div class="label">녹음 길이</div><div class="value">${record.durationSec.toFixed(1)}초</div></div>
      <div><div class="label">소음 데시벨(dB 환산)</div><div class="value">${record.iDb.toFixed(1)} dB</div></div>
      <div><div class="label">소음 원인(추정)</div><div class="value">${record.noiseSource.label}</div></div>
    </div>
  `;
}

function formatTooShortMessage(minDurationSec) {
  return `분석이 불가능합니다: 최소 ${minDurationSec}초 이상 녹음/업로드해야 합니다.`;
}

// ---------- 화면 1: 실시간 녹음 ----------

function updateRecordTimer() {
  const elapsedSec = Math.floor((Date.now() - recordState.startedAt) / 1000);
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  els.recordTimer.textContent = `${mm}:${ss}`;
}

async function startRecording() {
  setMessage(els.recordMessage, null);
  els.recordResult.hidden = true;

  recordState.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordState.chunks = [];
  recordState.mediaRecorder = new MediaRecorder(recordState.stream);
  recordState.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordState.chunks.push(e.data);
  };
  recordState.mediaRecorder.start();
  recordState.startedAt = Date.now();
  els.recordTimer.textContent = '00:00';
  recordState.timerHandle = setInterval(updateRecordTimer, 500);

  els.recordStartBtn.disabled = true;
  els.recordStopBtn.disabled = false;
}

function stopRecording() {
  return new Promise((resolve) => {
    recordState.mediaRecorder.onstop = () => resolve();
    recordState.mediaRecorder.stop();
    recordState.stream.getTracks().forEach((t) => t.stop());
  });
}

async function handleRecordStop() {
  clearInterval(recordState.timerHandle);
  els.recordStartBtn.disabled = false;
  els.recordStopBtn.disabled = true;

  await stopRecording();
  const blob = new Blob(recordState.chunks, { type: recordState.mediaRecorder.mimeType });

  let decoded;
  try {
    decoded = await decodeAudioBlob(blob);
  } catch (err) {
    setMessage(els.recordMessage, `녹음 처리에 실패했습니다: ${err.message}`);
    return;
  }

  if (decoded.durationSec < MIN_ANALYSIS_DURATION_SEC) {
    setMessage(els.recordMessage, formatTooShortMessage(MIN_ANALYSIS_DURATION_SEC));
    return;
  }

  try {
    const record = await analyzeViaBackend(decoded.samples, decoded.sampleRate, decoded.durationSec, 'live');
    renderAnalysisSummary(els.recordResult, record);
  } catch (err) {
    if (err.body?.error === 'too_short') {
      setMessage(els.recordMessage, formatTooShortMessage(err.body.minDurationSec));
    } else {
      setMessage(els.recordMessage, `분석 요청에 실패했습니다: ${err.message}`);
    }
  }
}

els.recordStartBtn.addEventListener('click', () => {
  startRecording().catch((err) => setMessage(els.recordMessage, `마이크 접근에 실패했습니다: ${err.message}`));
});
els.recordStopBtn.addEventListener('click', () => {
  handleRecordStop();
});

// ---------- 화면 2: 파일 업로드 ----------

async function handleUploadAnalyze() {
  setMessage(els.uploadMessage, null);
  els.uploadResult.hidden = true;

  const file = els.uploadInput.files[0];
  if (!file) {
    setMessage(els.uploadMessage, '분석할 오디오 파일을 선택해 주세요.');
    return;
  }

  let decoded;
  try {
    decoded = await decodeAudioBlob(file);
  } catch (err) {
    setMessage(els.uploadMessage, `파일을 디코딩할 수 없습니다: ${err.message}`);
    return;
  }

  if (decoded.durationSec < MIN_ANALYSIS_DURATION_SEC) {
    setMessage(els.uploadMessage, formatTooShortMessage(MIN_ANALYSIS_DURATION_SEC));
    return;
  }

  try {
    const record = await analyzeViaBackend(decoded.samples, decoded.sampleRate, decoded.durationSec, 'upload');
    renderAnalysisSummary(els.uploadResult, record);
  } catch (err) {
    if (err.body?.error === 'too_short') {
      setMessage(els.uploadMessage, formatTooShortMessage(err.body.minDurationSec));
    } else {
      setMessage(els.uploadMessage, `분석 요청에 실패했습니다: ${err.message}`);
    }
  }
}

els.uploadAnalyzeBtn.addEventListener('click', handleUploadAnalyze);

// ---------- 화면 3: 분석 결과 리스트 + 신고 도움 ----------

async function loadResults() {
  const response = await fetch('/api/results');
  return response.json();
}

async function submitReport(id, form) {
  const payload = {
    location: form.location.value || null,
    occurredAt: form.occurredAt.value || null,
    description: form.description.value || null,
    contact: form.contact.value || null,
  };
  const response = await fetch(`/api/results/${id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function renderResultItem(record) {
  const item = document.createElement('div');
  item.className = 'result-item';

  const report = record.report ?? {};
  item.innerHTML = `
    <div class="meta">${new Date(record.createdAt).toLocaleString()} · ${record.source === 'upload' ? '파일 업로드' : '실시간 녹음'}</div>
    <div class="fields">
      <div><div class="label">녹음 길이</div><div class="value">${record.durationSec.toFixed(1)}초</div></div>
      <div><div class="label">소음 데시벨(dB 환산)</div><div class="value">${record.iDb.toFixed(1)} dB</div></div>
      <div><div class="label">소음 원인(추정)</div><div class="value">${record.noiseSource.label}</div></div>
    </div>
    <details>
      <summary>신고 도움 정보 ${record.report ? '(등록됨)' : '(선택 입력)'}</summary>
      <form class="report-form">
        <input name="location" placeholder="발생 위치 (선택)" value="${report.location ?? ''}" />
        <input name="occurredAt" placeholder="발생 시각 (선택)" value="${report.occurredAt ?? ''}" />
        <textarea name="description" placeholder="상황 설명 (선택)">${report.description ?? ''}</textarea>
        <input name="contact" placeholder="연락처 (선택)" value="${report.contact ?? ''}" />
        <button type="submit">저장</button>
      </form>
    </details>
  `;

  const form = item.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updated = await submitReport(record.id, form);
    Object.assign(record, updated);
    item.replaceWith(renderResultItem(record));
  });

  return item;
}

async function refreshResultsList() {
  els.resultsList.innerHTML = '불러오는 중...';
  const results = await loadResults();
  els.resultsList.innerHTML = '';
  if (results.length === 0) {
    els.resultsList.innerHTML = '<p>아직 분석 결과가 없습니다.</p>';
    return;
  }
  for (const record of results) {
    els.resultsList.appendChild(renderResultItem(record));
  }
}

els.refreshResultsBtn.addEventListener('click', refreshResultsList);
