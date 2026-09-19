import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';
import { MIN_ANALYSIS_DURATION_SEC } from '../src/config.js';
import { FRAME_SIZE } from '../src/recordingAnalyzer.js';

function sine(freq, sampleRate, n, amplitude = 1) {
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return samples;
}

async function withServer(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-test-'));
  const server = createServer({ dataDir });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('POST /api/analyze: 너무 짧은 녹음은 422와 too_short를 반환한다', async () => {
  await withServer(async (baseUrl) => {
    const sampleRate = 8000;
    const tooShortDuration = MIN_ANALYSIS_DURATION_SEC - 1;
    const res = await fetch(`${baseUrl}/api/analyze?sampleRate=${sampleRate}&duration=${tooShortDuration}&source=live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Float32Array(FRAME_SIZE).buffer,
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, 'too_short');
    assert.equal(body.minDurationSec, MIN_ANALYSIS_DURATION_SEC);
  });
});

test('POST /api/analyze -> GET /api/results: 정상 분석 결과가 저장되고 조회된다', async () => {
  await withServer(async (baseUrl) => {
    const sampleRate = 8000;
    const n = FRAME_SIZE * 8; // MIN_ANALYSIS_DURATION_SEC(3초)를 넘기기 위해 충분한 길이로 설정
    const samples = sine(1000, sampleRate, n);
    const duration = n / sampleRate;

    const analyzeRes = await fetch(`${baseUrl}/api/analyze?sampleRate=${sampleRate}&duration=${duration}&source=upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: samples.buffer,
    });
    assert.equal(analyzeRes.status, 200);
    const record = await analyzeRes.json();
    assert.equal(record.source, 'upload');
    assert.ok(record.id);
    assert.ok(record.durationSec > 0);
    assert.equal(record.report, null);

    const listRes = await fetch(`${baseUrl}/api/results`);
    const list = await listRes.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, record.id);
  });
});

test('POST /api/results/:id/report: 신고 도움 정보를 저장한다', async () => {
  await withServer(async (baseUrl) => {
    const sampleRate = 8000;
    const n = FRAME_SIZE * 8; // MIN_ANALYSIS_DURATION_SEC(3초)를 넘기기 위해 충분한 길이로 설정
    const samples = sine(440, sampleRate, n);
    const duration = n / sampleRate;

    const analyzeRes = await fetch(`${baseUrl}/api/analyze?sampleRate=${sampleRate}&duration=${duration}&source=live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: samples.buffer,
    });
    const record = await analyzeRes.json();

    const reportRes = await fetch(`${baseUrl}/api/results/${record.id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: '아파트 옆동', description: '새벽 공사 소음' }),
    });
    assert.equal(reportRes.status, 200);
    const updated = await reportRes.json();
    assert.equal(updated.report.location, '아파트 옆동');
    assert.equal(updated.report.description, '새벽 공사 소음');
    assert.ok(updated.report.submittedAt);
  });
});

test('POST /api/results/:id/report: 존재하지 않는 id는 404를 반환한다', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/results/does-not-exist/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  });
});

test('GET /: 정적 파일(index.html)을 서빙한다', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('소음 방해지수 측정기'));
  });
});
