/**
 * One-time backfill: recompute game-level and season-level stats for all already-finalized games.
 * Use after adding new stat columns (e.g. Phase 2) so existing data is populated from game_events.
 *
 * Run from repo root: pnpm --filter @lbss/api exec tsx --env-file=../../.env scripts/backfill-game-stats.ts
 * Or from packages/api: npx tsx --env-file=../../.env scripts/backfill-game-stats.ts
 */
import { db } from '../src/db/index.js';
import { games } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { finalizeGame } from '../src/services/finalize-game.js';

async function main() {
  const finalized = await db.select({ id: games.id }).from(games).where(eq(games.isFinalized, true));
  console.log(`Found ${finalized.length} finalized game(s). Recomputing stats...`);
  let ok = 0;
  let err = 0;
  for (const g of finalized) {
    try {
      await finalizeGame(g.id, undefined, { recompute: true });
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok} done...`);
    } catch (e) {
      err++;
      console.error(`  Game ${g.id}:`, (e as Error).message);
    }
  }
  console.log(`Done. ${ok} recomputed, ${err} errors.`);
  process.exit(err > 0 ? 1 : 0);
}

main();
