/**
 * Refuses a website release the live server is not ready for.
 *
 * Four times the website went live while the server was still on older code, and the client saw a broken
 * page (an endpoint the new website calls did not exist yet). The rule that prevents it: the newest commit that
 * changed the server's running code must already be inside the commit the live server reports at /api/version.
 *
 * `git(args)` runs git and returns its output (throwing on failure); `serverVersion()` returns the server's
 * /api/version body or null. Both are passed in so the rule can be tested without git or a network.
 */
// What the server actually runs. Its tests and notes can change without a server release.
export const SERVER_PATHS = ['../backend/src', '../backend/prisma', '../backend/package.json', '../backend/package-lock.json'];

const isAncestor = (git, older, newer) => {
  try {
    git(['merge-base', '--is-ancestor', older, newer]);
    return true;
  } catch {
    return false;
  }
};

const known = (git, commit) => {
  try {
    git(['cat-file', '-e', `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

export const checkServerReady = async ({ git, serverVersion }) => {
  const needed = git(['log', '-1', '--format=%H', '--', ...SERVER_PATHS]).trim();
  if (!needed) return { ok: true, message: 'This release has no server changes.' };
  const short = needed.slice(0, 7);

  const version = await serverVersion();
  if (!version?.commit) {
    return { ok: false, message: 'The live server did not say which commit it runs (/api/version), so this release cannot be checked against it.' };
  }
  let running = version.commit;
  if (!known(git, running)) {
    try {
      git(['fetch', '--quiet', 'origin']);
    } catch {
      // Offline: judged below with what is known.
    }
  }
  if (!known(git, running)) {
    return { ok: false, message: `The live server runs commit ${running}, which this copy of the code does not have. Pull first.` };
  }
  running = git(['rev-parse', running]).trim();
  if (isAncestor(git, needed, running)) {
    return { ok: true, message: `The live server (${version.commit}) already has this release's server code (${short}).` };
  }
  return {
    ok: false,
    message:
      `The live server runs ${version.commit}, which does not include this release's server change ${short}.\n` +
      'Releasing the website now would break pages that need the new server. First merge into the production branch\n' +
      'on GitHub and wait for Render to show "Live" (check /api/version), then run the deploy again.',
  };
};
