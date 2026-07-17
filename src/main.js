import { Engine } from './core/engine.js';
import { Input, consumeProgrammaticFullscreenExit } from './core/input.js';
import { ModeManager } from './core/mode-manager.js';
import { SyncChannel } from './core/sync.js';
import { World } from './world/world.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Leaderboard } from './ui/leaderboard.js';
import { CONFIG } from './core/config.js';
import { idleMode } from './modes/idle-mode.js';
import { coinRushMode } from './modes/coin-rush-mode.js';

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
if (view) {
  const [x, y, W, H] = view.split(',').map(Number);
  if (W > 0 && H > 0) engine.setView({ x, y, W, H });
}

const input = new Input();
const hud = new Hud();

const ctx = { world, input, hud };
const modeManager = new ModeManager(ctx);
modeManager.register(idleMode);
modeManager.register(coinRushMode);
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
const syncIn = syncRole === 'follow'
  ? new SyncChannel('follow', (s) => { remote = s; remoteAge = 0; })
  : null;
const syncOut = syncRole === 'master' ? new SyncChannel('master') : null;
if (syncRole === 'follow') document.body.classList.add('follower');

// ---- demo pilot (?demo=coin-rush or the menu button) ----
let demoActive = false;
function startDemo() {
  demoActive = true;
  input.moveAcc = 0; // real mouse movement from here on ends the demo
  modeManager.switchTo('coin-rush');
}
if (params.get('demo')) startDemo();

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
    startDemo();
    setPaused(false);
  },
});

input.onEscape = () => setPaused(!paused);

// browsers swallow ESC in fullscreen to exit it — treat that exit as the
// menu request it was (F key / button exits pass through silently)
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !consumeProgrammaticFullscreenExit()) {
    setPaused(true);
  }
});

if (debug) window.__spacesaver = { engine, world, input, hud, modeManager };

let frames = 0;
let fpsTimer = 0;

engine.start((dt) => {
  if (syncRole === 'follow') {
    // render-only window: adopt the master's clocks and ship pose
    if (remote) {
      remoteAge += dt;
      world.speed = remote.speed;
      const targetScroll = remote.scroll + remote.speed * remoteAge;
      world.scroll += (targetScroll - world.scroll) * Math.min(dt * 8, 1) - world.speed * dt;
      world.update(dt); // adds speed*dt back and animates everything else
      world.time = remote.t + remoteAge;
      world.ship.snapTo(remote.sx, remote.sy, remote.bank, remote.pitch);
    } else {
      world.update(dt); // no master yet: free-run
    }
    return;
  }

  if (demoActive) {
    input.nx = Math.sin(world.time * 0.5) * 0.6;
    input.ny = Math.sin(world.time * 0.37) * 0.5;
    input.lastActivity = world.time;
  }
  input.update(dt, world.time);
  if (demoActive && input.moveAcc > 12) demoActive = false; // player takes over

  if (paused) {
    world.scenicUpdate(dt);
  } else {
    modeManager.update(dt);
    world.update(dt);
  }

  syncOut?.publish({
    t: world.time,
    scroll: world.scroll,
    speed: world.speed,
    sx: world.ship.position.x,
    sy: world.ship.position.y,
    bank: world.ship.bank,
    pitch: world.ship.group.rotation.x,
    mode: modeManager.current.id,
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
