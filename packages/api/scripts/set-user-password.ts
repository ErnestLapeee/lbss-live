/**
 * Set a user's password hash (argon2) — run against production DB from a trusted machine.
 *
 * Usage (from repo root, with DATABASE_URL in .env):
 *   pnpm --filter @lbss/api exec tsx --env-file=../../.env scripts/set-user-password.ts admin@lbss.lv
 * Password is read from SET_USER_PASSWORD env (avoid shell history).
 */
import { hash } from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { users } from '../src/db/schema/index.js';
import { validatePasswordStrength } from '../src/lib/password-policy.js';

async function main() {
  const email = process.argv[2]?.trim();
  const password = process.env.SET_USER_PASSWORD?.trim();
  if (!email) {
    console.error('Usage: SET_USER_PASSWORD=... tsx scripts/set-user-password.ts <email>');
    process.exit(1);
  }
  if (!password) {
    console.error('Set SET_USER_PASSWORD in the environment (not argv).');
    process.exit(1);
  }
  const check = validatePasswordStrength(password);
  if (!check.ok) {
    console.error(check.message);
    process.exit(1);
  }
  const passwordHash = await hash(password);
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.email, email))
    .returning({ id: users.id });

  if (updated.length === 0) {
    console.error(`No user with email: ${email}`);
    process.exit(1);
  }
  console.log(`Password updated for ${email} (id ${updated[0]!.id}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
