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

  // GET /:slug/stats - batting stats; ?seasonId=X for one season, omit for all-time (one aggregated row)
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

      if (isAllTime || !seasonIdNum) {
        const rows = await db.execute(sql`
          SELECT
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(plate_appearances, 0))::int AS plate_appearances,
            SUM(COALESCE(at_bats, 0))::int AS at_bats,
            SUM(COALESCE(hits, 0))::int AS hits,
            SUM(COALESCE(singles, 0))::int AS singles,
            SUM(COALESCE(doubles, 0))::int AS doubles,
            SUM(COALESCE(triples, 0))::int AS triples,
            SUM(COALESCE(home_runs, 0))::int AS home_runs,
            SUM(COALESCE(rbi, 0))::int AS rbi,
            SUM(COALESCE(runs, 0))::int AS runs,
            SUM(COALESCE(walks, 0))::int AS walks,
            SUM(COALESCE(strikeouts, 0))::int AS strikeouts,
            SUM(COALESCE(hit_by_pitch, 0))::int AS hit_by_pitch,
            SUM(COALESCE(stolen_bases, 0))::int AS stolen_bases,
            SUM(COALESCE(caught_stealing, 0))::int AS caught_stealing,
            SUM(COALESCE(sacrifice_flies, 0))::int AS sacrifice_flies,
            SUM(COALESCE(sacrifice_bunts, 0))::int AS sacrifice_bunts,
            SUM(COALESCE(ground_outs, 0))::int AS ground_outs,
            SUM(COALESCE(fly_outs, 0))::int AS fly_outs,
            SUM(COALESCE(grounded_into_double_plays, 0))::int AS grounded_into_double_plays,
            SUM(COALESCE(intentional_walks, 0))::int AS intentional_walks,
            SUM(COALESCE(reached_on_error, 0))::int AS reached_on_error,
            SUM(COALESCE(total_bases, 0))::int AS total_bases,
            (SELECT name FROM teams t JOIN player_season_batting psb ON psb.team_id = t.id WHERE psb.player_id = ${player.id} ORDER BY psb.season_id DESC LIMIT 1) AS team_name
          FROM player_season_batting
          WHERE player_id = ${player.id}
        `);
        const raw = (rows as { rows?: Record<string, unknown>[] }).rows ?? rows;
        const r = Array.isArray(raw) ? raw[0] : (raw as Record<string, unknown>);
        if (!r || (Number(r.games) === 0 && Number(r.plate_appearances) === 0)) {
          return reply.send([]);
        }
        const ab = Number(r.at_bats ?? 0);
        const h = Number(r.hits ?? 0);
        const obDenom = ab + Number(r.walks ?? 0) + Number(r.hit_by_pitch ?? 0) + Number(r.sacrifice_flies ?? 0);
        const obp = obDenom > 0 ? ((h + Number(r.walks ?? 0) + Number(r.hit_by_pitch ?? 0)) / obDenom).toFixed(3) : null;
        const slg = ab > 0 ? (Number(r.total_bases ?? 0) / ab).toFixed(3) : null;
        const babipDenom = ab - Number(r.strikeouts ?? 0) - Number(r.home_runs ?? 0) + Number(r.sacrifice_flies ?? 0);
        const babip = babipDenom > 0 ? ((h - Number(r.home_runs ?? 0)) / babipDenom).toFixed(3) : null;
        const one = {
          id: null,
          playerId: player.id,
          teamId: null,
          seasonId: null,
          games: r.games,
          plateAppearances: r.plate_appearances,
          atBats: r.at_bats,
          hits: r.hits,
          singles: r.singles,
          doubles: r.doubles,
          triples: r.triples,
          homeRuns: r.home_runs,
          rbi: r.rbi,
          runs: r.runs,
          walks: r.walks,
          strikeouts: r.strikeouts,
          hitByPitch: r.hit_by_pitch,
          stolenBases: r.stolen_bases,
          caughtStealing: r.caught_stealing,
          sacrificeFlies: r.sacrifice_flies,
          sacrificeBunts: r.sacrifice_bunts,
          groundOuts: r.ground_outs,
          flyOuts: r.fly_outs,
          groundedIntoDoublePlays: r.grounded_into_double_plays,
          intentionalWalks: r.intentional_walks,
          reachedOnError: r.reached_on_error,
          totalBases: r.total_bases,
          battingAvg: ab > 0 ? (h / ab).toFixed(3) : null,
          onBasePct: obp,
          sluggingPct: slg,
          ops: obp && slg ? (parseFloat(obp) + parseFloat(slg)).toFixed(3) : null,
          babip,
          lastComputedAt: null,
          teamName: r.team_name,
          seasonYear: null,
        };
        return reply.send([one]);
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
        .where(and(eq(playerSeasonBatting.playerId, player.id), eq(playerSeasonBatting.seasonId, seasonIdNum)))
        .orderBy(desc(seasons.year));

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch player stats' });
    }
  });

  // GET /:slug/pitching-stats - ?seasonId=X for one season, omit for all-time
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>('/:slug/pitching-stats', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === 'all';
      const seasonIdNum = seasonId && seasonId !== 'all' ? parseInt(seasonId, 10) : null;

      if (isAllTime || !seasonIdNum) {
        const rows = await db.execute(sql`
          SELECT
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(games_started, 0))::int AS games_started,
            SUM(COALESCE(wins, 0))::int AS wins,
            SUM(COALESCE(losses, 0))::int AS losses,
            SUM(COALESCE(saves, 0))::int AS saves,
            SUM(COALESCE(innings_pitched, 0)::numeric)::numeric AS innings_pitched,
            SUM(COALESCE(hits_allowed, 0))::int AS hits_allowed,
            SUM(COALESCE(runs_allowed, 0))::int AS runs_allowed,
            SUM(COALESCE(earned_runs, 0))::int AS earned_runs,
            SUM(COALESCE(walks_allowed, 0))::int AS walks_allowed,
            SUM(COALESCE(strikeouts, 0))::int AS strikeouts,
            SUM(COALESCE(home_runs_allowed, 0))::int AS home_runs_allowed,
            SUM(COALESCE(hit_batters, 0))::int AS hit_batters,
            SUM(COALESCE(wild_pitches, 0))::int AS wild_pitches,
            SUM(COALESCE(batters_faced, 0))::int AS batters_faced,
            SUM(COALESCE(balks, 0))::int AS balks,
            SUM(COALESCE(intentional_walks, 0))::int AS intentional_walks,
            SUM(COALESCE(ground_outs, 0))::int AS ground_outs,
            SUM(COALESCE(fly_outs, 0))::int AS fly_outs,
            (SELECT name FROM teams t JOIN player_season_pitching psp ON psp.team_id = t.id WHERE psp.player_id = ${player.id} ORDER BY psp.season_id DESC LIMIT 1) AS team_name
          FROM player_season_pitching WHERE player_id = ${player.id}
        `);
        const raw = (rows as { rows?: Record<string, unknown>[] }).rows ?? rows;
        const r = Array.isArray(raw) ? raw[0] : (raw as Record<string, unknown>);
        if (!r || Number(r.games) === 0) return reply.send([]);
        const ip = Number(r.innings_pitched ?? 0);
        const er = Number(r.earned_runs ?? 0);
        const h = Number(r.hits_allowed ?? 0);
        const bb = Number(r.walks_allowed ?? 0);
        const k = Number(r.strikeouts ?? 0);
        const hr = Number(r.home_runs_allowed ?? 0);
        const era = ip > 0 ? ((er / ip) * 9).toFixed(2) : null;
        const whip = ip > 0 ? ((bb + h) / ip).toFixed(2) : null;
        const one = {
          id: null,
          seasonId: null,
          games: r.games,
          gamesStarted: r.games_started,
          wins: r.wins,
          losses: r.losses,
          saves: r.saves,
          inningsPitched: ip.toFixed(1),
          hitsAllowed: r.hits_allowed,
          runsAllowed: r.runs_allowed,
          earnedRuns: r.earned_runs,
          walksAllowed: r.walks_allowed,
          strikeouts: r.strikeouts,
          homeRunsAllowed: r.home_runs_allowed,
          hitBatters: r.hit_batters,
          wildPitches: r.wild_pitches,
          battersFaced: r.batters_faced,
          balks: r.balks,
          intentionalWalks: r.intentional_walks,
          groundOuts: r.ground_outs,
          flyOuts: r.fly_outs,
          era,
          whip,
          strikeoutRate: ip > 0 ? (k / ip).toFixed(1) : null,
          walkRate: ip > 0 ? (bb / ip).toFixed(1) : null,
          fip: ip > 0 ? (3.1 + (13 * hr + 3 * bb - 2 * k) / ip).toFixed(2) : null,
          k9: ip > 0 ? ((k / ip) * 9).toFixed(1) : null,
          bb9: ip > 0 ? ((bb / ip) * 9).toFixed(1) : null,
          h9: ip > 0 ? ((h / ip) * 9).toFixed(1) : null,
          babip: null,
          teamName: r.team_name,
          seasonYear: null,
        };
        return reply.send([one]);
      }

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
        .where(and(eq(playerSeasonPitching.playerId, player.id), eq(playerSeasonPitching.seasonId, seasonIdNum)))
        .orderBy(desc(seasons.year));

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching stats' });
    }
  });

  // GET /:slug/fielding-stats - ?seasonId=X for one season, omit for all-time
  app.get<{ Params: { slug: string }; Querystring: { seasonId?: string } }>('/:slug/fielding-stats', async (request, reply) => {
    try {
      const [player] = await db.select().from(players).where(eq(players.slug, request.params.slug)).limit(1);
      if (!player) return reply.status(404).send({ message: 'Player not found' });

      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === 'all';
      const seasonIdNum = seasonId && seasonId !== 'all' ? parseInt(seasonId, 10) : null;

      if (isAllTime || !seasonIdNum) {
        const rows = await db.execute(sql`
          SELECT
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(innings, 0)::numeric)::numeric AS innings,
            SUM(COALESCE(putouts, 0))::int AS putouts,
            SUM(COALESCE(assists, 0))::int AS assists,
            SUM(COALESCE(errors, 0))::int AS errors,
            SUM(COALESCE(double_plays, 0))::int AS double_plays,
            SUM(COALESCE(triple_plays, 0))::int AS triple_plays,
            SUM(COALESCE(passed_balls, 0))::int AS passed_balls,
            SUM(COALESCE(catcher_stolen_bases, 0))::int AS catcher_stolen_bases,
            SUM(COALESCE(catcher_caught_stealing, 0))::int AS catcher_caught_stealing,
            SUM(COALESCE(pickoffs, 0))::int AS pickoffs,
            (SELECT name FROM teams t JOIN player_season_fielding psf ON psf.team_id = t.id WHERE psf.player_id = ${player.id} ORDER BY psf.season_id DESC LIMIT 1) AS team_name
          FROM player_season_fielding WHERE player_id = ${player.id}
        `);
        const raw = (rows as { rows?: Record<string, unknown>[] }).rows ?? rows;
        const r = Array.isArray(raw) ? raw[0] : (raw as Record<string, unknown>);
        if (!r || Number(r.games) === 0) return reply.send([]);
        const po = Number(r.putouts ?? 0);
        const a = Number(r.assists ?? 0);
        const e = Number(r.errors ?? 0);
        const tc = po + a + e;
        const fp = tc > 0 ? ((po + a) / tc).toFixed(3) : null;
        const one = {
          id: null,
          seasonId: null,
          games: r.games,
          innings: r.innings != null ? String(r.innings) : '0',
          putouts: r.putouts,
          assists: r.assists,
          errors: r.errors,
          doublePlays: r.double_plays,
          triplePlays: r.triple_plays,
          passedBalls: r.passed_balls,
          catcherStolenBases: r.catcher_stolen_bases,
          catcherCaughtStealing: r.catcher_caught_stealing,
          pickoffs: r.pickoffs,
          fieldingPct: fp,
          teamName: r.team_name,
          seasonYear: null,
        };
        return reply.send([one]);
      }

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
        .where(and(eq(playerSeasonFielding.playerId, player.id), eq(playerSeasonFielding.seasonId, seasonIdNum)))
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
