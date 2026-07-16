import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldSpeed, spawnInterval, asteroidShare } from '../src/game/difficulty.js';

test('worldSpeed ramps from 60 and caps', () => {
  assert.equal(worldSpeed(0), 60);
  assert.ok(worldSpeed(60) > worldSpeed(30));
  assert.equal(worldSpeed(120), worldSpeed(500)); // capped
  assert.equal(worldSpeed(120), 60 + 120 * 0.8);
});

test('spawnInterval shrinks and clamps', () => {
  assert.equal(spawnInterval(0), 1.2);
  assert.ok(spawnInterval(60) < spawnInterval(10));
  assert.ok(spawnInterval(1000) >= 0.45);
  assert.equal(spawnInterval(120), spawnInterval(999));
});

test('asteroidShare rises 30% -> 60% and caps', () => {
  assert.equal(asteroidShare(0), 0.3);
  assert.ok(Math.abs(asteroidShare(120) - 0.6) < 1e-9);
  assert.ok(Math.abs(asteroidShare(9999) - 0.6) < 1e-9);
});

test('curves are monotonic over the ramp', () => {
  for (let t = 0; t < 120; t += 5) {
    assert.ok(worldSpeed(t + 5) >= worldSpeed(t));
    assert.ok(spawnInterval(t + 5) <= spawnInterval(t));
    assert.ok(asteroidShare(t + 5) >= asteroidShare(t));
  }
});
