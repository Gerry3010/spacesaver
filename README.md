# spacesaver

Fancy 3D space screensaver that turns into an arcade game the moment you move
the mouse. A ship glides through an infinite starfield — leave it alone and it
flies itself; take the stick and you're catching coins and dodging asteroids.

Built with three.js (bloom, shader starfield, procedural everything — no asset
files), vanilla JS, bundled by esbuild.

## Modes

- **Idle (screensaver):** autopilot drifts through space on layered sine
  curves. After a while a hint fades in.
- **Coin Rush (game):** move the mouse → the ship follows the cursor
  (unprojected onto the flight plane, so it sits under the pointer).
  Catch gold rings (combo multiplier for chains), dodge asteroids
  (3 lives, brief invulnerability after a hit). Game over → score + best
  (localStorage) → back to the screensaver. Stop moving for ~6 s → the game
  fades back into the screensaver too.

Keys: `F` = fullscreen, `ESC` = pause menu (resume / restart / fullscreen /
mode select — registered modes appear there automatically via `mode.label`;
the game clock freezes while the menu is open). `?debug=1` = fps/draw-call overlay + `window.__spacesaver`
handle. `?demo=coin-rush` = synthetic pilot (for headless screenshots/tuning —
the mouse does nothing in demo mode).

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

## Deploy (spacesaver.geraldhofbauer.net)

Standard pattern: container on a localhost port, host nginx terminates TLS.

```sh
# on the server, in /opt/spacesaver (clone)
docker compose -f deploy/docker-compose.yml up -d --build   # 127.0.0.1:8123
sudo bash deploy/server-setup.sh                            # vhost + certbot
```
