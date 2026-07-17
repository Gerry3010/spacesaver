// Pure helpers for the leaderboard API — kept separate for unit tests.
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Minimal HS256 JWT — "ganz simple": header.payload.signature */
export function jwtSign(payload, secret) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** @returns {object|null} payload, or null if signature/shape is invalid */
export function jwtVerify(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** @returns {string|null} cleaned name, or null if unacceptable */
export function validateName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) return null;
  // letters/digits/space and a little punctuation — no control chars/emoji soup
  if (!/^[\p{L}\p{N} ._\-]+$/u.test(name)) return null;
  return name;
}

/** @returns {number|null} validated integer score */
export function validateScore(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 10 || n > 1_000_000) return null;
  return n;
}
