// Multi-window sync over BroadcastChannel (same browser, same origin).
// One master window runs the real simulation and publishes ~30Hz; follower
// windows render the same world through their own view offset (see
// engine.setView). The base world is deterministic f(scroll) with a shared
// seed, so idle only needs ship pose + clocks to travel — but Coin Rush spawns
// randomly, so the master also ships the active coin/asteroid transforms.
//
// Co-op play adds a reverse path: followers send their pointer to the master
// (typed 'input' messages) so you can steer from any display. Messages are
// tagged with a type so both directions share the one channel.

const CHANNEL = 'spacesaver-sync';

export class SyncChannel {
  /**
   * @param {'master'|'follow'} role
   * @param {{onState?: (s:object)=>void, onInput?: (i:object)=>void}} [handlers]
   *   follower gets onState (per master update); master gets onInput (per
   *   follower pointer update).
   */
  constructor(role, handlers = {}) {
    this.role = role;
    this.ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
    if (this.ch) {
      this.ch.onmessage = (e) => {
        const m = e.data;
        if (!m) return;
        if (m.type === 'state' && role === 'follow') handlers.onState?.(m);
        else if (m.type === 'input' && role === 'master') handlers.onInput?.(m);
      };
    }
    this._lastState = -Infinity;
    this._lastInput = -Infinity;
  }

  /** Master: publish world state, throttled to ~30Hz. */
  publishState(state, now) {
    if (!this.ch || now - this._lastState < 0.033) return;
    this._lastState = now;
    state.type = 'state';
    this.ch.postMessage(state);
  }

  /** Follower: publish this display's pointer to the master, throttled ~60Hz. */
  publishInput(input, now) {
    if (!this.ch || now - this._lastInput < 0.016) return;
    this._lastInput = now;
    input.type = 'input';
    this.ch.postMessage(input);
  }
}
