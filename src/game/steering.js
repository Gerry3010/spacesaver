// Pure steering response curve.
// Linear pointer→corridor mapping felt cramped: the visible frustum at the
// flight plane is roughly half the corridor, so the edges were unreachable.
// A power curve keeps the center fine-grained (precision) and expands
// toward the edges — pointer at the screen border = ship at the corridor
// border, on any screen/aspect (mobile included).

/**
 * @param {number} n normalized pointer position, -1..1
 * @param {number} exponent >1 = softer center, harder edges
 * @returns {number} shaped -1..1
 */
export function steeringCurve(n, exponent) {
  const c = Math.min(Math.abs(n), 1) ** exponent;
  return n < 0 ? -c : c;
}
