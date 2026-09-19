import test from 'node:test';
import assert from 'node:assert/strict';
import { wallTransfer } from '../src/wallTransfer.js';

test('차단주파수 이하에서는 감쇠 없이 통과한다(H=1)', () => {
  assert.equal(wallTransfer(100, 200), 1);
  assert.equal(wallTransfer(200, 200), 1);
});

test('차단주파수 위에서는 fc/f 비율로 감쇠한다', () => {
  assert.ok(Math.abs(wallTransfer(400, 200) - 0.5) < 1e-9);
  assert.ok(Math.abs(wallTransfer(800, 200) - 0.25) < 1e-9);
});
