/**
 * Replaces the development credentials with real ones before anyone outside
 * the team is given access.
 *
 * Two separate problems, both of which have to be fixed together:
 *
 *   - The seeded passwords are published. "Admin@123" is written in the
 *     README, the deploy guide and the seed script, so every admin account
 *     currently has a password anyone who can read the repository knows.
 *
 *   - The signing key is published too. JWT_SECRET ships as a placeholder, and
 *     a known key is worse than a known password: tokens are signed with it, so
 *     anyone holding it can mint a token for any account — including the
 *     platform operator, who administers every restaurant — without ever seeing
 *     a password. Rotating passwords while the key stays public fixes nothing.
 *
 * Run: npm run db:rotate-credentials
 *
 * Prints the new passwords once. They are not stored anywhere else, so put them
 * in a password manager before closing the terminal. Everyone signed in is
 * signed out, because the key their token was signed with no longer exists.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

/** Long, random, and URL-safe so it survives being pasted into any host's UI. */
const newSecret = () => crypto.randomBytes(48).toString('base64url');

/**
 * Readable enough to retype off a phone, random enough to be worth having:
 * ~62 bits, in a shape that satisfies the usual "letters, digits, symbol"
 * rules without the ambiguous characters people mistype.
 */
const newPassword = () => {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const body = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `Md-${body}-${crypto.randomInt(10, 100)}`;
};

const rotateSecret = () => {
  if (!fs.existsSync(envPath)) {
    console.log('  .env not found — set JWT_SECRET yourself on the host that runs the API.');
    return null;
  }
  const secret = newSecret();
  const env = fs.readFileSync(envPath, 'utf8');
  const line = `JWT_SECRET="${secret}"`;
  fs.writeFileSync(envPath, /^JWT_SECRET=.*$/m.test(env) ? env.replace(/^JWT_SECRET=.*$/m, line) : `${env.trimEnd()}\n${line}\n`);
  return secret;
};

const run = async () => {
  console.log('\nRotating credentials\n');

  const secret = rotateSecret();
  console.log(secret ? `  JWT_SECRET  rewritten in backend/.env (${secret.length} chars)` : '  JWT_SECRET  skipped');

  // Staff only. Customers chose their own passwords and are not ours to reset.
  const staff = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'STAFF'] } },
    select: { id: true, email: true, role: true, tenantId: true },
    orderBy: { email: 'asc' },
  });

  const issued = [];
  for (const user of staff) {
    const password = newPassword();
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 10) } });
    issued.push({ ...user, password });
  }

  const tenants = Object.fromEntries((await prisma.tenant.findMany({ select: { id: true, nameEn: true } })).map((t) => [t.id, t.nameEn]));

  console.log(`\n  ${issued.length} account${issued.length === 1 ? '' : 's'} updated:\n`);
  for (const user of issued) {
    console.log(`    ${user.email}`);
    console.log(`      password : ${user.password}`);
    console.log(`      manages  : ${user.tenantId ? tenants[user.tenantId] : 'every restaurant (platform operator)'}\n`);
  }

  console.log('  Next:');
  console.log('    1. Save these in a password manager — they are not stored anywhere else.');
  console.log('    2. Restart the API so it picks up the new JWT_SECRET.');
  console.log('    3. If the API runs on a host (Render, Fly, a VPS), set JWT_SECRET there too.');
  console.log('    4. Send the password to each person separately from the link.\n');

  await prisma.$disconnect();
};

run().catch(async (error) => {
  console.error('\nRotation failed — nothing further was changed.\n', error);
  await prisma.$disconnect();
  process.exit(1);
});
