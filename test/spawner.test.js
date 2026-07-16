import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickType, coinStringOffsets } from '../src/game/spawner.js';

test('pickType respects the asteroid share', () => {
  assert.equal(pickType(0.2, 0.3), 'asteroid');
  assert.equal(pickType(0.31, 0.3), 'coin');
  assert.equal(pickType(0.59, 0.6), 'asteroid');
});

test('coinStringOffsets produces the requested count, spaced in z', () => {
  const o = coinStringOffsets(4, 1);
  assert.equal(o.length, 4);
  for (let i = 1; i < o.length; i++) assert.ok(o[i].z < o[i - 1].z);
  assert.equal(o[0].z, 0);
});

test('coinStringOffsets arc stays bounded for max curve/count', () => {
  for (const curve of [-1.2, 1.2]) {
    const o = coinStringOffsets(5, curve);
    for (const p of o) {
      assert.ok(Math.abs(p.x) <= 1.2 * 16 * 0.6 + 1e-9);
      assert.ok(Math.abs(p.y) <= Math.abs(curve) * 3 + 1e-9);
    }
  }
});

test('straight string when curve is 0', () => {
  const o = coinStringOffsets(3, 0);
  for (const p of o) {
    assert.equal(p.x, 0);
    assert.equal(p.y, 0);
  }
});
