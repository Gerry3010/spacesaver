import { CONFIG } from '../core/config.js';

// Screensaver mode: the autopilot flies slow layered Lissajous curves.
// Any significant input hands the stick to the player (coin-rush).

export const idleMode = {
  id: 'idle',
  t: 0,
  enteredAt: 0,

  enter(ctx) {
    this.enteredAt = ctx.world.time;
    ctx.hud.setPlaying(false);
    ctx.hud.hideGameOver();
  },

  update(dt, ctx) {
    this.t += dt;
    const { world, input, hud } = ctx;

    // gentle drift toward idle cruising speed
    world.speed += (CONFIG.idleSpeed - world.speed) * Math.min(dt * 1.2, 1);

    // layered sines — never repeats visibly, always smooth
    const t = this.t;
    const x = Math.sin(t * 0.21) * 14 + Math.sin(t * 0.043 + 1.7) * 9;
    const y = Math.sin(t * 0.17 + 0.8) * 7 + Math.sin(t * 0.061) * 5;
    world.ship.setTarget(x, y);

    const idleTime = world.time - this.enteredAt;
    hud.showHint(idleTime > CONFIG.hintDelay);

    // grace period so the mouse settling after game-over doesn't restart instantly
    if (idleTime > CONFIG.idleGrace && input.activitySince(this.enteredAt + CONFIG.idleGrace)) {
      ctx.modeManager.switchTo('coin-rush');
    }
  },

  exit(ctx) {
    ctx.hud.showHint(false);
  },
};
