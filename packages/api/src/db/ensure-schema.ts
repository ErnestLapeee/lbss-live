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

  await ensurePlayoffsTables();
}

/**
 * Playoffs tables (migration 0006) — if migrations never ran, admin `GET /playoffs` 500s with
 * undefined_table. Idempotent DDL aligned with `0006_playoffs.sql`.
 */
async function ensurePlayoffsTables(): Promise<void> {
  await db.execute(sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS has_playoffs boolean DEFAULT false`);
  await db.execute(sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS regular_season_games_per_team integer`);
  await db.execute(sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS playoff_settings jsonb DEFAULT '{}'::jsonb`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS playoffs (
      id serial PRIMARY KEY,
      season_id integer NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
      name varchar(120) NOT NULL,
      is_active boolean DEFAULT true,
      config jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS playoffs_season_id_idx ON playoffs(season_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS playoffs_active_idx ON playoffs(is_active)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS playoff_series (
      id serial PRIMARY KEY,
      playoffs_id integer NOT NULL REFERENCES playoffs(id) ON DELETE CASCADE,
      round_number integer NOT NULL,
      series_index integer NOT NULL,
      label varchar(120),
      higher_seed integer,
      lower_seed integer,
      higher_team_id integer REFERENCES teams(id),
      lower_team_id integer REFERENCES teams(id),
      best_of integer NOT NULL DEFAULT 1,
      winner_team_id integer REFERENCES teams(id),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS playoff_series_playoffs_id_idx ON playoff_series(playoffs_id)`);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS playoff_series_round_idx ON playoff_series(playoffs_id, round_number)`
  );

  await db.execute(
    sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS playoff_series_id integer REFERENCES playoff_series(id) ON DELETE SET NULL`
  );
  await db.execute(sql`CREATE INDEX IF NOT EXISTS games_playoff_series_id_idx ON games(playoff_series_id)`);
}

/** @deprecated Use ensureOptionalSchemaColumns */
export async function ensureGameEventsBatterSideColumn(): Promise<void> {
  await ensureOptionalSchemaColumns();
}
