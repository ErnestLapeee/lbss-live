import { sql } from 'drizzle-orm';
import { db } from './index.js';

/**
 * Drizzle migrations are not always run on deploy (e.g. Railway one-off services).
 * If `game_events.batter_side` is missing, any `select()` on `gameEvents` fails with 500.
 * Matches migration 0010_game_events_batter_side.sql — safe to run repeatedly.
 */
export async function ensureGameEventsBatterSideColumn(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE game_events ADD COLUMN IF NOT EXISTS batter_side varchar(1)`
  );
}
