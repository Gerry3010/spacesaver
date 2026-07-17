// Pure math for Explore mode — three-free, unit-tested.

/** Pointer position (-1..1) → turn rate with a small center deadzone (rad/s).
 *  Blended linear+quadratic response: still eased right around the center
 *  (no jitter) but climbs fast — pushing halfway already gives real turn rate. */
export function turnRate(n, deadzone = 0.09, maxRate = 2.4) {
  const a = Math.abs(n);
  if (a <= deadzone) return 0;
  const t = Math.min((a - deadzone) / (1 - deadzone), 1);
  const shaped = t * (0.45 + 0.55 * t); // 0.45·linear + 0.55·squared, =1 at edge
  return Math.sign(n) * shaped * maxRate;
}

/** Autopilot braking curve: fast far out, zero at arrival distance. */
export function approachSpeed(dist, arrive, maxSpeed) {
  return Math.max(0, Math.min((dist - arrive) * 0.85, maxSpeed));
}

/** Shortest signed angular difference a→b, wrap-aware (radians). */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Planet visual radius from Earth radii — log-ish squash, Earth≈1.15, Jupiter≈3.9, capped. */
export function planetRadius(rade) {
  const r = Math.max(rade ?? 1, 0.3);
  return Math.min(1.15 * Math.sqrt(r), 5.5);
}

/** Star visual radius from solar radii. */
export function starRadius(stRad) {
  const r = Math.max(stRad ?? 1, 0.05);
  return Math.min(Math.max(11 * Math.pow(r, 0.4), 5), 20);
}

/** Star color from effective temperature (K) — rough blackbody buckets. */
export function starColorHex(teff) {
  const t = teff ?? 5500;
  if (t < 3200) return 0xff8a4a; // M — orange-red
  if (t < 4700) return 0xffb46b; // K — orange
  if (t < 6000) return 0xfff3c9; // G — warm white
  if (t < 7500) return 0xf6f4ff; // F — white
  return 0xbcd0ff;               // A and hotter — blue-white
}

/** Coarse planet class from radius/mass (Earth units). */
export function planetType(rade, masse) {
  const r = rade ?? (masse != null ? Math.pow(masse, 0.42) : 1); // 318 M⊕ → ~11 R⊕
  if (r >= 6) return 'jovian';
  if (r >= 3.2) return 'neptunian';
  if (r >= 1.7) return 'super-earth';
  return 'rocky';
}

/** Decorative orbit ring radius for planet index i. */
export function orbitRadius(i, starR) {
  return starR + 16 + i * 12;
}

/** Deterministic system position in the explore volume (golden-angle spiral). */
export function systemPosition(i) {
  if (i === 0) return [0, 0, 0];
  const angle = i * 2.39996; // golden angle
  const r = 420 + i * 150;
  const y = ((i * 73) % 240) - 120;
  return [Math.cos(angle) * r, y, Math.sin(angle) * r];
}
