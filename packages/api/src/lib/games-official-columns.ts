import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsFromExecute } from './pg-result.js';

let cached: boolean | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/** True when `games.umpire` and `games.official_scorer` exist (migration 0012). Cached briefly. */
export async function gamesTableHasOfficialColumns(): Promise<boolean> {
  const now = Date.now();
  if (cached !== null && now - cachedAt < TTL_MS) return cached;
  let has = false;
  try {
    const rows = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'games'
        and column_name in ('umpire', 'official_scorer')
    `);
    const names = new Set(
      rowsFromExecute<{ column_name: string }>(rows).map((r) => r.column_name),
    );
    has = names.has('umpire') && names.has('official_scorer');
  } catch {
    has = false;
  }
  cached = has;
  cachedAt = now;
  return has;
}
