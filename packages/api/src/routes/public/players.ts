import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  players, playerSeasonBatting, playerSeasonPitching, playerSeasonFielding,
  playerGameBatting, playerGamePitching, playerGameFielding, gameEvents,
  teams, seasons, games,
} from '../../db/schema/index.js';
import { eq, and, desc, sql, isNotNull } from 'drizzle-orm';

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

  // GET /:slug/stats - get all season batting stats for player, ordered by season year desc
  app.get<{ Params: { slug: string } }>('/:slug/stats', async (request, reply) => {
    try {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.slug, request.params.slug))
        .limit(1);

      if (!player || !player.isActive) {
        return reply.status(404).send({ message: 'Player not found' });
      }

      const stats = await db
        .select({
          id: playerSeasonBatting.id,
          playerId: playerSeasonBatting.playerId,
          teamId: playerSeasonBatting.teamId,
          seasonId: playerSeasonBatting.seasonId,
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
          seasonYear: seasons.year,
        })
        .from(playerSeasonBatting)
        .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
        .innerJoin(seasons, eq(playerSeasonBatting.seasonId, seasons.id))
        .where(eq(playerSeasonBatting.playerId, player.id))
        .orderBy(desc(seasons.year));

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch player stats' });
    }
  });

  // GET /:slug/pitching-stats - season pitching stats
  app.get<{ Params: { slug: string } }>('/:slug/pitching-stats', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const stats = await db
        .select({
          id: playerSeasonPitching.id,
          seasonId: playerSeasonPitching.seasonId,
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
          seasonYear: seasons.year,
        })
        .from(playerSeasonPitching)
        .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
        .innerJoin(seasons, eq(playerSeasonPitching.seasonId, seasons.id))
        .where(eq(playerSeasonPitching.playerId, player.id))
        .orderBy(desc(seasons.year));

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching stats' });
    }
  });

  // GET /:slug/fielding-stats - season fielding stats
  app.get<{ Params: { slug: string } }>('/:slug/fielding-stats', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const stats = await db
        .select({
          id: playerSeasonFielding.id,
          seasonId: playerSeasonFielding.seasonId,
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
        .innerJoin(seasons, eq(playerSeasonFielding.seasonId, seasons.id))
        .where(eq(playerSeasonFielding.playerId, player.id))
        .orderBy(desc(seasons.year));

      return reply.send(stats);
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
