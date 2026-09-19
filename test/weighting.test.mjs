import test from 'node:test';
import assert from 'node:assert/strict';
import { aWeightingDb, aWeightingLinear, perceptualWeight } from '../src/weighting.js';

test('A-weighting은 1kHz 부근에서 0dB에 가깝다', () => {
  assert.ok(Math.abs(aWeightingDb(1000)) < 0.1);
});

test('A-weighting은 저주파에서 큰 폭으로 감쇠한다(음수 dB)', () => {
  assert.ok(aWeightingDb(31.5) < -30);
});

test('perceptualWeight는 f0 경계에서 연속이다', () => {
  const params = { f0: 200, gamma: 1.0 };
  const below = perceptualWeight(199.999, params);
  const at = perceptualWeight(200, params);
  const above = perceptualWeight(200.001, params);
  assert.ok(Math.abs(below - at) < 1e-3);
  assert.ok(Math.abs(above - at) < 1e-3);
  assert.equal(at, aWeightingLinear(200));
});

test('f0 아래에서는 gamma가 클수록 저주파 보정이 커진다', () => {
  const f = 50;
  const small = perceptualWeight(f, { f0: 200, gamma: 0.5 });
  const large = perceptualWeight(f, { f0: 200, gamma: 2.0 });
  assert.ok(large > small);
});
