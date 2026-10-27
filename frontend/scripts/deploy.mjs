#!/usr/bin/env node
/**
 * Deploys the website to production (Vercel) and checks that it went live.
 *
 *   npm run deploy                 (from the frontend folder)
 *   npm run deploy -- --allow-dirty
 *   npm run deploy -- --force      (emergency only: skips the "server first" check)
 *
 * Why this exists instead of a bare `vercel --prod`:
 * - Vercel publishes whatever is in this folder, committed or not. Refusing
 *   uncommitted changes means "what is live" is always a commit someone can name.
 * - Vercel is not given the .git folder, so the commit has to be passed in; it
 *   becomes the version shown in the admin and published as /version.json.
 * - A deploy that "finished" is not the same as a site that serves it. The last
 *   step reads /version.json back from the live address and compares.
 *
 * Needs the Vercel login this machine already has (on this PC it lives under
 * XDG_DATA_HOME=/c/Users/Administrator/AppData/Roaming/xdg.data).
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkServerReady } from './serverGuard.mjs';

const LIVE_URL = process.env.VERIFY_URL || 'https://www.madawarah.com';
// trimEnd, not trim: the first line of `git status` starts with a space that means something.
const out = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

let commit;
let changes;
try {
  commit = out('git rev-parse --short HEAD');
  changes = out('git status --porcelain -- .');
} catch {
  fail('Run this from the frontend folder of the git checkout.');
}

if (changes && !process.argv.includes('--allow-dirty')) {
  fail(
    `The frontend folder has changes that are not committed:\n\n${changes}\n\n` +
      'Vercel would publish them, but afterwards nobody could say what is live.\n' +
      'Commit them first. (Or add --allow-dirty to publish anyway; the version label then ends in +.)',
  );
}

// The server first, always: the website is refused while the live server lacks this release's server changes
// (see serverGuard.mjs). --force skips it for an emergency, and says so.
function liveApi() {
  try {
    return (readFileSync('.env.production', 'utf8').match(/^VITE_API_URL=(.+)$/m) || [])[1]?.trim().replace(/\/+$/, '') || '';
  } catch {
    return '';
  }
}
if (process.argv.includes('--force')) {
  console.log('\n--force: NOT checking that the live server has this release\'s server changes.');
} else {
  const api = process.env.VERIFY_API || liveApi();
  const guard = await checkServerReady({
    git: (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    serverVersion: async () => {
      try {
        const res = await fetch(`${api}/version`, { cache: 'no-store' });
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    },
  });
  if (!guard.ok) fail(`NOT DEPLOYED. ${guard.message}\n(For an emergency only: npm run deploy -- --force)`);
  console.log(`\n${guard.message}`);
}

console.log(`\nDeploying commit ${commit}${changes ? ' plus uncommitted changes' : ''} to production...\n`);
// One command string: the commit is hex from git, so nothing in it needs quoting.
const command = ['npx', 'vercel', '--prod', '--yes', '--build-env', `BUILD_COMMIT=${commit}`, ...(changes ? ['--build-env', 'BUILD_DIRTY=1'] : [])].join(' ');
const run = spawnSync(command, { stdio: 'inherit', shell: true });
if (run.status !== 0) fail('The deploy did not complete, so nothing above is live. Fix the error shown and run it again.');

// Give the new deployment a moment to take over the production address.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let live = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    const res = await fetch(`${LIVE_URL}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    const body = res.ok ? await res.json() : null;
    live = body && typeof body.id === 'string' ? body : null;
  } catch {
    live = null;
  }
  if (live?.commit === commit) break;
  await wait(4000);
}

// The website is only half of a release: the server (Render) is deployed from GitHub, not from here. Say which code
// it is running, so a change that needs both is never called "live" while the server is still on the old code.
const apiAddress = () => {
  try {
    return (readFileSync('.env.production', 'utf8').match(/^VITE_API_URL=(.+)$/m) || [])[1]?.trim() || '';
  } catch {
    return '';
  }
};
const serverCheck = async () => {
  const api = process.env.VERIFY_API || apiAddress();
  if (!api) return;
  try {
    const res = await fetch(`${api.replace(/\/+$/, '')}/version`, { cache: 'no-store' });
    const body = res.ok ? await res.json() : null;
    if (!body) return console.log('Server: could not read its version (an older server without /api/version).');
    console.log(`Server: running commit ${body.commit || 'unknown'}, started ${body.startedAt}.`);
    if (body.commit && body.commit !== commit) {
      console.log(`NOTE: this release is ${commit}. If it also changes the server, merge it into the production branch and wait for Render to show Live, then check this line again.`);
    }
  } catch {
    console.log('Server: could not be reached to read its version.');
  }
};

if (live?.commit === commit) {
  await serverCheck();
  console.log(`\nLIVE and verified: ${LIVE_URL} is serving commit ${live.commit}, built ${live.builtAt}.`);
  console.log('Open admin tabs will show "A new version is available" within a minute. Tabs opened before this feature existed need one manual refresh (Ctrl+Shift+R).\n');
} else {
  fail(
    `Deployed, but ${LIVE_URL}/version.json reports ${live ? `commit ${live.commit}` : 'nothing readable'}, not ${commit}.\n` +
      'Do not tell the client it is fixed yet. Wait a minute and open that address, or check the Vercel dashboard.',
  );
}
