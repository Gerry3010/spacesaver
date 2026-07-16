// Mode registry + state machine.
// A mode is { id, enter(ctx), update(dt, ctx), exit(ctx) }.
// Adding a future mini-game = one new file in src/modes/ + one register() call.

export class ModeManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.modeManager = this;
    this.modes = new Map();
    this.current = null;
  }

  register(mode) {
    this.modes.set(mode.id, mode);
  }

  switchTo(id) {
    const next = this.modes.get(id);
    if (!next || next === this.current) return;
    if (this.current) this.current.exit(this.ctx);
    this.current = next;
    this.current.enter(this.ctx);
  }

  update(dt) {
    if (this.current) this.current.update(dt, this.ctx);
  }
}
