import { db } from './index.js';
import {
  seasons, leagues, leagueTeams, teams, players, playerSeasons,
  users, sessions, games, gameEvents, playerGameBatting, playerGamePitching,
  playerSeasonBatting, standings, articles, licenses, payments,
} from './schema/index.js';
import { hash } from 'argon2';
import { validatePasswordStrength } from '../lib/password-policy.js';

async function main() {
  try {
    // Clear all data
    await db.delete(payments);
    await db.delete(licenses);
    await db.delete(gameEvents);
    await db.delete(playerGameBatting);
    await db.delete(playerGamePitching);
    await db.delete(playerSeasonBatting);
    await db.delete(standings);
    await db.delete(articles);
    await db.delete(leagueTeams);
    await db.delete(games);
    await db.delete(playerSeasons);
    await db.delete(leagues);
    await db.delete(sessions);
    await db.delete(users);
    await db.delete(teams);
    await db.delete(seasons);
    await db.delete(players);

    // Create admin user (password must meet API policy: 12+ chars, upper, lower, number, symbol)
    const seedPassword =
      process.env.SEED_ADMIN_PASSWORD?.trim() || 'Lbss#Dev2026!Admin';
    const pwCheck = validatePasswordStrength(seedPassword);
    if (!pwCheck.ok) {
      throw new Error(`SEED_ADMIN_PASSWORD invalid: ${pwCheck.message}`);
    }
    const passwordHash = await hash(seedPassword);
    await db.insert(users).values({
      email: 'admin@lbss.lv',
      passwordHash,
      displayName: 'LBSS Admin',
      role: 'admin',
    });

    console.log(
      `Seed completed successfully. Admin user created: admin@lbss.lv / (password from SEED_ADMIN_PASSWORD or default — change after first login)`,
    );
    if (!process.env.SEED_ADMIN_PASSWORD?.trim()) {
      console.log(`Default dev password (rotate in production): ${seedPassword}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
