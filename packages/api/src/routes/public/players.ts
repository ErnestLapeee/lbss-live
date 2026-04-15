import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  players, playerSeasonBatting, playerSeasonPitching, playerSeasonFielding,
  playerGameBatting, playerGamePitching, playerGameFielding, gameEvents,
  teams, seasons, games, leagues,
} from '../../db/schema/index.js';
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';

/** Same abbreviations as team roster / modal (1–10). */
const FIELDING_POS_LABELS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH',
};

/** Primary / secondary position from games played at each spot (60% rule for slash). */
function fieldingPositionLabel(
  entries: { position: number; games: number }[],
): string | null {
  const valid = entries.filter((e) => e.games > 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => b.games - a.games);
  const top = sorted[0]!;
  const second = sorted[1];
  const topLabel = FIELDING_POS_LABELS[top.position] || String(top.position);
  if (second && second.games >= top.games * 0.6) {
    const secLabel = FIELDING_POS_LABELS[second.position] || String(second.position);
    return `${topLabel}/${secLabel}`;
  }
  return topLabel;
}

type PosCountRow = { seasonId: number; teamId: number; position: number | null; games: number };

function fieldingPosMap(rows: PosCountRow[]): Map<string, { position: number; games: number }[]> {
  const m = new Map<string, { position: number; games: number }[]>();
  for (const row of rows) {
    if (row.position == null) continue;
    const key = `${row.seasonId}:${row.teamId}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push({ position: row.position, games: Number(row.games) });
  }
  return m;
}

async function gamesHavePlayoffSeriesId(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'games'
        and column_name = 'playoff_series_id'
      limit 1
    `);
    const list = Array.isArray((rows as any).rows) ? (rows as any).rows : (rows as any);
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

export async function playersRoutes(app: FastifyInstance) {
  // GET / - list all active players (with pagination: page, limit)
  app.get<{
    Querystring: { page?: string; limit?: string };
  }>('/', async (request, reply) => {
    try {
      const page = Math.max(1, parseInt(request.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '20', 10)));
      const offset = (page - 1) * limit;

      const result = await db
        .select()
        .from(players)
        .where(eq(players.isActive, true))
        .orderBy(players.lastName, players.firstName)
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(players)
        .where(eq(players.isActive, true));

      return reply.send({
        data: result,
        pagination: { page, limit, total: count },
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch players' });
    }
  });

  // GET /:slug - get player by slug
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    try {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.slug, request.params.slug))
        .limit(1);

      if (!player || !player.isActive) {
        return reply.status(404).send({ message: 'Player not found' });
      }

      return reply.send(player);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch player' });
    }
  });

  // GET /:slug/stats - batting stats; ?seasonId=X for one season, omit for all seasons (per-season rows)
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>('/:slug/stats', async (request, reply) => {
    try {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.slug, request.params.slug))
        .limit(1);

      if (!player || !player.isActive) {
        return reply.status(404).send({ message: 'Player not found' });
      }

      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === 'all';
      const seasonIdNum = seasonId && seasonId !== 'all' ? parseInt(seasonId, 10) : null;

      const baseSelect = db
        .select({
          id: playerSeasonBatting.id,
          playerId: playerSeasonBatting.playerId,
          teamId: playerSeasonBatting.teamId,
          seasonId: playerSeasonBatting.seasonId,
          seasonLabel: sql<string | null>`NULL`.as('season_label'),
          games: playerSeasonBatting.games,
          plateAppearances: playerSeasonBatting.plateAppearances,
          atBats: playerSeasonBatting.atBats,
          hits: playerSeasonBatting.hits,
          singles: playerSeasonBatting.singles,
          doubles: playerSeasonBatting.doubles,
          triples: playerSeasonBatting.triples,
          homeRuns: playerSeasonBatting.homeRuns,
          rbi: playerSeasonBatting.rbi,
          runs: playerSeasonBatting.runs,
          walks: playerSeasonBatting.walks,
          strikeouts: playerSeasonBatting.strikeouts,
          hitByPitch: playerSeasonBatting.hitByPitch,
          stolenBases: playerSeasonBatting.stolenBases,
          caughtStealing: playerSeasonBatting.caughtStealing,
          sacrificeFlies: playerSeasonBatting.sacrificeFlies,
          sacrificeBunts: playerSeasonBatting.sacrificeBunts,
          groundOuts: playerSeasonBatting.groundOuts,
          flyOuts: playerSeasonBatting.flyOuts,
          groundedIntoDoublePlays: playerSeasonBatting.groundedIntoDoublePlays,
          intentionalWalks: playerSeasonBatting.intentionalWalks,
          reachedOnError: playerSeasonBatting.reachedOnError,
          totalBases: playerSeasonBatting.totalBases,
          battingAvg: playerSeasonBatting.battingAvg,
          onBasePct: playerSeasonBatting.onBasePct,
          sluggingPct: playerSeasonBatting.sluggingPct,
          ops: playerSeasonBatting.ops,
          babip: playerSeasonBatting.babip,
          lastComputedAt: playerSeasonBatting.lastComputedAt,
          teamName: teams.name,
          teamLogoUrl: teams.logoUrl,
          seasonYear: seasons.year,
        })
        .from(playerSeasonBatting)
        .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
        .innerJoin(seasons, eq(playerSeasonBatting.seasonId, seasons.id));

      const stats = await (isAllTime || !seasonIdNum
        ? baseSelect
            .where(eq(playerSeasonBatting.playerId, player.id))
            .orderBy(desc(seasons.year))
        : baseSelect
            .where(and(eq(playerSeasonBatting.playerId, player.id), eq(playerSeasonBatting.seasonId, seasonIdNum)))
            .orderBy(desc(seasons.year)));

      if (!isAllTime) return reply.send(stats);

      let playoffRows: any[] = [];
      if (await gamesHavePlayoffSeriesId()) {
        // Playoffs rows (computed from per-game stats linked to playoff series)
        playoffRows = await db.select({
          id: sql<number>`-(${seasons.id} * 1000 + ${playerGameBatting.teamId})`.as('id'),
          playerId: playerGameBatting.playerId,
          teamId: playerGameBatting.teamId,
          seasonId: seasons.id,
          seasonLabel: sql<string>`'Playoffs'`.as('season_label'),
          games: sql<number>`COUNT(DISTINCT ${playerGameBatting.gameId})`.as('games'),
          plateAppearances: sql<number>`SUM(${playerGameBatting.plateAppearances})`.as('plate_appearances'),
          atBats: sql<number>`SUM(${playerGameBatting.atBats})`.as('at_bats'),
          hits: sql<number>`SUM(${playerGameBatting.hits})`.as('hits'),
          singles: sql<number>`SUM(${playerGameBatting.singles})`.as('singles'),
          doubles: sql<number>`SUM(${playerGameBatting.doubles})`.as('doubles'),
          triples: sql<number>`SUM(${playerGameBatting.triples})`.as('triples'),
          homeRuns: sql<number>`SUM(${playerGameBatting.homeRuns})`.as('home_runs'),
          rbi: sql<number>`SUM(${playerGameBatting.rbi})`.as('rbi'),
          runs: sql<number>`SUM(${playerGameBatting.runs})`.as('runs'),
          walks: sql<number>`SUM(${playerGameBatting.walks})`.as('walks'),
          strikeouts: sql<number>`SUM(${playerGameBatting.strikeouts})`.as('strikeouts'),
          hitByPitch: sql<number>`SUM(${playerGameBatting.hitByPitch})`.as('hit_by_pitch'),
          stolenBases: sql<number>`SUM(${playerGameBatting.stolenBases})`.as('stolen_bases'),
          caughtStealing: sql<number>`SUM(${playerGameBatting.caughtStealing})`.as('caught_stealing'),
          sacrificeFlies: sql<number>`SUM(${playerGameBatting.sacrificeFlies})`.as('sacrifice_flies'),
          sacrificeBunts: sql<number>`SUM(${playerGameBatting.sacrificeBunts})`.as('sacrifice_bunts'),
          groundOuts: sql<number>`COALESCE(SUM(${playerGameBatting.groundOuts}),0)`.as('ground_outs'),
          flyOuts: sql<number>`COALESCE(SUM(${playerGameBatting.flyOuts}),0)`.as('fly_outs'),
          groundedIntoDoublePlays: sql<number>`COALESCE(SUM(${playerGameBatting.groundedIntoDoublePlays}),0)`.as('grounded_into_double_plays'),
          intentionalWalks: sql<number>`COALESCE(SUM(${playerGameBatting.intentionalWalks}),0)`.as('intentional_walks'),
          reachedOnError: sql<number>`COALESCE(SUM(${playerGameBatting.reachedOnError}),0)`.as('reached_on_error'),
          totalBases: sql<number>`COALESCE(SUM(${playerGameBatting.totalBases}),0)`.as('total_bases'),
          battingAvg: sql<string | null>`CASE WHEN SUM(${playerGameBatting.atBats}) > 0 THEN ROUND(SUM(${playerGameBatting.hits})::numeric / SUM(${playerGameBatting.atBats}), 3)::text ELSE NULL END`.as('batting_avg'),
          onBasePct: sql<string | null>`CASE WHEN (SUM(${playerGameBatting.atBats}) + SUM(${playerGameBatting.walks}) + SUM(${playerGameBatting.hitByPitch}) + SUM(${playerGameBatting.sacrificeFlies})) > 0 THEN ROUND((SUM(${playerGameBatting.hits}) + SUM(${playerGameBatting.walks}) + SUM(${playerGameBatting.hitByPitch}))::numeric / (SUM(${playerGameBatting.atBats}) + SUM(${playerGameBatting.walks}) + SUM(${playerGameBatting.hitByPitch}) + SUM(${playerGameBatting.sacrificeFlies})), 3)::text ELSE NULL END`.as('on_base_pct'),
          sluggingPct: sql<string | null>`CASE WHEN SUM(${playerGameBatting.atBats}) > 0 THEN ROUND(COALESCE(SUM(${playerGameBatting.totalBases}),0)::numeric / SUM(${playerGameBatting.atBats}), 3)::text ELSE NULL END`.as('slugging_pct'),
          ops: sql<string | null>`CASE WHEN SUM(${playerGameBatting.atBats}) > 0 THEN ROUND( COALESCE((SUM(${playerGameBatting.hits}) + SUM(${playerGameBatting.walks}) + SUM(${playerGameBatting.hitByPitch}))::numeric / NULLIF(SUM(${playerGameBatting.atBats}) + SUM(${playerGameBatting.walks}) + SUM(${playerGameBatting.hitByPitch}) + SUM(${playerGameBatting.sacrificeFlies}), 0), 0) + COALESCE(SUM(${playerGameBatting.totalBases}),0)::numeric / SUM(${playerGameBatting.atBats}), 3)::text ELSE NULL END`.as('ops'),
          babip: sql<string | null>`CASE WHEN (SUM(${playerGameBatting.atBats}) - SUM(${playerGameBatting.strikeouts}) - SUM(${playerGameBatting.homeRuns}) + SUM(${playerGameBatting.sacrificeFlies})) > 0 THEN ROUND((SUM(${playerGameBatting.hits}) - SUM(${playerGameBatting.homeRuns}))::numeric / (SUM(${playerGameBatting.atBats}) - SUM(${playerGameBatting.strikeouts}) - SUM(${playerGameBatting.homeRuns}) + SUM(${playerGameBatting.sacrificeFlies})), 3)::text ELSE NULL END`.as('babip'),
          lastComputedAt: sql<null>`NULL`.as('last_computed_at'),
          teamName: teams.name,
          teamLogoUrl: teams.logoUrl,
          seasonYear: seasons.year,
        })
          .from(playerGameBatting)
          .innerJoin(games, eq(playerGameBatting.gameId, games.id))
          .innerJoin(leagues, eq(games.leagueId, leagues.id))
          .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
          .innerJoin(teams, eq(playerGameBatting.teamId, teams.id))
          .where(and(
            eq(playerGameBatting.playerId, player.id),
            eq(games.isFinalized, true),
            sql`${games.playoffSeriesId} IS NOT NULL`,
          ))
          .groupBy(seasons.id, seasons.year, teams.id, teams.name, teams.logoUrl, playerGameBatting.playerId, playerGameBatting.teamId);
      }

      const merged = [...stats, ...playoffRows].sort((a: any, b: any) => {
        const ay = Number(a.seasonYear ?? 0);
        const by = Number(b.seasonYear ?? 0);
        if (by !== ay) return by - ay;
        const aPo = a.seasonLabel ? 1 : 0;
        const bPo = b.seasonLabel ? 1 : 0;
        return aPo - bPo; // regular first, then playoffs
      });

      return reply.send(merged);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch player stats' });
    }
  });

  // GET /:slug/pitching-stats - ?seasonId=X for one season, omit for all seasons
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>('/:slug/pitching-stats', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === 'all';
      const seasonIdNum = seasonId && seasonId !== 'all' ? parseInt(seasonId, 10) : null;

      const baseSelect = db
        .select({
          id: playerSeasonPitching.id,
          seasonId: playerSeasonPitching.seasonId,
          seasonLabel: sql<string | null>`NULL`.as('season_label'),
          games: playerSeasonPitching.games,
          gamesStarted: playerSeasonPitching.gamesStarted,
          wins: playerSeasonPitching.wins,
          losses: playerSeasonPitching.losses,
          saves: playerSeasonPitching.saves,
          inningsPitched: playerSeasonPitching.inningsPitched,
          hitsAllowed: playerSeasonPitching.hitsAllowed,
          runsAllowed: playerSeasonPitching.runsAllowed,
          earnedRuns: playerSeasonPitching.earnedRuns,
          walksAllowed: playerSeasonPitching.walksAllowed,
          strikeouts: playerSeasonPitching.strikeouts,
          homeRunsAllowed: playerSeasonPitching.homeRunsAllowed,
          hitBatters: playerSeasonPitching.hitBatters,
          wildPitches: playerSeasonPitching.wildPitches,
          battersFaced: playerSeasonPitching.battersFaced,
          balks: playerSeasonPitching.balks,
          intentionalWalks: playerSeasonPitching.intentionalWalks,
          groundOuts: playerSeasonPitching.groundOuts,
          flyOuts: playerSeasonPitching.flyOuts,
          era: playerSeasonPitching.era,
          whip: playerSeasonPitching.whip,
          fip: playerSeasonPitching.fip,
          k9: playerSeasonPitching.k9,
          bb9: playerSeasonPitching.bb9,
          h9: playerSeasonPitching.h9,
          babip: playerSeasonPitching.babip,
          teamName: teams.name,
          teamLogoUrl: teams.logoUrl,
          seasonYear: seasons.year,
        })
        .from(playerSeasonPitching)
        .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
        .innerJoin(seasons, eq(playerSeasonPitching.seasonId, seasons.id));

      const stats = await (isAllTime || !seasonIdNum
        ? baseSelect
            .where(eq(playerSeasonPitching.playerId, player.id))
            .orderBy(desc(seasons.year))
        : baseSelect
            .where(and(eq(playerSeasonPitching.playerId, player.id), eq(playerSeasonPitching.seasonId, seasonIdNum)))
            .orderBy(desc(seasons.year)));

      if (!isAllTime) return reply.send(stats);

      let playoffRows: any[] = [];
      if (await gamesHavePlayoffSeriesId()) playoffRows = await db.select({
        id: sql<number>`-(${seasons.id} * 1000 + ${playerGamePitching.teamId})`.as('id'),
        seasonId: seasons.id,
        seasonLabel: sql<string>`'Playoffs'`.as('season_label'),
        games: sql<number>`COUNT(DISTINCT ${playerGamePitching.gameId})`.as('games'),
        gamesStarted: sql<number>`COALESCE(SUM(${playerGamePitching.isStarter}::int), 0)`.as('games_started'),
        wins: sql<number>`COALESCE(SUM(CASE WHEN ${playerGamePitching.decision} = 'W' THEN 1 ELSE 0 END), 0)`.as('wins'),
        losses: sql<number>`COALESCE(SUM(CASE WHEN ${playerGamePitching.decision} = 'L' THEN 1 ELSE 0 END), 0)`.as('losses'),
        saves: sql<number>`COALESCE(SUM(CASE WHEN ${playerGamePitching.decision} = 'S' THEN 1 ELSE 0 END), 0)`.as('saves'),
        inningsPitched: sql<string>`COALESCE(SUM(${playerGamePitching.inningsPitched}::numeric), 0)::text`.as('innings_pitched'),
        hitsAllowed: sql<number>`COALESCE(SUM(${playerGamePitching.hitsAllowed}), 0)`.as('hits_allowed'),
        runsAllowed: sql<number>`COALESCE(SUM(${playerGamePitching.runsAllowed}), 0)`.as('runs_allowed'),
        earnedRuns: sql<number>`COALESCE(SUM(${playerGamePitching.earnedRuns}), 0)`.as('earned_runs'),
        walksAllowed: sql<number>`COALESCE(SUM(${playerGamePitching.walksAllowed}), 0)`.as('walks_allowed'),
        strikeouts: sql<number>`COALESCE(SUM(${playerGamePitching.strikeouts}), 0)`.as('strikeouts'),
        homeRunsAllowed: sql<number>`COALESCE(SUM(${playerGamePitching.homeRunsAllowed}), 0)`.as('home_runs_allowed'),
        hitBatters: sql<number>`COALESCE(SUM(${playerGamePitching.hitBatters}), 0)`.as('hit_batters'),
        wildPitches: sql<number>`COALESCE(SUM(${playerGamePitching.wildPitches}), 0)`.as('wild_pitches'),
        battersFaced: sql<number>`COALESCE(SUM(${playerGamePitching.battersFaced}), 0)`.as('batters_faced'),
        balks: sql<number>`COALESCE(SUM(${playerGamePitching.balks}), 0)`.as('balks'),
        intentionalWalks: sql<number>`COALESCE(SUM(${playerGamePitching.intentionalWalks}), 0)`.as('intentional_walks'),
        groundOuts: sql<number>`COALESCE(SUM(${playerGamePitching.groundOuts}), 0)`.as('ground_outs'),
        flyOuts: sql<number>`COALESCE(SUM(${playerGamePitching.flyOuts}), 0)`.as('fly_outs'),
        era: sql<string | null>`CASE WHEN COALESCE(SUM(${playerGamePitching.inningsPitched}::numeric), 0) > 0 THEN ROUND((COALESCE(SUM(${playerGamePitching.earnedRuns}),0)::numeric / COALESCE(SUM(${playerGamePitching.inningsPitched}::numeric),0)) * 9, 2)::text ELSE NULL END`.as('era'),
        whip: sql<string | null>`CASE WHEN COALESCE(SUM(${playerGamePitching.inningsPitched}::numeric), 0) > 0 THEN ROUND(((COALESCE(SUM(${playerGamePitching.walksAllowed}),0) + COALESCE(SUM(${playerGamePitching.hitsAllowed}),0))::numeric / COALESCE(SUM(${playerGamePitching.inningsPitched}::numeric),0)), 2)::text ELSE NULL END`.as('whip'),
        fip: sql<null>`NULL`.as('fip'),
        k9: sql<null>`NULL`.as('k9'),
        bb9: sql<null>`NULL`.as('bb9'),
        h9: sql<null>`NULL`.as('h9'),
        babip: sql<null>`NULL`.as('babip'),
        teamName: teams.name,
        seasonYear: seasons.year,
      })
        .from(playerGamePitching)
        .innerJoin(games, eq(playerGamePitching.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
        .innerJoin(teams, eq(playerGamePitching.teamId, teams.id))
        .where(and(
          eq(playerGamePitching.playerId, player.id),
          eq(games.isFinalized, true),
          sql`${games.playoffSeriesId} IS NOT NULL`,
        ))
        .groupBy(seasons.id, seasons.year, teams.id, teams.name, playerGamePitching.teamId);

      const merged = [...stats, ...playoffRows].sort((a: any, b: any) => {
        const ay = Number(a.seasonYear ?? 0);
        const by = Number(b.seasonYear ?? 0);
        if (by !== ay) return by - ay;
        const aPo = a.seasonLabel ? 1 : 0;
        const bPo = b.seasonLabel ? 1 : 0;
        return aPo - bPo;
      });

      return reply.send(merged);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching stats' });
    }
  });

  // GET /:slug/fielding-stats - ?seasonId=X for one season, omit for all seasons
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>('/:slug/fielding-stats', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === 'all';
      const seasonIdNum = seasonId && seasonId !== 'all' ? parseInt(seasonId, 10) : null;

      const baseSelect = db
        .select({
          id: playerSeasonFielding.id,
          seasonId: playerSeasonFielding.seasonId,
          teamId: playerSeasonFielding.teamId,
          seasonLabel: sql<string | null>`NULL`.as('season_label'),
          games: playerSeasonFielding.games,
          innings: playerSeasonFielding.innings,
          putouts: playerSeasonFielding.putouts,
          assists: playerSeasonFielding.assists,
          errors: playerSeasonFielding.errors,
          doublePlays: playerSeasonFielding.doublePlays,
          triplePlays: playerSeasonFielding.triplePlays,
          passedBalls: playerSeasonFielding.passedBalls,
          catcherStolenBases: playerSeasonFielding.catcherStolenBases,
          catcherCaughtStealing: playerSeasonFielding.catcherCaughtStealing,
          pickoffs: playerSeasonFielding.pickoffs,
          fieldingPct: playerSeasonFielding.fieldingPct,
          teamName: teams.name,
          seasonYear: seasons.year,
        })
        .from(playerSeasonFielding)
        .innerJoin(teams, eq(playerSeasonFielding.teamId, teams.id))
        .innerJoin(seasons, eq(playerSeasonFielding.seasonId, seasons.id));

      const stats = await (isAllTime || !seasonIdNum
        ? baseSelect
            .where(eq(playerSeasonFielding.playerId, player.id))
            .orderBy(desc(seasons.year))
        : baseSelect
            .where(and(eq(playerSeasonFielding.playerId, player.id), eq(playerSeasonFielding.seasonId, seasonIdNum)))
            .orderBy(desc(seasons.year)));

      const posRowsAll = await db
        .select({
          seasonId: seasons.id,
          teamId: playerGameFielding.teamId,
          position: playerGameFielding.position,
          games: sql<number>`count(*)::int`.as('games'),
        })
        .from(playerGameFielding)
        .innerJoin(games, eq(playerGameFielding.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
        .where(
          and(
            eq(playerGameFielding.playerId, player.id),
            eq(games.isFinalized, true),
            isNotNull(playerGameFielding.position),
          ),
        )
        .groupBy(seasons.id, playerGameFielding.teamId, playerGameFielding.position);

      let posRowsPlayoff: PosCountRow[] = [];
      if (await gamesHavePlayoffSeriesId()) {
        posRowsPlayoff = await db
          .select({
            seasonId: seasons.id,
            teamId: playerGameFielding.teamId,
            position: playerGameFielding.position,
            games: sql<number>`count(*)::int`.as('games'),
          })
          .from(playerGameFielding)
          .innerJoin(games, eq(playerGameFielding.gameId, games.id))
          .innerJoin(leagues, eq(games.leagueId, leagues.id))
          .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
          .where(
            and(
              eq(playerGameFielding.playerId, player.id),
              eq(games.isFinalized, true),
              isNotNull(playerGameFielding.position),
              isNotNull(games.playoffSeriesId),
            ),
          )
          .groupBy(seasons.id, playerGameFielding.teamId, playerGameFielding.position);
      }

      const mapAll = fieldingPosMap(posRowsAll);
      const mapPlayoff = fieldingPosMap(posRowsPlayoff);

      const enrichFieldingRows = (rows: any[]) =>
        rows.map((row) => {
          const tid = row.teamId as number | undefined;
          const sid = row.seasonId as number | undefined;
          const isPlayoff = row.seasonLabel === 'Playoffs';
          const m = isPlayoff ? mapPlayoff : mapAll;
          const key = tid != null && sid != null ? `${sid}:${tid}` : null;
          const entries = key ? m.get(key) ?? [] : [];
          return {
            ...row,
            positionLabel: fieldingPositionLabel(entries),
          };
        });

      if (!isAllTime) return reply.send(enrichFieldingRows(stats));

      let playoffRows: any[] = [];
      if (await gamesHavePlayoffSeriesId()) playoffRows = await db.select({
        id: sql<number>`-(${seasons.id} * 1000 + ${playerGameFielding.teamId})`.as('id'),
        seasonId: seasons.id,
        teamId: playerGameFielding.teamId,
        seasonLabel: sql<string>`'Playoffs'`.as('season_label'),
        games: sql<number>`COUNT(DISTINCT ${playerGameFielding.gameId})`.as('games'),
        innings: sql<number>`COALESCE(SUM(COALESCE(${playerGameFielding.innings}, 0)), 0)`.as('innings'),
        putouts: sql<number>`COALESCE(SUM(${playerGameFielding.putouts}), 0)`.as('putouts'),
        assists: sql<number>`COALESCE(SUM(${playerGameFielding.assists}), 0)`.as('assists'),
        errors: sql<number>`COALESCE(SUM(${playerGameFielding.errors}), 0)`.as('errors'),
        doublePlays: sql<number>`COALESCE(SUM(${playerGameFielding.doublePlays}), 0)`.as('double_plays'),
        triplePlays: sql<number>`COALESCE(SUM(${playerGameFielding.triplePlays}), 0)`.as('triple_plays'),
        passedBalls: sql<number>`COALESCE(SUM(${playerGameFielding.passedBalls}), 0)`.as('passed_balls'),
        catcherStolenBases: sql<number>`COALESCE(SUM(${playerGameFielding.catcherStolenBases}), 0)`.as('catcher_stolen_bases'),
        catcherCaughtStealing: sql<number>`COALESCE(SUM(${playerGameFielding.catcherCaughtStealing}), 0)`.as('catcher_caught_stealing'),
        pickoffs: sql<number>`COALESCE(SUM(${playerGameFielding.pickoffs}), 0)`.as('pickoffs'),
        fieldingPct: sql<string | null>`CASE WHEN (COALESCE(SUM(${playerGameFielding.putouts}),0) + COALESCE(SUM(${playerGameFielding.assists}),0) + COALESCE(SUM(${playerGameFielding.errors}),0)) > 0 THEN ROUND((COALESCE(SUM(${playerGameFielding.putouts}),0) + COALESCE(SUM(${playerGameFielding.assists}),0))::numeric / (COALESCE(SUM(${playerGameFielding.putouts}),0) + COALESCE(SUM(${playerGameFielding.assists}),0) + COALESCE(SUM(${playerGameFielding.errors}),0)), 3)::text ELSE NULL END`.as('fielding_pct'),
        teamName: teams.name,
        seasonYear: seasons.year,
      })
        .from(playerGameFielding)
        .innerJoin(games, eq(playerGameFielding.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
        .innerJoin(teams, eq(playerGameFielding.teamId, teams.id))
        .where(and(
          eq(playerGameFielding.playerId, player.id),
          eq(games.isFinalized, true),
          sql`${games.playoffSeriesId} IS NOT NULL`,
        ))
        .groupBy(seasons.id, seasons.year, teams.id, teams.name, playerGameFielding.teamId);

      const merged = [...stats, ...playoffRows].sort((a: any, b: any) => {
        const ay = Number(a.seasonYear ?? 0);
        const by = Number(b.seasonYear ?? 0);
        if (by !== ay) return by - ay;
        const aPo = a.seasonLabel ? 1 : 0;
        const bPo = b.seasonLabel ? 1 : 0;
        return aPo - bPo;
      });

      return reply.send(enrichFieldingRows(merged));
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch fielding stats' });
    }
  });

  // GET /:slug/fielding-by-position - aggregate fielding stats grouped by position
  app.get<{ Params: { slug: string } }>('/:slug/fielding-by-position', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const rows = await db.select({
        position: playerGameFielding.position,
        games: sql<number>`count(*)`.as('games'),
        putouts: sql<number>`sum(${playerGameFielding.putouts})`.as('putouts'),
        assists: sql<number>`sum(${playerGameFielding.assists})`.as('assists'),
        errors: sql<number>`sum(${playerGameFielding.errors})`.as('errors'),
        doublePlays: sql<number>`sum(${playerGameFielding.doublePlays})`.as('double_plays'),
        innings: sql<string>`sum(${playerGameFielding.innings}::numeric)`.as('innings'),
      })
        .from(playerGameFielding)
        .where(eq(playerGameFielding.playerId, player.id))
        .groupBy(playerGameFielding.position)
        .orderBy(sql`count(*) desc`);

      const result = rows.map(r => {
        const po = Number(r.putouts) || 0;
        const a = Number(r.assists) || 0;
        const e = Number(r.errors) || 0;
        const tc = po + a + e;
        return {
          position: r.position,
          games: Number(r.games),
          putouts: po,
          assists: a,
          errors: e,
          doublePlays: Number(r.doublePlays) || 0,
          innings: r.innings ?? '0',
          fieldingPct: tc > 0 ? ((po + a) / tc).toFixed(3) : null,
        };
      });

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch fielding by position' });
    }
  });

  // GET /:slug/game-log - per-game batting & pitching lines
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>(
    '/:slug/game-log', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const seasonFilter = request.query.seasonId ? parseInt(request.query.seasonId, 10) : null;

      const battingLog = await db.execute(sql`
        SELECT pgb.*, g.scheduled_at as date, g.home_score, g.away_score,
          ht.name as home_team, at.name as away_team,
          ht.logo_url as home_team_logo, at.logo_url as away_team_logo,
          g.home_team_id, g.away_team_id
        FROM player_game_batting pgb
        JOIN games g ON pgb.game_id = g.id
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        ${seasonFilter ? sql`JOIN leagues l ON g.league_id = l.id WHERE pgb.player_id = ${player.id} AND l.season_id = ${seasonFilter}` : sql`WHERE pgb.player_id = ${player.id}`}
        AND g.is_finalized = true
        ORDER BY g.scheduled_at DESC
      `);

      const pitchingLog = await db.execute(sql`
        SELECT pgp.*, g.scheduled_at as date, g.home_score, g.away_score,
          ht.name as home_team, at.name as away_team,
          ht.logo_url as home_team_logo, at.logo_url as away_team_logo,
          g.home_team_id, g.away_team_id
        FROM player_game_pitching pgp
        JOIN games g ON pgp.game_id = g.id
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        ${seasonFilter ? sql`JOIN leagues l ON g.league_id = l.id WHERE pgp.player_id = ${player.id} AND l.season_id = ${seasonFilter}` : sql`WHERE pgp.player_id = ${player.id}`}
        AND g.is_finalized = true
        ORDER BY g.scheduled_at DESC
      `);

      const bLog = (battingLog as any).rows ?? battingLog;
      const pLog = (pitchingLog as any).rows ?? pitchingLog;

      return reply.send({ batting: bLog, pitching: pLog });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch game log' });
    }
  });

  // GET /:slug/spray-chart - hit location data from events
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>(
    '/:slug/spray-chart', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const seasonFilter = request.query.seasonId ? parseInt(request.query.seasonId, 10) : null;

      const hitData = await db.execute(sql`
        SELECT ge.hit_location_x, ge.hit_location_y, ge.hit_type, ge.hit_hardness,
          ge.event_type, ge.outs_recorded
        FROM game_events ge
        JOIN games g ON ge.game_id = g.id
        ${seasonFilter ? sql`JOIN leagues l ON g.league_id = l.id` : sql``}
        WHERE ge.batter_id = ${player.id}
          AND ge.is_deleted = false
          AND ge.hit_location_x IS NOT NULL
          AND ge.hit_location_y IS NOT NULL
          AND ge.event_type IN (
            'single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double',
            'ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'bunt_single',
            'sacrifice_fly', 'sacrifice_bunt', 'infield_fly', 'fielders_choice',
            'error', 'sac_bunt_error', 'sac_fly_error'
          )
          ${seasonFilter ? sql`AND l.season_id = ${seasonFilter}` : sql``}
        ORDER BY ge.created_at DESC
      `);

      const rows = (hitData as any).rows ?? hitData;
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch spray chart data' });
    }
  });
}
