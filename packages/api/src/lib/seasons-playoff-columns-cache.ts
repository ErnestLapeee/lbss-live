import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsFromExecute } from './pg-result.js';

const TTL_MS = 5 * 60 * 1000;
let cachedAt = 0;
let cachedValue: boolean | null = null;

/**
 * Whether `seasons` has optional playoff columns. Cached to avoid hitting
 * `information_schema` on every seasons list request (reduces load and flaky failures).
 */
export async function getSeasonsHavePlayoffColumnsCached(): Promise<boolean> {
  const now = Date.now();
  if (cachedValue !== null && now - cachedAt < TTL_MS) {
    return cachedValue;
  }
  let v = false;
  try {
    const rows = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'seasons'
        and column_name in ('has_playoffs', 'regular_season_games_per_team', 'playoff_settings')
    `);
    const list = rowsFromExecute<Record<string, unknown>>(rows);
    v = list.length >= 3;
  } catch {
    v = false;
  }
  cachedValue = v;
  cachedAt = now;
  return v;
}
