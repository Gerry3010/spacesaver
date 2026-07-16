import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { ModeManager } from './core/mode-manager.js';
import { World } from './world/world.js';
import { Hud } from './ui/hud.js';
import { idleMode } from './modes/idle-mode.js';
import { coinRushMode } from './modes/coin-rush-mode.js';

const canvas = document.getElementById('scene');
const engine = new Engine(canvas);
const world = new World();
engine.attach(world.scene, world.camera);

const input = new Input();
const hud = new Hud();

const modeManager = new ModeManager({ world, input, hud });
modeManager.register(idleMode);
modeManager.register(coinRushMode);
modeManager.switchTo('idle');

const params = new URLSearchParams(location.search);
const debug = params.has('debug');
if (debug) window.__spacesaver = { engine, world, input, hud, modeManager };

// ?demo=coin-rush: drive the game with a synthetic pilot (for headless
// screenshots and tuning — there is no real mouse in that context)
const demo = params.get('demo');
if (demo) modeManager.switchTo(demo);
let frames = 0;
let fpsTimer = 0;

engine.start((dt) => {
  if (demo) {
    input.nx = Math.sin(world.time * 0.5) * 0.6;
    input.ny = Math.sin(world.time * 0.37) * 0.5;
    input.lastActivity = world.time;
  }
  input.update(dt, world.time);
  modeManager.update(dt);
  world.update(dt);

  if (debug) {
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      const info = engine.renderer.info.render;
      hud.setDebug(
        `${Math.round(frames / fpsTimer)} fps | ` +
        `${info.calls} calls | ${(info.triangles / 1000).toFixed(1)}k tris | ` +
        `mode ${modeManager.current.id}`
      );
      frames = 0;
      fpsTimer = 0;
    }
  }
});
