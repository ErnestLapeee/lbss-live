import { sql } from 'drizzle-orm';
import { db } from './index.js';

/**
 * Drizzle migrations are not always run on deploy (e.g. Railway).
 * Missing columns cause `SELECT` with the full Drizzle schema to 500 — e.g. public
 * `/games/:id/events` only touches `game_events`, while admin `GET /admin/scoring/:id/state`
 * also selects `game_lineups` including `exited_inning` / `exited_half` (migration 0009).
 * All statements match the SQL migrations — safe to run repeatedly.
 */
export async function ensureOptionalSchemaColumns(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE game_events ADD COLUMN IF NOT EXISTS batter_side varchar(1)`
  );
  await db.execute(
    sql`ALTER TABLE game_events ADD COLUMN IF NOT EXISTS runner_scored_reasons jsonb DEFAULT '[]'::jsonb`
  );

  await db.execute(
    sql`ALTER TABLE game_lineups ADD COLUMN IF NOT EXISTS exited_inning integer`
  );
  await db.execute(
    sql`ALTER TABLE game_lineups ADD COLUMN IF NOT EXISTS exited_half varchar(3)`
  );
}

/** @deprecated Use ensureOptionalSchemaColumns */
export async function ensureGameEventsBatterSideColumn(): Promise<void> {
  await ensureOptionalSchemaColumns();
}
