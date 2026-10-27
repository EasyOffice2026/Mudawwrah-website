import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkServerReady } from '../scripts/serverGuard.mjs';

// A pretend history: a1 -> b2 (server change) -> c3 (website only). The live server may run any of them.
const history = ['a1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'b2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'c3ccccccccccccccccccccccccccccccccccccccc'];
const full = (ref) => history.find((c) => c.startsWith(ref));
const gitWith = ({ serverChange = history[1], fetched = true } = {}) => {
  let haveAll = fetched;
  return (args) => {
    const [cmd] = args;
    if (cmd === 'log') return serverChange ? `${serverChange}\n` : '';
    if (cmd === 'fetch') {
      haveAll = true;
      return '';
    }
    if (cmd === 'cat-file') {
      if (!haveAll || !full(args[2].replace('^{commit}', ''))) throw new Error('unknown');
      return '';
    }
    if (cmd === 'rev-parse') return full(args[1]);
    if (cmd === 'merge-base') {
      if (history.indexOf(full(args[2])) < history.indexOf(full(args[3]))) return '';
      if (args[2] === args[3]) return '';
      throw new Error('not ancestor');
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
};
const server = (commit) => async () => (commit ? { commit } : null);

test('a release is allowed once the live server has its server change', async () => {
  assert.equal((await checkServerReady({ git: gitWith(), serverVersion: server('b2bbbbb') })).ok, true);
  assert.equal((await checkServerReady({ git: gitWith(), serverVersion: server('c3ccccc') })).ok, true);
});

test('a release is refused while the live server is still on older code', async () => {
  const result = await checkServerReady({ git: gitWith(), serverVersion: server('a1aaaaa') });
  assert.equal(result.ok, false);
  assert.match(result.message, /does not include this release's server change b2bbbbb/);
});

test('a website-only history needs nothing from the server', async () => {
  assert.equal((await checkServerReady({ git: gitWith({ serverChange: '' }), serverVersion: server(null) })).ok, true);
});

test('an unreadable server version is never taken as ready', async () => {
  assert.equal((await checkServerReady({ git: gitWith(), serverVersion: server(null) })).ok, false);
});

test('a server commit not known locally is fetched before judging', async () => {
  assert.equal((await checkServerReady({ git: gitWith({ fetched: false }), serverVersion: server('b2bbbbb') })).ok, true);
});
