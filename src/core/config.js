// Central tunables. Everything perf- or feel-critical lives here.
export const CONFIG = {
  // flight corridor the ship (and spawns) stay inside, world units
  corridor: { x: 26, y: 15 },

  // seconds without significant input before the game fades back to idle
  idleTimeout: 6,
  // seconds of idle before the "move the mouse" hint appears
  hintDelay: 10,
  // seconds after entering idle during which activity is ignored (settle grace)
  idleGrace: 0.8,

  pixelRatioCap: 1.75,

  bloom: { strength: 0.9, radius: 0.6, threshold: 0.8 },

  stars: {
    layers: [
      { count: 6000, box: 700, parallax: 1.0, size: 2.7, brightness: 1.35 },
      { count: 4000, box: 950, parallax: 0.55, size: 2.0, brightness: 0.9 },
      { count: 2500, box: 1300, parallax: 0.28, size: 1.5, brightness: 0.6 },
    ],
  },

  trail: { max: 340, life: 1.0, rate: 80 },

  coins: { max: 40, radius: 1.7 },
  asteroids: { max: 30, minScale: 1.6, maxScale: 5.0, hitFactor: 0.8 },

  spawnZ: -360,
  killZ: 25,

  idleSpeed: 70,
  shipScale: 0.72,
  shipRadius: 1.3,
  // ship hitbox half-extents (world units) — wide for the wings, flat, long.
  // pickup is generous (rings snap from further away, visuals unchanged),
  // hurt is tighter so asteroid hits feel fair.
  shipPickup: { x: 3.6, y: 1.9, z: 2.6 },
  shipHurt: { x: 2.7, y: 1.0, z: 2.1 },
  lives: 3,
  invulnTime: 2.0,
  comboWindow: 2.0,
  gameOverTime: 4.0,
};
