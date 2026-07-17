// Pointer tracking + activity detection.
// "Significant" movement uses a decaying accumulator so desk vibrations or a
// single 1px jitter never start the game, but a real flick does immediately.

const SIGNIFICANT_PX = 8;

export class Input {
  constructor() {
    this.nx = 0; // normalized -1..1, +x right
    this.ny = 0; // normalized -1..1, +y up
    this.moveAcc = 0;
    this.lastActivity = -Infinity; // seconds on the engine clock
    this.time = 0;
    this._pending = 0;
    this._forceActivity = false;

    this._lastX = null;
    this._lastY = null;
    window.addEventListener('pointermove', (e) => {
      this.nx = (e.clientX / window.innerWidth) * 2 - 1;
      this.ny = -((e.clientY / window.innerHeight) * 2 - 1);
      // track deltas ourselves — movementX/Y is 0/undefined for touch pointers
      if (this._lastX !== null) {
        this._pending += Math.abs(e.clientX - this._lastX) + Math.abs(e.clientY - this._lastY);
      }
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    window.addEventListener('pointerdown', (e) => {
      this._forceActivity = true;
      if (e.button === 1) e.preventDefault(); // no middle-click autoscroll
    });
    // it's a game surface — no context menu, no accidental drag/select
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('selectstart', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // menu toggle — deliberately NOT activity (must not start the game)
        this.onEscape?.();
        return;
      }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      this._forceActivity = true;
    });

    const fsBtn = document.getElementById('fs-btn');
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
  }

  update(dt, time) {
    this.time = time;
    this.moveAcc = this.moveAcc * Math.exp(-dt * 4) + this._pending;
    this._pending = 0;
    if (this.moveAcc > SIGNIFICANT_PX || this._forceActivity) {
      this.lastActivity = time;
      this._forceActivity = false;
    }
  }

  /** Seconds since the last significant activity. */
  idleFor() {
    return this.time - this.lastActivity;
  }

  /** True if there was significant activity after the given engine-time. */
  activitySince(t) {
    return this.lastActivity > t;
  }
}

let _programmaticExit = false;

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    _programmaticExit = true;
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

/**
 * True once if the last fullscreen exit was ours (F key / button) rather
 * than the browser swallowing ESC — that case should open the pause menu.
 */
export function consumeProgrammaticFullscreenExit() {
  const v = _programmaticExit;
  _programmaticExit = false;
  return v;
}
