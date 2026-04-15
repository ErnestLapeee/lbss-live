import { sql } from 'drizzle-orm';

/** When aggregating all-time stats, exclude rows tied to `season_kind = 'playoff'` unless client opts in. */
export function parseIncludePlayoffsAllTime(
  query: Record<string, string | string[] | undefined>,
  isAllTime: boolean,
): boolean {
  if (!isAllTime) return true;
  const raw = query.includePlayoffs;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'true' || v === '1';
}

/** Use in raw SQL `WHERE` for `player_season_*` joins to `seasons s_psb`. */
export function sqlAllTimeSeasonWhere(includePlayoffs: boolean) {
  return includePlayoffs
    ? sql`TRUE`
    : sql`COALESCE(s_psb.season_kind, 'regular') <> 'playoff'`;
}
