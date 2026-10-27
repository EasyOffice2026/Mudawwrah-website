import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Encrypts a restaurant's own secrets (its Tap secret key) before they are stored, so a copy of the database, a
 * backup or a careless query never shows them. AES-256-GCM: tampering is detected, not just hidden.
 *
 * The key is SECRETS_KEY (32 random bytes, base64) when set; otherwise it is derived from JWT_SECRET, so no new
 * setting is needed. Changing either makes stored secrets unreadable (they then have to be entered again), the
 * same rule as JWT_SECRET itself: never change it casually.
 */
const keyBytes = () => {
  const given = process.env.SECRETS_KEY;
  if (given) {
    const key = Buffer.from(given, 'base64');
    if (key.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes, base64-encoded');
    return key;
  }
  return Buffer.from(crypto.hkdfSync('sha256', config.jwtSecret, 'mdawra', 'tenant-secrets', 32));
};

const VERSION = 'v1';

export const seal = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
};

/** The secret, or null when there is none or it cannot be read (wrong key, damaged): never a half-read value. */
export const open = (sealed) => {
  if (!sealed) return null;
  try {
    const [version, iv, tag, data] = String(sealed).split(':');
    if (version !== VERSION) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

/** What may be shown of a secret: its kind and last four characters ("sk_live_…3f9a"). */
export const hint = (secret) => {
  if (!secret) return null;
  const kind = (/^(sk_(?:live|test)_)/.exec(secret) || [])[1] || '';
  return `${kind}…${secret.slice(-4)}`;
};
