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
} from '../../db/schema/index.js';
import { eq, and, desc, max, sql } from 'drizzle-orm';
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
]);

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
      if (detail === 'ball') state.balls++;
      else if (detail === 'foul') { if (state.strikes < 2) state.strikes++; }
      else if (detail === 'strike' || detail === 'called_strike' || detail === 'swinging_strike') state.strikes++;
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

  // ── GET /:gameId/state ── Full game state
  app.get<{ Params: { gameId: string } }>('/:gameId/state', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
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
        isStarter: gameLineups.isStarter,
        isActive: gameLineups.isActive,
        firstName: players.firstName,
        lastName: players.lastName,
      })
        .from(gameLineups)
        .innerJoin(players, eq(gameLineups.playerId, players.id))
        .where(eq(gameLineups.gameId, gameId));

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
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
      if (!game) return reply.status(404).send({ message: 'Game not found' });

      // Get players on each team's roster for the season, with license status
      const rosterQuery = await db.select({
        playerId: playerSeasons.playerId,
        teamId: playerSeasons.teamId,
        firstName: players.firstName,
        lastName: players.lastName,
        jerseyNumber: playerSeasons.jerseyNumber,
        licensePaid: licenses.paymentStatus,
      })
        .from(playerSeasons)
        .innerJoin(players, eq(playerSeasons.playerId, players.id))
        .leftJoin(licenses, and(
          eq(licenses.playerId, playerSeasons.playerId),
          eq(licenses.seasonId, playerSeasons.seasonId),
        ))
        .where(
          sql`${playerSeasons.teamId} IN (${game.homeTeamId}, ${game.awayTeamId})`
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

      // Insert event
      const [event] = await db.insert(gameEvents).values({
        gameId,
        eventNumber,
        inning: body.inning,
        half: body.half,
        batterId: body.batterId ?? null,
        pitcherId: body.pitcherId ?? null,
        eventType: body.eventType,
        eventDetail: body.eventDetail ?? null,
        rbi: body.rbi ?? 0,
        runsScored: body.runsScored ?? 0,
        outsRecorded: body.outsRecorded ?? 0,
        errorsOnPlay: body.errorsOnPlay ?? 0,
        balls: body.balls ?? 0,
        strikes: body.strikes ?? 0,
        runnerFirstId: body.runnerFirstId ?? null,
        runnerSecondId: body.runnerSecondId ?? null,
        runnerThirdId: body.runnerThirdId ?? null,
        runnersScored: body.runnersScored ?? [],
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

      return reply.send({ undone: lastEvent.eventNumber, undoneType: lastEvent.eventType, state });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to undo' });
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
        await db.update(gameLineups).set({ isActive: false }).where(eq(gameLineups.id, outEntry.id));

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
      }

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

      for (const change of changes) {
        await db.update(gameLineups)
          .set({ position: change.newPosition })
          .where(and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.playerId, change.playerId),
            eq(gameLineups.isActive, true)
          ));
      }

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
      const { homeScore, awayScore } = request.body;

      await db.update(games).set({
        homeScore,
        awayScore,
        updatedAt: new Date(),
      }).where(eq(games.id, gameId));

      try { getIO().to(`game:${gameId}`).emit('game:update', { state: { homeScore, awayScore } }); } catch {}

      return reply.send({ success: true });
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
        const [finalGame] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
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
