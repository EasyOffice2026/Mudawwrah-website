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

export const playChime = () => {
  try {
    const audio = context();
    if (!audio) return;
    audio.resume();
    [880, 1320].forEach((freq, index) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audio.destination);
      const start = audio.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    /* audio is a nicety, never a failure */
  }
};
