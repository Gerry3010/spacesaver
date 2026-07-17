// Multi-window sync over BroadcastChannel (same browser, same origin).
// One master window runs the real simulation and publishes ~30Hz; follower
// windows render the same world through their own view offset (see
// engine.setView). World content is deterministic f(scroll) with a shared
// seed, so only ship pose + clocks need to travel.

const CHANNEL = 'spacesaver-sync';

export class SyncChannel {
  /**
   * @param {'master'|'follow'} role
   * @param {(state: object) => void} [onState] follower: called per master update
   */
  constructor(role, onState) {
    this.role = role;
    this.ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
    if (this.ch && role === 'follow' && onState) {
      this.ch.onmessage = (e) => onState(e.data);
    }
    this._lastSent = -Infinity;
  }

  /** Master: publish state, throttled to ~30Hz. */
  publish(state, now) {
    if (!this.ch || now - this._lastSent < 0.033) return;
    this._lastSent = now;
    this.ch.postMessage(state);
  }
}
