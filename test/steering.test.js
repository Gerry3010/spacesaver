import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steeringCurve } from '../src/game/steering.js';

test('center and edges map exactly', () => {
  assert.equal(steeringCurve(0, 1.6), 0);
  assert.equal(steeringCurve(1, 1.6), 1);
  assert.equal(steeringCurve(-1, 1.6), -1);
});

test('odd symmetry', () => {
  for (const n of [0.2, 0.5, 0.9]) {
    assert.equal(steeringCurve(-n, 1.6), -steeringCurve(n, 1.6));
  }
});

test('exponent > 1 softens the center, keeps edges', () => {
  assert.ok(steeringCurve(0.3, 1.6) < 0.3);
  assert.ok(steeringCurve(0.9, 1.6) > 0.8);
  // quadratic is softer in the center than 1.6
  assert.ok(steeringCurve(0.3, 2) < steeringCurve(0.3, 1.6));
});

test('monotonic', () => {
  let prev = -1.01;
  for (let n = -1; n <= 1.001; n += 0.05) {
    const v = steeringCurve(n, 1.6);
    assert.ok(v > prev);
    prev = v;
  }
});

test('input beyond ±1 clamps to ±1', () => {
  assert.equal(steeringCurve(1.8, 1.6), 1);
  assert.equal(steeringCurve(-1.8, 1.6), -1);
});
