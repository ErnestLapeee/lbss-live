import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { seasons, leagues } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

export async function seasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons ordered by year desc
  app.get('/', async (request, reply) => {
    try {
      const result = await db
        // IMPORTANT: do not `select()` all columns from seasons, because production DB may lag behind
        // app schema during deployments/migration rollbacks (e.g. playoff columns). Keep this to core columns.
        .select({
          id: seasons.id,
          year: seasons.year,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          isActive: seasons.isActive,
          createdAt: seasons.createdAt,
        })
        .from(seasons)
        .orderBy(desc(seasons.year));
      return reply.send(result.map((s) => ({
        ...s,
        hasPlayoffs: false,
        regularSeasonGamesPerTeam: null,
        playoffSettings: {},
      })));
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
        .select({
          id: seasons.id,
          year: seasons.year,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          isActive: seasons.isActive,
          createdAt: seasons.createdAt,
        })
        .from(seasons)
        .where(eq(seasons.year, year))
        .limit(1);

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      const seasonLeagues = await db
        // Avoid `select()` all columns in case DB schema is behind app schema.
        .select({
          id: leagues.id,
          seasonId: leagues.seasonId,
          name: leagues.name,
          slug: leagues.slug,
          sport: leagues.sport,
          level: leagues.level,
          createdAt: leagues.createdAt,
        })
        .from(leagues)
        .where(eq(leagues.seasonId, season.id));

      return reply.send({
        ...season,
        hasPlayoffs: false,
        regularSeasonGamesPerTeam: null,
        playoffSettings: {},
        leagues: seasonLeagues,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });
}
