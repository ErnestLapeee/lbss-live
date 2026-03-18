import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  games,
  leagueTeams,
  leagues,
  licenses,
  payments,
  playerGameBatting,
  playerGameFielding,
  playerGamePitching,
  playerSeasonBatting,
  playerSeasonFielding,
  playerSeasonPitching,
  playerSeasons,
  seasons,
  standings,
} from '../../db/schema/index.js';
import { desc, eq, inArray } from 'drizzle-orm';

export async function adminSeasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons
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
      // Fill optional playoff fields for older DB schemas.
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

  // GET /:id - get season by id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
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
        .where(eq(seasons.id, id))
        .limit(1);

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send({
        ...season,
        hasPlayoffs: false,
        regularSeasonGamesPerTeam: null,
        playoffSettings: {},
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });

  // POST / - create season
  app.post<{
    Body: {
      year: number;
      name: string;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      hasPlayoffs?: boolean;
      regularSeasonGamesPerTeam?: number;
      playoffSettings?: any;
    };
  }>('/', async (request, reply) => {
    try {
      const { year, name, startDate, endDate, isActive, hasPlayoffs, regularSeasonGamesPerTeam, playoffSettings } = request.body ?? {};
      if (!year || !name) {
        return reply.status(400).send({ message: 'year and name required' });
      }

      const [season] = await db
        .insert(seasons)
        .values({
          year,
          name,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          isActive: isActive ?? false,
          hasPlayoffs: hasPlayoffs ?? false,
          regularSeasonGamesPerTeam: regularSeasonGamesPerTeam ?? null,
          playoffSettings: playoffSettings ?? {},
        })
        .returning();

      return reply.status(201).send(season);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create season' });
    }
  });

  // PUT /:id - update season
  app.put<{
    Params: { id: string };
    Body: {
      year?: number;
      name?: string;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      hasPlayoffs?: boolean;
      regularSeasonGamesPerTeam?: number | null;
      playoffSettings?: any;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const { year, name, startDate, endDate, isActive, hasPlayoffs, regularSeasonGamesPerTeam, playoffSettings } = request.body ?? {};

      const [season] = await db
        .update(seasons)
        .set({
          ...(year !== undefined && { year }),
          ...(name !== undefined && { name }),
          ...(startDate !== undefined && { startDate }),
          ...(endDate !== undefined && { endDate }),
          ...(isActive !== undefined && { isActive }),
          ...(hasPlayoffs !== undefined && { hasPlayoffs }),
          ...(regularSeasonGamesPerTeam !== undefined && { regularSeasonGamesPerTeam }),
          ...(playoffSettings !== undefined && { playoffSettings }),
        })
        .where(eq(seasons.id, id))
        .returning();

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send(season);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update season' });
    }
  });

  // DELETE /:id - delete season
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const deleted = await db.transaction(async (tx) => {
        // Find all leagues in this season
        const seasonLeagues = await tx
          .select({ id: leagues.id })
          .from(leagues)
          .where(eq(leagues.seasonId, id));

        for (const league of seasonLeagues) {
          // Delete all games (and their per-game data) for this league
          const leagueGames = await tx
            .select({ id: games.id })
            .from(games)
            .where(eq(games.leagueId, league.id));

          for (const g of leagueGames) {
            await tx.delete(playerGameFielding).where(eq(playerGameFielding.gameId, g.id));
            await tx.delete(playerGamePitching).where(eq(playerGamePitching.gameId, g.id));
            await tx.delete(playerGameBatting).where(eq(playerGameBatting.gameId, g.id));
            await tx.delete(games).where(eq(games.id, g.id));
          }

          // Delete league-team links and standings rows for this league
          await tx.delete(standings).where(eq(standings.leagueId, league.id));
          await tx.delete(leagueTeams).where(eq(leagueTeams.leagueId, league.id));

          // Finally delete the league itself
          await tx.delete(leagues).where(eq(leagues.id, league.id));
        }

        // Delete season-level player stats and roster records
        await tx.delete(playerSeasonBatting).where(eq(playerSeasonBatting.seasonId, id));
        await tx.delete(playerSeasonPitching).where(eq(playerSeasonPitching.seasonId, id));
        await tx.delete(playerSeasonFielding).where(eq(playerSeasonFielding.seasonId, id));
        await tx.delete(playerSeasons).where(eq(playerSeasons.seasonId, id));

        // Delete licenses and related payments for this season
        const seasonLicenses = await tx
          .select({ id: licenses.id })
          .from(licenses)
          .where(eq(licenses.seasonId, id));
        const licenseIds = seasonLicenses.map((l) => l.id);
        if (licenseIds.length > 0) {
          await tx.delete(payments).where(inArray(payments.licenseId, licenseIds));
          await tx.delete(licenses).where(inArray(licenses.id, licenseIds));
        }

        // Finally delete the season record itself
        return tx
          .delete(seasons)
          .where(eq(seasons.id, id))
          .returning({ id: seasons.id });
      });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send({ message: 'Season deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete season' });
    }
  });
}
