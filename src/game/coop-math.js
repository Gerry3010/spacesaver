// Pure helpers for multi-display co-op play — no DOM, no THREE, so they're
// unit-testable. Used by input.js (pointer mapping) and main.js (input
// arbitration between displays).

function clamp1(v) {
  const r = v < -1 ? -1 : v > 1 ? 1 : v;
  return r === 0 ? 0 : r; // normalize -0 → 0
}

/**
 * Map a window-local pointer to normalized coords on the *virtual* canvas that
 * spans every display. Without a view offset (single display) this is the plain
 * window mapping. With `?view=x,y,W,H` the window only shows the sub-rect at
 * (x,y) of a W×H virtual area, so the pointer's true position across the whole
 * playfield is (x+clientX, y+clientY) over W×H.
 *
 * @param {{x:number,y:number,W:number,H:number}|null} view
 * @returns {{nx:number, ny:number}} nx: -1 left … +1 right, ny: -1 down … +1 up
 */
export function virtualPointer(view, clientX, clientY, winW, winH) {
  const vx = view ? view.x + clientX : clientX;
  const vy = view ? view.y + clientY : clientY;
  const W = view ? view.W : winW;
  const H = view ? view.H : winH;
  return {
    nx: clamp1((vx / W) * 2 - 1),
    ny: clamp1(-((vy / H) * 2 - 1)),
  };
}

/**
 * Pick the pointer that steers the master: whichever display's pointer was
 * active most recently wins (timestamps are all on the master's clock, stamped
 * when input arrives). Ties/equal go to local so a solo master is unaffected.
 *
 * @param {{nx:number,ny:number,activeAt:number}} local
 * @param {{nx:number,ny:number,activeAt:number}} remote
 */
export function pickPointer(local, remote) {
  return remote.activeAt > local.activeAt ? remote : local;
}
