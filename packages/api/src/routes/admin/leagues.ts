import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { leagueTeams, leagues, standings } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export async function adminLeaguesRoutes(app: FastifyInstance) {
  // GET / - list all leagues
  app.get('/', async (request, reply) => {
    try {
      // IMPORTANT: do not `select()` all columns from leagues, because production DB may lag behind
      // app schema during deployments/migration rollbacks. Keep this to core columns.
      const result = await db.select({
        id: leagues.id,
        seasonId: leagues.seasonId,
        name: leagues.name,
        slug: leagues.slug,
        sport: leagues.sport,
        level: leagues.level,
        createdAt: leagues.createdAt,
      }).from(leagues);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch leagues' });
    }
  });

  // POST / - create league
  app.post<{
    Body: {
      seasonId: number;
      name: string;
      slug: string;
      sport?: string;
      level?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const { seasonId, name, slug, sport, level } = request.body ?? {};
      if (!seasonId || !name || !slug) {
        return reply.status(400).send({ message: 'seasonId, name, and slug required' });
      }

      const [league] = await db
        .insert(leagues)
        .values({
          seasonId,
          name,
          slug,
          sport: sport ?? 'baseball',
          level: level ?? 'senior',
        })
        .returning();

      return reply.status(201).send(league);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create league' });
    }
  });

  // PUT /:id - update league
  app.put<{
    Params: { id: string };
    Body: {
      seasonId?: number;
      name?: string;
      slug?: string;
      sport?: string;
      level?: string;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const { seasonId, name, slug, sport, level } = request.body ?? {};

      const [league] = await db
        .update(leagues)
        .set({
          ...(seasonId !== undefined && { seasonId }),
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(sport !== undefined && { sport }),
          ...(level !== undefined && { level }),
        })
        .where(eq(leagues.id, id))
        .returning();

      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }

      return reply.send(league);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update league' });
    }
  });

  // DELETE /:id - delete league
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const deleted = await db.transaction(async (tx) => {
        // Remove dependent data that references this league so FK constraints don't block deletion.
        await tx.delete(standings).where(eq(standings.leagueId, id));
        await tx.delete(leagueTeams).where(eq(leagueTeams.leagueId, id));

        return tx
          .delete(leagues)
          .where(eq(leagues.id, id))
          .returning({ id: leagues.id });
      });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'League not found' });
      }

      return reply.send({ message: 'League deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete league' });
    }
  });
}
