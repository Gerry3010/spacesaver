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

    window.addEventListener('pointermove', (e) => {
      this.nx = (e.clientX / window.innerWidth) * 2 - 1;
      this.ny = -((e.clientY / window.innerHeight) * 2 - 1);
      this._pending += Math.abs(e.movementX ?? 0) + Math.abs(e.movementY ?? 0);
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

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
