import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  playerSeasonBatting,
  players,
  teams,
} from '../../db/schema/index.js';
import { eq, desc, and, gte } from 'drizzle-orm';

function getOrderColumn(category: string) {
  switch (category) {
    case 'home_runs':
      return playerSeasonBatting.homeRuns;
    case 'rbi':
      return playerSeasonBatting.rbi;
    case 'hits':
      return playerSeasonBatting.hits;
    case 'stolen_bases':
      return playerSeasonBatting.stolenBases;
    case 'ops':
      return playerSeasonBatting.ops;
    default:
      return playerSeasonBatting.battingAvg;
  }
}

export async function leaderboardsRoutes(app: FastifyInstance) {
  // GET / - leaderboard endpoint
  app.get<{
    Querystring: { seasonId?: string; category?: string };
  }>('/', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      if (!seasonId) {
        return reply.status(400).send({ message: 'seasonId query param required' });
      }

      const seasonIdNum = parseInt(seasonId, 10);
      if (isNaN(seasonIdNum)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const category = request.query.category || 'batting_avg';
      const orderColumn = getOrderColumn(category);

      const result = await db
        .select({
          playerId: players.id,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
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
          battingAvg: playerSeasonBatting.battingAvg,
          onBasePct: playerSeasonBatting.onBasePct,
          sluggingPct: playerSeasonBatting.sluggingPct,
          ops: playerSeasonBatting.ops,
          lastComputedAt: playerSeasonBatting.lastComputedAt,
        })
        .from(playerSeasonBatting)
        .innerJoin(players, eq(playerSeasonBatting.playerId, players.id))
        .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
        .where(
          and(
            eq(playerSeasonBatting.seasonId, seasonIdNum),
            gte(playerSeasonBatting.atBats, 10)
          )
        )
        .orderBy(desc(orderColumn))
        .limit(20);

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch leaderboard' });
    }
  });
}
