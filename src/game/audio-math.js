// Pure audio parameter math — no Web Audio, no DOM, so it's unit-testable.
// The actual synthesis lives in src/core/audio.js and feeds these numbers into
// oscillators/gains.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Coin pickup pitch: rises a semitone per combo step off a C5 base, capped so a
// long combo doesn't screech. combo is the score multiplier (1..10).
export function coinFreq(combo) {
  const step = clamp(Math.round(combo) - 1, 0, 12); // cap the climb at an octave
  return 523.25 * Math.pow(2, step / 12);
}

// Engine hum: a low drone whose pitch and loudness track the world speed.
// Idle drift (~70 u/s) is a faint background purr; full-throttle Explore
// (~260 u/s) is a louder, higher rumble. Deliberately subtle — it's ambience.
const HUM_REF_SPEED = 260;

export function humFreq(speed) {
  return 42 + clamp(speed / HUM_REF_SPEED, 0, 1) * 48; // 42..90 Hz
}

export function humGain(speed) {
  return clamp(speed / HUM_REF_SPEED, 0, 1) * 0.06; // 0..0.06, capped low
}

// Ambient space pad: an open-fifth drone stacked across octaves (root, fifth,
// octave, twelfth). No dissonant third, so it stays calm and "spacey" and
// blends under the engine hum. Frequencies in Hz off a low root (A1 = 55).
export function ambientChord(root = 55) {
  return [root, root * 1.5, root * 2, root * 3];
}
