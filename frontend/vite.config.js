/* global process */
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const git = (args) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

/**
 * Which build this is. Vercel is not given the .git folder, so `npm run deploy`
 * passes the commit in as BUILD_COMMIT (and BUILD_DIRTY=1 when the folder had
 * changes that were not committed); a local build reads both from git itself.
 *
 * The id carries the build time as well as the commit: redeploying the same
 * commit with a different setting (say a new API address) is still a new
 * version that open tabs must reload for.
 */
const stamp = () => {
  const given = process.env.BUILD_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const commit = given || git('rev-parse --short HEAD') || 'unknown';
  const dirty = given ? process.env.BUILD_DIRTY === '1' : Boolean(git('status --porcelain -- .'));
  const builtAt = new Date().toISOString();
  return { id: `${commit}@${builtAt}`, commit, dirty, builtAt };
};

const build = stamp();

/** Publishes the same stamp as /version.json, so tabs left open across a deploy can notice it. */
const versionFile = () => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD__: JSON.stringify(build) },
});
