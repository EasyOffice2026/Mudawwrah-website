import assert from 'node:assert/strict';
import { test } from 'node:test';
import { domainCandidates } from '../src/middleware/tenant.js';

test('a domain is tried as typed first, then with or without "www."', () => {
  assert.deepEqual(domainCandidates('www.khobztmaraei.com'), ['www.khobztmaraei.com', 'khobztmaraei.com']);
  assert.deepEqual(domainCandidates('khobztmaraei.com'), ['khobztmaraei.com', 'www.khobztmaraei.com']);
  assert.deepEqual(domainCandidates('www.madawarah.com'), ['www.madawarah.com', 'madawarah.com']);
});

test('case and stray spaces do not matter; nothing is tried for an empty address', () => {
  assert.deepEqual(domainCandidates(' WWW.Madawarah.COM '), ['www.madawarah.com', 'madawarah.com']);
  assert.deepEqual(domainCandidates(''), []);
  assert.deepEqual(domainCandidates(undefined), []);
});
