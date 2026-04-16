import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { leagues, seasons } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { getSeasonsColumnFlagsCached } from '../../lib/seasons-playoff-columns-cache.js';
import { seasonsRowSelectShape } from '../../lib/seasons-drizzle-select.js';
import { seasonWithPlayoffDefaults } from '../../lib/season-playoff-response.js';

const leagueCore = {
  id: leagues.id,
  seasonId: leagues.seasonId,
  name: leagues.name,
  slug: leagues.slug,
  sport: leagues.sport,
  level: leagues.level,
  createdAt: leagues.createdAt,
};

export async function leaguesRoutes(app: FastifyInstance) {
  // GET /:id - get league by id with season info
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid league id' });
      }

      const [league] = await db.select(leagueCore).from(leagues).where(eq(leagues.id, id)).limit(1);

      if (!league) {
        return reply.status(404).send({ message: 'League not found' });
      }

      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const [seasonRow] = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .where(eq(seasons.id, league.seasonId))
        .limit(1);

      const season = seasonRow
        ? {
            ...seasonWithPlayoffDefaults(hasPoCols, seasonRow as Record<string, unknown>),
            seasonKind: flags.hasSeasonKindOptionals
              ? String((seasonRow as Record<string, unknown>).seasonKind ?? 'regular')
              : 'regular',
            parentSeasonId: flags.hasSeasonKindOptionals
              ? ((seasonRow as Record<string, unknown>).parentSeasonId as number | null | undefined) ?? null
              : null,
          }
        : null;

      return reply.send({ ...league, season });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch league' });
    }
  });
}
