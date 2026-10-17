import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBuildTime, judge, mayReload, parseBuild } from '../src/lib/versionCheck.js';

const OWN = 'dab75f6@2026-10-06T18:00:00.000Z';
const NEWER = { id: 'a1b2c3d@2026-10-07T09:00:00.000Z', commit: 'a1b2c3d' };

test('the same build is never an update', () => {
  assert.deepEqual(judge(OWN, { id: OWN }, null), { show: false, candidate: null, recheck: false });
});

test('an unreadable version file is ignored, not treated as an update', () => {
  assert.deepEqual(judge(OWN, null, null), { show: false, candidate: null, recheck: false });
  // ...and it forgets a pending sighting: a flaky connection can't add up to "twice in a row".
  assert.deepEqual(judge(OWN, null, NEWER), { show: false, candidate: null, recheck: false });
});

test('a different build must be seen twice in a row before the banner shows', () => {
  const first = judge(OWN, NEWER, null);
  assert.deepEqual(first, { show: false, candidate: NEWER, recheck: true }); // look again in a few seconds
  const second = judge(OWN, NEWER, first.candidate);
  assert.equal(second.show, true);
});

test('a brief glimpse of another build (an edge server mid-deploy) shows nothing', () => {
  const first = judge(OWN, NEWER, null);
  const second = judge(OWN, { id: OWN }, first.candidate); // the next read is our own build again
  assert.deepEqual(second, { show: false, candidate: null, recheck: false });
});

test('two different builds in a row are not "the same build twice"', () => {
  const other = { id: 'ffffff0@2026-10-08T09:00:00.000Z' };
  const first = judge(OWN, NEWER, null);
  const second = judge(OWN, other, first.candidate);
  assert.deepEqual(second, { show: false, candidate: other, recheck: true });
});

test('version.json bodies: build info, or null for anything else', () => {
  assert.deepEqual(parseBuild({ id: OWN, commit: 'dab75f6' }), { id: OWN, commit: 'dab75f6' });
  assert.equal(parseBuild(null), null);
  assert.equal(parseBuild({}), null);
  assert.equal(parseBuild({ id: '' }), null);
  assert.equal(parseBuild({ id: 42 }), null);
  assert.equal(parseBuild('<!doctype html>'), null);
});

test('a failed script load reloads the page once, never in a loop', () => {
  const now = 1_000_000;
  assert.equal(mayReload(null, now), true); // first time
  assert.equal(mayReload('0', now), true);
  assert.equal(mayReload(String(now - 5_000), now), false); // reloaded 5 s ago and it still failed
  assert.equal(mayReload(String(now - 31_000), now), true); // long enough ago: a different deploy
  assert.equal(mayReload('not a number', now), true);
});

test('build time is shown in Kuwait time', () => {
  // 18:00 UTC is 21:00 in Kuwait — the restaurant's clock, not the server's (Tokyo).
  const text = formatBuildTime('2026-10-06T18:00:00.000Z');
  assert.match(text, /21:00/);
  assert.match(text, /Oct/);
  assert.equal(formatBuildTime(null), '');
  assert.equal(formatBuildTime('garbage'), '');
});
