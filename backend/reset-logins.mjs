/**
 * Prints a fresh password for the two accounts used for QA: the mdawra
 * restaurant admin, and the platform owner.
 *
 * Run:  node reset-logins.mjs      (from the backend folder)
 *
 * Deliberately NOT prisma/rotate-credentials.js, which resets every staff
 * account on every restaurant and rotates JWT_SECRET, signing out everyone
 * currently logged in — the client included.
 *
 * Passwords are hashed the moment they are stored, so the values printed
 * here are the only copy. Save them before closing the terminal.
 * Safe to delete this file once you have them.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const newPassword = () => {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const body = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `Md-${body}-${crypto.randomInt(10, 100)}`;
};

const run = async () => {
  console.log('');
  for (const email of ['admin@mdawra.com', 'owner@platform.com']) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`  ${email}  -> NOT FOUND`);
      continue;
    }
    const password = newPassword();
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 10) } });
    console.log(`  ${email.padEnd(22)}  ${password}`);
  }
  console.log('\n  Save these now — they are not stored anywhere else.\n');
  await prisma.$disconnect();
};

run().catch(async (error) => {
  console.error('\nReset failed — nothing was changed.\n', error);
  await prisma.$disconnect();
  process.exit(1);
});
