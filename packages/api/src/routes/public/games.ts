import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  games,
  teams,
  leagues,
  seasons,
  playerGameBatting,
  playerGamePitching,
  playerGameFielding,
  playerSeasonBatting,
  playerSeasonPitching,
  gameLineups,
  players,
  gameEvents,
} from '../../db/schema/index.js';
import { eq, and, gte, lte, sql, desc, sum, inArray } from 'drizzle-orm';
import { rowsFromExecute } from '../../lib/pg-result.js';
import { gamesTableHasOfficialColumns } from '../../lib/games-official-columns.js';
import { buildPublicLineScores } from '@lbss/shared';

export async function gamesRoutes(app: FastifyInstance) {
  // GET / - list games with optional filters: seasonId, leagueId, status, from/to dates
  app.get<{
    Querystring: {
      seasonId?: string;
      leagueId?: string;
      status?: string;
      from?: string;
      to?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const { seasonId, leagueId, status, from, to } = request.query;

      const conditions = [];
      if (seasonId) {
        const sid = parseInt(seasonId, 10);
        if (!isNaN(sid)) {
          conditions.push(sql`${games.leagueId} IN (SELECT id FROM leagues WHERE season_id = ${sid})`);
        }
      }
      if (leagueId) {
        const id = parseInt(leagueId, 10);
        if (!isNaN(id)) conditions.push(eq(games.leagueId, id));
      }
      if (status) conditions.push(eq(games.status, status));
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) conditions.push(gte(games.scheduledAt, fromDate));
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) conditions.push(lte(games.scheduledAt, toDate));
      }

      const hasOfficialCols = await gamesTableHasOfficialColumns();
      const gameSelect = {
        id: games.id,
        leagueId: games.leagueId,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        scheduledAt: games.scheduledAt,
        venue: games.venue,
        ...(hasOfficialCols ? { umpire: games.umpire, officialScorer: games.officialScorer } : {}),
        status: games.status,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        currentInning: games.currentInning,
        currentHalf: games.currentHalf,
        currentOuts: games.currentOuts,
        isFinalized: games.isFinalized,
        inningsCount: games.inningsCount,
      };

      const gamesList = conditions.length > 0
        ? await db.select(gameSelect).from(games).where(and(...conditions)).orderBy(games.scheduledAt)
        : await db.select(gameSelect).from(games).orderBy(games.scheduledAt);

      // League -> season info for each game
      const leagueIds = new Set<number>();
      for (const g of gamesList) leagueIds.add(g.leagueId);
      const leagueSeasonMap: Record<number, { seasonId: number; seasonYear: number; seasonName: string }> = {};
      if (leagueIds.size > 0) {
        const leagueRows = await db.select({
          leagueId: leagues.id,
          seasonId: seasons.id,
          seasonYear: seasons.year,
          seasonName: seasons.name,
        })
          .from(leagues)
          .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
          .where(sql`${leagues.id} = ANY(${sql.raw(`ARRAY[${[...leagueIds].join(',')}]`)})`);
        for (const r of leagueRows) leagueSeasonMap[r.leagueId] = { seasonId: r.seasonId, seasonYear: r.seasonYear, seasonName: r.seasonName };
      }

      // Collect all team IDs for a single batch query
      const teamIds = new Set<number>();
      for (const g of gamesList) { teamIds.add(g.homeTeamId); teamIds.add(g.awayTeamId); }
      const teamMap: Record<number, { name: string; shortName: string | null; logoUrl: string | null }> = {};
      if (teamIds.size > 0) {
        const teamRows = await db.select({ id: teams.id, name: teams.name, shortName: teams.shortName, logoUrl: teams.logoUrl })
          .from(teams)
          .where(sql`${teams.id} = ANY(${sql.raw(`ARRAY[${[...teamIds].join(',')}]`)})`);
        for (const t of teamRows) teamMap[t.id] = { name: t.name, shortName: t.shortName, logoUrl: t.logoUrl };
      }

      // Batch fetch linescores + game state for live/final games
      const scoredIds = gamesList.filter(g => g.status === 'live' || g.status === 'final').map(g => g.id);
      const linescoreMap: Record<number, { homeLineScore: number[]; awayLineScore: number[] }> = {};
      const boundsMap: Record<number, { maxTop: number; maxBot: number }> = {};
      for (const id of scoredIds) boundsMap[id] = { maxTop: 0, maxBot: 0 };

      if (scoredIds.length > 0) {
        const allEvts = await db.select({
          gameId: gameEvents.gameId,
          inning: gameEvents.inning,
          half: gameEvents.half,
          eventType: gameEvents.eventType,
          runsScored: gameEvents.runsScored,
        }).from(gameEvents)
          .where(and(
            sql`${gameEvents.gameId} = ANY(${sql.raw(`ARRAY[${scoredIds.join(',')}]`)})`,
            eq(gameEvents.isDeleted, false),
          ))
          .orderBy(gameEvents.eventNumber);

        for (const e of allEvts) {
          const b = boundsMap[e.gameId];
          if (b && e.eventType === 'end_half_inning' && e.inning != null && e.half) {
            if (e.half === 'top') b.maxTop = Math.max(b.maxTop, e.inning);
            else b.maxBot = Math.max(b.maxBot, e.inning);
          }
          if (e.eventType === 'pitch' || e.eventType === 'end_half_inning') continue;
          const runs = e.runsScored ?? 0;
          if (runs === 0) continue;
          if (!linescoreMap[e.gameId]) linescoreMap[e.gameId] = { homeLineScore: [], awayLineScore: [] };
          const ls = linescoreMap[e.gameId];
          const idx = e.inning - 1;
          if (e.half === 'top') {
            while (ls.awayLineScore.length <= idx) ls.awayLineScore.push(0);
            ls.awayLineScore[idx] += runs;
          } else {
            while (ls.homeLineScore.length <= idx) ls.homeLineScore.push(0);
            ls.homeLineScore[idx] += runs;
          }
        }
      }

      // Batch fetch base occupancy + current batter for live games
      const liveIds = gamesList.filter(g => g.status === 'live').map(g => g.id);
      const basesMap: Record<number, { first: boolean; second: boolean; third: boolean }> = {};
      const currentBatterMap: Record<number, { name: string; battingOrder: number } | null> = {};
      if (liveIds.length > 0) {
        const liveIdArray = sql.raw(`ARRAY[${liveIds.join(',')}]`);
        const baseRows = rowsFromExecute<{
          game_id: number;
          runner_first_id: number | null;
          runner_second_id: number | null;
          runner_third_id: number | null;
        }>(await db.execute(sql`
          select distinct on (game_id)
            game_id, runner_first_id, runner_second_id, runner_third_id
          from game_events
          where game_id = any(${liveIdArray})
            and is_deleted = false
            and event_type != 'pitch'
          order by game_id, event_number desc
        `));
        for (const row of baseRows) {
          basesMap[row.game_id] = {
            first: !!row.runner_first_id,
            second: !!row.runner_second_id,
            third: !!row.runner_third_id,
          };
        }

        const batterRows = rowsFromExecute<{ game_id: number; batter_id: number }>(await db.execute(sql`
          select distinct on (game_id) game_id, batter_id
          from game_events
          where game_id = any(${liveIdArray})
            and is_deleted = false
            and batter_id is not null
          order by game_id, event_number desc
        `));
        const batterIds = [...new Set(batterRows.map((row) => row.batter_id))];
        if (batterIds.length > 0) {
          const [playerRows, lineupRows] = await Promise.all([
            db.select({
              id: players.id,
              firstName: players.firstName,
              lastName: players.lastName,
            }).from(players).where(inArray(players.id, batterIds)),
            db.select({
              gameId: gameLineups.gameId,
              playerId: gameLineups.playerId,
              battingOrder: gameLineups.battingOrder,
            }).from(gameLineups).where(and(
              inArray(gameLineups.gameId, liveIds),
              inArray(gameLineups.playerId, batterIds),
            )),
          ]);
          const playerMap = new Map(playerRows.map((row) => [row.id, row]));
          const lineupMap = new Map(lineupRows.map((row) => [`${row.gameId}:${row.playerId}`, row]));
          for (const row of batterRows) {
            const playerRow = playerMap.get(row.batter_id);
            if (!playerRow) continue;
            const lineupRow = lineupMap.get(`${row.game_id}:${row.batter_id}`);
            currentBatterMap[row.game_id] = {
              name: `${playerRow.firstName.charAt(0)}. ${playerRow.lastName}`,
              battingOrder: lineupRow?.battingOrder ?? 0,
            };
          }
        }
      }

      // Batch fetch W/L pitchers for finalized games
      const finalIds = gamesList.filter(g => g.isFinalized).map(g => g.id);
      const wpMap: Record<number, { decision: string; firstName: string; lastName: string; teamId: number; ip: string; h: number; er: number; bb: number; k: number }[]> = {};
      if (finalIds.length > 0) {
        const pitcherRows = await db.select({
          gameId: playerGamePitching.gameId,
          teamId: playerGamePitching.teamId,
          decision: playerGamePitching.decision,
          firstName: players.firstName,
          lastName: players.lastName,
          inningsPitched: playerGamePitching.inningsPitched,
          hitsAllowed: playerGamePitching.hitsAllowed,
          earnedRuns: playerGamePitching.earnedRuns,
          walksAllowed: playerGamePitching.walksAllowed,
          strikeouts: playerGamePitching.strikeouts,
        }).from(playerGamePitching)
          .innerJoin(players, eq(playerGamePitching.playerId, players.id))
          .where(and(
            sql`${playerGamePitching.gameId} = ANY(${sql.raw(`ARRAY[${finalIds.join(',')}]`)})`,
            sql`${playerGamePitching.decision} IN ('W', 'L', 'S')`,
          ));
        for (const r of pitcherRows) {
          if (!wpMap[r.gameId]) wpMap[r.gameId] = [];
          wpMap[r.gameId].push({
            decision: r.decision!,
            firstName: r.firstName,
            lastName: r.lastName,
            teamId: r.teamId,
            ip: r.inningsPitched ?? '0',
            h: r.hitsAllowed ?? 0,
            er: r.earnedRuns ?? 0,
            bb: r.walksAllowed ?? 0,
            k: r.strikeouts ?? 0,
          });
        }
      }

      // Team hits & fielding errors (final games) for schedule mini box R/H/E
      const finalStatIds = gamesList.filter(g => g.status === 'final').map(g => g.id);
      const hitsByGameTeam: Record<number, Record<number, number>> = {};
      const errorsByGameTeam: Record<number, Record<number, number>> = {};
      if (finalStatIds.length > 0) {
        const hitRows = await db
          .select({
            gameId: playerGameBatting.gameId,
            teamId: playerGameBatting.teamId,
            totalHits: sum(playerGameBatting.hits),
          })
          .from(playerGameBatting)
          .where(inArray(playerGameBatting.gameId, finalStatIds))
          .groupBy(playerGameBatting.gameId, playerGameBatting.teamId);
        for (const r of hitRows) {
          if (!hitsByGameTeam[r.gameId]) hitsByGameTeam[r.gameId] = {};
          hitsByGameTeam[r.gameId][r.teamId] = Number(r.totalHits ?? 0);
        }
        const errRows = await db
          .select({
            gameId: playerGameFielding.gameId,
            teamId: playerGameFielding.teamId,
            totalErr: sum(playerGameFielding.errors),
          })
          .from(playerGameFielding)
          .where(inArray(playerGameFielding.gameId, finalStatIds))
          .groupBy(playerGameFielding.gameId, playerGameFielding.teamId);
        for (const r of errRows) {
          if (!errorsByGameTeam[r.gameId]) errorsByGameTeam[r.gameId] = {};
          errorsByGameTeam[r.gameId][r.teamId] = Number(r.totalErr ?? 0);
        }
      }

      const result = gamesList.map(g => {
        const ht = teamMap[g.homeTeamId];
        const at = teamMap[g.awayTeamId];
        const ls = linescoreMap[g.id];
        const paddedLines =
          g.status === 'live' || g.status === 'final'
            ? buildPublicLineScores({
                awayScoring: ls?.awayLineScore ?? [],
                homeScoring: ls?.homeLineScore ?? [],
                bounds: boundsMap[g.id] ?? { maxTop: 0, maxBot: 0 },
                gameStatus: g.status,
                isFinalized: !!g.isFinalized,
                awayRuns: g.awayScore ?? 0,
                homeRuns: g.homeScore ?? 0,
                currentInning: g.currentInning ?? null,
                currentHalf: g.currentHalf ?? null,
              })
            : null;
        const pitchers = wpMap[g.id] || [];
        const wp = pitchers.find(p => p.decision === 'W');
        const lp = pitchers.find(p => p.decision === 'L');
        const sv = pitchers.find(p => p.decision === 'S');
        const bases = basesMap[g.id] ?? null;
        const currentBatter = currentBatterMap[g.id] ?? null;
        const seasonInfo = leagueSeasonMap[g.leagueId];
        const row = g as typeof g & { umpire?: string | null; officialScorer?: string | null };
        return {
          ...g,
          umpire: hasOfficialCols ? row.umpire ?? null : null,
          officialScorer: hasOfficialCols ? row.officialScorer ?? null : null,
          seasonId: seasonInfo?.seasonId ?? null,
          seasonYear: seasonInfo?.seasonYear ?? null,
          seasonName: seasonInfo?.seasonName ?? null,
          homeTeamName: ht?.name ?? null,
          awayTeamName: at?.name ?? null,
          homeTeamShort: ht?.shortName ?? null,
          awayTeamShort: at?.shortName ?? null,
          homeTeamLogoUrl: ht?.logoUrl ?? null,
          awayTeamLogoUrl: at?.logoUrl ?? null,
          homeLineScore: paddedLines?.homeLineScore ?? null,
          awayLineScore: paddedLines?.awayLineScore ?? null,
          homeTeamHits: g.status === 'final' ? (hitsByGameTeam[g.id]?.[g.homeTeamId] ?? 0) : null,
          awayTeamHits: g.status === 'final' ? (hitsByGameTeam[g.id]?.[g.awayTeamId] ?? 0) : null,
          homeTeamErrors: g.status === 'final' ? (errorsByGameTeam[g.id]?.[g.homeTeamId] ?? 0) : null,
          awayTeamErrors: g.status === 'final' ? (errorsByGameTeam[g.id]?.[g.awayTeamId] ?? 0) : null,
          bases,
          currentBatter,
          winPitcher: wp ? { name: `${wp.firstName.charAt(0)}. ${wp.lastName}`, ip: wp.ip, h: wp.h, er: wp.er, bb: wp.bb, k: wp.k } : null,
          lossPitcher: lp ? { name: `${lp.firstName.charAt(0)}. ${lp.lastName}`, ip: lp.ip, h: lp.h, er: lp.er, bb: lp.bb, k: lp.k } : null,
          savePitcher: sv ? { name: `${sv.firstName.charAt(0)}. ${sv.lastName}`, ip: sv.ip, h: sv.h, er: sv.er, bb: sv.bb, k: sv.k } : null,
        };
      });

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch games' });
    }
  });

  // GET /:id - get game details with team names
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      // IMPORTANT: do not `select()` all columns from games, because production DB may lag behind
      // app schema during deployments/migration rollbacks (e.g. playoff columns). Keep this to core columns.
      const hasOfficialCols = await gamesTableHasOfficialColumns();
      const [gameRow] = await db
        .select({
          id: games.id,
          leagueId: games.leagueId,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
          scheduledAt: games.scheduledAt,
          venue: games.venue,
          ...(hasOfficialCols ? { umpire: games.umpire, officialScorer: games.officialScorer } : {}),
          status: games.status,
          homeScore: games.homeScore,
          awayScore: games.awayScore,
          inningsCount: games.inningsCount,
          currentInning: games.currentInning,
          currentHalf: games.currentHalf,
          currentOuts: games.currentOuts,
          isFinalized: games.isFinalized,
          finalizedAt: games.finalizedAt,
          finalizedBy: games.finalizedBy,
          createdAt: games.createdAt,
          updatedAt: games.updatedAt,
        })
        .from(games)
        .where(eq(games.id, id))
        .limit(1);

      if (!gameRow) {
        return reply.status(404).send({ message: 'Game not found' });
      }

      const gr = gameRow as typeof gameRow & { umpire?: string | null; officialScorer?: string | null };
      const game = {
        ...gameRow,
        umpire: hasOfficialCols ? gr.umpire ?? null : null,
        officialScorer: hasOfficialCols ? gr.officialScorer ?? null : null,
      };

      const [homeTeam] = await db
        .select({ name: teams.name, slug: teams.slug, shortName: teams.shortName, logoUrl: teams.logoUrl })
        .from(teams)
        .where(eq(teams.id, game.homeTeamId))
        .limit(1);
      const [awayTeam] = await db
        .select({ name: teams.name, slug: teams.slug, shortName: teams.shortName, logoUrl: teams.logoUrl })
        .from(teams)
        .where(eq(teams.id, game.awayTeamId))
        .limit(1);

      return reply.send({
        ...game,
        homeTeamName: homeTeam?.name ?? null,
        awayTeamName: awayTeam?.name ?? null,
        homeTeamSlug: homeTeam?.slug ?? null,
        awayTeamSlug: awayTeam?.slug ?? null,
        homeTeamShortName: homeTeam?.shortName ?? null,
        awayTeamShortName: awayTeam?.shortName ?? null,
        homeTeamLogoUrl: homeTeam?.logoUrl ?? null,
        awayTeamLogoUrl: awayTeam?.logoUrl ?? null,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch game' });
    }
  });

  // GET /:id/boxscore - get batting stats for all players in this game
  app.get<{ Params: { id: string } }>('/:id/boxscore', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const battingStats = await db
        .select({
          id: playerGameBatting.id,
          gameId: playerGameBatting.gameId,
          playerId: playerGameBatting.playerId,
          teamId: playerGameBatting.teamId,
          plateAppearances: playerGameBatting.plateAppearances,
          atBats: playerGameBatting.atBats,
          hits: playerGameBatting.hits,
          singles: playerGameBatting.singles,
          doubles: playerGameBatting.doubles,
          triples: playerGameBatting.triples,
          homeRuns: playerGameBatting.homeRuns,
          rbi: playerGameBatting.rbi,
          runs: playerGameBatting.runs,
          walks: playerGameBatting.walks,
          strikeouts: playerGameBatting.strikeouts,
          hitByPitch: playerGameBatting.hitByPitch,
          sacrificeFlies: playerGameBatting.sacrificeFlies,
          sacrificeBunts: playerGameBatting.sacrificeBunts,
          stolenBases: playerGameBatting.stolenBases,
          caughtStealing: playerGameBatting.caughtStealing,
          errors: playerGameBatting.errors,
          groundOuts: playerGameBatting.groundOuts,
          flyOuts: playerGameBatting.flyOuts,
          groundedIntoDoublePlays: playerGameBatting.groundedIntoDoublePlays,
          intentionalWalks: playerGameBatting.intentionalWalks,
          reachedOnError: playerGameBatting.reachedOnError,
          totalBases: playerGameBatting.totalBases,
          buntSingles: playerGameBatting.buntSingles,
          strikeoutsLooking: playerGameBatting.strikeoutsLooking,
          strikeoutsSwinging: playerGameBatting.strikeoutsSwinging,
          pickedOff: playerGameBatting.pickedOff,
          fieldersChoice: playerGameBatting.fieldersChoice,
          catcherInterference: playerGameBatting.catcherInterference,
          groundedIntoTriplePlay: playerGameBatting.groundedIntoTriplePlay,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
        })
        .from(playerGameBatting)
        .innerJoin(players, eq(playerGameBatting.playerId, players.id))
        .innerJoin(teams, eq(playerGameBatting.teamId, teams.id))
        .where(eq(playerGameBatting.gameId, id));

      return reply.send(battingStats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch boxscore' });
    }
  });

  // GET /:id/events - get all non-deleted events for this game, ordered by eventNumber
  app.get<{ Params: { id: string } }>('/:id/events', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const evts = await db
        .select()
        .from(gameEvents)
        .where(and(eq(gameEvents.gameId, id), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      // Collect unique player IDs to resolve names
      const playerIds = new Set<number>();
      for (const e of evts) {
        if (e.batterId) playerIds.add(e.batterId);
        if (e.pitcherId) playerIds.add(e.pitcherId);
        if (e.runnerFirstId) playerIds.add(e.runnerFirstId);
        if (e.runnerSecondId) playerIds.add(e.runnerSecondId);
        if (e.runnerThirdId) playerIds.add(e.runnerThirdId);
        const rs = (e.runnersScored as number[]) || [];
        for (const r of rs) playerIds.add(r);
      }

      const playerMap: Record<number, string> = {};
      if (playerIds.size > 0) {
        const ids = [...playerIds];
        const allPlayers = await db.select({ id: players.id, firstName: players.firstName, lastName: players.lastName })
          .from(players)
          .where(inArray(players.id, ids));
        for (const p of allPlayers) playerMap[p.id] = `${p.firstName} ${p.lastName}`;
      }

      const enriched = evts.map(e => ({
        ...e,
        batterName: e.batterId ? playerMap[e.batterId] || null : null,
        pitcherName: e.pitcherId ? playerMap[e.pitcherId] || null : null,
        runnerFirstName: e.runnerFirstId ? playerMap[e.runnerFirstId] || null : null,
        runnerSecondName: e.runnerSecondId ? playerMap[e.runnerSecondId] || null : null,
        runnerThirdName: e.runnerThirdId ? playerMap[e.runnerThirdId] || null : null,
        runnersScoredNames: ((e.runnersScored as number[]) || []).map(id => playerMap[id] || `#${id}`),
      }));

      return reply.send(enriched);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch events' });
    }
  });

  // GET /:id/lineups - get lineups with player names
  app.get<{ Params: { id: string } }>('/:id/lineups', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid game id' });

      const lineupRows = await db
        .select({
          id: gameLineups.id,
          gameId: gameLineups.gameId,
          teamId: gameLineups.teamId,
          playerId: gameLineups.playerId,
          battingOrder: gameLineups.battingOrder,
          position: gameLineups.position,
          isStarter: gameLineups.isStarter,
          isActive: gameLineups.isActive,
          firstName: players.firstName,
          lastName: players.lastName,
        })
        .from(gameLineups)
        .leftJoin(players, eq(gameLineups.playerId, players.id))
        .where(eq(gameLineups.gameId, id))
        .orderBy(gameLineups.battingOrder);

      return reply.send(
        lineupRows.map((row) => ({
          ...row,
          firstName: row.firstName ?? '—',
          lastName: row.lastName ?? 'Vacant slot',
        })),
      );
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch lineups' });
    }
  });

  // GET /:id/pitching-boxscore - pitching stats for this game
  app.get<{ Params: { id: string } }>('/:id/pitching-boxscore', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid game id' });

      const stats = await db
        .select({
          playerId: playerGamePitching.playerId,
          teamId: playerGamePitching.teamId,
          inningsPitched: playerGamePitching.inningsPitched,
          hits: playerGamePitching.hitsAllowed,
          runs: playerGamePitching.runsAllowed,
          earnedRuns: playerGamePitching.earnedRuns,
          walks: playerGamePitching.walksAllowed,
          strikeouts: playerGamePitching.strikeouts,
          homeRuns: playerGamePitching.homeRunsAllowed,
          hitBatters: playerGamePitching.hitBatters,
          pitchesThrown: playerGamePitching.pitchesThrown,
          decision: playerGamePitching.decision,
          isStarter: playerGamePitching.isStarter,
          battersFaced: playerGamePitching.battersFaced,
          balks: playerGamePitching.balks,
          intentionalWalks: playerGamePitching.intentionalWalks,
          groundOuts: playerGamePitching.groundOuts,
          flyOuts: playerGamePitching.flyOuts,
          gameScore: playerGamePitching.gameScore,
          qualityStarts: playerGamePitching.qualityStarts,
          shutouts: playerGamePitching.shutouts,
          completeGames: playerGamePitching.completeGames,
          strikeoutsLooking: playerGamePitching.strikeoutsLooking,
          strikeoutsSwinging: playerGamePitching.strikeoutsSwinging,
          wildPitches: playerGamePitching.wildPitches,
          balls: playerGamePitching.balls,
          strikes: playerGamePitching.strikes,
          firstName: players.firstName,
          lastName: players.lastName,
        })
        .from(playerGamePitching)
        .innerJoin(players, eq(playerGamePitching.playerId, players.id))
        .where(eq(playerGamePitching.gameId, id));

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching boxscore' });
    }
  });

  // GET /:id/fielding-boxscore - fielding stats for this game (errors, PB, etc.)
  app.get<{ Params: { id: string } }>('/:id/fielding-boxscore', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid game id' });

      const stats = await db
        .select({
          playerId: playerGameFielding.playerId,
          teamId: playerGameFielding.teamId,
          position: playerGameFielding.position,
          putouts: playerGameFielding.putouts,
          assists: playerGameFielding.assists,
          errors: playerGameFielding.errors,
          doublePlays: playerGameFielding.doublePlays,
          triplePlays: playerGameFielding.triplePlays,
          passedBalls: playerGameFielding.passedBalls,
          firstName: players.firstName,
          lastName: players.lastName,
        })
        .from(playerGameFielding)
        .innerJoin(players, eq(playerGameFielding.playerId, players.id))
        .where(eq(playerGameFielding.gameId, id));

      return reply.send(stats);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch fielding boxscore' });
    }
  });

  // GET /:id/linescore - compute per-inning linescore from events
  app.get<{ Params: { id: string } }>('/:id/linescore', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid game id' });

      const evts = await db
        .select({
          inning: gameEvents.inning,
          half: gameEvents.half,
          eventType: gameEvents.eventType,
          runsScored: gameEvents.runsScored,
        })
        .from(gameEvents)
        .where(and(eq(gameEvents.gameId, id), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const homeLineScore: number[] = [];
      const awayLineScore: number[] = [];

      for (const e of evts) {
        if (e.eventType === 'pitch' || e.eventType === 'end_half_inning') continue;
        const runs = e.runsScored ?? 0;
        if (runs === 0) continue;
        const idx = e.inning - 1;
        if (e.half === 'top') {
          while (awayLineScore.length <= idx) awayLineScore.push(0);
          awayLineScore[idx] += runs;
        } else {
          while (homeLineScore.length <= idx) homeLineScore.push(0);
          homeLineScore[idx] += runs;
        }
      }

      return reply.send({ homeLineScore, awayLineScore });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to compute linescore' });
    }
  });

  // GET /:id/season-context - get season batting/pitching averages for all players in this game
  app.get<{ Params: { id: string } }>('/:id/season-context', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid game id' });

      // Get the game's season via league
      const [gameRow] = await db.select({ leagueId: games.leagueId }).from(games).where(eq(games.id, id)).limit(1);
      if (!gameRow) return reply.status(404).send({ message: 'Game not found' });
      const [leagueRow] = await db.select({ seasonId: leagues.seasonId }).from(leagues).where(eq(leagues.id, gameRow.leagueId)).limit(1);
      if (!leagueRow) return reply.send({ batting: [], pitching: [] });
      const seasonId = leagueRow.seasonId;

      // Get all player IDs in this game's lineups
      const lineupRows = await db.select({ playerId: gameLineups.playerId }).from(gameLineups).where(eq(gameLineups.gameId, id));
      const pids = lineupRows.map(r => r.playerId);
      if (pids.length === 0) return reply.send({ batting: [], pitching: [] });

      const batting = await db.select({
        playerId: playerSeasonBatting.playerId,
        atBats: playerSeasonBatting.atBats,
        hits: playerSeasonBatting.hits,
        homeRuns: playerSeasonBatting.homeRuns,
        rbi: playerSeasonBatting.rbi,
        runs: playerSeasonBatting.runs,
        avg: playerSeasonBatting.battingAvg,
        obp: playerSeasonBatting.onBasePct,
        slg: playerSeasonBatting.sluggingPct,
        ops: playerSeasonBatting.ops,
        walks: playerSeasonBatting.walks,
        strikeouts: playerSeasonBatting.strikeouts,
        stolenBases: playerSeasonBatting.stolenBases,
        hitByPitch: playerSeasonBatting.hitByPitch,
        sacrificeFlies: playerSeasonBatting.sacrificeFlies,
        totalBases: playerSeasonBatting.totalBases,
      }).from(playerSeasonBatting)
        .where(and(
          eq(playerSeasonBatting.seasonId, seasonId),
          sql`${playerSeasonBatting.playerId} = ANY(${sql.raw(`ARRAY[${pids.join(',')}]`)})`
        ));

      const pitching = await db.select({
        playerId: playerSeasonPitching.playerId,
        inningsPitched: playerSeasonPitching.inningsPitched,
        wins: playerSeasonPitching.wins,
        losses: playerSeasonPitching.losses,
        era: playerSeasonPitching.era,
        strikeouts: playerSeasonPitching.strikeouts,
        walksAllowed: playerSeasonPitching.walksAllowed,
      }).from(playerSeasonPitching)
        .where(and(
          eq(playerSeasonPitching.seasonId, seasonId),
          sql`${playerSeasonPitching.playerId} = ANY(${sql.raw(`ARRAY[${pids.join(',')}]`)})`
        ));

      return reply.send({ batting, pitching });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season context' });
    }
  });
}
