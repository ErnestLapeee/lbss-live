import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  games,
  gameEvents,
  gameLineups,
  leagues,
  leagueTeams,
  playerGameBatting,
  playerGamePitching,
  playerGameFielding,
  playerSeasonBatting,
  playerSeasonPitching,
  playerSeasonFielding,
  standings,
  playoffSeries,
} from '../../db/schema/index.js';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import {
  finalizeGame,
  FinalizeGameError,
  recomputeSeasonBatting,
  recomputeSeasonPitching,
  recomputeSeasonFielding,
  recomputeStandings,
  type ScoringDbConnection,
} from '../../services/finalize-game.js';
import { firstRowFromExecute } from '../../lib/pg-result.js';
import { gamesTableHasOfficialColumns } from '../../lib/games-official-columns.js';
import { isStatistician } from '../../lib/statistician-guards.js';
import { lockScoringGame } from '../../lib/scoring-game-lock.js';
import { gameTransitionError, normalizeGameStatus } from '../../lib/game-lifecycle.js';
import { getIO } from '../../app.js';

class AdminGameAbortError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function pgErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return err instanceof Error ? err.message : String(err);
  const e = err as Record<string, unknown>;
  const cause = e.cause as Record<string, unknown> | undefined;
  const code = e.code ?? cause?.code;
  const msg = (e.message as string) || (cause?.message as string) || 'Database error';
  return code != null ? `${msg} (${String(code)})` : msg;
}

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

async function assertGameTeamsInLeague(
  leagueId: number,
  homeTeamId: number,
  awayTeamId: number,
  conn: ScoringDbConnection = db,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (homeTeamId === awayTeamId) {
    return { ok: false, message: 'Home and away must be different teams' };
  }
  const rows: Array<{ teamId: number }> = await conn.select({ teamId: leagueTeams.teamId }).from(leagueTeams).where(eq(leagueTeams.leagueId, leagueId));
  const allowed = new Set(rows.map((r) => r.teamId));
  if (!allowed.has(homeTeamId)) {
    return {
      ok: false,
      message:
        'Home team is not registered in this league. Add the club under Season setup for this league, then try again.',
    };
  }
  if (!allowed.has(awayTeamId)) {
    return {
      ok: false,
      message:
        'Away team is not registered in this league. Add the club under Season setup for this league, then try again.',
    };
  }
  return { ok: true };
}

export async function adminGamesRoutes(app: FastifyInstance) {
  async function getSeasonIdForLeague(leagueId: number, conn: ScoringDbConnection = db): Promise<number | null> {
    const seasonResult = await conn.execute(
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
          .orderBy(desc(games.scheduledAt), desc(games.id));
        return reply.send(filtered);
      }

      const result = await db.select(adminGameListSelect).from(games).orderBy(desc(games.scheduledAt), desc(games.id));
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
      const body = request.body ?? {};
      const leagueId = Number(body.leagueId);
      const homeTeamId = Number(body.homeTeamId);
      const awayTeamId = Number(body.awayTeamId);
      const scheduledAtRaw = body.scheduledAt;
      const venue = body.venue;
      const playoffRaw = body.playoffSeriesId;

      if (
        !Number.isFinite(leagueId) ||
        !Number.isFinite(homeTeamId) ||
        !Number.isFinite(awayTeamId) ||
        leagueId <= 0 ||
        homeTeamId <= 0 ||
        awayTeamId <= 0
      ) {
        return reply.status(400).send({ message: 'Valid leagueId, homeTeamId, and awayTeamId are required' });
      }
      if (scheduledAtRaw == null || String(scheduledAtRaw).trim() === '') {
        return reply.status(400).send({ message: 'scheduledAt is required' });
      }
      const scheduledAt = new Date(String(scheduledAtRaw));
      if (Number.isNaN(scheduledAt.getTime())) {
        return reply.status(400).send({ message: 'Invalid scheduledAt' });
      }

      const members = await assertGameTeamsInLeague(leagueId, homeTeamId, awayTeamId);
      if (!members.ok) {
        return reply.status(400).send({ message: members.message });
      }

      let playoffSeriesId: number | null = null;
      if (playoffRaw != null && String(playoffRaw).trim() !== '') {
        const sid = Number(playoffRaw);
        if (!Number.isFinite(sid) || sid <= 0) {
          return reply.status(400).send({ message: 'Invalid playoffSeriesId' });
        }
        playoffSeriesId = sid;
      }

      const venueStr = venue != null && String(venue).trim() !== '' ? String(venue).trim() : null;
      /** Raw `sql\`...\`` placeholders must not be `Date` instances (postgres.js expects string/Buffer). */
      const scheduledAtIso = scheduledAt.toISOString();

      /** Without migration 0012, `games.umpire` / `official_scorer` are missing; narrow SQL avoids driver/ORM SQL that references them. */
      const hasOfficialCols = await gamesTableHasOfficialColumns();
      let newGameId: number;
      if (hasOfficialCols) {
        const [inserted] = await db
          .insert(games)
          .values({
            leagueId,
            homeTeamId,
            awayTeamId,
            scheduledAt,
            venue: venueStr,
            playoffSeriesId,
          })
          .returning({ id: games.id });
        if (!inserted?.id) {
          request.log.error('insert(games) returned no id');
          return reply.status(500).send({ message: 'Failed to create game (no row id)' });
        }
        newGameId = inserted.id;
      } else {
        const ins = await db.execute(sql`
          INSERT INTO games (
            league_id,
            home_team_id,
            away_team_id,
            scheduled_at,
            venue,
            playoff_series_id
          )
          VALUES (
            ${leagueId},
            ${homeTeamId},
            ${awayTeamId},
            ${scheduledAtIso},
            ${venueStr},
            ${playoffSeriesId}
          )
          RETURNING id
        `);
        const row = firstRowFromExecute<{ id: number | string }>(ins);
        const rawId = row?.id;
        if (rawId == null) {
          request.log.error('insert games (legacy columns) returned no id');
          return reply.status(500).send({ message: 'Failed to create game (no row id)' });
        }
        newGameId = Number(rawId);
      }

      const [game] = await db
        .select(adminGameListSelect)
        .from(games)
        .where(eq(games.id, newGameId))
        .limit(1);

      if (!game) {
        return reply.status(500).send({ message: 'Failed to load game after create' });
      }

      return reply.status(201).send(game);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: `Failed to create game: ${pgErrorMessage(err)}` });
    }
  });

  // POST /bulk/playoff-series — set playoffSeriesId on many games (must be registered before /:id)
  app.post<{
    Body: { gameIds: number[]; playoffSeriesId: number | null };
  }>('/bulk/playoff-series', async (request, reply) => {
    try {
      if (isStatistician(request)) {
        return reply.status(403).send({ message: 'Scorers cannot bulk-link playoff series.' });
      }
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
      const game = await db.transaction(async (tx) => {
        await lockScoringGame(tx, id);
        const [existing] = await tx.select(adminGameListSelect).from(games).where(eq(games.id, id)).limit(1);
        if (!existing) {
          throw new AdminGameAbortError(404, 'Game not found');
        }

        if (
          isStatistician(request) &&
          (Boolean(existing.isFinalized) || String(existing.status) === 'final')
        ) {
          throw new AdminGameAbortError(403, 'Scorers cannot edit completed or finalized games.');
        }

        const nextStatus = body.status !== undefined ? normalizeGameStatus(body.status) : null;
        if (body.status !== undefined) {
          if (!nextStatus) {
            throw new AdminGameAbortError(400, `Invalid game status: ${String(body.status)}`);
          }
          if (isStatistician(request) && nextStatus === 'final') {
            throw new AdminGameAbortError(403, 'Scorers cannot set a game to final status. Ask an admin to finalize.');
          }
          if (nextStatus !== existing.status) {
            const transitionErr = gameTransitionError({
              currentStatus: existing.status,
              targetStatus: nextStatus,
              isFinalized: existing.isFinalized,
              source: 'admin',
            });
            if (transitionErr) {
              throw new AdminGameAbortError(409, transitionErr);
            }
          }
        }

        const nextLeagueId = body.leagueId !== undefined ? Number(body.leagueId) : existing.leagueId;
        const nextHome = body.homeTeamId !== undefined ? Number(body.homeTeamId) : existing.homeTeamId;
        const nextAway = body.awayTeamId !== undefined ? Number(body.awayTeamId) : existing.awayTeamId;
        if (
          !Number.isFinite(nextLeagueId) ||
          !Number.isFinite(nextHome) ||
          !Number.isFinite(nextAway) ||
          nextLeagueId <= 0 ||
          nextHome <= 0 ||
          nextAway <= 0
        ) {
          throw new AdminGameAbortError(400, 'leagueId, homeTeamId, and awayTeamId must be valid positive numbers');
        }

        const identityChanged =
          nextLeagueId !== existing.leagueId ||
          nextHome !== existing.homeTeamId ||
          nextAway !== existing.awayTeamId;
        if (identityChanged) {
          if (existing.isFinalized || existing.status === 'live' || existing.status === 'suspended' || existing.status === 'final') {
            throw new AdminGameAbortError(409, 'Teams and league cannot be changed once a game has started or been finalized');
          }
          const [existingEvent] = await tx
            .select({ id: gameEvents.id })
            .from(gameEvents)
            .where(and(eq(gameEvents.gameId, id), eq(gameEvents.isDeleted, false)))
            .limit(1);
          if (existingEvent) {
            throw new AdminGameAbortError(409, 'Teams and league cannot be changed after scoring events have been recorded');
          }
        }

        const members = await assertGameTeamsInLeague(nextLeagueId, nextHome, nextAway, tx);
        if (!members.ok) {
          throw new AdminGameAbortError(400, members.message);
        }

        const updateData: Record<string, unknown> = {};
        if (body.leagueId !== undefined) updateData.leagueId = nextLeagueId;
        if (body.homeTeamId !== undefined) updateData.homeTeamId = nextHome;
        if (body.awayTeamId !== undefined) updateData.awayTeamId = nextAway;
        if (body.scheduledAt !== undefined)
          updateData.scheduledAt = new Date(body.scheduledAt);
        if (body.venue !== undefined) updateData.venue = body.venue;
        if (nextStatus !== null) updateData.status = nextStatus;
        if (body.playoffSeriesId !== undefined) updateData.playoffSeriesId = body.playoffSeriesId;

        const [updated] = await tx
          .update(games)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(games.id, id))
          .returning({ id: games.id });

        if (!updated) {
          throw new AdminGameAbortError(404, 'Game not found');
        }

        const [refetched] = await tx
          .select(adminGameListSelect)
          .from(games)
          .where(eq(games.id, id))
          .limit(1);
        return refetched;
      });

      return reply.send(game);
    } catch (err) {
      if (err instanceof AdminGameAbortError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update game' });
    }
  });

  // DELETE /:id - delete game and all related data, then recompute season stats atomically
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      if (isStatistician(request)) {
        return reply.status(403).send({ message: 'Scorers cannot delete games.' });
      }
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      await db.transaction(async (tx) => {
        await lockScoringGame(tx, id);
        const [game] = await tx
          .select(adminGameListSelect)
          .from(games)
          .where(eq(games.id, id))
          .limit(1);

        if (!game) {
          throw new AdminGameAbortError(404, 'Game not found');
        }

        const leagueId = game.leagueId;
        await tx.delete(playerGameFielding).where(eq(playerGameFielding.gameId, id));
        await tx.delete(playerGamePitching).where(eq(playerGamePitching.gameId, id));
        await tx.delete(playerGameBatting).where(eq(playerGameBatting.gameId, id));
        await tx.delete(gameEvents).where(eq(gameEvents.gameId, id));
        await tx.delete(gameLineups).where(eq(gameLineups.gameId, id));
        await tx.delete(games).where(eq(games.id, id));

        if (leagueId) {
          const seasonId = await getSeasonIdForLeague(leagueId, tx);
          if (seasonId) {
            await recomputeSeasonBatting(seasonId, tx);
            await recomputeSeasonPitching(seasonId, tx);
            await recomputeSeasonFielding(seasonId, tx);
          }
          await recomputeStandings(leagueId, tx);
        }
      });

      return reply.send({ message: 'Game deleted' });
    } catch (err) {
      if (err instanceof AdminGameAbortError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete game' });
    }
  });

  // POST /:id/finalize - finalize game (computes stats, standings, etc.)
  app.post<{ Params: { id: string } }>('/:id/finalize', async (request, reply) => {
    try {
      if (isStatistician(request)) {
        return reply.status(403).send({ message: 'Only staff accounts can finalize games.' });
      }
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const user = request.user;
      const result = await finalizeGame(id, user?.id);
      try {
        getIO().to(`game:${id}`).emit('game:final', {
          gameId: id,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          status: 'final',
        });
      } catch {}
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof FinalizeGameError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
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
      if (isStatistician(request)) {
        return reply.status(403).send({ message: 'Scorers cannot edit official stat lines from the games admin.' });
      }
      const id = parseInt(request.params.id, 10);
      const playerId = parseInt(request.params.playerId, 10);
      const kind = request.params.kind;
      if (isNaN(id) || isNaN(playerId)) return reply.status(400).send({ message: 'Invalid id' });

      const body = request.body ?? {};
      let updates: Record<string, any> = {};

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
        for (const [k, fn] of Object.entries(allowed)) if (k in body) updates[k] = fn(body[k]);
        if (Object.keys(updates).length === 0) return reply.status(400).send({ message: 'No valid fields' });
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
        for (const [k, fn] of Object.entries(allowed)) if (k in body) updates[k] = fn(body[k]);
        if (Object.keys(updates).length === 0) return reply.status(400).send({ message: 'No valid fields' });
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
        for (const [k, fn] of Object.entries(allowed)) if (k in body) updates[k] = fn(body[k]);
        if (Object.keys(updates).length === 0) return reply.status(400).send({ message: 'No valid fields' });
      }

      await db.transaction(async (tx) => {
        await lockScoringGame(tx, id);
        const [game] = await tx.select(adminGameListSelect).from(games).where(eq(games.id, id)).limit(1);
        if (!game) throw new AdminGameAbortError(404, 'Game not found');

        if (kind === 'batting') {
          await tx.update(playerGameBatting).set(updates).where(and(eq(playerGameBatting.gameId, id), eq(playerGameBatting.playerId, playerId)));
        } else if (kind === 'pitching') {
          await tx.update(playerGamePitching).set(updates).where(and(eq(playerGamePitching.gameId, id), eq(playerGamePitching.playerId, playerId)));
        } else {
          await tx.update(playerGameFielding).set(updates).where(and(eq(playerGameFielding.gameId, id), eq(playerGameFielding.playerId, playerId)));
        }

        // Manual stat edits are explicit overrides until the next event-derived recompute.
        const seasonId = await getSeasonIdForLeague(game.leagueId, tx);
        if (seasonId) {
          await recomputeSeasonBatting(seasonId, tx);
          await recomputeSeasonPitching(seasonId, tx);
          await recomputeSeasonFielding(seasonId, tx);
        }
        await recomputeStandings(game.leagueId, tx);
      });

      return reply.send({
        success: true,
        manualOverride: true,
        message: 'Manual stat line saved. Later event edits/finalization recomputes can overwrite this row.',
      });
    } catch (err) {
      if (err instanceof AdminGameAbortError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update game stats' });
    }
  });

}
