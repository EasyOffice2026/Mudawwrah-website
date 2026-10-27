import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { publicCache } from '../middleware/publicCache.js';
import { prisma } from '../prisma.js';
import { currentTenant, currentTenantId, runWithTenant } from '../tenantContext.js';
import { hasOwnTapAccount, isOnlinePaymentEnabled } from './payment/index.js';
import * as tap from './payment/tap.js';
import { hint, seal } from './secretBox.js';

const KEY_SHAPE = /^sk_(live|test)_[A-Za-z0-9]{10,}$/;

/**
 * What the owner sees about online payment: which Tap account is used (the restaurant's own, the platform's, or
 * none), whether it is live or a test account, and the key's last four characters. Never the key itself.
 */
export const get = () => {
  const tenant = currentTenant();
  const own = tap.ownKeyOf(tenant);
  const platform = config.payment.tenants.includes(String(tenant?.slug || '').toLowerCase()) && config.payment.tap.secretKey;
  const key = own || (platform ? config.payment.tap.secretKey : null);
  return {
    account: own ? 'own' : platform ? 'platform' : 'none',
    keyHint: hint(key),
    mode: key ? (key.startsWith('sk_live_') ? 'live' : 'test') : null,
    enabled: isOnlinePaymentEnabled(),
    pilot: config.payment.pilotPhones.length > 0,
  };
};

// The restaurant was remembered with its old key for a minute (publicCache); forget it so the change is immediate.
// The answer is worked out from the restaurant as it now is, not as this request first saw it.
const saveKey = async (sealed) => {
  const tenant = await prisma.tenant.update({ where: { id: currentTenantId() }, data: { tapSecretKey: sealed } });
  publicCache.clear();
  return runWithTenant(tenant, get);
};

/** Checks the key with Tap, then stores it encrypted. A key Tap does not accept is never saved. */
export const setKey = async (secretKey) => {
  const key = String(secretKey || '').trim();
  if (!KEY_SHAPE.test(key)) throw new HttpError(400, 'That does not look like a Tap secret key (it starts with sk_live_ or sk_test_).');
  try {
    await tap.verifyKey(key);
  } catch (error) {
    throw new HttpError(400, `Tap did not accept this key: ${error.message.replace(/^Tap request failed: /, '')}`);
  }
  return saveKey(seal(key));
};

export const removeKey = async () => {
  if (!hasOwnTapAccount()) return get();
  return saveKey(null);
};
