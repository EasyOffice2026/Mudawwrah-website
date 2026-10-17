/**
 * The decision half of "is this tab out of date?", free of React and the DOM
 * so each rule can be tested on its own.
 *
 * Every build stamps itself — { id, commit, dirty, builtAt } — and publishes the
 * same object as /version.json. A tab compares its own id with the published one.
 */

/** A /version.json body as build info, or null when it isn't one (an older deploy answers with HTML). */
export const parseBuild = (body) => (body && typeof body.id === 'string' && body.id ? body : null);

/**
 * One step of the update check. `found` is what /version.json said just now
 * (null when it couldn't be read), `candidate` the differing build seen on the
 * previous check.
 *
 * The banner only shows once the SAME different build has been seen twice in a
 * row. Right after a deploy some edge servers briefly still serve the old file,
 * and a tab that has just loaded the newest build must not be told to update to
 * the one before it.
 */
export const judge = (ownId, found, candidate) => {
  if (!found || found.id === ownId) return { show: false, candidate: null, recheck: false };
  if (candidate && candidate.id === found.id) return { show: true, candidate, recheck: false };
  return { show: false, candidate: found, recheck: true };
};

/**
 * Whether the page may reload itself after a script failed to load. Never twice
 * within `windowMs`: if the reload didn't cure it, the deploy really is broken
 * and looping would only hide that.
 */
export const mayReload = (lastReloadAt, now, windowMs = 30000) => {
  const last = Number(lastReloadAt);
  return !(last && now - last < windowMs);
};

/** "6 Oct, 21:00": when a build was made, in the restaurant's timezone (Kuwait). */
export const formatBuildTime = (builtAt, lang = 'en', timeZone = 'Asia/Kuwait') => {
  const date = new Date(builtAt);
  if (!builtAt || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};
