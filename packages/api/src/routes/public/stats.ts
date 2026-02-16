import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  playerSeasonBatting,
  playerSeasonPitching,
  playerSeasonFielding,
  playerGameFielding,
  players,
  teams,
  seasons,
} from '../../db/schema/index.js';
import { eq, desc, asc, and, sql } from 'drizzle-orm';

export async function statsRoutes(app: FastifyInstance) {
  // GET /batting?seasonId=X - all batting stats for a season
  app.get<{
    Querystring: { seasonId?: string };
  }>('/batting', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }
      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const result = await db
        .select({
          playerId: players.id,
          playerSlug: players.slug,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
          teamShortName: teams.shortName,
          teamLogoUrl: teams.logoUrl,
          id: playerSeasonBatting.id,
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
        })
        .from(playerSeasonBatting)
        .innerJoin(players, eq(playerSeasonBatting.playerId, players.id))
        .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
        .where(eq(playerSeasonBatting.seasonId, seasonIdNum))
        .orderBy(desc(playerSeasonBatting.battingAvg));

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch batting stats' });
    }
  });

  // GET /leaders?seasonId=X - top 5 in each major category
  app.get<{
    Querystring: { seasonId?: string };
  }>('/leaders', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }
      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const baseFields = {
        playerId: players.id,
        playerSlug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
        teamName: teams.name,
        teamShortName: teams.shortName,
        teamLogoUrl: teams.logoUrl,
      };

      const categories = [
        { key: 'battingAvg', column: playerSeasonBatting.battingAvg, label: 'Batting Average' },
        { key: 'homeRuns', column: playerSeasonBatting.homeRuns, label: 'Home Runs' },
        { key: 'rbi', column: playerSeasonBatting.rbi, label: 'RBI' },
        { key: 'hits', column: playerSeasonBatting.hits, label: 'Hits' },
        { key: 'stolenBases', column: playerSeasonBatting.stolenBases, label: 'Stolen Bases' },
        { key: 'ops', column: playerSeasonBatting.ops, label: 'OPS' },
        { key: 'runs', column: playerSeasonBatting.runs, label: 'Runs' },
      ];

      const leaders: Record<string, { label: string; players: any[] }> = {};

      for (const cat of categories) {
        const rows = await db
          .select({
            ...baseFields,
            value: cat.column,
          })
          .from(playerSeasonBatting)
          .innerJoin(players, eq(playerSeasonBatting.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
          .where(eq(playerSeasonBatting.seasonId, seasonIdNum))
          .orderBy(desc(cat.column))
          .limit(5);

        leaders[cat.key] = {
          label: cat.label,
          players: rows,
        };
      }

      return reply.send(leaders);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch leaders' });
    }
  });

  // GET /pitching?seasonId=X - all pitching stats for a season
  app.get<{
    Querystring: { seasonId?: string };
  }>('/pitching', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }
      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const result = await db
        .select({
          playerId: players.id,
          playerSlug: players.slug,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
          teamShortName: teams.shortName,
          teamLogoUrl: teams.logoUrl,
          id: playerSeasonPitching.id,
          teamId: playerSeasonPitching.teamId,
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
          strikeoutRate: playerSeasonPitching.strikeoutRate,
          walkRate: playerSeasonPitching.walkRate,
          fip: playerSeasonPitching.fip,
          k9: playerSeasonPitching.k9,
          bb9: playerSeasonPitching.bb9,
          h9: playerSeasonPitching.h9,
          babip: playerSeasonPitching.babip,
        })
        .from(playerSeasonPitching)
        .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
        .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
        .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
        .orderBy(asc(playerSeasonPitching.era));

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching stats' });
    }
  });

  // GET /pitching-leaders?seasonId=X - top 5 in each pitching category
  app.get<{
    Querystring: { seasonId?: string };
  }>('/pitching-leaders', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }
      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const baseFields = {
        playerId: players.id,
        playerSlug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
        teamName: teams.name,
        teamShortName: teams.shortName,
        teamLogoUrl: teams.logoUrl,
      };

      // ERA: lower is better
      const eraLeaders = await db
        .select({ ...baseFields, value: playerSeasonPitching.era })
        .from(playerSeasonPitching)
        .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
        .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
        .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
        .orderBy(asc(playerSeasonPitching.era))
        .limit(5);

      // WHIP: lower is better
      const whipLeaders = await db
        .select({ ...baseFields, value: playerSeasonPitching.whip })
        .from(playerSeasonPitching)
        .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
        .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
        .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
        .orderBy(asc(playerSeasonPitching.whip))
        .limit(5);

      const descCategories = [
        { key: 'strikeouts', column: playerSeasonPitching.strikeouts, label: 'Strikeouts' },
        { key: 'wins', column: playerSeasonPitching.wins, label: 'Wins' },
        { key: 'saves', column: playerSeasonPitching.saves, label: 'Saves' },
        { key: 'inningsPitched', column: playerSeasonPitching.inningsPitched, label: 'Innings Pitched' },
      ];

      const leaders: Record<string, { label: string; players: any[] }> = {
        era: { label: 'ERA', players: eraLeaders },
        whip: { label: 'WHIP', players: whipLeaders },
      };

      for (const cat of descCategories) {
        const rows = await db
          .select({ ...baseFields, value: cat.column })
          .from(playerSeasonPitching)
          .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
          .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
          .orderBy(desc(cat.column))
          .limit(5);

        leaders[cat.key] = { label: cat.label, players: rows };
      }

      return reply.send(leaders);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching leaders' });
    }
  });

  // GET /fielding?seasonId=X - all fielding stats for a season
  app.get<{
    Querystring: { seasonId?: string };
  }>('/fielding', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }
      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const result = await db
        .select({
          playerId: players.id,
          playerSlug: players.slug,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
          teamShortName: teams.shortName,
          teamLogoUrl: teams.logoUrl,
          id: playerSeasonFielding.id,
          teamId: playerSeasonFielding.teamId,
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
        })
        .from(playerSeasonFielding)
        .innerJoin(players, eq(playerSeasonFielding.playerId, players.id))
        .innerJoin(teams, eq(playerSeasonFielding.teamId, teams.id))
        .where(eq(playerSeasonFielding.seasonId, seasonIdNum))
        .orderBy(desc(playerSeasonFielding.fieldingPct));

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch fielding stats' });
    }
  });

  // GET /fielding-by-position?seasonId=X&position=N - fielding stats for a specific position
  // Aggregates from playerGameFielding so we get per-position breakdown
  app.get<{
    Querystring: { seasonId?: string; position?: string };
  }>('/fielding-by-position', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const positionStr = request.query.position;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }
      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const conditions = [
        sql`${playerGameFielding.gameId} IN (
          SELECT g.id FROM games g
          INNER JOIN leagues l ON g.league_id = l.id
          WHERE l.season_id = ${seasonIdNum}
        )`,
      ];
      if (positionStr) {
        const posNum = parseInt(positionStr, 10);
        if (!isNaN(posNum)) {
          conditions.push(eq(playerGameFielding.position, posNum));
        }
      }

      const rows = await db
        .select({
          playerId: players.id,
          playerSlug: players.slug,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
          teamShortName: teams.shortName,
          teamLogoUrl: teams.logoUrl,
          position: playerGameFielding.position,
          games: sql<number>`count(*)`.as('games'),
          innings: sql<string>`sum(${playerGameFielding.innings}::numeric)`.as('innings'),
          putouts: sql<number>`sum(${playerGameFielding.putouts})`.as('putouts'),
          assists: sql<number>`sum(${playerGameFielding.assists})`.as('assists'),
          errors: sql<number>`sum(${playerGameFielding.errors})`.as('errors'),
          doublePlays: sql<number>`sum(${playerGameFielding.doublePlays})`.as('double_plays'),
          triplePlays: sql<number>`sum(${playerGameFielding.triplePlays})`.as('triple_plays'),
          passedBalls: sql<number>`sum(${playerGameFielding.passedBalls})`.as('passed_balls'),
          catcherStolenBases: sql<number>`sum(${playerGameFielding.catcherStolenBases})`.as('catcher_sb'),
          catcherCaughtStealing: sql<number>`sum(${playerGameFielding.catcherCaughtStealing})`.as('catcher_cs'),
          pickoffs: sql<number>`sum(${playerGameFielding.pickoffs})`.as('pickoffs'),
        })
        .from(playerGameFielding)
        .innerJoin(players, eq(playerGameFielding.playerId, players.id))
        .innerJoin(teams, eq(playerGameFielding.teamId, teams.id))
        .where(and(...conditions))
        .groupBy(
          players.id, players.slug, players.firstName, players.lastName,
          teams.name, teams.shortName, teams.logoUrl,
          playerGameFielding.position,
        )
        .orderBy(sql`count(*) desc`);

      const result = rows.map(r => {
        const po = Number(r.putouts) || 0;
        const a = Number(r.assists) || 0;
        const e = Number(r.errors) || 0;
        const tc = po + a + e;
        return {
          ...r,
          games: Number(r.games),
          putouts: po,
          assists: a,
          errors: e,
          doublePlays: Number(r.doublePlays) || 0,
          triplePlays: Number(r.triplePlays) || 0,
          passedBalls: Number(r.passedBalls) || 0,
          catcherStolenBases: Number(r.catcherStolenBases) || 0,
          catcherCaughtStealing: Number(r.catcherCaughtStealing) || 0,
          pickoffs: Number(r.pickoffs) || 0,
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

  // GET /seasons - all seasons for the season selector
  app.get('/seasons', async (_request, reply) => {
    try {
      const result = await db
        .select({ id: seasons.id, name: seasons.name, year: seasons.year, isActive: seasons.isActive })
        .from(seasons)
        .orderBy(desc(seasons.year));
      return reply.send(result);
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch seasons' });
    }
  });
}
