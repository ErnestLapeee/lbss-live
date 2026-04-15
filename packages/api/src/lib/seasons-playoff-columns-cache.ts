import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsFromExecute } from './pg-result.js';

const TTL_MS = 5 * 60 * 1000;

export type SeasonsColumnFlags = {
  /** has_playoffs, regular_season_games_per_team, playoff_settings */
  hasPlayoffOptionals: boolean;
  /** season_kind, parent_season_id (migration 0011) */
  hasSeasonKindOptionals: boolean;
};

let cachedAt = 0;
let cachedFlags: SeasonsColumnFlags | null = null;

/**
 * Probes `information_schema` once per TTL for optional `seasons` columns so we do not
 * SELECT/ORDER BY columns that are missing before migrations run (avoids 500s on admin/public).
 */
export async function getSeasonsColumnFlagsCached(): Promise<SeasonsColumnFlags> {
  const now = Date.now();
  if (cachedFlags !== null && now - cachedAt < TTL_MS) {
    return cachedFlags;
  }

  let flags: SeasonsColumnFlags = {
    hasPlayoffOptionals: false,
    hasSeasonKindOptionals: false,
  };
  try {
    const rows = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'seasons'
        and column_name in (
          'has_playoffs', 'regular_season_games_per_team', 'playoff_settings',
          'season_kind', 'parent_season_id'
        )
    `);
    const list = rowsFromExecute<{ column_name?: string }>(rows);
    const names = new Set(
      list.map((r) => (r.column_name != null ? String(r.column_name) : '')).filter(Boolean),
    );
    flags = {
      hasPlayoffOptionals:
        names.has('has_playoffs') &&
        names.has('regular_season_games_per_team') &&
        names.has('playoff_settings'),
      hasSeasonKindOptionals: names.has('season_kind') && names.has('parent_season_id'),
    };
  } catch {
    flags = { hasPlayoffOptionals: false, hasSeasonKindOptionals: false };
  }
  cachedFlags = flags;
  cachedAt = now;
  return flags;
}

/** @deprecated Prefer getSeasonsColumnFlagsCached() for combined probe. */
export async function getSeasonsHavePlayoffColumnsCached(): Promise<boolean> {
  const f = await getSeasonsColumnFlagsCached();
  return f.hasPlayoffOptionals;
}
