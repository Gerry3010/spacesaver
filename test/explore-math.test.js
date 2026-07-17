import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  turnRate, approachSpeed, angleDelta, planetRadius, starRadius,
  starColorHex, planetType, orbitRadius, systemPosition,
} from '../src/game/explore-math.js';

test('turnRate: deadzone, symmetry, max at edge', () => {
  assert.equal(turnRate(0), 0);
  assert.equal(turnRate(0.05), 0); // inside the (smaller) deadzone
  assert.ok(turnRate(0.5) > 0);
  assert.equal(turnRate(-0.5), -turnRate(0.5));
  assert.ok(Math.abs(turnRate(1) - 2.4) < 1e-9); // full maxRate at the edge
  // halfway push must already give a meaningful fraction of max (was the
  // "sluggish" complaint: squared curve gave only ~0.25 here)
  assert.ok(turnRate(0.5) / 2.4 > 0.28);
});

test('approachSpeed: brakes to zero at arrival, capped at max', () => {
  assert.equal(approachSpeed(100, 100, 260), 0);
  assert.equal(approachSpeed(50, 100, 260), 0); // inside arrival zone
  assert.ok(approachSpeed(150, 100, 260) > 0);
  assert.equal(approachSpeed(10000, 100, 260), 260);
});

test('angleDelta wraps to shortest path', () => {
  assert.ok(Math.abs(angleDelta(0.1, -0.1) + 0.2) < 1e-9);
  assert.ok(Math.abs(angleDelta(3.0, -3.0) - (2 * Math.PI - 6)) < 1e-9);
});

test('planetRadius: monotonic, Earth ~1.15, capped', () => {
  assert.ok(Math.abs(planetRadius(1) - 1.15) < 1e-9);
  assert.ok(planetRadius(11.2) > planetRadius(4));
  assert.ok(planetRadius(1000) <= 5.5);
  assert.ok(planetRadius(null) > 0);
});

test('starRadius: clamped range, sun 11', () => {
  assert.ok(Math.abs(starRadius(1) - 11) < 1e-9);
  assert.ok(starRadius(0.01) >= 5);
  assert.ok(starRadius(100) <= 20);
});

test('starColorHex buckets', () => {
  assert.equal(starColorHex(2566), 0xff8a4a); // TRAPPIST-1
  assert.equal(starColorHex(5772), 0xfff3c9); // Sol
  assert.equal(starColorHex(8000), 0xbcd0ff);
  assert.equal(starColorHex(null), 0xfff3c9);
});

test('planetType thresholds', () => {
  assert.equal(planetType(1, 1), 'rocky');
  assert.equal(planetType(2, 5), 'super-earth');
  assert.equal(planetType(4, 15), 'neptunian');
  assert.equal(planetType(11.2, 318), 'jovian');
  assert.equal(planetType(null, 318), 'jovian'); // falls back to mass
});

test('orbitRadius staggers outward', () => {
  assert.ok(orbitRadius(1, 10) > orbitRadius(0, 10));
});

test('systemPosition: Sol at origin, others spaced apart', () => {
  assert.deepEqual(systemPosition(0), [0, 0, 0]);
  for (let i = 1; i < 26; i++) {
    const [x, y, z] = systemPosition(i);
    const d = Math.hypot(x, y, z);
    assert.ok(d > 300, `system ${i} too close to origin (${d})`);
    // pairwise: consecutive systems must not overlap
    const [x2, y2, z2] = systemPosition(i - 1);
    assert.ok(Math.hypot(x - x2, y - y2, z - z2) > 200, `systems ${i - 1}/${i} overlap`);
  }
});
