import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { seasons, leagues } from '../../db/schema/index.js';
import { eq, desc, sql } from 'drizzle-orm';

async function seasonsHavePlayoffColumns(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'seasons'
        and column_name in ('has_playoffs', 'regular_season_games_per_team', 'playoff_settings')
    `);
    const list = Array.isArray((rows as any).rows) ? (rows as any).rows : (rows as any);
    return Array.isArray(list) && list.length >= 3;
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
        result.map((s: any) => ({
          ...s,
          hasPlayoffs: hasPoCols ? (s.hasPlayoffs ?? false) : false,
          regularSeasonGamesPerTeam: hasPoCols ? (s.regularSeasonGamesPerTeam ?? null) : null,
          playoffSettings: hasPoCols ? (s.playoffSettings ?? {}) : {},
        }))
      );
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

      const hasPoCols = await seasonsHavePlayoffColumns();
      const [season] = await db
        .select({
          id: seasons.id,
          year: seasons.year,
          name: seasons.name,
          startDate: seasons.startDate,
          endDate: seasons.endDate,
          isActive: seasons.isActive,
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
        hasPlayoffs: hasPoCols ? ((season as any).hasPlayoffs ?? false) : false,
        regularSeasonGamesPerTeam: hasPoCols ? ((season as any).regularSeasonGamesPerTeam ?? null) : null,
        playoffSettings: hasPoCols ? ((season as any).playoffSettings ?? {}) : {},
        leagues: seasonLeagues,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });
}
