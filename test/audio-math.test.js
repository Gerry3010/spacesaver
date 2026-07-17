import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, coinFreq, humFreq, humGain } from '../src/game/audio-math.js';

test('clamp bounds a value', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('coinFreq starts at C5 and rises with combo', () => {
  assert.ok(Math.abs(coinFreq(1) - 523.25) < 0.01);
  assert.ok(coinFreq(2) > coinFreq(1));
  assert.ok(coinFreq(5) > coinFreq(2));
});

test('coinFreq is non-decreasing and caps at an octave', () => {
  let prev = 0;
  for (let c = 1; c <= 20; c++) {
    const f = coinFreq(c);
    assert.ok(f >= prev, `combo ${c} should not drop in pitch`);
    prev = f;
  }
  // capped one octave above the base, so it never screeches past a doubling
  assert.ok(Math.abs(coinFreq(13) - 523.25 * 2) < 0.01);
  assert.equal(coinFreq(50), coinFreq(13));
});

test('humGain is silent at rest, rises with speed, stays low', () => {
  assert.equal(humGain(0), 0);
  assert.ok(humGain(70) > 0);
  assert.ok(humGain(260) > humGain(70));
  assert.ok(humGain(1000) <= 0.06); // capped, never loud
});

test('humFreq stays in a low band and climbs with speed', () => {
  assert.ok(humFreq(0) >= 42);
  assert.ok(humFreq(260) > humFreq(0));
  assert.ok(humFreq(9999) <= 90); // capped
});
