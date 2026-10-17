/* global __BUILD__ */
import { useEffect, useRef, useState } from 'react';
import { judge, mayReload, parseBuild } from './versionCheck.js';

/** What this tab is running: stamped in by vite.config.js when the site was built. */
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { id: 'dev', commit: 'dev', dirty: false, builtAt: null };

const POLL_MS = 60_000;
const RECHECK_MS = 5_000;

/** What is deployed right now, or null when it can't be read (offline, or an older deploy without a version file). */
const fetchLiveBuild = async () => {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseBuild(await res.json());
  } catch {
    return null;
  }
};

/**
 * Returns the newer build once a deploy has replaced the one this tab is
 * running, else null. Checks every minute while the tab is visible, and the
 * moment a hidden tab comes back or the network returns — a branch screen left
 * open all day would otherwise run last week's code indefinitely.
 */
export const useBuildUpdate = () => {
  const [newer, setNewer] = useState(null);
  const candidate = useRef(null);

  useEffect(() => {
    if (import.meta.env.DEV) return undefined;
    let stopped = false;
    let recheck = null;

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      clearTimeout(recheck);
      const found = await fetchLiveBuild();
      if (stopped) return;
      const verdict = judge(BUILD.id, found, candidate.current);
      candidate.current = verdict.candidate;
      if (verdict.show) setNewer(verdict.candidate);
      else if (verdict.recheck) recheck = setTimeout(check, RECHECK_MS);
    };

    check();
    const timer = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    return () => {
      stopped = true;
      clearTimeout(recheck);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
    };
  }, []);

  return newer;
};

const RELOAD_KEY = 'mdawra_chunk_reload';

/**
 * A tab opened before a deploy still points at script files the deploy replaced,
 * so opening a page it hadn't loaded yet fails. Reload once to pick up the new
 * version. If that doesn't cure it (the deploy itself is broken) the guard stops a
 * second reload and the error shows, rather than looping.
 */
export const installStaleChunkReload = () => {
  window.addEventListener('vite:preloadError', () => {
    try {
      if (!mayReload(sessionStorage.getItem(RELOAD_KEY), Date.now())) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return; // no storage means no loop guard, so don't risk reloading forever
    }
    window.location.reload();
  });
};
