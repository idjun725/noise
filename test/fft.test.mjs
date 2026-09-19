import test from 'node:test';
import assert from 'node:assert/strict';
import { fft, windowedDft } from '../src/fft.js';

test('impulse의 FFT는 모든 빈에서 크기가 1이다', () => {
  const n = 8;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re[0] = 1;
  fft(re, im);
  for (let k = 0; k < n; k++) {
    assert.ok(Math.abs(Math.hypot(re[k], im[k]) - 1) < 1e-9);
  }
});

test('직류(DC) 신호의 FFT는 0번 빈에만 에너지가 몰린다', () => {
  const n = 16;
  const re = new Float64Array(n).fill(1);
  const im = new Float64Array(n);
  fft(re, im);
  assert.ok(Math.abs(re[0] - n) < 1e-9);
  for (let k = 1; k < n; k++) {
    assert.ok(Math.hypot(re[k], im[k]) < 1e-9);
  }
});

test('windowedDft는 사인파의 주파수 빈에서 피크를 보인다', () => {
  const sampleRate = 8000;
  const n = 1024;
  const freq = 1000; // 정확히 빈 경계에 위치하도록 선택 (1000 * 1024/8000 = 128)
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);

  const { re, im } = windowedDft(samples);
  const half = n / 2;
  let peakK = 0;
  let peakMag = -1;
  for (let k = 0; k <= half; k++) {
    const mag = Math.hypot(re[k], im[k]);
    if (mag > peakMag) {
      peakMag = mag;
      peakK = k;
    }
  }
  const peakFreq = (peakK * sampleRate) / n;
  assert.equal(peakFreq, freq);
});
