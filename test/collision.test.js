import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spheresHit, ellipsoidHit } from '../src/game/collision.js';

test('spheresHit: overlapping spheres hit', () => {
  assert.equal(spheresHit(0, 0, 0, 1, 1.5, 0, 0, 1), true);
});

test('spheresHit: touching spheres hit (boundary)', () => {
  assert.equal(spheresHit(0, 0, 0, 1, 2, 0, 0, 1), true);
});

test('spheresHit: separated spheres miss', () => {
  assert.equal(spheresHit(0, 0, 0, 1, 2.01, 0, 0, 1), false);
});

test('spheresHit: works on all axes', () => {
  assert.equal(spheresHit(0, 0, 0, 1, 0, 1.9, 0, 1), true);
  assert.equal(spheresHit(0, 0, 0, 1, 0, 0, -1.9, 1), true);
  assert.equal(spheresHit(0, 0, 0, 1, 3, 3, 3, 1), false);
});

test('ellipsoidHit: wide in x, tight in y', () => {
  // extents 3 / 1 / 2
  assert.equal(ellipsoidHit(2.9, 0, 0, 3, 1, 2), true); // wingtip catch
  assert.equal(ellipsoidHit(0, 2.9, 0, 3, 1, 2), false); // same distance above misses
  assert.equal(ellipsoidHit(0, 0.9, 0, 3, 1, 2), true);
});

test('ellipsoidHit: boundary and center', () => {
  assert.equal(ellipsoidHit(0, 0, 0, 3, 1, 2), true);
  assert.equal(ellipsoidHit(3, 0, 0, 3, 1, 2), true);
  assert.equal(ellipsoidHit(3.001, 0, 0, 3, 1, 2), false);
});

test('ellipsoidHit: diagonal combines axes', () => {
  // each axis alone inside, together outside the unit sphere
  assert.equal(ellipsoidHit(2.5, 0.8, 0, 3, 1, 2), false);
  assert.equal(ellipsoidHit(1.5, 0.5, 1.0, 3, 1, 2), true);
});
