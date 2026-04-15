import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { seasons, leagues } from '../../db/schema/index.js';
import { eq, desc, sql } from 'drizzle-orm';
import { rowsFromExecute } from '../../lib/pg-result.js';
import { seasonWithPlayoffDefaults } from '../../lib/season-playoff-response.js';

async function seasonsHavePlayoffColumns(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'seasons'
        and column_name in ('has_playoffs', 'regular_season_games_per_team', 'playoff_settings')
    `);
    const list = rowsFromExecute<Record<string, unknown>>(rows);
    return list.length >= 3;
  } catch {
    return false;
  }
}

export async function seasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons ordered by year desc
  app.get('/', async (request, reply) => {
    try {
      const hasPoCols = await seasonsHavePlayoffColumns();
      const result = await db
        .select({
          id: seasons.id,
          year: seasons.year,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          isActive: seasons.isActive,
          seasonKind: seasons.seasonKind,
          parentSeasonId: seasons.parentSeasonId,
          ...(hasPoCols
            ? {
              hasPlayoffs: seasons.hasPlayoffs,
              regularSeasonGamesPerTeam: seasons.regularSeasonGamesPerTeam,
              playoffSettings: seasons.playoffSettings,
            }
            : {}),
          createdAt: seasons.createdAt,
        })
        .from(seasons)
        .orderBy(desc(seasons.year));
      return reply.send(
        result.map((s) => ({
          ...seasonWithPlayoffDefaults(hasPoCols, s as Record<string, unknown>),
          seasonKind: s.seasonKind ?? 'regular',
          parentSeasonId: s.parentSeasonId ?? null,
        })),
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

      const hasPoCols = await seasonsHavePlayoffColumns();
      const [season] = await db
        .select({
          id: seasons.id,
          year: seasons.year,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          isActive: seasons.isActive,
          seasonKind: seasons.seasonKind,
          parentSeasonId: seasons.parentSeasonId,
          ...(hasPoCols
            ? {
                hasPlayoffs: seasons.hasPlayoffs,
                regularSeasonGamesPerTeam: seasons.regularSeasonGamesPerTeam,
                playoffSettings: seasons.playoffSettings,
              }
            : {}),
          createdAt: seasons.createdAt,
        })
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

      return reply.send({
        ...seasonWithPlayoffDefaults(hasPoCols, season as Record<string, unknown>),
        seasonKind: season.seasonKind ?? 'regular',
        parentSeasonId: season.parentSeasonId ?? null,
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

      const hasPoCols = await seasonsHavePlayoffColumns();
      const [season] = await db
        .select({
          id: seasons.id,
          year: seasons.year,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          isActive: seasons.isActive,
          seasonKind: seasons.seasonKind,
          parentSeasonId: seasons.parentSeasonId,
          ...(hasPoCols
            ? {
              hasPlayoffs: seasons.hasPlayoffs,
              regularSeasonGamesPerTeam: seasons.regularSeasonGamesPerTeam,
              playoffSettings: seasons.playoffSettings,
            }
            : {}),
          createdAt: seasons.createdAt,
        })
        .from(seasons)
        .where(eq(seasons.year, year))
        .orderBy(desc(seasons.seasonKind))
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
        ...seasonWithPlayoffDefaults(hasPoCols, season as Record<string, unknown>),
        seasonKind: season.seasonKind ?? 'regular',
        parentSeasonId: season.parentSeasonId ?? null,
        leagues: seasonLeagues,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });
}
