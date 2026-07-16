// Pure difficulty curves over elapsed play time t (seconds).
// Everything ramps for 2 minutes, then plateaus.

const RAMP = 120;

export function worldSpeed(t) {
  return 60 + Math.min(t, RAMP) * 0.8; // 60 -> 156
}

export function spawnInterval(t) {
  return Math.max(0.45, 1.2 - (Math.min(t, RAMP) / RAMP) * 0.75); // 1.2s -> 0.45s
}

export function asteroidShare(t) {
  return 0.3 + (Math.min(t, RAMP) / RAMP) * 0.3; // 30% -> 60%
}
