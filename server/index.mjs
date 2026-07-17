// Leaderboard API — zero dependencies (node:http + node:sqlite + HMAC-JWT).
// Env: PORT (3000), DB_PATH (/data/leaderboard.db), JWT_SECRET (required),
//      TURNSTILE_SITEKEY + TURNSTILE_SECRET (optional — without them,
//      registration runs captcha-free, e.g. local dev).
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { jwtSign, jwtVerify, validateName, validateScore } from './lib.mjs';

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || '/data/leaderboard.db';
const JWT_SECRET = process.env.JWT_SECRET || '';
const TS_SITEKEY = process.env.TURNSTILE_SITEKEY || '';
const TS_SECRET = process.env.TURNSTILE_SECRET || '';

if (!JWT_SECRET) {
  console.error('JWT_SECRET missing — refusing to start');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL REFERENCES players(id),
    score INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id, score);
`);

const qTop = db.prepare(`
  SELECT p.name AS name, MAX(s.score) AS best
  FROM scores s JOIN players p ON p.id = s.player_id
  GROUP BY p.id ORDER BY best DESC, MIN(s.created_at) ASC LIMIT 10
`);
const qBest = db.prepare('SELECT MAX(score) AS best FROM scores WHERE player_id = ?');
const qRank = db.prepare(`
  SELECT COUNT(*) + 1 AS rank FROM (
    SELECT MAX(score) AS best FROM scores GROUP BY player_id
  ) WHERE best > ?
`);
const qInsertPlayer = db.prepare('INSERT INTO players (id, name, created_at) VALUES (?, ?, ?)');
const qInsertScore = db.prepare('INSERT INTO scores (player_id, score, created_at) VALUES (?, ?, ?)');
const qPlayer = db.prepare('SELECT id, name FROM players WHERE id = ?');

// naive in-memory rate limit: min interval per key
const lastHit = new Map();
function limited(key, minMs) {
  const now = Date.now();
  const prev = lastHit.get(key) || 0;
  if (now - prev < minMs) return true;
  lastHit.set(key, now);
  if (lastHit.size > 10000) lastHit.clear();
  return false;
}

async function verifyTurnstile(token, ip) {
  if (!TS_SECRET) return true; // not configured -> open (dev)
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: TS_SECRET, response: token, remoteip: ip }),
    });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function auth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const payload = jwtVerify(h.slice(7), JWT_SECRET);
  if (!payload?.id) return null;
  return qPlayer.get(payload.id) || null; // player must still exist
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '?';
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return send(res, 200, { sitekey: TS_SITEKEY || null });
    }

    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      const top = qTop.all().map((r, i) => ({ rank: i + 1, name: r.name, score: r.best }));
      const player = auth(req);
      let me = null;
      if (player) {
        const best = qBest.get(player.id)?.best ?? null;
        me = { name: player.name, best, rank: best != null ? qRank.get(best).rank : null };
      }
      return send(res, 200, { top, me });
    }

    if (req.method === 'POST' && url.pathname === '/api/register') {
      if (limited(`reg:${ip}`, 3000)) return send(res, 429, { error: 'slow_down' });
      const body = await readBody(req);
      const name = validateName(body.name);
      if (!name) return send(res, 400, { error: 'bad_name' });
      if (!(await verifyTurnstile(body.turnstile, ip))) return send(res, 403, { error: 'captcha_failed' });
      const id = randomUUID();
      try {
        qInsertPlayer.run(id, name, Date.now());
      } catch {
        return send(res, 409, { error: 'name_taken' });
      }
      return send(res, 200, { token: jwtSign({ id, name }, JWT_SECRET), id, name });
    }

    if (req.method === 'POST' && url.pathname === '/api/score') {
      const player = auth(req);
      if (!player) return send(res, 401, { error: 'no_auth' });
      if (limited(`score:${player.id}`, 3000)) return send(res, 429, { error: 'slow_down' });
      const body = await readBody(req);
      const score = validateScore(body.score);
      if (score == null) return send(res, 400, { error: 'bad_score' });
      qInsertScore.run(player.id, score, Date.now());
      const best = qBest.get(player.id).best;
      return send(res, 200, { best, rank: qRank.get(best).rank });
    }

    send(res, 404, { error: 'not_found' });
  } catch (e) {
    send(res, 400, { error: 'bad_request' });
  }
});

server.listen(PORT, () => console.log(`leaderboard api on :${PORT}, turnstile ${TS_SECRET ? 'ON' : 'OFF'}`));
