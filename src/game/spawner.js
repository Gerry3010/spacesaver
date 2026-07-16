import { CONFIG } from '../core/config.js';
import { spawnInterval, asteroidShare } from './difficulty.js';

/** Pure: decide what to spawn. Exported for tests. */
export function pickType(rand, share) {
  return rand < share ? 'asteroid' : 'coin';
}

/**
 * Pure: layout for a string of coins flying in a gentle arc.
 * Returns offsets relative to the string origin; z grows away from the camera.
 * Exported for tests.
 */
export function coinStringOffsets(count, curve) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: curve * i * i * 0.6,
      y: Math.sin((i / Math.max(count - 1, 1)) * Math.PI) * curve * 3,
      z: 0 - i * 7, // 0 - … keeps i=0 at +0, not -0
    });
  }
  return out;
}

/** Timed spawning of coins & asteroids ahead of the ship. */
export class Spawner {
  constructor(coins, asteroids) {
    this.coins = coins;
    this.asteroids = asteroids;
    this.reset();
  }

  reset() {
    this.timer = 0.6; // first spawn arrives quickly
  }

  update(dt, elapsed) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = spawnInterval(elapsed) * (0.75 + Math.random() * 0.5);

    const cx = CONFIG.corridor.x;
    const cy = CONFIG.corridor.y;
    const x = (Math.random() * 2 - 1) * cx;
    const y = (Math.random() * 2 - 1) * cy;

    if (pickType(Math.random(), asteroidShare(elapsed)) === 'asteroid') {
      this.asteroids.spawn(x, y, CONFIG.spawnZ);
    } else {
      const count = 3 + Math.floor(Math.random() * 3); // 3..5
      const curve = (Math.random() * 2 - 1) * 1.2;
      const offsets = coinStringOffsets(count, curve);
      for (const o of offsets) {
        const px = Math.max(-cx, Math.min(cx, x + o.x));
        const py = Math.max(-cy, Math.min(cy, y + o.y));
        this.coins.spawn(px, py, CONFIG.spawnZ + o.z);
      }
    }
  }
}
