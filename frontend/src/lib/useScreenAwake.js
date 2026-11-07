import { useEffect } from 'react';

/**
 * Asks the screen to stay on while this page is open, where the browser allows it (a screen wake lock). A branch
 * tablet that dims and locks stops checking in: its orders go unseen and the owner sees it as offline. The lock
 * lapses whenever the page is hidden, so it is asked for again each time the page comes back.
 */
export function useScreenAwake(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let lock = null;
    const hold = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) || null;
      } catch {
        lock = null;
      }
    };
    hold();
    const again = () => document.visibilityState === 'visible' && hold();
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      lock?.release?.().catch(() => {});
    };
  }, [enabled]);
}
