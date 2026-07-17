import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/systems.json', import.meta.url)));

test('at least 25 systems plus Sol', () => {
  assert.ok(data.systems.length >= 26, `got ${data.systems.length}`);
  assert.equal(data.systems[0].host, 'Sol');
  assert.equal(data.systems[0].planets.length, 8);
});

test('every system has host, star data and at least one planet', () => {
  for (const s of data.systems) {
    assert.ok(typeof s.host === 'string' && s.host.length > 0);
    assert.ok(s.planets.length >= 1, `${s.host} has no planets`);
    assert.ok(s.distLy === null || typeof s.distLy === 'number');
    assert.ok(s.teff === null || s.teff > 1000);
  }
});

test('every planet has a name and numeric-or-null fields', () => {
  for (const s of data.systems) {
    for (const p of s.planets) {
      assert.ok(typeof p.name === 'string' && p.name.length > 0);
      for (const k of ['rade', 'masse', 'period', 'eqt', 'discYear']) {
        assert.ok(p[k] === null || typeof p[k] === 'number', `${p.name}.${k}`);
      }
    }
  }
});

test('signature systems made it in', () => {
  const hosts = new Set(data.systems.map((s) => s.host));
  for (const h of ['TRAPPIST-1', 'Kepler-90', 'Proxima Cen', 'HR 8799']) {
    assert.ok(hosts.has(h), `${h} missing`);
  }
  const k90 = data.systems.find((s) => s.host === 'Kepler-90');
  assert.equal(k90.planets.length, 8);
});
