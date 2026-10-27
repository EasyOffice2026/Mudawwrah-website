#!/usr/bin/env node
/**
 * Deploys the website to the staging copy (DEPLOY.md, "Staging"), never to production.
 *
 *   npm run deploy:staging            (from the frontend folder; uncommitted changes are allowed here)
 *
 * - A Vercel preview, not `--prod`: the live site is not touched, whatever is in this folder.
 * - Built against the staging server named in .env.staging, and refused unless that server says it is staging
 *   (/api/version), so a test site can never be pointed at live data by a typo.
 * - The preview gets the fixed address in .env.staging (STAGING_ALIAS), so the staging server's settings (payment
 *   return page, allowed origins) and everyone's bookmark stay the same from one deploy to the next.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};
const out = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();

let env = '';
try {
  env = readFileSync('.env.staging', 'utf8');
} catch {
  fail('Run this from the frontend folder (it reads .env.staging).');
}
const value = (key) => (env.match(new RegExp(`^${key}=(.+)$`, 'm')) || [])[1]?.trim() || '';
const api = value('VITE_API_URL').replace(/\/+$/, '');
const alias = value('STAGING_ALIAS').replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (!api || !alias) fail('.env.staging needs VITE_API_URL (the staging server, ending in /api) and STAGING_ALIAS.');

let server = null;
try {
  const res = await fetch(`${api}/version`, { cache: 'no-store' });
  server = res.ok ? await res.json() : null;
} catch {
  server = null;
}
if (!server) fail(`NOT DEPLOYED. The staging server ${api} did not answer. Is it running on Render?`);
if (server.environment !== 'staging') {
  fail(`NOT DEPLOYED. ${api} says it is "${server.environment || 'production'}", not staging. A test site must never use live data.`);
}

const commit = out('git rev-parse --short HEAD');
const dirty = Boolean(out('git status --porcelain -- .'));
console.log(`\nStaging server ${api}: running ${server.commit || 'unknown'}.`);
console.log(`Deploying commit ${commit}${dirty ? ' plus uncommitted changes' : ''} to staging (a preview, not the live site)...\n`);

const build = [
  'npx vercel --yes',
  '--build-env VITE_STAGE=staging',
  `--build-env VITE_API_URL=${api}`,
  `--build-env BUILD_COMMIT=${commit}`,
  ...(dirty ? ['--build-env BUILD_DIRTY=1'] : []),
].join(' ');
// Vercel prints the new deployment's address on stdout, and its progress on stderr.
const run = spawnSync(build, { stdio: ['inherit', 'pipe', 'inherit'], shell: true, encoding: 'utf8' });
const url = (run.stdout || '').match(/https:\/\/\S+\.vercel\.app/g)?.pop();
if (run.status !== 0 || !url) fail('The staging deploy did not complete. Fix the error shown and run it again.');

const named = spawnSync(`npx vercel alias set ${url} ${alias}`, { stdio: 'inherit', shell: true });
if (named.status !== 0) fail(`Deployed at ${url}, but it could not be given the address ${alias}. Open that one instead.`);

let live = null;
for (let attempt = 1; attempt <= 6 && live?.commit !== commit; attempt += 1) {
  try {
    const res = await fetch(`https://${alias}/version.json?t=${Date.now()}`, { cache: 'no-store' });
    live = res.ok ? await res.json() : null;
  } catch {
    live = null;
  }
  if (live?.commit !== commit) await new Promise((resolve) => setTimeout(resolve, 3000));
}
console.log(
  live?.commit === commit
    ? `\nSTAGING is serving commit ${commit}: https://${alias}/r/mdawra (and /r/mdawra/admin/login)\n`
    : `\nDeployed to https://${alias}. Its version could not be read back yet (Vercel's login screen in front of\npreviews hides it: DEPLOY.md, "Staging"). Open it in a browser.\n`,
);
