import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  games,
  gameEvents,
  gameLineups,
  playerSeasons,
  players,
  teams,
  licenses,
  leagues,
} from '../../db/schema/index.js';
import { eq, and, desc, max, sql, inArray } from 'drizzle-orm';
import { getIO } from '../../app.js';
import { finalizeGame } from '../../services/finalize-game.js';

// ── Game state reducer (inline for speed) ──

interface GameState {
  inning: number;
  half: 'top' | 'bot';
  outs: number;
  homeScore: number;
  awayScore: number;
  bases: { first: number | null; second: number | null; third: number | null };
  homeLineScore: number[];
  awayLineScore: number[];
  eventCount: number;
  balls: number;
  strikes: number;
}

const BETWEEN_PITCH_EVENTS = new Set([
  'stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball',
  'balk', 'advance', 'advance_on_error', 'defensive_indifference',
  'runner_interference', 'appeal_play', 'tagged_out', 'force_out',
  'hit_by_ball', 'missed_base', 'left_base_early', 'left_base_path',
  'offensive_interference', 'passed_runner', 'hesitation',
  'double_play', 'triple_play', 'illegal_pitch', 'end_half_inning',
  'adjust_score',
]);

function normalizeHalf(h: string | undefined): 'top' | 'bot' {
  const s = String(h ?? 'top').trim().toLowerCase();
  if (s === 'bottom' || s === 'bot') return 'bot';
  return 'top';
}

/** Same rules as PUT /event — keeps box score / state from bad client payloads. */
function normalizeIncomingRunScoring(body: {
  runsScored?: number;
  runnersScored?: number[];
  runnerScoredReasons?: string[];
}):
  | { ok: true; runsScored: number; runnersScored: number[]; runnerScoredReasons: string[] }
  | { ok: false; message: string } {
  const rs = Array.isArray(body.runnersScored) ? body.runnersScored.map(Number).filter((n) => !Number.isNaN(n)) : [];
  const rr = Array.isArray(body.runnerScoredReasons) ? body.runnerScoredReasons.map(String) : [];
  const runsScored = Number(body.runsScored ?? 0);

  if (rr.length !== 0 && rr.length !== rs.length) {
    return { ok: false, message: 'runnerScoredReasons length must match runnersScored length (or be empty)' };
  }
  if (rs.length !== runsScored) {
    return { ok: false, message: `runsScored (${runsScored}) must equal runnersScored length (${rs.length})` };
  }
  const runnerScoredReasons = rr.length === 0 && rs.length > 0 ? rs.map(() => 'on_play') : rr;
  return { ok: true, runsScored, runnersScored: rs, runnerScoredReasons };
}

function computeGameState(events: any[]): GameState {
  const state: GameState = {
    inning: 1, half: 'top', outs: 0, homeScore: 0, awayScore: 0,
    bases: { first: null, second: null, third: null },
    homeLineScore: [0], awayLineScore: [],
    eventCount: 0,
    balls: 0, strikes: 0,
  };

  const sorted = events
    .filter((e: any) => !e.isDeleted)
    .sort((a: any, b: any) => a.eventNumber - b.eventNumber);

  for (const event of sorted) {
    // Pitch events only update the count; they don't affect bases/outs/score
    if (event.eventType === 'pitch') {
      const detail = (event.eventDetail || '').toLowerCase();
      if (detail === 'ball') state.balls = Math.min(3, state.balls + 1);
      else if (detail === 'foul') { if (state.strikes < 2) state.strikes++; }
      else if (detail === 'strike' || detail === 'called_strike' || detail === 'swinging_strike') {
        state.strikes = Math.min(2, state.strikes + 1);
      }
      state.eventCount++;
      continue;
    }

    // Manual correction: deltas vs. play-by-play totals (logged as an event so state stays consistent)
    if (event.eventType === 'adjust_score') {
      let detail: { homeDelta?: number; awayDelta?: number } = {};
      try {
        detail = JSON.parse(event.eventDetail || '{}') as typeof detail;
      } catch { /* ignore */ }
      const homeDelta = Number(detail.homeDelta) || 0;
      const awayDelta = Number(detail.awayDelta) || 0;
      state.homeScore += homeDelta;
      state.awayScore += awayDelta;
      const inn = Math.max(1, event.inning || 1);
      if (homeDelta !== 0) {
        while (state.homeLineScore.length < inn) state.homeLineScore.push(0);
        state.homeLineScore[inn - 1] += homeDelta;
      }
      if (awayDelta !== 0) {
        while (state.awayLineScore.length < inn) state.awayLineScore.push(0);
        state.awayLineScore[inn - 1] += awayDelta;
      }
      state.eventCount++;
      continue;
    }

    // Roster-only: does not change score, outs, bases, or count
    if (event.eventType === 'substitution') {
      state.eventCount++;
      continue;
    }

    const runs = event.runsScored || 0;

    if (event.half === 'top') {
      state.awayScore += runs;
      while (state.awayLineScore.length < event.inning) state.awayLineScore.push(0);
      state.awayLineScore[event.inning - 1] += runs;
    } else {
      state.homeScore += runs;
      while (state.homeLineScore.length < event.inning) state.homeLineScore.push(0);
      state.homeLineScore[event.inning - 1] += runs;
    }

    state.outs = state.outs + (event.outsRecorded || 0);
    state.bases = {
      first: event.runnerFirstId ?? null,
      second: event.runnerSecondId ?? null,
      third: event.runnerThirdId ?? null,
    };

    // Reset count for at-bat-concluding events (not runner events between pitches)
    if (!BETWEEN_PITCH_EVENTS.has(event.eventType)) {
      state.balls = 0;
      state.strikes = 0;
    }

    if (state.outs >= 3) {
      state.outs = 0;
      state.bases = { first: null, second: null, third: null };
      state.balls = 0;
      state.strikes = 0;
      if (event.half === 'top') {
        state.half = 'bot';
        while (state.homeLineScore.length < event.inning) state.homeLineScore.push(0);
      } else {
        state.half = 'top';
        state.inning = event.inning + 1;
        while (state.awayLineScore.length < event.inning + 1) state.awayLineScore.push(0);
        while (state.homeLineScore.length < event.inning + 1) state.homeLineScore.push(0);
      }
    } else {
      state.inning = event.inning;
      state.half = event.half;
    }

    state.eventCount++;
  }

  return state;
}

export async function adminScoringRoutes(app: FastifyInstance) {
  async function getGameCore(gameId: number) {
    const res = await db.execute(sql`
      SELECT
        id,
        league_id as "leagueId",
        home_team_id as "homeTeamId",
        away_team_id as "awayTeamId",
        scheduled_at as "scheduledAt",
        venue,
        status,
        home_score as "homeScore",
        away_score as "awayScore",
        innings_count as "inningsCount",
        current_inning as "currentInning",
        current_half as "currentHalf",
        current_outs as "currentOuts",
        is_finalized as "isFinalized",
        finalized_at as "finalizedAt",
        finalized_by as "finalizedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM games
      WHERE id = ${gameId}
      LIMIT 1
    `);
    return (((res as any).rows?.[0] ?? (res as any)?.[0]) ?? null) as any | null;
  }

  // ── GET /:gameId/state ── Full game state
  app.get<{ Params: { gameId: string } }>('/:gameId/state', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const game = await getGameCore(gameId);
      if (!game) return reply.status(404).send({ message: 'Game not found' });

      const events = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const lineupRows = await db.select({
        id: gameLineups.id,
        teamId: gameLineups.teamId,
        playerId: gameLineups.playerId,
        battingOrder: gameLineups.battingOrder,
        position: gameLineups.position,
        enteredInning: gameLineups.enteredInning,
        enteredHalf: gameLineups.enteredHalf,
        exitedInning: gameLineups.exitedInning,
        exitedHalf: gameLineups.exitedHalf,
        isStarter: gameLineups.isStarter,
        isActive: gameLineups.isActive,
        firstName: players.firstName,
        lastName: players.lastName,
        bats: players.bats,
      })
        .from(gameLineups)
        .innerJoin(players, eq(gameLineups.playerId, players.id))
        .where(eq(gameLineups.gameId, gameId))
        .orderBy(gameLineups.battingOrder);

      // Get team names
      const [homeTeam] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, game.homeTeamId)).limit(1);
      const [awayTeam] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, game.awayTeamId)).limit(1);

      const state = computeGameState(events);

      return reply.send({
        game: {
          ...game,
          homeTeamName: homeTeam?.name,
          awayTeamName: awayTeam?.name,
        },
        state,
        events,
        lineups: {
          home: lineupRows.filter(l => l.teamId === game.homeTeamId),
          away: lineupRows.filter(l => l.teamId === game.awayTeamId),
        },
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to get game state' });
    }
  });

  // ── GET /:gameId/roster ── Available players for lineup
  app.get<{ Params: { gameId: string } }>('/:gameId/roster', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const game = await getGameCore(gameId);
      if (!game) return reply.status(404).send({ message: 'Game not found' });

      // Get players on each team's roster for THIS game’s season, with license status.
      // A player can appear for the same team in multiple seasons; we only want the season that matches the league.
      const [league] = await db
        .select({ seasonId: leagues.seasonId })
        .from(leagues)
        .where(eq(leagues.id, game.leagueId))
        .limit(1);

      const seasonId = league?.seasonId ?? null;

      const rosterQuery = await db
        .select({
          playerId: playerSeasons.playerId,
          teamId: playerSeasons.teamId,
          firstName: players.firstName,
          lastName: players.lastName,
          jerseyNumber: playerSeasons.jerseyNumber,
          licensePaid: licenses.paymentStatus,
        })
        .from(playerSeasons)
        .innerJoin(players, eq(playerSeasons.playerId, players.id))
        .leftJoin(
          licenses,
          and(
            eq(licenses.playerId, playerSeasons.playerId),
            eq(licenses.seasonId, playerSeasons.seasonId),
          ),
        )
        .where(
          and(
            sql`${playerSeasons.teamId} IN (${game.homeTeamId}, ${game.awayTeamId})`,
            seasonId != null ? eq(playerSeasons.seasonId, seasonId) : sql`true`,
          ),
        );

      return reply.send({
        home: rosterQuery.filter(p => p.teamId === game.homeTeamId),
        away: rosterQuery.filter(p => p.teamId === game.awayTeamId),
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to get roster' });
    }
  });

  // ── POST /:gameId/lineup ── Set lineup for a team
  app.post<{
    Params: { gameId: string };
    Body: {
      teamId: number;
      lineup: Array<{ playerId: number; battingOrder: number; position: number }>;
    };
  }>('/:gameId/lineup', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const { teamId, lineup } = request.body;

      // Delete existing lineup for this team in this game
      await db.delete(gameLineups).where(
        and(eq(gameLineups.gameId, gameId), eq(gameLineups.teamId, teamId))
      );

      // Insert new lineup
      if (lineup && lineup.length > 0) {
        await db.insert(gameLineups).values(
          lineup.map(entry => ({
            gameId,
            teamId,
            playerId: entry.playerId,
            battingOrder: entry.battingOrder,
            position: entry.position,
            isStarter: true,
            isActive: true,
          }))
        );
      }

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to set lineup' });
    }
  });

  // ── POST /:gameId/start ── Start the game
  app.post<{ Params: { gameId: string } }>('/:gameId/start', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);

      const [game] = await db.update(games).set({
        status: 'live',
        currentInning: 1,
        currentHalf: 'top',
        currentOuts: 0,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId)).returning();

      if (!game) return reply.status(404).send({ message: 'Game not found' });

      try { getIO().to(`game:${gameId}`).emit('game:update', { status: 'live', inning: 1, half: 'top' }); } catch {}

      return reply.send(game);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to start game' });
    }
  });

  // ── POST /:gameId/pause ──
  app.post<{ Params: { gameId: string } }>('/:gameId/pause', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      await db.update(games).set({ status: 'suspended', updatedAt: new Date() }).where(eq(games.id, gameId));
      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to pause game' });
    }
  });

  // ── POST /:gameId/resume ──
  app.post<{ Params: { gameId: string } }>('/:gameId/resume', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      await db.update(games).set({ status: 'live', updatedAt: new Date() }).where(eq(games.id, gameId));
      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to resume game' });
    }
  });

  // ── POST /:gameId/event ── Record a play (the core endpoint)
  app.post<{
    Params: { gameId: string };
    Body: {
      eventType: string;
      batterId?: number;
      pitcherId?: number;
      inning: number;
      half: string;
      rbi?: number;
      runsScored?: number;
      outsRecorded?: number;
      errorsOnPlay?: number;
      balls?: number;
      strikes?: number;
      runnerFirstId?: number | null;
      runnerSecondId?: number | null;
      runnerThirdId?: number | null;
      runnersScored?: number[];
      runnerScoredReasons?: string[];
      fieldingSequence?: string;
      putoutFielderIds?: number[];
      assistFielderIds?: number[];
      errorFielderIds?: number[];
      pitchCount?: number;
      pitchSequence?: string;
      eventDetail?: string;
      hitLocationX?: number | null;
      hitLocationY?: number | null;
      hitType?: string | null;
      hitHardness?: string | null;
      /** Switch hitter: L or R — box side for this PA (stored on events with this batter). */
      batterSide?: 'L' | 'R' | null;
    };
  }>('/:gameId/event', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const body = request.body;
      const user = (request as any).user;

      // Get next event number
      const [maxEvt] = await db
        .select({ maxNum: max(gameEvents.eventNumber) })
        .from(gameEvents)
        .where(eq(gameEvents.gameId, gameId));
      const eventNumber = ((maxEvt?.maxNum as number) || 0) + 1;

      const rawSide = body.batterSide;
      const batterSideNorm =
        rawSide === 'L' || rawSide === 'R' ? rawSide : null;

      const runNorm = normalizeIncomingRunScoring(body);
      if (!runNorm.ok) return reply.status(400).send({ message: runNorm.message });

      const outsRecorded = Number(body.outsRecorded ?? 0);
      if (outsRecorded < 0 || outsRecorded > 3) {
        return reply.status(400).send({ message: 'outsRecorded must be between 0 and 3' });
      }

      // Insert event
      const [event] = await db.insert(gameEvents).values({
        gameId,
        eventNumber,
        inning: body.inning,
        half: body.half,
        batterId: body.batterId ?? null,
        batterSide: batterSideNorm,
        pitcherId: body.pitcherId ?? null,
        eventType: body.eventType,
        eventDetail: body.eventDetail ?? null,
        rbi: body.rbi ?? 0,
        runsScored: runNorm.runsScored,
        outsRecorded,
        errorsOnPlay: body.errorsOnPlay ?? 0,
        balls: body.balls ?? 0,
        strikes: body.strikes ?? 0,
        runnerFirstId: body.runnerFirstId ?? null,
        runnerSecondId: body.runnerSecondId ?? null,
        runnerThirdId: body.runnerThirdId ?? null,
        runnersScored: runNorm.runnersScored,
        runnerScoredReasons: runNorm.runnerScoredReasons,
        fieldingSequence: body.fieldingSequence ?? null,
        putoutFielderIds: body.putoutFielderIds ?? [],
        assistFielderIds: body.assistFielderIds ?? [],
        errorFielderIds: body.errorFielderIds ?? [],
        pitchCount: body.pitchCount ?? null,
        pitchSequence: body.pitchSequence ?? null,
        hitLocationX: body.hitLocationX != null ? String(body.hitLocationX) : null,
        hitLocationY: body.hitLocationY != null ? String(body.hitLocationY) : null,
        hitType: body.hitType ?? null,
        hitHardness: body.hitHardness ?? null,
        createdBy: user?.id ?? null,
      }).returning();

      // Recompute game state from all events
      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const state = computeGameState(allEvents);

      // Update games table with current state
      await db.update(games).set({
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        currentInning: state.inning,
        currentHalf: state.half,
        currentOuts: state.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      // Emit to WebSocket
      try {
        getIO().to(`game:${gameId}`).emit('game:update', {
          state,
          event: {
            eventNumber,
            eventType: body.eventType,
            batterId: body.batterId,
            pitcherId: body.pitcherId,
            eventDetail: body.eventDetail,
          },
        });
      } catch {}

      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ event, state });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to record event' });
    }
  });

  // ── POST /:gameId/undo ── Soft-delete last event
  app.post<{ Params: { gameId: string } }>('/:gameId/undo', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);

      // Get last non-deleted event
      const [lastEvent] = await db.select()
        .from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(desc(gameEvents.eventNumber))
        .limit(1);

      if (!lastEvent) return reply.status(400).send({ message: 'No events to undo' });

      // Soft delete
      await db.update(gameEvents)
        .set({ isDeleted: true })
        .where(eq(gameEvents.id, lastEvent.id));

      // Recompute state
      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const state = computeGameState(allEvents);

      await db.update(games).set({
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        currentInning: state.inning,
        currentHalf: state.half,
        currentOuts: state.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try { getIO().to(`game:${gameId}`).emit('game:update', { state }); } catch {}

      const user = (request as any).user;
      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ undone: lastEvent.eventNumber, undoneType: lastEvent.eventType, state });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to undo' });
    }
  });

  // ── POST /:gameId/redo ── Un-delete last soft-deleted event
  app.post<{ Params: { gameId: string } }>('/:gameId/redo', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);

      const [lastDeleted] = await db.select()
        .from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, true)))
        .orderBy(desc(gameEvents.eventNumber))
        .limit(1);

      if (!lastDeleted) return reply.status(400).send({ message: 'No events to redo' });

      await db.update(gameEvents)
        .set({ isDeleted: false })
        .where(eq(gameEvents.id, lastDeleted.id));

      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const state = computeGameState(allEvents);

      await db.update(games).set({
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        currentInning: state.inning,
        currentHalf: state.half,
        currentOuts: state.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try { getIO().to(`game:${gameId}`).emit('game:update', { state }); } catch {}

      const user = (request as any).user;
      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ redone: lastDeleted.eventNumber, redoneType: lastDeleted.eventType, state });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to redo' });
    }
  });

  // ── PUT /:gameId/event/:eventId ── Edit an existing event
  app.put<{
    Params: { gameId: string; eventId: string };
    Body: Record<string, any>;
  }>('/:gameId/event/:eventId', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const eventId = parseInt(request.params.eventId, 10);
      const body = request.body;

      const [existing] = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.id, eventId), eq(gameEvents.gameId, gameId)))
        .limit(1);
      if (!existing) return reply.status(404).send({ message: 'Event not found' });

      const allowedFields: Record<string, (v: any) => any> = {
        eventType: (v) => v,
        eventDetail: (v) => v ?? null,
        rbi: (v) => v ?? 0,
        runsScored: (v) => v ?? 0,
        outsRecorded: (v) => v ?? 0,
        errorsOnPlay: (v) => v ?? 0,
        fieldingSequence: (v) => v ?? null,
        hitLocationX: (v) => v != null ? String(v) : null,
        hitLocationY: (v) => v != null ? String(v) : null,
        hitType: (v) => v ?? null,
        hitHardness: (v) => v ?? null,
        runnerFirstId: (v) => v ?? null,
        runnerSecondId: (v) => v ?? null,
        runnerThirdId: (v) => v ?? null,
        runnersScored: (v) => v ?? [],
        runnerScoredReasons: (v) => v ?? [],
        batterId: (v) => v ?? null,
        batterSide: (v) => {
          if (v === '' || v == null) return null;
          const c = String(v).trim().toUpperCase().charAt(0);
          return c === 'L' || c === 'R' ? c : null;
        },
        pitcherId: (v) => v ?? null,
      };

      const updates: Record<string, any> = {};
      for (const [key, transform] of Object.entries(allowedFields)) {
        if (key in body) updates[key] = transform(body[key]);
      }

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ message: 'No valid fields to update' });
      }

      // Basic validation / normalization for scorer attribution.
      if ('runnersScored' in updates || 'runnerScoredReasons' in updates || 'runsScored' in updates) {
        const nextRunners: number[] = ('runnersScored' in updates ? updates.runnersScored : (existing.runnersScored as any)) ?? [];
        const nextReasons: string[] = ('runnerScoredReasons' in updates ? updates.runnerScoredReasons : ((existing as any).runnerScoredReasons as any)) ?? [];
        const nextRunsScored: number = ('runsScored' in updates ? updates.runsScored : (existing.runsScored as any)) ?? 0;

        const rs = Array.isArray(nextRunners) ? nextRunners : [];
        const rr = Array.isArray(nextReasons) ? nextReasons : [];

        if (rr.length !== 0 && rr.length !== rs.length) {
          return reply.status(400).send({ message: 'runnerScoredReasons length must match runnersScored length (or be empty)' });
        }
        // Enforce consistency: runsScored should match the number of scorers when provided.
        if (rs.length !== nextRunsScored) {
          return reply.status(400).send({ message: `runsScored (${nextRunsScored}) must equal runnersScored length (${rs.length})` });
        }
        // If reasons omitted, default to on_play for each scorer.
        if (rr.length === 0 && rs.length > 0 && 'runnerScoredReasons' in updates) {
          updates.runnerScoredReasons = rs.map(() => 'on_play');
        }
      }

      await db.update(gameEvents).set(updates).where(eq(gameEvents.id, eventId));

      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const state = computeGameState(allEvents);

      await db.update(games).set({
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        currentInning: state.inning,
        currentHalf: state.half,
        currentOuts: state.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try { getIO().to(`game:${gameId}`).emit('game:update', { state }); } catch {}

      const user = (request as any).user;
      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ updated: eventId, state });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to edit event' });
    }
  });

  // ── DELETE /:gameId/event/:eventId ── Soft-delete a specific event
  app.delete<{ Params: { gameId: string; eventId: string } }>('/:gameId/event/:eventId', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const eventId = parseInt(request.params.eventId, 10);

      const [existing] = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.id, eventId), eq(gameEvents.gameId, gameId)))
        .limit(1);
      if (!existing) return reply.status(404).send({ message: 'Event not found' });

      await db.update(gameEvents)
        .set({ isDeleted: true })
        .where(eq(gameEvents.id, eventId));

      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const state = computeGameState(allEvents);

      await db.update(games).set({
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        currentInning: state.inning,
        currentHalf: state.half,
        currentOuts: state.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try { getIO().to(`game:${gameId}`).emit('game:update', { state }); } catch {}

      const user = (request as any).user;
      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ deleted: eventId, state });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete event' });
    }
  });

  // ── GET /:gameId/state-at/:eventNumber ── Time-travel preview
  app.get<{ Params: { gameId: string; eventNumber: string } }>('/:gameId/state-at/:eventNumber', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const upTo = parseInt(request.params.eventNumber, 10);

      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const sliced = allEvents.filter(e => e.eventNumber <= upTo);
      const state = computeGameState(sliced);

      return reply.send({ state, eventCount: sliced.length });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to get state at event' });
    }
  });

  // ── PUT /:gameId/substitute ── Substitute a player
  app.put<{
    Params: { gameId: string };
    Body: {
      outPlayerId: number;
      inPlayerId: number;
      teamId: number;
      position: number;
      inning: number;
      half: string;
    };
  }>('/:gameId/substitute', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const { outPlayerId, inPlayerId, teamId, position, inning, half } = request.body;

      // Deactivate outgoing player
      const [outEntry] = await db.select().from(gameLineups)
        .where(and(
          eq(gameLineups.gameId, gameId),
          eq(gameLineups.playerId, outPlayerId),
          eq(gameLineups.isActive, true)
        )).limit(1);

      if (outEntry) {
        await db.update(gameLineups).set({
          isActive: false,
          exitedInning: inning,
          exitedHalf: half,
        }).where(eq(gameLineups.id, outEntry.id));

        // Add incoming player with same batting order
        await db.insert(gameLineups).values({
          gameId,
          teamId,
          playerId: inPlayerId,
          battingOrder: outEntry.battingOrder,
          position,
          enteredInning: inning,
          enteredHalf: half,
          isStarter: false,
          isActive: true,
        });
      } else {
        return reply.status(400).send({ message: 'Outgoing player is not active in lineup' });
      }

      const user = (request as any).user;
      const halfNorm = normalizeHalf(half);
      const inningNum = Math.max(1, Math.floor(Number(inning)) || 1);

      const allEventsBefore = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);
      const stateBefore = computeGameState(allEventsBefore);

      const [maxEvt] = await db
        .select({ maxNum: max(gameEvents.eventNumber) })
        .from(gameEvents)
        .where(eq(gameEvents.gameId, gameId));
      const eventNumber = ((maxEvt?.maxNum as number) || 0) + 1;

      const nameRows = await db.select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
      }).from(players).where(inArray(players.id, [outPlayerId, inPlayerId]));
      const outRow = nameRows.find((r) => r.id === outPlayerId);
      const inRow = nameRows.find((r) => r.id === inPlayerId);
      const outName = `${outRow?.firstName ?? ''} ${outRow?.lastName ?? ''}`.trim() || `Player #${outPlayerId}`;
      const inName = `${inRow?.firstName ?? ''} ${inRow?.lastName ?? ''}`.trim() || `Player #${inPlayerId}`;

      const detail = JSON.stringify({
        kind: 'player_change',
        position,
        teamId,
        outPlayerId,
        inPlayerId,
        outName,
        inName,
      });

      await db.insert(gameEvents).values({
        gameId,
        eventNumber,
        inning: inningNum,
        half: halfNorm,
        batterId: null,
        pitcherId: null,
        eventType: 'substitution',
        eventDetail: detail,
        rbi: 0,
        runsScored: 0,
        outsRecorded: 0,
        errorsOnPlay: 0,
        balls: 0,
        strikes: 0,
        runnerFirstId: stateBefore.bases.first,
        runnerSecondId: stateBefore.bases.second,
        runnerThirdId: stateBefore.bases.third,
        runnersScored: [],
        runnerScoredReasons: [],
        createdBy: user?.id ?? null,
      });

      const allAfter = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);
      const newState = computeGameState(allAfter);

      await db.update(games).set({
        homeScore: newState.homeScore,
        awayScore: newState.awayScore,
        currentInning: newState.inning,
        currentHalf: newState.half,
        currentOuts: newState.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try {
        getIO().to(`game:${gameId}`).emit('game:update', { state: newState });
      } catch {}

      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to substitute' });
    }
  });

  // ── PUT /:gameId/swap-positions ── Swap defensive positions between active players
  app.put<{
    Params: { gameId: string };
    Body: {
      changes: Array<{ playerId: number; newPosition: number }>;
    };
  }>('/:gameId/swap-positions', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const { changes } = request.body;

      if (!changes || changes.length === 0) {
        return reply.status(400).send({ message: 'No changes provided' });
      }

      const snapshots: Array<{
        playerId: number;
        oldPosition: number;
        newPosition: number;
        firstName: string;
        lastName: string;
      }> = [];

      for (const change of changes) {
        const [row] = await db.select({
          position: gameLineups.position,
          playerId: gameLineups.playerId,
          firstName: players.firstName,
          lastName: players.lastName,
        })
          .from(gameLineups)
          .innerJoin(players, eq(players.id, gameLineups.playerId))
          .where(and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.playerId, change.playerId),
            eq(gameLineups.isActive, true),
          ))
          .limit(1);

        if (row) {
          snapshots.push({
            playerId: change.playerId,
            oldPosition: row.position,
            newPosition: change.newPosition,
            firstName: row.firstName,
            lastName: row.lastName,
          });
        }

        await db.update(gameLineups)
          .set({ position: change.newPosition })
          .where(and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.playerId, change.playerId),
            eq(gameLineups.isActive, true),
          ));
      }

      const user = (request as any).user;

      if (snapshots.length > 0) {
        const allEventsBefore = await db.select().from(gameEvents)
          .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
          .orderBy(gameEvents.eventNumber);
        const stateBefore = computeGameState(allEventsBefore);

        const [maxEvt] = await db
          .select({ maxNum: max(gameEvents.eventNumber) })
          .from(gameEvents)
          .where(eq(gameEvents.gameId, gameId));
        const eventNumber = ((maxEvt?.maxNum as number) || 0) + 1;

        const detail = JSON.stringify({
          kind: 'position_swap',
          changes: snapshots.map((s) => ({
            playerId: s.playerId,
            firstName: s.firstName,
            lastName: s.lastName,
            oldPosition: s.oldPosition,
            newPosition: s.newPosition,
          })),
        });

        await db.insert(gameEvents).values({
          gameId,
          eventNumber,
          inning: stateBefore.inning,
          half: stateBefore.half,
          batterId: null,
          pitcherId: null,
          eventType: 'substitution',
          eventDetail: detail,
          rbi: 0,
          runsScored: 0,
          outsRecorded: 0,
          errorsOnPlay: 0,
          balls: 0,
          strikes: 0,
          runnerFirstId: stateBefore.bases.first,
          runnerSecondId: stateBefore.bases.second,
          runnerThirdId: stateBefore.bases.third,
          runnersScored: [],
          runnerScoredReasons: [],
          createdBy: user?.id ?? null,
        });

        const allAfter = await db.select().from(gameEvents)
          .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
          .orderBy(gameEvents.eventNumber);
        const newState = computeGameState(allAfter);

        await db.update(games).set({
          homeScore: newState.homeScore,
          awayScore: newState.awayScore,
          currentInning: newState.inning,
          currentHalf: newState.half,
          currentOuts: newState.outs,
          updatedAt: new Date(),
        }).where(eq(games.id, gameId));

        try {
          getIO().to(`game:${gameId}`).emit('game:update', { state: newState });
        } catch {}
      }

      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to swap positions' });
    }
  });

  // ── PUT /:gameId/adjust-score ── Manually adjust the score
  app.put<{
    Params: { gameId: string };
    Body: { homeScore: number; awayScore: number };
  }>('/:gameId/adjust-score', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const user = (request as any).user;
      const targetHome = Math.max(0, Math.floor(Number(request.body?.homeScore) || 0));
      const targetAway = Math.max(0, Math.floor(Number(request.body?.awayScore) || 0));

      const allEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const state = computeGameState(allEvents);
      const homeDelta = targetHome - state.homeScore;
      const awayDelta = targetAway - state.awayScore;

      if (homeDelta === 0 && awayDelta === 0) {
        return reply.send({ success: true, noOp: true, state });
      }

      const [maxEvt] = await db
        .select({ maxNum: max(gameEvents.eventNumber) })
        .from(gameEvents)
        .where(eq(gameEvents.gameId, gameId));
      const eventNumber = ((maxEvt?.maxNum as number) || 0) + 1;

      const detail = JSON.stringify({ homeDelta, awayDelta });
      await db.insert(gameEvents).values({
        gameId,
        eventNumber,
        inning: state.inning,
        half: state.half,
        batterId: null,
        pitcherId: null,
        eventType: 'adjust_score',
        eventDetail: detail,
        rbi: 0,
        runsScored: 0,
        outsRecorded: 0,
        errorsOnPlay: 0,
        balls: 0,
        strikes: 0,
        runnerFirstId: null,
        runnerSecondId: null,
        runnerThirdId: null,
        runnersScored: [],
        runnerScoredReasons: [],
        createdBy: user?.id ?? null,
      });

      const allAfter = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);

      const newState = computeGameState(allAfter);

      await db.update(games).set({
        homeScore: newState.homeScore,
        awayScore: newState.awayScore,
        currentInning: newState.inning,
        currentHalf: newState.half,
        currentOuts: newState.outs,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try {
        getIO().to(`game:${gameId}`).emit('game:update', { state: newState });
      } catch {}

      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ success: true, state: newState });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to adjust score' });
    }
  });

  // ── POST /:gameId/finalize ── Finalize the game
  app.post<{ Params: { gameId: string } }>('/:gameId/finalize', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const user = (request as any).user;

      const result = await finalizeGame(gameId, user?.id);

      try {
        const finalGame = await getGameCore(gameId);
        getIO().to(`game:${gameId}`).emit('game:final', {
          gameId,
          homeScore: finalGame?.homeScore,
          awayScore: finalGame?.awayScore,
          status: 'final',
        });
      } catch {}

      return reply.send(result);
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ message: err.message || 'Failed to finalize game' });
    }
  });
}
