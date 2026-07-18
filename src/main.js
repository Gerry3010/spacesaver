import { Engine } from './core/engine.js';
import { Input, consumeProgrammaticFullscreenExit } from './core/input.js';
import { ModeManager } from './core/mode-manager.js';
import { SyncChannel } from './core/sync.js';
import { World } from './world/world.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Leaderboard } from './ui/leaderboard.js';
import { CONFIG } from './core/config.js';
import { audio } from './core/audio.js';
import { pickPointer } from './game/coop-math.js';
import { CoinField, AsteroidField } from './game/entities.js';
import { idleMode } from './modes/idle-mode.js';
import { coinRushMode } from './modes/coin-rush-mode.js';
import { exploreMode } from './modes/explore-mode.js';

const params = new URLSearchParams(location.search);
const debug = params.has('debug');

// ?steer=2 — try steering-curve exponents live without a rebuild
const steer = parseFloat(params.get('steer'));
if (steer > 0) CONFIG.steering.exponent = steer;

const canvas = document.getElementById('scene');
const engine = new Engine(canvas);
const world = new World();
engine.attach(world.scene, world.camera);

// ?view=x,y,W,H — this window renders the sub-rect at (x, y) of a virtual
// canvas W×H spanning all displays (see multi.html)
const view = params.get('view');
let viewRect = null;
if (view) {
  const [x, y, W, H] = view.split(',').map(Number);
  if (W > 0 && H > 0) {
    viewRect = { x, y, W, H };
    engine.setView(viewRect);
  }
}

const input = new Input();
if (viewRect) input.setView(viewRect); // pointer maps to the whole playfield
const hud = new Hud();

const ctx = { world, input, hud };
const modeManager = new ModeManager(ctx);
modeManager.register(idleMode);
modeManager.register(coinRushMode);
// Explore needs mouse-look + scroll wheel — desktop only for now (touch
// would need its own control scheme; deliberately deferred). The demo param
// overrides so headless screenshot runs (no pointer at all) still work.
if (window.matchMedia('(pointer: fine)').matches || params.get('demo') === 'explore') {
  modeManager.register(exploreMode);
}
modeManager.switchTo('idle');

// leaderboard (?api= overrides for local dev, e.g. ?api=http://127.0.0.1:3000/api)
const leaderboard = new Leaderboard(params.get('api') || '/api');

// game over → back to the drifting world, menu with leaderboard on top
ctx.afterGameOver = (score) => {
  leaderboard.onGameOver(score);
  modeManager.switchTo('idle');
  setPaused(true, 'Game Over');
};
ctx.isDemo = () => demoActive;

// ---- multi-display sync (?sync=master | ?sync=follow) ----
const syncRole = params.get('sync');
let remote = null;
let remoteAge = 0;
// master: the most-recent pointer a follower sent (co-op steering). activeAt is
// stamped on the master's own clock when it arrives, so it competes fairly with
// the master's local pointer via pickPointer.
let remoteInput = { nx: 0, ny: 0, activeAt: -Infinity };
const syncIn = syncRole === 'follow'
  ? new SyncChannel('follow', { onState: (s) => { remote = s; remoteAge = 0; } })
  : null;
const syncOut = syncRole === 'master'
  ? new SyncChannel('master', { onInput: (i) => { remoteInput = { nx: i.nx, ny: i.ny, activeAt: world.time }; } })
  : null;
if (syncRole === 'follow') document.body.classList.add('follower');

// followers render the master's coins/asteroids read-only (no spawner/collision)
let ghostCoins = null;
let ghostRocks = null;

// ---- demo pilot (?demo=coin-rush | ?demo=explore, or the menu button) ----
// In demo the mouse never takes over the game — it's a hands-off showcase you
// leave through the ESC menu. coin-rush is driven by a synthetic pilot below;
// explore runs its own autonomous star tour (see explore-mode).
let demoActive = false;
function startDemo(modeId = 'coin-rush') {
  demoActive = true;
  modeManager.switchTo(modeId);
}
const demoParam = params.get('demo');
if (demoParam === 'coin-rush' || demoParam === 'explore') startDemo(demoParam);
else if (demoParam) modeManager.switchTo(demoParam);

// ---- ESC / pause menu ----
let paused = false;

function setPaused(p, title) {
  if (paused === p || syncRole === 'follow') return;
  paused = p;
  if (p) {
    menu.show(modeManager.list(), modeManager.current.id, title);
    leaderboard.refresh();
  } else {
    menu.hide();
    // don't let time spent in the menu count as idle time
    input.lastActivity = world.time;
  }
}

const menu = new Menu({
  onResume: () => setPaused(false),
  onRestart: () => {
    modeManager.restartCurrent();
    setPaused(false);
  },
  onSelectMode: (id) => {
    demoActive = false;
    modeManager.switchTo(id);
    setPaused(false);
  },
  onDemo: () => {
    // demo whatever mode you're in (idle/game-over falls back to coin-rush)
    startDemo(modeManager.current.id === 'explore' ? 'explore' : 'coin-rush');
    setPaused(false);
  },
});

input.onEscape = () => {
  // ESC first dismisses the Explore star map if it's open, before the menu
  if (modeManager.current.id === 'explore' && exploreMode.hud?.mapOpen) {
    exploreMode.hud.closeMap();
    return;
  }
  setPaused(!paused);
};

// on-screen pause button (bottom-left) — same as pressing ESC
document.getElementById('pause-btn')?.addEventListener('click', () => setPaused(!paused));

// mute toggle (bottom-right) — state persists in localStorage via the audio engine
const muteBtn = document.getElementById('mute-btn');
if (muteBtn) {
  const renderMute = () => {
    muteBtn.classList.toggle('muted', audio.isMuted);
    const label = audio.isMuted ? 'Ton an' : 'Ton aus';
    muteBtn.title = label;
    muteBtn.setAttribute('aria-label', label);
  };
  muteBtn.addEventListener('click', () => { audio.toggleMute(); renderMute(); });
  renderMute();
}

// browsers swallow ESC in fullscreen to exit it — treat that exit as the
// menu request it was (F key / button exits pass through silently)
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !consumeProgrammaticFullscreenExit()) {
    setPaused(true);
  }
});

if (debug) {
  window.__spacesaver = {
    engine, world, input, hud, modeManager, audio,
    getSync: () => ({ role: syncRole, remote, remoteInput, ghostCoins, ghostRocks }),
  };
}

let frames = 0;
let fpsTimer = 0;

engine.start((dt) => {
  if (syncRole === 'follow') {
    // co-op: while this display's pointer is active, send it to the master so
    // you can steer the shared ship from any screen
    input.update(dt, world.time);
    if (syncIn && input.idleFor() < 0.4) {
      syncIn.publishInput({ nx: input.nx, ny: input.ny }, world.time);
    }
    // render-only window: adopt the master's clocks and ship pose
    if (remote) {
      remoteAge += dt;
      world.speed = remote.speed;
      const targetScroll = remote.scroll + remote.speed * remoteAge;
      world.scroll += (targetScroll - world.scroll) * Math.min(dt * 8, 1) - world.speed * dt;
      world.update(dt); // adds speed*dt back and animates everything else
      world.time = remote.t + remoteAge;
      world.ship.snapTo(remote.sx, remote.sy, remote.bank, remote.pitch);
      // mirror the master's coins/asteroids read-only, extrapolating the z-flow
      // between 30Hz updates so they stay smooth across the display seam
      if (remote.ents && remote.mode === 'coin-rush') {
        if (!ghostCoins) {
          ghostCoins = new CoinField(world.scene);
          ghostRocks = new AsteroidField(world.scene);
        }
        const zAdd = remote.speed * remoteAge;
        ghostCoins.renderGhost(remote.ents.coins, zAdd);
        ghostRocks.renderGhost(remote.ents.rocks, zAdd);
      } else if (ghostCoins) {
        ghostCoins.renderGhost([], 0);
        ghostRocks.renderGhost([], 0);
      }
    } else {
      world.update(dt); // no master yet: free-run
    }
    return;
  }

  if (demoActive && modeManager.current.id === 'coin-rush') {
    input.nx = Math.sin(world.time * 0.5) * 0.6;
    input.ny = Math.sin(world.time * 0.37) * 0.5;
    input.lastActivity = world.time;
  }
  input.update(dt, world.time);

  // co-op: if a follower's pointer is more recent than the master's own, it
  // steers the shared ship (demo drives input itself, so leave it alone)
  if (syncOut && !demoActive) {
    const picked = pickPointer(
      { nx: input.nx, ny: input.ny, activeAt: input.lastActivity },
      remoteInput,
    );
    input.nx = picked.nx;
    input.ny = picked.ny;
  }

  if (paused) {
    world.scenicUpdate(dt);
  } else {
    modeManager.update(dt);
    world.update(dt);
  }

  // engine hum tracks flight speed; silent while paused (followers never reach
  // here, so secondary displays stay quiet)
  audio.setEngine(paused ? 0 : world.speed);

  syncOut?.publishState({
    t: world.time,
    scroll: world.scroll,
    speed: world.speed,
    sx: world.ship.position.x,
    sy: world.ship.position.y,
    bank: world.ship.bank,
    pitch: world.ship.group.rotation.x,
    mode: modeManager.current.id,
    ents: modeManager.current.snapshot?.() || null, // coin-rush only
  }, world.time);

  if (debug) {
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      const info = engine.renderer.info.render;
      hud.setDebug(
        `${Math.round(frames / fpsTimer)} fps | ` +
        `${info.calls} calls | ${(info.triangles / 1000).toFixed(1)}k tris | ` +
        `mode ${modeManager.current.id}${demoActive ? ' (demo)' : ''}`
      );
      frames = 0;
      fpsTimer = 0;
    }
  }
});
