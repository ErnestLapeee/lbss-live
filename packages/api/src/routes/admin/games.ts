import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  games,
  gameEvents,
  gameLineups,
  leagues,
  playerGameBatting,
  playerGamePitching,
  playerGameFielding,
  playerSeasonBatting,
  playerSeasonPitching,
  playerSeasonFielding,
  standings,
  playoffSeries,
} from '../../db/schema/index.js';
import { eq, and, sql, inArray, asc } from 'drizzle-orm';
import { finalizeGame, recomputeSeasonBatting, recomputeSeasonPitching, recomputeSeasonFielding, recomputeStandings } from '../../services/finalize-game.js';
import { firstRowFromExecute } from '../../lib/pg-result.js';

/** Columns safe for all deployed DBs (avoid RETURNING/select * on newer schema fields before migrations run). */
const adminGameListSelect = {
  id: games.id,
  leagueId: games.leagueId,
  homeTeamId: games.homeTeamId,
  awayTeamId: games.awayTeamId,
  scheduledAt: games.scheduledAt,
  venue: games.venue,
  status: games.status,
  homeScore: games.homeScore,
  awayScore: games.awayScore,
  inningsCount: games.inningsCount,
  currentInning: games.currentInning,
  currentHalf: games.currentHalf,
  currentOuts: games.currentOuts,
  isFinalized: games.isFinalized,
  finalizedAt: games.finalizedAt,
  finalizedBy: games.finalizedBy,
  playoffSeriesId: games.playoffSeriesId,
  createdAt: games.createdAt,
  updatedAt: games.updatedAt,
} as const;

export async function adminGamesRoutes(app: FastifyInstance) {
  async function getSeasonIdForLeague(leagueId: number): Promise<number | null> {
    const seasonResult = await db.execute(
      sql`SELECT s.id FROM seasons s JOIN leagues l ON l.season_id = s.id WHERE l.id = ${leagueId} LIMIT 1`
    );
    const row = firstRowFromExecute<{ id: number }>(seasonResult);
    return row?.id != null ? Number(row.id) : null;
  }

  // GET / - list games; optional ?seasonId= filters to leagues in that season
  app.get<{ Querystring: { seasonId?: string } }>('/', async (request, reply) => {
    try {
      const seasonIdStr = request.query?.seasonId;

      if (seasonIdStr !== undefined && seasonIdStr !== '') {
        const sid = parseInt(seasonIdStr, 10);
        if (isNaN(sid)) {
          return reply.status(400).send({ message: 'Invalid seasonId' });
        }
        const leagueRows = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.seasonId, sid));
        const leagueIds = leagueRows.map((r) => r.id);
        if (leagueIds.length === 0) {
          return reply.send([]);
        }
        const filtered = await db
          .select(adminGameListSelect)
          .from(games)
          .where(inArray(games.leagueId, leagueIds))
          .orderBy(asc(games.scheduledAt));
        return reply.send(filtered);
      }

      const result = await db.select(adminGameListSelect).from(games).orderBy(asc(games.scheduledAt));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch games' });
    }
  });

  // POST / - create game
  app.post<{
    Body: {
      leagueId: number;
      homeTeamId: number;
      awayTeamId: number;
      scheduledAt: string;
      venue?: string;
      playoffSeriesId?: number | null;
    };
  }>('/', async (request, reply) => {
    try {
      const { leagueId, homeTeamId, awayTeamId, scheduledAt, venue, playoffSeriesId } =
        request.body ?? {};

      if (!leagueId || !homeTeamId || !awayTeamId || !scheduledAt) {
        return reply
          .status(400)
          .send({ message: 'leagueId, homeTeamId, awayTeamId, scheduledAt required' });
      }

      const [inserted] = await db
        .insert(games)
        .values({
          leagueId,
          homeTeamId,
          awayTeamId,
          scheduledAt: new Date(scheduledAt),
          venue: venue ?? null,
          playoffSeriesId: playoffSeriesId ?? null,
        })
        .returning({ id: games.id });

      const [game] = await db
        .select(adminGameListSelect)
        .from(games)
        .where(eq(games.id, inserted.id))
        .limit(1);

      return reply.status(201).send(game);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to create game' });
    }
  });

  // POST /bulk/playoff-series — set playoffSeriesId on many games (must be registered before /:id)
  app.post<{
    Body: { gameIds: number[]; playoffSeriesId: number | null };
  }>('/bulk/playoff-series', async (request, reply) => {
    try {
      const { gameIds, playoffSeriesId: seriesRaw } = request.body ?? {};
      if (!Array.isArray(gameIds) || gameIds.length === 0) {
        return reply.status(400).send({ message: 'gameIds array required' });
      }
      const ids = [...new Set(gameIds.map(Number).filter((n) => !isNaN(n)))];
      if (ids.length === 0) {
        return reply.status(400).send({ message: 'No valid game ids' });
      }

      let playoffSeriesId: number | null;
      if (seriesRaw === null || seriesRaw === undefined) {
        playoffSeriesId = null;
      } else {
        const sid = Number(seriesRaw);
        if (isNaN(sid)) {
          return reply.status(400).send({ message: 'Invalid playoffSeriesId' });
        }
        const [row] = await db
          .select({ id: playoffSeries.id })
          .from(playoffSeries)
          .where(eq(playoffSeries.id, sid))
          .limit(1);
        if (!row) {
          return reply.status(400).send({ message: 'playoffSeriesId not found' });
        }
        playoffSeriesId = sid;
      }

      await db
        .update(games)
        .set({ playoffSeriesId, updatedAt: new Date() })
        .where(inArray(games.id, ids));

      return reply.send({ updated: ids.length });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update games' });
    }
  });

  // PUT /:id - update game
  app.put<{
    Params: { id: string };
    Body: {
      leagueId?: number;
      homeTeamId?: number;
      awayTeamId?: number;
      scheduledAt?: string;
      venue?: string;
      status?: string;
      playoffSeriesId?: number | null;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const body = request.body ?? {};
      const updateData: Record<string, unknown> = {};
      if (body.leagueId !== undefined) updateData.leagueId = body.leagueId;
      if (body.homeTeamId !== undefined) updateData.homeTeamId = body.homeTeamId;
      if (body.awayTeamId !== undefined) updateData.awayTeamId = body.awayTeamId;
      if (body.scheduledAt !== undefined)
        updateData.scheduledAt = new Date(body.scheduledAt);
      if (body.venue !== undefined) updateData.venue = body.venue;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.playoffSeriesId !== undefined) updateData.playoffSeriesId = body.playoffSeriesId;

      const [updated] = await db
        .update(games)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(games.id, id))
        .returning({ id: games.id });

      if (!updated) {
        return reply.status(404).send({ message: 'Game not found' });
      }

      const [game] = await db
        .select(adminGameListSelect)
        .from(games)
        .where(eq(games.id, id))
        .limit(1);

      return reply.send(game);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update game' });
    }
  });

  // DELETE /:id - delete game and all related data, then recompute season stats
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const [game] = await db
        .select(adminGameListSelect)
        .from(games)
        .where(eq(games.id, id))
        .limit(1);

      if (!game) {
        return reply.status(404).send({ message: 'Game not found' });
      }

      const leagueId = game.leagueId;

      // Delete all related per-game data (foreign key dependencies)
      await db.delete(playerGameFielding).where(eq(playerGameFielding.gameId, id));
      await db.delete(playerGamePitching).where(eq(playerGamePitching.gameId, id));
      await db.delete(playerGameBatting).where(eq(playerGameBatting.gameId, id));
      await db.delete(gameEvents).where(eq(gameEvents.gameId, id));
      await db.delete(gameLineups).where(eq(gameLineups.gameId, id));
      await db.delete(games).where(eq(games.id, id));

      // Recompute season aggregates if the game belonged to a league
      if (leagueId) {
        try {
          const seasonId = await getSeasonIdForLeague(leagueId);

          if (seasonId) {
            // Delete stale season rows then recompute from remaining games
            await db.delete(playerSeasonBatting).where(eq(playerSeasonBatting.seasonId, seasonId));
            await db.delete(playerSeasonPitching).where(eq(playerSeasonPitching.seasonId, seasonId));
            await db.delete(playerSeasonFielding).where(eq(playerSeasonFielding.seasonId, seasonId));

            await recomputeSeasonBatting(seasonId);
            await recomputeSeasonPitching(seasonId);
            await recomputeSeasonFielding(seasonId);
          }

          // Recompute standings
          await recomputeStandings(leagueId);
        } catch (recomputeErr) {
          request.log.error(recomputeErr, 'Failed to recompute season stats after game delete');
        }
      }

      return reply.send({ message: 'Game deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete game' });
    }
  });

  // POST /:id/finalize - finalize game (computes stats, standings, etc.)
  app.post<{ Params: { id: string } }>('/:id/finalize', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const user = request.user;
      const result = await finalizeGame(id, user?.id);
      return reply.send(result);
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ message: err.message || 'Failed to finalize game' });
    }
  });

  // GET /:id/stats - fetch per-game batting/pitching/fielding rows (for manual edits)
  app.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.status(400).send({ message: 'Invalid game id' });

      const [batting, pitching, fielding] = await Promise.all([
        db.select().from(playerGameBatting).where(eq(playerGameBatting.gameId, id)),
        db.select().from(playerGamePitching).where(eq(playerGamePitching.gameId, id)),
        db.select().from(playerGameFielding).where(eq(playerGameFielding.gameId, id)),
      ]);

      return reply.send({ batting, pitching, fielding });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch game stats' });
    }
  });

  // PUT /:id/stats/:kind/:playerId - manual edit of a per-game stat line, then recompute season + standings
  app.put<{
    Params: { id: string; kind: 'batting' | 'pitching' | 'fielding'; playerId: string };
    Body: Record<string, any>;
  }>('/:id/stats/:kind/:playerId', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      const playerId = parseInt(request.params.playerId, 10);
      const kind = request.params.kind;
      if (isNaN(id) || isNaN(playerId)) return reply.status(400).send({ message: 'Invalid id' });

      const body = request.body ?? {};

      const [game] = await db.select(adminGameListSelect).from(games).where(eq(games.id, id)).limit(1);
      if (!game) return reply.status(404).send({ message: 'Game not found' });

      if (kind === 'batting') {
        const allowed: Record<string, (v: any) => any> = {
          plateAppearances: (v) => Number(v) || 0,
          atBats: (v) => Number(v) || 0,
          hits: (v) => Number(v) || 0,
          singles: (v) => Number(v) || 0,
          doubles: (v) => Number(v) || 0,
          triples: (v) => Number(v) || 0,
          homeRuns: (v) => Number(v) || 0,
          rbi: (v) => Number(v) || 0,
          runs: (v) => Number(v) || 0,
          walks: (v) => Number(v) || 0,
          strikeouts: (v) => Number(v) || 0,
          hitByPitch: (v) => Number(v) || 0,
          sacrificeFlies: (v) => Number(v) || 0,
          sacrificeBunts: (v) => Number(v) || 0,
          stolenBases: (v) => Number(v) || 0,
          caughtStealing: (v) => Number(v) || 0,
          groundOuts: (v) => Number(v) || 0,
          flyOuts: (v) => Number(v) || 0,
          groundedIntoDoublePlays: (v) => Number(v) || 0,
          intentionalWalks: (v) => Number(v) || 0,
          reachedOnError: (v) => Number(v) || 0,
          totalBases: (v) => Number(v) || 0,
          buntSingles: (v) => Number(v) || 0,
          strikeoutsLooking: (v) => Number(v) || 0,
          strikeoutsSwinging: (v) => Number(v) || 0,
          pickedOff: (v) => Number(v) || 0,
          fieldersChoice: (v) => Number(v) || 0,
          catcherInterference: (v) => Number(v) || 0,
          groundedIntoTriplePlay: (v) => Number(v) || 0,
        };
        const updates: Record<string, any> = {};
        for (const [k, fn] of Object.entries(allowed)) if (k in body) updates[k] = fn(body[k]);
        if (Object.keys(updates).length === 0) return reply.status(400).send({ message: 'No valid fields' });
        await db.update(playerGameBatting).set(updates).where(and(eq(playerGameBatting.gameId, id), eq(playerGameBatting.playerId, playerId)));
      } else if (kind === 'pitching') {
        const allowed: Record<string, (v: any) => any> = {
          inningsPitched: (v) => String(v ?? '0'),
          hitsAllowed: (v) => Number(v) || 0,
          runsAllowed: (v) => Number(v) || 0,
          earnedRuns: (v) => Number(v) || 0,
          walksAllowed: (v) => Number(v) || 0,
          strikeouts: (v) => Number(v) || 0,
          homeRunsAllowed: (v) => Number(v) || 0,
          hitBatters: (v) => Number(v) || 0,
          wildPitches: (v) => Number(v) || 0,
          pitchesThrown: (v) => (v == null || v === '' ? null : Number(v)),
          isStarter: (v) => !!v,
          decision: (v) => (v ? String(v) : null),
          battersFaced: (v) => Number(v) || 0,
          balks: (v) => Number(v) || 0,
          intentionalWalks: (v) => Number(v) || 0,
          groundOuts: (v) => Number(v) || 0,
          flyOuts: (v) => Number(v) || 0,
          holds: (v) => Number(v) || 0,
          saveOpportunities: (v) => Number(v) || 0,
          blownSaves: (v) => Number(v) || 0,
          completeGames: (v) => Number(v) || 0,
          gameScore: (v) => (v == null || v === '' ? null : Number(v)),
          qualityStarts: (v) => Number(v) || 0,
          shutouts: (v) => Number(v) || 0,
          inheritedRunners: (v) => Number(v) || 0,
          inheritedRunnersScored: (v) => Number(v) || 0,
          strikeoutsLooking: (v) => Number(v) || 0,
          strikeoutsSwinging: (v) => Number(v) || 0,
        };
        const updates: Record<string, any> = {};
        for (const [k, fn] of Object.entries(allowed)) if (k in body) updates[k] = fn(body[k]);
        if (Object.keys(updates).length === 0) return reply.status(400).send({ message: 'No valid fields' });
        await db.update(playerGamePitching).set(updates).where(and(eq(playerGamePitching.gameId, id), eq(playerGamePitching.playerId, playerId)));
      } else {
        const allowed: Record<string, (v: any) => any> = {
          position: (v) => (v == null || v === '' ? null : Number(v)),
          innings: (v) => String(v ?? '0'),
          putouts: (v) => Number(v) || 0,
          assists: (v) => Number(v) || 0,
          errors: (v) => Number(v) || 0,
          doublePlays: (v) => Number(v) || 0,
          triplePlays: (v) => Number(v) || 0,
          passedBalls: (v) => Number(v) || 0,
          catcherStolenBases: (v) => Number(v) || 0,
          catcherCaughtStealing: (v) => Number(v) || 0,
          pickoffs: (v) => Number(v) || 0,
        };
        const updates: Record<string, any> = {};
        for (const [k, fn] of Object.entries(allowed)) if (k in body) updates[k] = fn(body[k]);
        if (Object.keys(updates).length === 0) return reply.status(400).send({ message: 'No valid fields' });
        await db.update(playerGameFielding).set(updates).where(and(eq(playerGameFielding.gameId, id), eq(playerGameFielding.playerId, playerId)));
      }

      // Manual stat edits are explicit overrides until the next event-derived recompute.
      const seasonId = await getSeasonIdForLeague(game.leagueId);
      if (seasonId) {
        await recomputeSeasonBatting(seasonId);
        await recomputeSeasonPitching(seasonId);
        await recomputeSeasonFielding(seasonId);
      }
      await recomputeStandings(game.leagueId);

      return reply.send({
        success: true,
        manualOverride: true,
        message: 'Manual stat line saved. Later event edits/finalization recomputes can overwrite this row.',
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update game stats' });
    }
  });

}
