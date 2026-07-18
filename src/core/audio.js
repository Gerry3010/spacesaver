import { coinFreq, humFreq, humGain, ambientChord } from '../game/audio-math.js';

// Procedural sound: everything is synthesized live via the Web Audio API — no
// asset files (repo rule). Short arcade blips for coins/hits/menu, plus a
// continuous engine hum that tracks the world speed. Muted state persists in
// localStorage; a low master volume keeps it unobtrusive.

const STORE_KEY = 'spacesaver.muted';
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
const MASTER_VOLUME = 0.55;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hum = null;
    this.ambient = null;
    this.muted = (typeof localStorage !== 'undefined') && localStorage.getItem(STORE_KEY) === '1';

    // Browsers block audio until a user gesture. Arm one-time unlockers; the
    // first real interaction (which also starts the game) boots the context.
    if (typeof window !== 'undefined') {
      this._onGesture = () => this.unlock();
      for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, this._onGesture);
    }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx.state === 'running') {
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, this._onGesture);
    }
  }

  _ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  // --- one-shot blip: an oscillator with a fast attack + exponential decay ---
  _blip({ type = 'sine', freq, freqEnd, dur = 0.12, gain = 0.3, delay = 0 }) {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noiseBuffer(dur) {
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); // decaying
    return buf;
  }

  // --- game events ---
  coin(combo = 1) {
    const f = coinFreq(combo);
    this._blip({ type: 'triangle', freq: f, freqEnd: f * 1.5, dur: 0.11, gain: 0.22 });
    this._blip({ type: 'sine', freq: f * 2, dur: 0.06, gain: 0.08, delay: 0.02 }); // sparkle
  }

  hit() {
    if (!this._ready()) return;
    const t0 = this.ctx.currentTime;
    // grit: a short noise burst swept down through a lowpass
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.22);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t0);
    lp.frequency.exponentialRampToValueAtTime(220, t0 + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.26);
    // body: a low thud drop
    this._blip({ type: 'sine', freq: 150, freqEnd: 55, dur: 0.26, gain: 0.3 });
  }

  gameOver() {
    // a descending three-note sting
    this._blip({ type: 'sawtooth', freq: 440, freqEnd: 330, dur: 0.18, gain: 0.2 });
    this._blip({ type: 'sawtooth', freq: 330, freqEnd: 247, dur: 0.2, gain: 0.2, delay: 0.16 });
    this._blip({ type: 'sawtooth', freq: 247, freqEnd: 98, dur: 0.5, gain: 0.22, delay: 0.34 });
  }

  menuOpen() {
    this._blip({ type: 'sine', freq: 330, freqEnd: 494, dur: 0.16, gain: 0.14 });
  }

  click() {
    this._blip({ type: 'square', freq: 660, dur: 0.045, gain: 0.1 });
  }

  // --- ambient space pad: a slow, evolving drone bed under everything ---
  _startAmbient() {
    if (this.ambient || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    lp.Q.value = 0.5;
    lp.connect(bus).connect(this.master);

    // open-fifth chord voices, higher ones quieter, gently detuned so they beat
    const oscs = ambientChord(55).map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = i % 2 ? 6 : -6;
      const g = ctx.createGain();
      g.gain.value = 0.5 / (i + 1);
      o.connect(g).connect(lp);
      o.start();
      return o;
    });

    // filtered noise "solar wind" — a breath of texture over the drone
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 220;
    bp.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.06;
    noise.connect(bp).connect(noiseGain).connect(bus);
    noise.start();

    // two slow LFOs: one breathes the whole bed, one sweeps the filter
    const breathe = ctx.createOscillator();
    breathe.frequency.value = 0.05;
    const breatheGain = ctx.createGain();
    breatheGain.gain.value = 0.03;
    breathe.connect(breatheGain).connect(bus.gain);
    breathe.start();

    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.033;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 220;
    sweep.connect(sweepGain).connect(lp.frequency);
    sweep.start();

    bus.gain.exponentialRampToValueAtTime(0.075, t + 5); // slow fade-in
    this.ambient = { bus, lp, oscs, noise, breathe, sweep };
  }

  // --- continuous engine hum, driven from the render loop each frame ---
  setEngine(speed) {
    if (!this._ready()) {
      if (this.hum) this.hum.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    this._startAmbient(); // lazy-start the ambient bed once audio is live
    if (!this.hum) {
      const osc = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      g.gain.value = 0;
      osc.connect(lp).connect(g).connect(this.master);
      osc.start();
      this.hum = { osc, lp, g };
    }
    const t = this.ctx.currentTime;
    this.hum.osc.frequency.setTargetAtTime(humFreq(speed), t, 0.1);
    this.hum.g.gain.setTargetAtTime(humGain(speed), t, 0.15);
  }

  // --- mute toggle (persisted) ---
  get isMuted() {
    return this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORE_KEY, this.muted ? '1' : '0');
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
    }
    if (this.muted && this.hum) this.hum.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}

export const audio = new AudioEngine();
