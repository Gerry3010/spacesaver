import { CONFIG } from '../core/config.js';
import { CoinField, AsteroidField } from '../game/entities.js';
import { Spawner } from '../game/spawner.js';
import { ellipsoidHit } from '../game/collision.js';
import { steeringCurve } from '../game/steering.js';
import { worldSpeed } from '../game/difficulty.js';

// The arcade game: mouse steering, catch coins, dodge asteroids.
// GAME_OVER is a sub-state here, not a top-level mode.

export const coinRushMode = {
  id: 'coin-rush',
  label: 'Coin Rush',
  coins: null,

  _init(ctx) {
    if (this.coins) return;
    this.coins = new CoinField(ctx.world.scene);
    this.asteroids = new AsteroidField(ctx.world.scene);
    this.spawner = new Spawner(this.coins, this.asteroids);
    // fields keep flowing past even after the mode exits (leftovers drift away)
    ctx.world.updatables.push((dt, speed) => {
      this.coins.update(dt, speed);
      this.asteroids.update(dt, speed);
    });
  },

  enter(ctx) {
    this._init(ctx);
    this._startRun(ctx);
  },

  _startRun(ctx) {
    this.state = 'play';
    this.elapsed = 0;
    this.score = 0;
    this.lives = CONFIG.lives;
    this.combo = 0;
    this.lastCoinAt = -99;
    this.invulnUntil = 0;
    this.spawner.reset();
    ctx.hud.hideGameOver();
    ctx.hud.setPlaying(true);
    ctx.hud.setScore(0);
    ctx.hud.setLives(this.lives, CONFIG.lives);
    ctx.hud.setCombo(0);
  },

  update(dt, ctx) {
    const { world, input, hud } = ctx;

    if (this.state === 'gameover') {
      world.speed += (CONFIG.idleSpeed - world.speed) * Math.min(dt * 0.8, 1);
      if (input.activitySince(this.gameOverAt + 0.7)) {
        this._startRun(ctx);
        return;
      }
      if (world.time > this.gameOverAt + CONFIG.gameOverTime) {
        ctx.modeManager.switchTo('idle');
      }
      return;
    }

    this.elapsed += dt;
    world.speed += (worldSpeed(this.elapsed) - world.speed) * Math.min(dt * 1.5, 1);

    // power-curve steering: precise around the center, expansive toward the
    // edges — pointer at the screen border pins the ship to the corridor edge
    const st = CONFIG.steering;
    const c = CONFIG.corridor;
    world.ship.setTarget(
      steeringCurve(input.nx, st.exponent) * c.x * st.overshoot,
      steeringCurve(input.ny, st.exponent) * c.y * st.overshoot
    );

    this.spawner.update(dt, this.elapsed);

    const ship = world.ship;
    const sp = ship.position;

    // coins — generous wing-wide pickup ellipsoid, visuals unchanged
    const pu = CONFIG.shipPickup;
    const cr = this.coins.radius;
    this.coins.pool.forEachActive((i) => {
      if (
        ellipsoidHit(sp.x - this.coins.x[i], sp.y - this.coins.y[i], sp.z - this.coins.z[i],
          pu.x + cr, pu.y + cr, pu.z + cr)
      ) {
        world.trail.burst(this.coins.x[i], this.coins.y[i], this.coins.z[i]);
        this.coins.remove(i);
        this.combo = world.time - this.lastCoinAt <= CONFIG.comboWindow ? this.combo + 1 : 1;
        this.lastCoinAt = world.time;
        const mult = Math.min(this.combo, 10);
        this.score += 10 * mult;
        hud.setScore(this.score);
        hud.setCombo(mult);
      }
    });
    if (this.combo > 0 && world.time - this.lastCoinAt > CONFIG.comboWindow) {
      this.combo = 0;
      hud.setCombo(0);
    }

    // asteroids
    if (world.time < this.invulnUntil) {
      ship.flashShield(Math.max(ship.shieldFlash, 0.35)); // sustained pulse while invulnerable
    }
    const hu = CONFIG.shipHurt;
    this.asteroids.pool.forEachActive((i) => {
      if (this.state !== 'play' || world.time < this.invulnUntil) return;
      const ar = this.asteroids.radiusOf(i);
      if (
        ellipsoidHit(sp.x - this.asteroids.x[i], sp.y - this.asteroids.y[i], sp.z - this.asteroids.z[i],
          hu.x + ar, hu.y + ar, hu.z + ar)
      ) {
        this.asteroids.remove(i);
        this._hit(ctx);
      }
    });

    // player walked away mid-game
    if (input.idleFor() > CONFIG.idleTimeout) {
      ctx.modeManager.switchTo('idle');
    }
  },

  _hit(ctx) {
    const { world, hud } = ctx;
    this.lives -= 1;
    hud.setLives(this.lives, CONFIG.lives);
    world.rig.addShake(1.0);
    world.ship.flashShield(1);
    this.invulnUntil = world.time + CONFIG.invulnTime;
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.gameOverAt = world.time;
      hud.showGameOver(this.score);
    }
  },

  exit(ctx) {
    ctx.hud.setCombo(0);
    ctx.hud.setPlaying(false);
    ctx.hud.hideGameOver();
  },
};
