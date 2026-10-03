import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsFromExecute } from './pg-result.js';
import { sqlAllTimeSeasonWhere } from './all-time-stats.js';

/** Rate-stat minimums per team game (college-style): 2 PA for batting, 1 IP (3 outs) for pitching. */
export const MIN_PA_PER_TEAM_GAME = 2;
export const MIN_OUTS_PER_TEAM_GAME = 3;

export type QualificationThresholds = {
  teamGames: number;
  minPlateAppearances: number;
  minOuts: number;
};

/**
 * Team games = most finalized games played by any team in a season, summed over the seasons in scope,
 * so thresholds grow as the season progresses and are larger for all-time.
 */
export async function getQualificationThresholds(
  seasonId: number | null,
  includePlayoffs: boolean,
): Promise<QualificationThresholds> {
  const seasonFilter = seasonId != null ? sql`s_psb.id = ${seasonId}` : sqlAllTimeSeasonWhere(includePlayoffs);
  const res = await db.execute(sql`
    WITH team_games AS (
      SELECT l.season_id, tg.team_id, COUNT(*)::int AS g
      FROM games g
      JOIN leagues l ON l.id = g.league_id
      CROSS JOIN LATERAL (VALUES (g.home_team_id), (g.away_team_id)) AS tg(team_id)
      WHERE g.is_finalized = true
      GROUP BY l.season_id, tg.team_id
    ),
    per_season AS (
      SELECT season_id, MAX(g) AS g FROM team_games GROUP BY season_id
    )
    SELECT COALESCE(SUM(ps.g), 0)::int AS team_games
    FROM per_season ps
    JOIN seasons s_psb ON s_psb.id = ps.season_id
    WHERE ${seasonFilter}
  `);
  const teamGames = Number(rowsFromExecute<{ team_games: number }>(res)[0]?.team_games ?? 0);
  return {
    teamGames,
    minPlateAppearances: Math.max(1, teamGames * MIN_PA_PER_TEAM_GAME),
    minOuts: Math.max(1, teamGames * MIN_OUTS_PER_TEAM_GAME),
  };
}

/** Outs from a baseball-notation innings value (e.g. "6.2" → 20). */
export function outsFromInningsNotation(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const whole = Math.trunc(n);
  return whole * 3 + Math.round((n - whole) * 10);
}
