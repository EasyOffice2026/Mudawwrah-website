/**
 * Two-tone chime, synthesised so the build needs no audio asset.
 *
 * Browsers only let a page make sound after someone has interacted with it,
 * so a dashboard left open untouched stays silent until its first click.
 * unlockAudio() — called from the "Turn on alerts" button — gets that out of
 * the way, so the first new order of the shift is actually heard.
 */
let ctx = null;

const context = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
};

export const unlockAudio = () => {
  try {
    context()?.resume();
  } catch {
    /* audio is a nicety, never a failure */
  }
};

/**
 * Tells `callback` whether the browser currently lets this page make sound —
 * once now and again whenever that changes. A page that has just (re)loaded
 * stays silent until someone clicks it, which on a branch screen means the
 * first new order of the day can arrive unheard.
 */
export const watchAudio = (callback) => {
  let audio = null;
  try {
    audio = context();
  } catch {
    /* no Web Audio at all */
  }
  if (!audio) {
    callback(true); // nothing to warn about
    return () => {};
  }
  const report = () => callback(audio.state === 'running');
  report();
  audio.addEventListener('statechange', report);
  return () => audio.removeEventListener('statechange', report);
};

// A telephone ring: two high notes flipping quickly, in two bursts (about 1.4 s). Square waves at near full
// volume carry over a kitchen's noise, where the old soft two-note chime went unheard.
const RING_NOTES = [1046.5, 1318.5];
const FLIPS = 8;
const FLIP_S = 0.07;
const BURST_GAP_S = 0.24;

export const playChime = () => {
  try {
    const audio = context();
    if (!audio) return;
    audio.resume();
    // The compressor keeps the ring as loud as the speaker allows without crackling.
    const limiter = audio.createDynamicsCompressor();
    limiter.connect(audio.destination);
    const begin = audio.currentTime + 0.03;
    for (let burst = 0; burst < 2; burst += 1) {
      for (let flip = 0; flip < FLIPS; flip += 1) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = RING_NOTES[flip % 2];
        osc.connect(gain);
        gain.connect(limiter);
        const start = begin + burst * (FLIPS * FLIP_S + BURST_GAP_S) + flip * FLIP_S;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.9, start + 0.005);
        gain.gain.setValueAtTime(0.9, start + FLIP_S - 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + FLIP_S);
        osc.start(start);
        osc.stop(start + FLIP_S);
      }
    }
  } catch {
    /* audio is a nicety, never a failure */
  }
};
