# spacesaver

Fancy 3D space screensaver that turns into an arcade game the moment you move
the mouse. A ship glides through an infinite starfield — leave it alone and it
flies itself; take the stick and you're catching coins and dodging asteroids.

Built with three.js (bloom, shader starfield, procedural everything — no asset
files), vanilla JS, bundled by esbuild.

## Modes

- **Idle (screensaver):** autopilot drifts through space on layered sine
  curves. After a while a hint fades in.
- **Coin Rush (game):** move the mouse/finger → the ship follows via a power
  steering curve (`|n|^1.6`, `src/game/steering.js`): precise around the
  center, expansive toward the edges — pointer at the screen border pins the
  ship to the corridor border on any screen or aspect (mobile included; try
  exponents live with `?steer=2`). Catch gold rings (combo multiplier for
  chains), dodge asteroids (3 lives, brief invulnerability after a hit).
  Game over → score + best (localStorage) → back to the screensaver. Stop
  moving for ~6 s → the game fades back into the screensaver too.

Keys: `F` = fullscreen, `ESC` = pause menu (resume / restart / fullscreen /
mode select / demo — registered modes appear there automatically via
`mode.label`; the game clock freezes while the menu is open; exiting
fullscreen with ESC opens the menu too). `?debug=1` = fps/draw-call overlay +
`window.__spacesaver` handle. `?demo=coin-rush` = synthetic pilot; moving the
mouse takes over seamlessly.

## Multi-display

`multi.html` opens one synced window per screen (Chrome window-management
permission): the first is the **master** (input, game, HUD), the rest are
**followers** rendering the same world through a view offset — together they
form one continuous view across all displays. Plumbing:

- `?view=x,y,W,H` — render the sub-rect at (x, y) of a virtual W×H canvas
  (`camera.setViewOffset`)
- `?sync=master|follow` — state sync over `BroadcastChannel`
  (`src/core/sync.js`): ship pose + clocks travel, everything else is
  deterministic `f(scroll)` from a shared seed (`src/core/rng.js`)
- followers hide HUD/menu; coins/asteroids currently render on the master's
  simulation only (game entities aren't synced yet — the screensaver is)

This is also the base for a native macOS screensaver wrapper (one
ScreenSaverView per display → one URL with matching `view`/`sync` params).

## Dev

```sh
npm install
npm run dev        # http://localhost:8000 (rebuild on save)
npm test           # unit tests (node --test) for the pure game math
npm run build      # minified dist/bundle.js
npm run build:standalone   # dist/spacesaver.html — single file, works from file://
```

`dist/spacesaver.html` is the offline artifact: one self-contained file,
double-click and it runs, no server, no network.

## Architecture

The **World** (`src/world/`) is the persistent base — ship, starfield, nebula,
engine trail, chase cam — and never resets. **Modes** (`src/modes/`) plug
gameplay on top via the mode registry (`src/core/mode-manager.js`):
`{ id, enter(ctx), update(dt, ctx), exit(ctx) }`. A new mini-game is one new
file in `src/modes/` plus one `register()` call in `main.js`.

Pure game math (collision ellipsoids, difficulty curves, spawn layout, index
pool) lives in `src/game/` and is unit-tested; everything touching three.js or
the DOM is verified manually (see below).

Perf ground rules: zero per-frame allocations (pools, scratch vectors,
starfield wrapping on the GPU via `mod()` in the vertex shader), pixelRatio
cap, half-res bloom, full stop while the tab is hidden.

## Manual flow checklist

- idle runs minutes without stutter; hint appears after ~10 s
- mouse move → seamless handover, ship under cursor
- coins collect (burst + score pop + combo), asteroid hit → shake/shield/life
- 3 hits → game over card → auto-return to idle; moving restarts instantly
- stop moving mid-game → ~6 s → fade back to idle
- tab hidden → CPU/GPU near zero; resize + fullscreen OK
- `dist/spacesaver.html` works from `file://` with network off

## Leaderboard

After game over the pause menu opens (title "Game Over") with the top-10 list.
First submission asks for a name (2–20 chars, optionally guarded by Cloudflare
Turnstile); the server issues a minimal HS256 JWT `{id, name}` that the client
keeps in localStorage — later scores submit automatically under that identity.

API (`server/`, zero dependencies — node:http + node:sqlite + HMAC-JWT):
`GET /api/config` (Turnstile sitekey), `GET /api/leaderboard` (top 10 + own
rank with auth), `POST /api/register` (name + Turnstile → JWT),
`POST /api/score` (auth; validated + rate-limited). Data in a named volume
(`leaderboard-data`), proxied as `/api/` by the web container's nginx.

Config via `deploy/.env` (gitignored): `JWT_SECRET` (required),
`TURNSTILE_SITEKEY`/`TURNSTILE_SECRET` (optional — without them registration
runs captcha-free, e.g. local dev). A widget for `geraldhofbauer.net` covers
the subdomain automatically. Local dev:
`JWT_SECRET=dev DB_PATH=/tmp/lb.db node server/index.mjs` +
open the game with `?api=http://127.0.0.1:3000/api`.

## Deploy (spacesaver.geraldhofbauer.net)

Standard pattern: container on a localhost port, host nginx terminates TLS.

```sh
# on the server, in /opt/spacesaver (clone)
docker compose -f deploy/docker-compose.yml up -d --build   # 127.0.0.1:8123
sudo bash deploy/server-setup.sh                            # vhost + certbot
```
