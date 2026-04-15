import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { seasons, leagues } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { seasonWithPlayoffDefaults } from '../../lib/season-playoff-response.js';
import { getSeasonsColumnFlagsCached } from '../../lib/seasons-playoff-columns-cache.js';
import { seasonsRowSelectShape } from '../../lib/seasons-drizzle-select.js';

export async function seasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons ordered by year desc
  app.get('/', async (request, reply) => {
    try {
      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const result = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .orderBy(desc(seasons.year));
      return reply.send(
        result.map((s) => {
          const row = s as Record<string, unknown>;
          return {
            ...seasonWithPlayoffDefaults(hasPoCols, row),
            seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
            parentSeasonId: flags.hasSeasonKindOptionals
              ? ((row.parentSeasonId as number | null | undefined) ?? null)
              : null,
          };
        }),
      );
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch seasons' });
    }
  });

  // GET /by-id/:id — same payload as /:year, but keyed by season id (regular vs playoff same year)
  app.get<{ Params: { id: string } }>('/by-id/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const [season] = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .where(eq(seasons.id, id))
        .limit(1);

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      const seasonLeagues = await db
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

      const row = season as Record<string, unknown>;
      return reply.send({
        ...seasonWithPlayoffDefaults(hasPoCols, row),
        seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
        parentSeasonId: flags.hasSeasonKindOptionals
          ? ((row.parentSeasonId as number | null | undefined) ?? null)
          : null,
        leagues: seasonLeagues,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });

  // GET /:year - get season by year, include its leagues
  app.get<{ Params: { year: string } }>('/:year', async (request, reply) => {
    try {
      const year = parseInt(request.params.year, 10);
      if (isNaN(year)) {
        return reply.status(400).send({ message: 'Invalid year' });
      }

      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const byYear = db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .where(eq(seasons.year, year));
      const [season] = flags.hasSeasonKindOptionals
        ? await byYear.orderBy(desc(seasons.seasonKind)).limit(1)
        : await byYear.limit(1);

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

      const row = season as Record<string, unknown>;
      return reply.send({
        ...seasonWithPlayoffDefaults(hasPoCols, row),
        seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
        parentSeasonId: flags.hasSeasonKindOptionals
          ? ((row.parentSeasonId as number | null | undefined) ?? null)
          : null,
        leagues: seasonLeagues,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });
}
