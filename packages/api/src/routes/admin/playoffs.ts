import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { playoffs, playoffSeries, games, seasons, teams } from '../../db/schema/index.js';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getSeasonsColumnFlagsCached } from '../../lib/seasons-playoff-columns-cache.js';
import { seasonsRowSelectShape } from '../../lib/seasons-drizzle-select.js';

const playoffsSelect = {
  id: playoffs.id,
  seasonId: playoffs.seasonId,
  name: playoffs.name,
  isActive: playoffs.isActive,
  config: playoffs.config,
  createdAt: playoffs.createdAt,
  updatedAt: playoffs.updatedAt,
};

export async function adminPlayoffsRoutes(app: FastifyInstance) {
  // GET /?seasonId= - list playoffs rows (optionally filtered by season)
  app.get<{ Querystring: { seasonId?: string } }>('/', async (request, reply) => {
    try {
      const seasonId = request.query?.seasonId ? parseInt(request.query.seasonId, 10) : null;
      const rows = seasonId
        ? await db.select(playoffsSelect).from(playoffs).where(eq(playoffs.seasonId, seasonId)).orderBy(desc(playoffs.id))
        : await db.select(playoffsSelect).from(playoffs).orderBy(desc(playoffs.id));
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch playoffs' });
    }
  });

  // POST / - create playoffs for a season
  app.post<{ Body: { seasonId: number; name: string; isActive?: boolean; config?: unknown } }>('/', async (request, reply) => {
    try {
      const { seasonId, name, isActive, config } = (request.body ?? {}) as Partial<{
        seasonId: number;
        name: string;
        isActive?: boolean;
        config?: unknown;
      }>;
      if (!seasonId || !name) return reply.status(400).send({ message: 'seasonId and name required' });

      const flags = await getSeasonsColumnFlagsCached();
      const [season] = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1);
      if (!season) return reply.status(404).send({ message: 'Season not found' });

      const sk = flags.hasSeasonKindOptionals
        ? String((season as Record<string, unknown>).seasonKind ?? 'regular')
        : 'regular';
      if (sk !== 'playoff') {
        return reply.status(400).send({
          message:
            'Playoff brackets must be attached to a Playoff season. In Admin → Seasons, create a separate season with type "Playoff", add leagues/teams there, then configure the bracket.',
        });
      }

      const [row] = await db.insert(playoffs).values({
        seasonId,
        name,
        isActive: isActive ?? true,
        config: config ?? {},
      }).returning(playoffsSelect);

      // Ensure season is marked as having playoffs.
      await db.update(seasons).set({ hasPlayoffs: true }).where(eq(seasons.id, seasonId));

      return reply.status(201).send(row);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create playoffs' });
    }
  });

  // PUT /:id - update playoffs
  app.put<{ Params: { id: string }; Body: { name?: string; isActive?: boolean; config?: unknown } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid playoffs id' });
      const { name, isActive, config } = request.body ?? {};
      const [row] = await db.update(playoffs).set({
        ...(name !== undefined && { name }),
        ...(isActive !== undefined && { isActive }),
        ...(config !== undefined && { config }),
        updatedAt: new Date(),
      }).where(eq(playoffs.id, id)).returning(playoffsSelect);
      if (!row) return reply.status(404).send({ message: 'Playoffs not found' });
      return reply.send(row);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update playoffs' });
    }
  });

  // DELETE /:id - delete playoffs (cascades series; unlinks games)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid playoffs id' });

      // Unlink games that reference series in this playoffs.
      const seriesIds = await db.select({ id: playoffSeries.id }).from(playoffSeries).where(eq(playoffSeries.playoffsId, id));
      if (seriesIds.length > 0) {
        await db.update(games)
          .set({ playoffSeriesId: null })
          .where(inArray(games.playoffSeriesId, seriesIds.map(s => s.id)));
      }

      const [deleted] = await db.delete(playoffs).where(eq(playoffs.id, id)).returning();
      if (!deleted) return reply.status(404).send({ message: 'Playoffs not found' });
      return reply.send({ message: 'Playoffs deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete playoffs' });
    }
  });

  // GET /:id/series - list series in a playoffs
  app.get<{ Params: { id: string } }>('/:id/series', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid playoffs id' });
      const rows = await db
        .select()
        .from(playoffSeries)
        .where(eq(playoffSeries.playoffsId, id))
        .orderBy(asc(playoffSeries.roundNumber), asc(playoffSeries.seriesIndex));
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch series' });
    }
  });

  // POST /:id/generate-bracket-from-order — round 1 pairings from seed order (1 vs N, 2 vs N-1, …); even count only
  app.post<{
    Params: { id: string };
    Body: { teamIdsOrdered?: number[]; replaceExisting?: boolean };
  }>('/:id/generate-bracket-from-order', async (request, reply) => {
    try {
      const playoffsId = parseInt(request.params.id, 10);
      if (isNaN(playoffsId)) return reply.status(400).send({ message: 'Invalid playoffs id' });

      const [po] = await db.select(playoffsSelect).from(playoffs).where(eq(playoffs.id, playoffsId)).limit(1);
      if (!po) return reply.status(404).send({ message: 'Playoffs not found' });

      const raw = (request.body as { teamIdsOrdered?: unknown; replaceExisting?: unknown }) ?? {};
      const ordered = Array.isArray(raw.teamIdsOrdered)
        ? raw.teamIdsOrdered.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      const unique = [...new Set(ordered)];
      if (unique.length !== ordered.length) {
        return reply.status(400).send({ message: 'Duplicate team ids in list' });
      }
      if (ordered.length < 2) {
        return reply.status(400).send({ message: 'At least two teams required' });
      }
      if (ordered.length % 2 !== 0) {
        return reply.status(400).send({ message: 'Use an even number of teams for this generator (pairings).' });
      }

      const found = await db.select({ id: teams.id }).from(teams).where(inArray(teams.id, unique));
      if (found.length !== unique.length) {
        return reply.status(400).send({ message: 'One or more team ids are invalid' });
      }

      const replace = raw.replaceExisting === true;

      const n = ordered.length;
      await db.transaction(async (tx) => {
        if (replace) {
          const seriesIds = await tx
            .select({ id: playoffSeries.id })
            .from(playoffSeries)
            .where(eq(playoffSeries.playoffsId, playoffsId));
          if (seriesIds.length > 0) {
            const ids = seriesIds.map((s) => s.id);
            await tx.update(games).set({ playoffSeriesId: null }).where(inArray(games.playoffSeriesId, ids));
            await tx.delete(playoffSeries).where(eq(playoffSeries.playoffsId, playoffsId));
          }
        } else {
          const existingRows = await tx
            .select({ id: playoffSeries.id })
            .from(playoffSeries)
            .where(eq(playoffSeries.playoffsId, playoffsId));
          if (existingRows.length > 0) {
            throw new Error('SERIES_EXIST');
          }
        }

        for (let i = 0; i < n / 2; i++) {
          const hi = ordered[i]!;
          const lo = ordered[n - 1 - i]!;
          await tx.insert(playoffSeries).values({
            playoffsId,
            roundNumber: 1,
            seriesIndex: i + 1,
            label: `Game ${i + 1}`,
            bestOf: 1,
            higherSeed: i + 1,
            lowerSeed: n - i,
            higherTeamId: hi,
            lowerTeamId: lo,
          });
        }
      });

      return reply.send({ message: `Created ${n / 2} series (round 1).` });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SERIES_EXIST') {
        return reply.status(409).send({
          message: 'This bracket already has series. Pass replaceExisting: true to replace (clears linked games).',
        });
      }
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to generate bracket' });
    }
  });

  // POST /:id/series - create series
  app.post<{ Params: { id: string }; Body: {
    roundNumber: number;
    seriesIndex: number;
    label?: string;
    bestOf?: number;
    higherSeed?: number | null;
    lowerSeed?: number | null;
    higherTeamId?: number | null;
    lowerTeamId?: number | null;
  } }>('/:id/series', async (request, reply) => {
    try {
      const playoffsId = parseInt(request.params.id, 10);
      if (isNaN(playoffsId)) return reply.status(400).send({ message: 'Invalid playoffs id' });
      const body = (request.body ?? {}) as Partial<{
        roundNumber: number;
        seriesIndex: number;
        label?: string;
        bestOf?: number;
        higherSeed?: number | null;
        lowerSeed?: number | null;
        higherTeamId?: number | null;
        lowerTeamId?: number | null;
      }>;
      if (body.roundNumber == null || body.seriesIndex == null) {
        return reply.status(400).send({ message: 'roundNumber and seriesIndex required' });
      }
      if (body.roundNumber < 1) {
        return reply.status(400).send({ message: 'roundNumber must be at least 1' });
      }
      const [row] = await db.insert(playoffSeries).values({
        playoffsId,
        roundNumber: body.roundNumber,
        seriesIndex: body.seriesIndex,
        label: body.label ?? null,
        bestOf: body.bestOf ?? 1,
        higherSeed: body.higherSeed ?? null,
        lowerSeed: body.lowerSeed ?? null,
        higherTeamId: body.higherTeamId ?? null,
        lowerTeamId: body.lowerTeamId ?? null,
      }).returning();
      return reply.status(201).send(row);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create series' });
    }
  });

  // PUT /series/:seriesId - update series
  app.put<{ Params: { seriesId: string }; Body: Record<string, any> }>('/series/:seriesId', async (request, reply) => {
    try {
      const seriesId = parseInt(request.params.seriesId, 10);
      if (isNaN(seriesId)) return reply.status(400).send({ message: 'Invalid series id' });
      const body = request.body ?? {};
      const [row] = await db.update(playoffSeries).set({
        ...(body.roundNumber !== undefined && { roundNumber: body.roundNumber }),
        ...(body.seriesIndex !== undefined && { seriesIndex: body.seriesIndex }),
        ...(body.label !== undefined && { label: body.label }),
        ...(body.bestOf !== undefined && { bestOf: body.bestOf }),
        ...(body.higherSeed !== undefined && { higherSeed: body.higherSeed }),
        ...(body.lowerSeed !== undefined && { lowerSeed: body.lowerSeed }),
        ...(body.higherTeamId !== undefined && { higherTeamId: body.higherTeamId }),
        ...(body.lowerTeamId !== undefined && { lowerTeamId: body.lowerTeamId }),
        ...(body.winnerTeamId !== undefined && { winnerTeamId: body.winnerTeamId }),
        updatedAt: new Date(),
      }).where(eq(playoffSeries.id, seriesId)).returning();
      if (!row) return reply.status(404).send({ message: 'Series not found' });
      return reply.send(row);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update series' });
    }
  });

  // DELETE /series/:seriesId - delete series and unlink games
  app.delete<{ Params: { seriesId: string } }>('/series/:seriesId', async (request, reply) => {
    try {
      const seriesId = parseInt(request.params.seriesId, 10);
      if (isNaN(seriesId)) return reply.status(400).send({ message: 'Invalid series id' });
      await db.update(games).set({ playoffSeriesId: null }).where(eq(games.playoffSeriesId, seriesId));
      const [row] = await db.delete(playoffSeries).where(eq(playoffSeries.id, seriesId)).returning();
      if (!row) return reply.status(404).send({ message: 'Series not found' });
      return reply.send({ message: 'Series deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete series' });
    }
  });
}

