import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { standings, teams } from '../../db/schema/index.js';
import { and, desc, eq, gt } from 'drizzle-orm';

export async function standingsRoutes(app: FastifyInstance) {
  // GET /:leagueId - get standings for a league, ordered by winPct desc
  app.get<{ Params: { leagueId: string } }>('/:leagueId', async (request, reply) => {
    try {
      const leagueId = parseInt(request.params.leagueId, 10);
      if (isNaN(leagueId)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const result = await db
        .select({
          id: standings.id,
          leagueId: standings.leagueId,
          teamId: standings.teamId,
          teamName: teams.name,
          wins: standings.wins,
          losses: standings.losses,
          ties: standings.ties,
          gamesPlayed: standings.gamesPlayed,
          runsScored: standings.runsScored,
          runsAllowed: standings.runsAllowed,
          winPct: standings.winPct,
          gamesBehind: standings.gamesBehind,
          streak: standings.streak,
          lastTen: standings.lastTen,
        })
        .from(standings)
        .innerJoin(teams, eq(standings.teamId, teams.id))
        // Only show teams that have actually played at least one game.
        .where(and(eq(standings.leagueId, leagueId), gt(standings.gamesPlayed, 0)))
        .orderBy(desc(standings.winPct));

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch standings' });
    }
  });
}
