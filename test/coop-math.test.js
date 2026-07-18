import { test } from 'node:test';
import assert from 'node:assert/strict';
import { virtualPointer, pickPointer } from '../src/game/coop-math.js';

test('virtualPointer without a view is the plain window mapping', () => {
  assert.deepEqual(virtualPointer(null, 50, 50, 100, 100), { nx: 0, ny: 0 });
  assert.deepEqual(virtualPointer(null, 100, 0, 100, 100), { nx: 1, ny: 1 }); // top-right
  assert.deepEqual(virtualPointer(null, 0, 100, 100, 100), { nx: -1, ny: -1 }); // bottom-left
});

test('virtualPointer maps two side-by-side displays onto one playfield', () => {
  // two 100-wide displays, virtual canvas 200×100
  const left = { x: 0, y: 0, W: 200, H: 100 };
  const right = { x: 100, y: 0, W: 200, H: 100 };
  // far-left edge of the left display = full left of the playfield
  assert.equal(virtualPointer(left, 0, 50, 100, 100).nx, -1);
  // inner edges (the seam) both land at the playfield center
  assert.equal(virtualPointer(left, 100, 50, 100, 100).nx, 0);
  assert.equal(virtualPointer(right, 0, 50, 100, 100).nx, 0);
  // far-right edge of the right display = full right
  assert.equal(virtualPointer(right, 100, 50, 100, 100).nx, 1);
});

test('virtualPointer clamps beyond the canvas edges', () => {
  const v = virtualPointer(null, 250, -40, 100, 100);
  assert.equal(v.nx, 1);
  assert.equal(v.ny, 1);
});

test('pickPointer: the most-recently-active pointer wins, ties go local', () => {
  const local = { nx: -0.5, ny: 0, activeAt: 10 };
  const remoteNewer = { nx: 0.8, ny: 0.2, activeAt: 11 };
  const remoteOlder = { nx: 0.8, ny: 0.2, activeAt: 9 };
  assert.equal(pickPointer(local, remoteNewer), remoteNewer);
  assert.equal(pickPointer(local, remoteOlder), local);
  assert.equal(pickPointer(local, { nx: 0, ny: 0, activeAt: 10 }), local); // tie → local
});

test('pickPointer: an idle master (never moved) yields to a live follower', () => {
  const local = { nx: 0, ny: 0, activeAt: -Infinity };
  const remote = { nx: 0.4, ny: -0.3, activeAt: 5 };
  assert.equal(pickPointer(local, remote), remote);
});
