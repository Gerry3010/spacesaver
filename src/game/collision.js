// Pure sphere collision math, kept three-free so it is unit-testable.

export function spheresHit(ax, ay, az, ar, bx, by, bz, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  const r = ar + br;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/**
 * Ellipsoid vs point-ish target: the ship is wide (wings), flat and long,
 * so a sphere either misses the wings or is unfairly tall. Extents are the
 * ship's half-sizes per axis with the target's radius already added on.
 */
export function ellipsoidHit(dx, dy, dz, rx, ry, rz) {
  const x = dx / rx;
  const y = dy / ry;
  const z = dz / rz;
  return x * x + y * y + z * z <= 1;
}
