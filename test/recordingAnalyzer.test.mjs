import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRecording, FRAME_SIZE } from '../src/recordingAnalyzer.js';

function sine(freq, sampleRate, n, amplitude = 1) {
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return samples;
}

test('프레임 하나보다 짧은 샘플은 에러를 던진다', () => {
  const samples = sine(440, 44100, FRAME_SIZE - 1);
  assert.throws(() => analyzeRecording(samples, 44100));
});

test('여러 프레임에 걸친 녹음에서 지배 주파수가 일관되게 검출된다', () => {
  const sampleRate = 8000;
  const freq = 1000; // 8000/4096 간격의 빈에 가까운 값
  const n = FRAME_SIZE * 5; // 5프레임 분량
  const samples = sine(freq, sampleRate, n);

  const result = analyzeRecording(samples, sampleRate);

  assert.equal(result.frameCount, 5);
  assert.ok(Math.abs(result.dominantFreq - freq) < (sampleRate / FRAME_SIZE));
  assert.ok(Math.abs(result.durationSec - n / sampleRate) < 1e-9);
  assert.ok(result.I >= 0);
  assert.equal(result.noiseSource.label, '중고음 생활/음성 소음');
});

test('마지막 남는 샘플(프레임 미만)은 무시하고 계산한다', () => {
  const sampleRate = 8000;
  const n = FRAME_SIZE * 2 + 100; // 프레임 2개 + 나머지
  const samples = sine(440, sampleRate, n);
  const result = analyzeRecording(samples, sampleRate);
  assert.equal(result.frameCount, 2);
});
