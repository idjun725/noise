import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDisturbanceIndex } from '../src/indexCalculator.js';

function sine(freq, sampleRate, n, amplitude = 1) {
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return samples;
}

test('지배 주파수(dominant)가 입력 사인파 주파수와 일치한다', () => {
  const sampleRate = 8000;
  const n = 1024;
  const freq = 1000; // 8000/1024 = 7.8125Hz 간격의 정확한 빈
  const samples = sine(freq, sampleRate, n);
  const { dominant } = computeDisturbanceIndex(samples, sampleRate);
  assert.equal(dominant.freq, freq);
});

test('동일 진폭이면 차단주파수보다 높은 성분이 더 크게 감쇠되어 낮은 기여도를 가진다', () => {
  const sampleRate = 8000;
  const n = 1024;
  const fc = 200;
  const lowFreq = sampleRate / n; // 첫 번째 빈, fc 이하
  const highFreq = 2000; // fc보다 훨씬 위
  const low = sine(lowFreq, sampleRate, n);
  const high = sine(highFreq, sampleRate, n);

  const resultLow = computeDisturbanceIndex(low, sampleRate, { fc, f0: 200, gamma: 1.0 });
  const resultHigh = computeDisturbanceIndex(high, sampleRate, { fc, f0: 200, gamma: 1.0 });

  const lowBin = resultLow.bins.find((b) => Math.abs(b.freq - lowFreq) < 1e-6);
  const highBin = resultHigh.bins.find((b) => Math.abs(b.freq - highFreq) < 1e-6);

  assert.equal(lowBin.h, 1);
  assert.ok(highBin.h < 1);
});

test('I는 항상 0 이상이다', () => {
  const sampleRate = 44100;
  const n = 2048;
  const samples = sine(440, sampleRate, n, 0.3);
  const { I } = computeDisturbanceIndex(samples, sampleRate);
  assert.ok(I >= 0);
  assert.ok(Number.isFinite(I));
});
