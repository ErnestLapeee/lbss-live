import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { games, gameEvents, gameLineups, playerGameBatting, playerGamePitching, playerGameFielding, playerSeasonBatting, playerSeasonPitching, playerSeasonFielding, standings } from '../../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { finalizeGame, recomputeSeasonBatting, recomputeSeasonPitching, recomputeSeasonFielding, recomputeStandings } from '../../services/finalize-game.js';

export async function adminGamesRoutes(app: FastifyInstance) {
  // GET / - list all games
  app.get('/', async (request, reply) => {
    try {
      const result = await db.select().from(games).orderBy(games.scheduledAt);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch games' });
    }
  });

  // POST / - create game
  app.post<{
    Body: {
      leagueId: number;
      homeTeamId: number;
      awayTeamId: number;
      scheduledAt: string;
      venue?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const { leagueId, homeTeamId, awayTeamId, scheduledAt, venue } =
        request.body ?? {};

      if (!leagueId || !homeTeamId || !awayTeamId || !scheduledAt) {
        return reply
          .status(400)
          .send({ message: 'leagueId, homeTeamId, awayTeamId, scheduledAt required' });
      }

      const [game] = await db
        .insert(games)
        .values({
          leagueId,
          homeTeamId,
          awayTeamId,
          scheduledAt: new Date(scheduledAt),
          venue: venue ?? null,
        })
        .returning();

      return reply.status(201).send(game);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create game' });
    }
  });

  // PUT /:id - update game
  app.put<{
    Params: { id: string };
    Body: {
      leagueId?: number;
      homeTeamId?: number;
      awayTeamId?: number;
      scheduledAt?: string;
      venue?: string;
      status?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const body = request.body ?? {};
      const updateData: Record<string, unknown> = {};
      if (body.leagueId !== undefined) updateData.leagueId = body.leagueId;
      if (body.homeTeamId !== undefined) updateData.homeTeamId = body.homeTeamId;
      if (body.awayTeamId !== undefined) updateData.awayTeamId = body.awayTeamId;
      if (body.scheduledAt !== undefined)
        updateData.scheduledAt = new Date(body.scheduledAt);
      if (body.venue !== undefined) updateData.venue = body.venue;
      if (body.status !== undefined) updateData.status = body.status;

      const [game] = await db
        .update(games)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(games.id, id))
        .returning();

      if (!game) {
        return reply.status(404).send({ message: 'Game not found' });
      }

      return reply.send(game);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update game' });
    }
  });

  // DELETE /:id - delete game and all related data, then recompute season stats
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const [game] = await db
        .select()
        .from(games)
        .where(eq(games.id, id))
        .limit(1);

      if (!game) {
        return reply.status(404).send({ message: 'Game not found' });
      }

      const leagueId = game.leagueId;

      // Delete all related per-game data (foreign key dependencies)
      await db.delete(playerGameFielding).where(eq(playerGameFielding.gameId, id));
      await db.delete(playerGamePitching).where(eq(playerGamePitching.gameId, id));
      await db.delete(playerGameBatting).where(eq(playerGameBatting.gameId, id));
      await db.delete(gameEvents).where(eq(gameEvents.gameId, id));
      await db.delete(gameLineups).where(eq(gameLineups.gameId, id));
      await db.delete(games).where(eq(games.id, id));

      // Recompute season aggregates if the game belonged to a league
      if (leagueId) {
        try {
          const seasonResult = await db.execute(
            sql`SELECT s.id FROM seasons s JOIN leagues l ON l.season_id = s.id WHERE l.id = ${leagueId} LIMIT 1`
          );
          const seasonId = ((seasonResult as any).rows?.[0] ?? (seasonResult as any)?.[0])?.id;

          if (seasonId) {
            // Delete stale season rows then recompute from remaining games
            await db.delete(playerSeasonBatting).where(eq(playerSeasonBatting.seasonId, seasonId));
            await db.delete(playerSeasonPitching).where(eq(playerSeasonPitching.seasonId, seasonId));
            await db.delete(playerSeasonFielding).where(eq(playerSeasonFielding.seasonId, seasonId));

            await recomputeSeasonBatting(seasonId);
            await recomputeSeasonPitching(seasonId);
            await recomputeSeasonFielding(seasonId);
          }

          // Recompute standings
          await recomputeStandings(leagueId);
        } catch (recomputeErr) {
          request.log.error(recomputeErr, 'Failed to recompute season stats after game delete');
        }
      }

      return reply.send({ message: 'Game deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete game' });
    }
  });

  // POST /:id/finalize - finalize game (computes stats, standings, etc.)
  app.post<{ Params: { id: string } }>('/:id/finalize', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const user = (request as any).user;
      const result = await finalizeGame(id, user?.id);
      return reply.send(result);
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ message: err.message || 'Failed to finalize game' });
    }
  });

}
