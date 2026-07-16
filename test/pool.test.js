import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndexPool } from '../src/game/pool.js';

test('acquire returns unique indices until exhausted, then -1', () => {
  const p = new IndexPool(3);
  const got = new Set([p.acquire(), p.acquire(), p.acquire()]);
  assert.equal(got.size, 3);
  assert.ok(!got.has(-1));
  assert.equal(p.acquire(), -1);
});

test('release makes an index reusable', () => {
  const p = new IndexPool(2);
  const a = p.acquire();
  p.acquire();
  assert.equal(p.acquire(), -1);
  p.release(a);
  assert.equal(p.acquire(), a);
});

test('double release is a no-op', () => {
  const p = new IndexPool(2);
  const a = p.acquire();
  p.release(a);
  p.release(a);
  assert.equal(p.activeCount, 0);
  // both slots still acquirable exactly once
  assert.notEqual(p.acquire(), -1);
  assert.notEqual(p.acquire(), -1);
  assert.equal(p.acquire(), -1);
});

test('forEachActive visits exactly the active set', () => {
  const p = new IndexPool(5);
  const a = p.acquire();
  const b = p.acquire();
  p.release(a);
  const seen = [];
  p.forEachActive((i) => seen.push(i));
  assert.deepEqual(seen, [b]);
});

test('releaseAll resets everything', () => {
  const p = new IndexPool(4);
  p.acquire(); p.acquire(); p.acquire();
  p.releaseAll();
  assert.equal(p.activeCount, 0);
  for (let i = 0; i < 4; i++) assert.notEqual(p.acquire(), -1);
  assert.equal(p.acquire(), -1);
});
