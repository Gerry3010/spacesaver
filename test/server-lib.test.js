import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtSign, jwtVerify, validateName, validateScore } from '../server/lib.mjs';

const SECRET = 'test-secret';

test('jwt round-trips a payload', () => {
  const t = jwtSign({ id: 'abc', name: 'Gerry' }, SECRET);
  assert.deepEqual(jwtVerify(t, SECRET), { id: 'abc', name: 'Gerry' });
});

test('jwt rejects wrong secret, tampering and garbage', () => {
  const t = jwtSign({ id: 'abc' }, SECRET);
  assert.equal(jwtVerify(t, 'other'), null);
  const [h, p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ id: 'evil' })).toString('base64url');
  assert.equal(jwtVerify(`${h}.${forged}.${s}`, SECRET), null);
  assert.equal(jwtVerify('nope', SECRET), null);
  assert.equal(jwtVerify(null, SECRET), null);
});

test('validateName trims, collapses spaces, enforces charset & length', () => {
  assert.equal(validateName('  Gerry  3010 '), 'Gerry 3010');
  assert.equal(validateName('Jäger_1.5-x'), 'Jäger_1.5-x');
  assert.equal(validateName('G'), null); // too short
  assert.equal(validateName('x'.repeat(21)), null); // too long
  assert.equal(validateName('a<script>'), null);
  assert.equal(validateName(42), null);
});

test('validateScore bounds and integer-ness', () => {
  assert.equal(validateScore(10), 10);
  assert.equal(validateScore('250'), 250);
  assert.equal(validateScore(5), null); // below minimum
  assert.equal(validateScore(1_000_001), null);
  assert.equal(validateScore(12.5), null);
  assert.equal(validateScore('abc'), null);
});
