import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { leagues, seasons } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export async function leaguesRoutes(app: FastifyInstance) {
  // GET /:id - get league by id with season info
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const [league] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, id))
        .limit(1);

      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }

      const [season] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, league.seasonId))
        .limit(1);

      return reply.send({ ...league, season: season ?? null });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch league' });
    }
  });
}
