import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { seasons, leagues } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

export async function seasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons ordered by year desc
  app.get('/', async (request, reply) => {
    try {
      const result = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.year));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch seasons' });
    }
  });

  // GET /:year - get season by year, include its leagues
  app.get<{ Params: { year: string } }>('/:year', async (request, reply) => {
    try {
      const year = parseInt(request.params.year, 10);
      if (isNaN(year)) {
        return reply.status(400).send({ message: 'Invalid year' });
      }

      const [season] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.year, year))
        .limit(1);

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      const seasonLeagues = await db
        .select()
        .from(leagues)
        .where(eq(leagues.seasonId, season.id));

      return reply.send({ ...season, leagues: seasonLeagues });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });
}
