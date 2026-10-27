import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// This file's own process is staging, with a fake live key already in the environment for the request guard.
process.env.APP_ENV = 'staging';
process.env.TAP_SECRET_KEY = 'sk_live_FAKELIVEKEY000000000001';
process.env.PAYMENT_PROVIDER = 'tap';
const tap = await import('../src/services/payment/tap.js');
const { setKey } = await import('../src/services/paymentSettingsService.js');
const { isStaging } = await import('../src/config.js');

const startWith = (env) =>
  spawnSync(process.execPath, ['--input-type=module', '-e', "import('./src/config.js').then((m) => m.assertStagingSafety())"], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

test('a staging server refuses to start with a live Tap key, and starts with a test key', () => {
  const live = startWith({ APP_ENV: 'staging', TAP_SECRET_KEY: 'sk_live_FAKELIVEKEY000000000001' });
  assert.equal(live.status, 1);
  assert.match(live.stderr, /LIVE key/);
  const test = startWith({ APP_ENV: 'staging', TAP_SECRET_KEY: 'sk_test_FAKETESTKEY000000000001' });
  assert.equal(test.status, 0);
  // Production is untouched by the rule.
  assert.equal(startWith({ APP_ENV: 'production', TAP_SECRET_KEY: 'sk_live_FAKELIVEKEY000000000001' }).status, 0);
});

test('on staging a live key is never sent to Tap, nor saved by an owner', async () => {
  assert.equal(isStaging(), true);
  await assert.rejects(tap.verifyKey('sk_live_FAKELIVEKEY000000000001'), /never used on staging/);
  await assert.rejects(setKey('sk_live_FAKELIVEKEY000000000001'), (error) => error.status === 400 && /staging/.test(error.message));
});
