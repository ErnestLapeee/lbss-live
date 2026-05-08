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
  playerSeasonBatting,
  playerGameFielding,
} from '../../db/schema/index.js';
import { eq, and, or, desc, max, sql, inArray } from 'drizzle-orm';
import { getIO } from '../../app.js';
import { finalizeGame } from '../../services/finalize-game.js';
import { firstRowFromExecute } from '../../lib/pg-result.js';
import { gamesTableHasOfficialColumns } from '../../lib/games-official-columns.js';
import { slugify } from '../../utils/slugify.js';
import { isBetweenPitchEvent, isKnownEventType } from '@lbss/shared';

/** JSONB array columns — normalize without `as any` on DB rows. */
function jsonbNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

function jsonbStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

function uniqueNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => Number(x)).filter((n) => Number.isFinite(n)))];
}

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
  if (new Set(rs).size !== rs.length) {
    return { ok: false, message: 'The same runner cannot score more than once on one event' };
  }
  if (rs.length !== runsScored) {
    return { ok: false, message: `runsScored (${runsScored}) must equal runnersScored length (${rs.length})` };
  }
  const runnerScoredReasons = rr.length === 0 && rs.length > 0 ? rs.map(() => 'on_play') : rr;
  return { ok: true, runsScored, runnersScored: rs, runnerScoredReasons };
}

function duplicateBaseRunnerMessage(bases: Array<number | null | undefined>): string | null {
  const seen = new Set<number>();
  for (const raw of bases) {
    if (raw == null) continue;
    const id = Number(raw);
    if (!Number.isFinite(id)) return 'Base runner IDs must be valid numbers';
    if (seen.has(id)) return 'The same runner cannot occupy multiple bases';
    seen.add(id);
  }
  return null;
}

function validateScoringEventPayload(
  payload: {
    eventType?: string;
    inning?: number;
    half?: string;
    outsRecorded?: number;
    runsScored?: number;
    runnersScored?: number[];
    runnerScoredReasons?: string[];
    runnerFirstId?: number | null;
    runnerSecondId?: number | null;
    runnerThirdId?: number | null;
    errorFielderIds?: number[];
    errorsOnPlay?: number;
  },
  options?: { expectedState?: GameState; strictState?: boolean },
): { ok: true; normalizedErrorsOnPlay: number } | { ok: false; message: string } {
  const eventType = String(payload.eventType ?? '').trim();
  if (!eventType || !isKnownEventType(eventType)) return { ok: false, message: `Unknown event type: ${eventType || '(empty)'}` };
  if (eventType === 'substitution') {
    return { ok: false, message: 'Use the substitution endpoint so lineup state and event log stay synchronized' };
  }

  const inning = Math.max(1, Math.floor(Number(payload.inning ?? options?.expectedState?.inning ?? 1)) || 1);
  const half = normalizeHalf(payload.half);
  if (options?.strictState && options.expectedState) {
    if (inning !== options.expectedState.inning || half !== options.expectedState.half) {
      return { ok: false, message: `Event inning/half (${half} ${inning}) does not match current state (${options.expectedState.half} ${options.expectedState.inning})` };
    }
  }

  const outsRecorded = Number(payload.outsRecorded ?? 0);
  if (!Number.isInteger(outsRecorded) || outsRecorded < 0 || outsRecorded > 3) {
    return { ok: false, message: 'outsRecorded must be an integer between 0 and 3' };
  }
  if (options?.strictState && options.expectedState && eventType !== 'end_half_inning' && options.expectedState.outs + outsRecorded > 3) {
    return { ok: false, message: 'outsRecorded would exceed three outs in the half-inning' };
  }
  if (options?.strictState && options.expectedState && eventType === 'end_half_inning') {
    const expectedOuts = Math.max(0, 3 - options.expectedState.outs);
    if (outsRecorded !== expectedOuts) {
      return { ok: false, message: `end_half_inning must record exactly ${expectedOuts} out${expectedOuts === 1 ? '' : 's'}` };
    }
    if (Number(payload.runsScored ?? 0) !== 0) {
      return { ok: false, message: 'end_half_inning cannot score runs' };
    }
    if (payload.runnerFirstId != null || payload.runnerSecondId != null || payload.runnerThirdId != null) {
      return { ok: false, message: 'end_half_inning must clear the bases' };
    }
  }
  if (eventType === 'place_runner_second') {
    if (outsRecorded !== 0) {
      return { ok: false, message: 'place_runner_second must record zero outs' };
    }
    if (Number(payload.runsScored ?? 0) !== 0) {
      return { ok: false, message: 'place_runner_second cannot score runs' };
    }
    const r2 = payload.runnerSecondId;
    if (r2 == null || !Number.isFinite(Number(r2))) {
      return { ok: false, message: 'place_runner_second requires runnerSecondId (runner on second base)' };
    }
  }
  if (eventType === 'double_play') {
    if (outsRecorded !== 2) return { ok: false, message: 'double_play must record exactly two outs' };
    if (options?.strictState && options.expectedState && options.expectedState.outs > 1) {
      return { ok: false, message: 'double_play is not possible with two outs already recorded' };
    }
  }
  if (eventType === 'triple_play') {
    if (outsRecorded !== 3) return { ok: false, message: 'triple_play must record exactly three outs' };
    if (options?.strictState && options.expectedState && options.expectedState.outs !== 0) {
      return { ok: false, message: 'triple_play is only possible with no outs' };
    }
  }

  const baseErr = duplicateBaseRunnerMessage([payload.runnerFirstId, payload.runnerSecondId, payload.runnerThirdId]);
  if (baseErr) return { ok: false, message: baseErr };

  const runNorm = normalizeIncomingRunScoring(payload);
  if (!runNorm.ok) return { ok: false, message: runNorm.message };

  const uniqueErrors = uniqueNumberArray(payload.errorFielderIds);
  const providedErrors = Number(payload.errorsOnPlay ?? 0);
  const normalizedErrorsOnPlay = uniqueErrors.length > 0 ? uniqueErrors.length : Math.max(0, Math.floor(providedErrors) || 0);
  if (uniqueErrors.length > 0 && providedErrors !== 0 && providedErrors !== uniqueErrors.length) {
    return { ok: false, message: 'errorsOnPlay must match unique errorFielderIds length' };
  }

  return { ok: true, normalizedErrorsOnPlay };
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
    if (!isBetweenPitchEvent(event.eventType)) {
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

function validateScoringEventTimeline(events: any[]): { ok: true } | { ok: false; message: string } {
  const sorted = events
    .filter((e: any) => !e.isDeleted)
    .sort((a: any, b: any) => a.eventNumber - b.eventNumber);
  let state = computeGameState([]);

  for (const event of sorted) {
    if (event.eventType !== 'substitution') {
      const validation = validateScoringEventPayload(event, { expectedState: state, strictState: true });
      if (!validation.ok) {
        return { ok: false, message: `Event #${event.eventNumber}: ${validation.message}` };
      }
    }
    state = computeGameState([...sorted.filter((e: any) => e.eventNumber <= event.eventNumber)]);
  }

  return { ok: true };
}

async function clearRedoTail(gameId: number, conn: any = db) {
  const [activeTail] = await conn
    .select({ maxNum: max(gameEvents.eventNumber) })
    .from(gameEvents)
    .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)));
  const activeTailEventNumber = Number(activeTail?.maxNum ?? 0);
  await conn
    .delete(gameEvents)
    .where(and(
      eq(gameEvents.gameId, gameId),
      eq(gameEvents.isDeleted, true),
      sql`${gameEvents.eventNumber} > ${activeTailEventNumber}`,
    ));
}

export async function adminScoringRoutes(app: FastifyInstance) {
  async function applyPlayerSubstitutionLineup(
    gameId: number,
    params: {
      outPlayerId: number;
      inPlayerId: number;
      teamId: number;
      position: number;
      inning: number;
      half: string;
    },
    conn: any = db,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const { outPlayerId, inPlayerId, teamId, position, inning, half } = params;
    const [outEntry] = await conn
      .select()
      .from(gameLineups)
      .where(
        and(
          eq(gameLineups.gameId, gameId),
          eq(gameLineups.playerId, outPlayerId),
          eq(gameLineups.isActive, true),
        ),
      )
      .limit(1);

    if (!outEntry) {
      return { ok: false, message: 'Outgoing player is not active in lineup' };
    }
    if (outEntry.teamId !== teamId) {
      return { ok: false, message: 'Outgoing player is active for a different team in this game' };
    }

    const [activeIncomingEntry] = await conn
      .select({ id: gameLineups.id, teamId: gameLineups.teamId })
      .from(gameLineups)
      .where(
        and(
          eq(gameLineups.gameId, gameId),
          eq(gameLineups.playerId, inPlayerId),
          eq(gameLineups.isActive, true),
        ),
      )
      .limit(1);

    if (activeIncomingEntry) {
      return {
        ok: false,
        message:
          activeIncomingEntry.teamId === teamId
            ? 'Incoming player is already active for this team'
            : 'Incoming player is already active for the other team in this game',
      };
    }

    await conn
      .update(gameLineups)
      .set({
        isActive: false,
        exitedInning: inning,
        exitedHalf: half,
      })
      .where(eq(gameLineups.id, outEntry.id));

    await conn.insert(gameLineups).values({
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

    return { ok: true };
  }

  type PositionSwapChange = { playerId?: number; oldPosition?: number; newPosition?: number };

  async function applyPositionSwapChanges(
    gameId: number,
    changes: PositionSwapChange[] | undefined,
    direction: 'undo' | 'redo',
  ) {
    if (!Array.isArray(changes)) return;
    for (const change of changes) {
      const playerId = Number(change.playerId);
      const position = direction === 'undo' ? Number(change.oldPosition) : Number(change.newPosition);
      if (!Number.isFinite(playerId) || !Number.isFinite(position)) continue;
      await db.update(gameLineups)
        .set({ position })
        .where(and(
          eq(gameLineups.gameId, gameId),
          eq(gameLineups.playerId, playerId),
          eq(gameLineups.isActive, true),
        ));
    }
  }

  /** Undo DB lineup changes for substitution events (soft-deleted event must still be readable from `eventDetail`). */
  async function revertSubstitutionLineupChanges(gameId: number, eventDetail: string | null) {
    let detail: {
      kind?: string;
      outPlayerId?: number;
      inPlayerId?: number;
      changes?: PositionSwapChange[];
    } = {};
    try {
      detail = JSON.parse(eventDetail || '{}');
    } catch {
      return;
    }
    if (detail.kind === 'position_swap') {
      await applyPositionSwapChanges(gameId, detail.changes, 'undo');
      return;
    }
    if (detail.kind !== 'player_change' || !detail.outPlayerId || !detail.inPlayerId) return;

    const [inRow] = await db
      .select({ id: gameLineups.id })
      .from(gameLineups)
      .where(
        and(
          eq(gameLineups.gameId, gameId),
          eq(gameLineups.playerId, detail.inPlayerId),
          eq(gameLineups.isActive, true),
        ),
      )
      .orderBy(desc(gameLineups.id))
      .limit(1);

    if (inRow) {
      await db.delete(gameLineups).where(eq(gameLineups.id, inRow.id));
    }

    const [outRow] = await db
      .select({ id: gameLineups.id })
      .from(gameLineups)
      .where(
        and(
          eq(gameLineups.gameId, gameId),
          eq(gameLineups.playerId, detail.outPlayerId),
          eq(gameLineups.isActive, false),
        ),
      )
      .orderBy(desc(gameLineups.id))
      .limit(1);

    if (outRow) {
      await db
        .update(gameLineups)
        .set({
          isActive: true,
          exitedInning: null,
          exitedHalf: null,
        })
        .where(eq(gameLineups.id, outRow.id));
    }
  }

  async function redoSubstitutionLineupChanges(
    gameId: number,
    event: { eventDetail: string | null; inning: number | null; half: string | null },
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    let detail: {
      kind?: string;
      outPlayerId?: number;
      inPlayerId?: number;
      teamId?: number;
      position?: number;
      changes?: PositionSwapChange[];
    } = {};
    try {
      detail = JSON.parse(event.eventDetail || '{}');
    } catch {
      return { ok: true };
    }

    if (detail.kind === 'position_swap') {
      await applyPositionSwapChanges(gameId, detail.changes, 'redo');
      return { ok: true };
    }

    if (
      detail.kind === 'player_change' &&
      detail.outPlayerId != null &&
      detail.inPlayerId != null &&
      detail.teamId != null &&
      detail.position != null
    ) {
      return applyPlayerSubstitutionLineup(gameId, {
        outPlayerId: detail.outPlayerId,
        inPlayerId: detail.inPlayerId,
        teamId: detail.teamId,
        position: detail.position,
        inning: event.inning ?? 1,
        half: String(event.half ?? 'top'),
      });
    }

    return { ok: true };
  }

  async function rebuildSubstitutionLineupState(gameId: number, extraAppliedDeletedEventId?: number) {
    const substitutions = await db.select()
      .from(gameEvents)
      .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.eventType, 'substitution')))
      .orderBy(gameEvents.eventNumber);

    const appliedBeforeRebuild = substitutions.filter((event) => !event.isDeleted || event.id === extraAppliedDeletedEventId);
    for (const event of [...appliedBeforeRebuild].sort((a, b) => b.eventNumber - a.eventNumber)) {
      await revertSubstitutionLineupChanges(gameId, event.eventDetail);
    }

    for (const event of substitutions.filter((event) => !event.isDeleted).sort((a, b) => a.eventNumber - b.eventNumber)) {
      const r = await redoSubstitutionLineupChanges(gameId, event);
      if (!r.ok) throw new Error(r.message || 'Cannot rebuild substitutions');
    }
  }

  /** Raw row shape from `getGameCore` SQL (camelCase aliases). */
  interface GameCoreRow extends Record<string, unknown> {
    id: number;
    leagueId: number;
    homeTeamId: number;
    awayTeamId: number;
    scheduledAt: Date | string;
    venue: string | null;
    umpire: string | null;
    officialScorer: string | null;
    status: string;
    homeScore: number;
    awayScore: number;
    inningsCount: number | null;
    currentInning: number | null;
    currentHalf: string | null;
    currentOuts: number | null;
    isFinalized: boolean;
    finalizedAt: Date | string | null;
    finalizedBy: number | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  }

  async function getGameCore(gameId: number): Promise<GameCoreRow | null> {
    const hasOfficialCols = await gamesTableHasOfficialColumns();
    const res = hasOfficialCols
      ? await db.execute(sql`
        SELECT
          id,
          league_id as "leagueId",
          home_team_id as "homeTeamId",
          away_team_id as "awayTeamId",
          scheduled_at as "scheduledAt",
          venue,
          umpire,
          official_scorer as "officialScorer",
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
      `)
      : await db.execute(sql`
        SELECT
          id,
          league_id as "leagueId",
          home_team_id as "homeTeamId",
          away_team_id as "awayTeamId",
          scheduled_at as "scheduledAt",
          venue,
          NULL::varchar as "umpire",
          NULL::varchar as "officialScorer",
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
    return firstRowFromExecute<GameCoreRow>(res);
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

      const lineupRaw = await db.select({
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
        .leftJoin(players, eq(gameLineups.playerId, players.id))
        .where(eq(gameLineups.gameId, gameId))
        .orderBy(gameLineups.battingOrder);

      const lineupRows = lineupRaw.map((row) => ({
        ...row,
        firstName: row.firstName ?? '—',
        lastName: row.lastName ?? 'Vacant slot',
        bats: row.bats ?? null,
      }));

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

  // ── POST /:gameId/roster/player ── Create player + add to this game’s season roster (lineup setup shortcut)
  app.post<{
    Params: { gameId: string };
    Body: {
      teamId: number;
      firstName: string;
      lastName: string;
      jerseyNumber?: string;
      bats?: string;
      throws?: string;
    };
  }>('/:gameId/roster/player', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      if (Number.isNaN(gameId)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const game = await getGameCore(gameId);
      if (!game) return reply.status(404).send({ message: 'Game not found' });

      const body = request.body ?? {};
      const teamId = Number(body.teamId);
      if (!Number.isFinite(teamId) || teamId <= 0) {
        return reply.status(400).send({ message: 'teamId is required' });
      }
      if (teamId !== game.homeTeamId && teamId !== game.awayTeamId) {
        return reply.status(400).send({ message: 'teamId must be the home or away team for this game' });
      }

      const firstName = String(body.firstName ?? '').trim();
      const lastName = String(body.lastName ?? '').trim();
      if (!firstName || !lastName) {
        return reply.status(400).send({ message: 'firstName and lastName are required' });
      }

      const jerseyRaw = body.jerseyNumber != null ? String(body.jerseyNumber).trim() : '';
      const jerseyNumber = jerseyRaw === '' ? null : jerseyRaw.slice(0, 5);

      const batsRaw = body.bats != null ? String(body.bats).trim().toUpperCase() : '';
      const bats =
        batsRaw === '' || batsRaw === '-'
          ? null
          : batsRaw === 'L' || batsRaw === 'R' || batsRaw === 'S'
            ? batsRaw
            : null;

      const throwsRaw = body.throws != null ? String(body.throws).trim().toUpperCase() : '';
      const throwsHand =
        throwsRaw === '' || throwsRaw === '-'
          ? null
          : throwsRaw === 'L' || throwsRaw === 'R'
            ? throwsRaw
            : null;

      const [leagueRow] = await db
        .select({ seasonId: leagues.seasonId })
        .from(leagues)
        .where(eq(leagues.id, game.leagueId))
        .limit(1);

      const seasonId = leagueRow?.seasonId ?? null;
      if (seasonId == null) {
        return reply.status(400).send({ message: 'League has no season; add the player from admin' });
      }

      const baseSlug = slugify(`${firstName}-${lastName}`) || 'player';
      let slug = baseSlug;
      let slugOk = false;
      for (let n = 0; n < 50; n++) {
        const candidate = n === 0 ? baseSlug : `${baseSlug}-${n}`;
        const [taken] = await db
          .select({ id: players.id })
          .from(players)
          .where(eq(players.slug, candidate))
          .limit(1);
        if (!taken) {
          slug = candidate;
          slugOk = true;
          break;
        }
      }
      if (!slugOk) {
        slug = `${baseSlug}-${Date.now()}`;
      }

      const result = await db.transaction(async (tx) => {
        const [player] = await tx
          .insert(players)
          .values({
            firstName,
            lastName,
            slug,
            nationality: 'LV',
            bats,
            throws: throwsHand,
          })
          .returning({ id: players.id });

        if (!player?.id) {
          throw new Error('PLAYER_INSERT_FAILED');
        }

        await tx.insert(playerSeasons).values({
          playerId: player.id,
          teamId,
          seasonId,
          jerseyNumber,
          position: null,
        });

        await tx
          .insert(licenses)
          .values({
            playerId: player.id,
            seasonId,
            status: 'pending',
            paymentStatus: 'unpaid',
          })
          .onConflictDoNothing();

        return { playerId: player.id };
      });

      return reply.status(201).send({
        playerId: result.playerId,
        teamId,
        firstName,
        lastName,
        jerseyNumber: jerseyNumber ?? undefined,
        licensePaid: 'unpaid',
      });
    } catch (err) {
      request.log.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to create roster player';
      if (msg === 'PLAYER_INSERT_FAILED') {
        return reply.status(500).send({ message: 'Failed to create player' });
      }
      return reply.status(500).send({ message: 'Failed to create roster player' });
    }
  });

  // ── GET /:gameId/most-common-lineup/:teamId ── Mode starter lineup (same season) for quick entry
  app.get<{ Params: { gameId: string; teamId: string } }>(
    '/:gameId/most-common-lineup/:teamId',
    async (request, reply) => {
      try {
        const gameId = parseInt(request.params.gameId, 10);
        const teamId = parseInt(request.params.teamId, 10);
        if (Number.isNaN(gameId) || Number.isNaN(teamId)) {
          return reply.status(400).send({ message: 'Invalid game or team id' });
        }

        const game = await getGameCore(gameId);
        if (!game) return reply.status(404).send({ message: 'Game not found' });

        const [leagueRow] = await db
          .select({ seasonId: leagues.seasonId })
          .from(leagues)
          .where(eq(leagues.id, game.leagueId))
          .limit(1);

        const seasonId = leagueRow?.seasonId ?? null;
        if (seasonId == null) {
          return reply.send({ lineup: null, gamesSampled: 0, message: 'No season for league' });
        }

        const seasonGames = await db
          .select({ id: games.id })
          .from(games)
          .innerJoin(leagues, eq(games.leagueId, leagues.id))
          .where(
            and(
              eq(leagues.seasonId, seasonId),
              or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
              sql`${games.status} IN ('final', 'live', 'suspended')`,
            ),
          );

        const gameIds = seasonGames.map((g) => g.id).filter((id) => id !== gameId);
        if (gameIds.length === 0) {
          return reply.send({ lineup: null, gamesSampled: 0, message: 'No other games in season yet' });
        }

        const rows = await db
          .select({
            gameId: gameLineups.gameId,
            battingOrder: gameLineups.battingOrder,
            playerId: gameLineups.playerId,
            position: gameLineups.position,
          })
          .from(gameLineups)
          .where(
            and(
              eq(gameLineups.teamId, teamId),
              eq(gameLineups.isStarter, true),
              sql`${gameLineups.battingOrder} >= 1 AND ${gameLineups.battingOrder} <= 9`,
              inArray(gameLineups.gameId, gameIds),
            ),
          );

        const byGame = new Map<number, typeof rows>();
        for (const r of rows) {
          const arr = byGame.get(r.gameId) ?? [];
          arr.push(r);
          byGame.set(r.gameId, arr);
        }

        const counts = new Map<string, { count: number; slots: typeof rows }>();
        for (const [, slotRows] of byGame) {
          if (slotRows.length !== 9) continue;
          const bo = new Set(slotRows.map((s) => s.battingOrder));
          if (bo.size !== 9) continue;
          const sorted = [...slotRows].sort((a, b) => a.battingOrder - b.battingOrder);
          const sig = sorted.map((s) => `${s.playerId}:${s.position}`).join('|');
          const prev = counts.get(sig);
          if (prev) prev.count++;
          else counts.set(sig, { count: 1, slots: sorted });
        }

        let best: { count: number; slots: typeof rows } | null = null;
        for (const v of counts.values()) {
          if (!best || v.count > best.count) best = v;
        }

        if (!best) {
          return reply.send({ lineup: null, gamesSampled: 0, message: 'No full starter lineups found' });
        }

        const lineup = best.slots.map((s) => ({
          playerId: s.playerId,
          position: s.position,
          battingOrder: s.battingOrder,
        }));

        return reply.send({
          lineup,
          gamesSampled: best.count,
          gamesInSeason: gameIds.length,
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({ message: 'Failed to compute most common lineup' });
      }
    },
  );

  // ── GET /:gameId/lineup-hints/:teamId — Season PA + defensive position usage (for lineup entry)
  app.get<{ Params: { gameId: string; teamId: string } }>(
    '/:gameId/lineup-hints/:teamId',
    async (request, reply) => {
      try {
        const gameId = parseInt(request.params.gameId, 10);
        const teamId = parseInt(request.params.teamId, 10);
        if (Number.isNaN(gameId) || Number.isNaN(teamId)) {
          return reply.status(400).send({ message: 'Invalid game or team id' });
        }

        const game = await getGameCore(gameId);
        if (!game) return reply.status(404).send({ message: 'Game not found' });

        const [leagueRow] = await db
          .select({ seasonId: leagues.seasonId })
          .from(leagues)
          .where(eq(leagues.id, game.leagueId))
          .limit(1);
        const seasonId = leagueRow?.seasonId ?? null;
        if (seasonId == null) {
          return reply.send({ players: {} });
        }

        const paRows = await db
          .select({
            playerId: playerSeasonBatting.playerId,
            plateAppearances: playerSeasonBatting.plateAppearances,
          })
          .from(playerSeasonBatting)
          .where(
            and(eq(playerSeasonBatting.seasonId, seasonId), eq(playerSeasonBatting.teamId, teamId)),
          );

        const posRows = await db
          .select({
            playerId: playerGameFielding.playerId,
            position: playerGameFielding.position,
            innings: sql<string>`coalesce(sum(${playerGameFielding.innings}::numeric), 0)::text`.as('innings'),
          })
          .from(playerGameFielding)
          .innerJoin(games, eq(playerGameFielding.gameId, games.id))
          .innerJoin(leagues, eq(games.leagueId, leagues.id))
          .where(
            and(
              eq(leagues.seasonId, seasonId),
              eq(playerGameFielding.teamId, teamId),
              eq(games.isFinalized, true),
              sql`${playerGameFielding.position} is not null`,
            ),
          )
          .groupBy(playerGameFielding.playerId, playerGameFielding.position);

        const byPlayer = new Map<
          number,
          { pa: number; positionInnings: Array<{ position: number; innings: number }> }
        >();

        for (const r of paRows) {
          const pid = r.playerId;
          const cur = byPlayer.get(pid) ?? { pa: 0, positionInnings: [] };
          cur.pa = Math.max(0, Number(r.plateAppearances) || 0);
          byPlayer.set(pid, cur);
        }

        for (const r of posRows) {
          const pos = Number(r.position);
          if (!Number.isInteger(pos) || pos < 1 || pos > 10) continue;
          const inn = parseFloat(r.innings || '0') || 0;
          const cur = byPlayer.get(r.playerId) ?? { pa: 0, positionInnings: [] };
          cur.positionInnings.push({ position: pos, innings: inn });
          byPlayer.set(r.playerId, cur);
        }

        const players: Record<string, { pa: number; positions: number[] }> = {};
        for (const [playerId, v] of byPlayer) {
          v.positionInnings.sort((a, b) => b.innings - a.innings);
          const seen = new Set<number>();
          const positions: number[] = [];
          for (const { position: p } of v.positionInnings) {
            if (seen.has(p)) continue;
            seen.add(p);
            positions.push(p);
          }
          players[String(playerId)] = { pa: v.pa, positions };
        }

        return reply.send({ players });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({ message: 'Failed to load lineup hints' });
      }
    },
  );

  // ── POST /:gameId/lineup ── Set lineup for a team
  app.post<{
    Params: { gameId: string };
    Body: {
      teamId: number;
      lineup: Array<{ playerId: number | null; battingOrder: number; position: number | null }>;
    };
  }>('/:gameId/lineup', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const { teamId, lineup } = request.body;

      const [game] = await db
        .select({
          status: games.status,
          isFinalized: games.isFinalized,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
        })
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);
      if (!game) return reply.status(404).send({ message: 'Game not found' });
      if (game.isFinalized || game.status === 'live') {
        return reply.status(400).send({ message: 'Lineups cannot be rewritten after a game is live or finalized. Use substitutions or event edits so stats can replay correctly.' });
      }
      if (teamId !== game.homeTeamId && teamId !== game.awayTeamId) {
        return reply.status(400).send({ message: 'Lineup team must be one of the two teams in this game' });
      }

      const entries = lineup ?? [];
      const battingOrders = entries.map((e) => Number(e.battingOrder));
      if (battingOrders.some((b) => !Number.isInteger(b) || b < 1 || b > 10)) {
        return reply.status(400).send({ message: 'Batting order must be integers 1–10 for each slot' });
      }
      if (new Set(battingOrders).size !== battingOrders.length) {
        return reply.status(400).send({ message: 'Duplicate batting order in lineup' });
      }

      const filledPositions: number[] = [];
      const lineupPlayerIds: number[] = [];
      for (const entry of entries) {
        const pidRaw = entry.playerId;
        const isVacant = pidRaw == null;
        if (isVacant) {
          if (entry.position != null) {
            return reply.status(400).send({ message: 'Vacant lineup slots cannot have a defensive position' });
          }
          continue;
        }
        const pid = Number(pidRaw);
        if (!Number.isInteger(pid) || pid <= 0) {
          return reply.status(400).send({ message: 'Invalid player id in lineup' });
        }
        lineupPlayerIds.push(pid);
        const pos = Number(entry.position);
        if (!Number.isInteger(pos) || pos < 1 || pos > 10) {
          return reply.status(400).send({ message: 'Each filled slot needs a defensive position 1–10' });
        }
        filledPositions.push(pos);
      }

      if (new Set(lineupPlayerIds).size !== lineupPlayerIds.length) {
        return reply.status(400).send({ message: 'The same player cannot appear twice in one lineup' });
      }
      if (new Set(filledPositions).size !== filledPositions.length) {
        return reply.status(400).send({ message: 'Each defensive position (P–DH) must be unique among active fielders' });
      }

      if (lineupPlayerIds.length > 0) {
        const opponentTeamId = teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
        const [opponentConflict] = await db
          .select({ playerId: gameLineups.playerId })
          .from(gameLineups)
          .where(and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.teamId, opponentTeamId),
            eq(gameLineups.isActive, true),
            inArray(gameLineups.playerId, lineupPlayerIds),
          ))
          .limit(1);

        if (opponentConflict) {
          return reply.status(400).send({ message: 'The same player cannot be active for both teams in one game' });
        }
      }

      // Delete existing lineup for this team in this game
      await db.delete(gameLineups).where(
        and(eq(gameLineups.gameId, gameId), eq(gameLineups.teamId, teamId))
      );

      // Insert new lineup
      if (entries.length > 0) {
        await db.insert(gameLineups).values(
          entries.map(entry => {
            const pidRaw = entry.playerId;
            const vacant = pidRaw == null;
            return {
              gameId,
              teamId,
              playerId: vacant ? null : Number(pidRaw),
              battingOrder: entry.battingOrder,
              position: vacant ? null : Number(entry.position),
              isStarter: true,
              isActive: true,
            };
          })
        );
      }

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to set lineup' });
    }
  });

  // ── POST /:gameId/start ── Start the game
  app.post<{
    Params: { gameId: string };
    Body?: { umpire?: string; officialScorer?: string };
  }>('/:gameId/start', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const umpire = String(request.body?.umpire ?? '').trim();
      const officialScorer = String(request.body?.officialScorer ?? '').trim();
      const hasOfficialCols = await gamesTableHasOfficialColumns();

      /** Bare `returning()` lists all schema columns; DBs without migration 0012 lack `umpire` / `official_scorer`. */
      const baseReturning = {
        id: games.id,
        status: games.status,
        currentInning: games.currentInning,
        currentHalf: games.currentHalf,
        currentOuts: games.currentOuts,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        updatedAt: games.updatedAt,
      } as const;

      const [game] = hasOfficialCols
        ? await db
            .update(games)
            .set({
              status: 'live',
              currentInning: 1,
              currentHalf: 'top',
              currentOuts: 0,
              umpire: umpire || null,
              officialScorer: officialScorer || null,
              updatedAt: new Date(),
            })
            .where(eq(games.id, gameId))
            .returning({
              ...baseReturning,
              umpire: games.umpire,
              officialScorer: games.officialScorer,
            })
        : await db
            .update(games)
            .set({
              status: 'live',
              currentInning: 1,
              currentHalf: 'top',
              currentOuts: 0,
              updatedAt: new Date(),
            })
            .where(eq(games.id, gameId))
            .returning(baseReturning);

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
      const user = request.user;

      // A new event after one or more undos starts a new history branch.
      await clearRedoTail(gameId);

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

      const priorEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);
      const priorState = computeGameState(priorEvents);
      const eventValidation = validateScoringEventPayload(body, { expectedState: priorState, strictState: true });
      if (!eventValidation.ok) return reply.status(400).send({ message: eventValidation.message });

      const outsRecorded = Number(body.outsRecorded ?? 0);

      // Insert event
      const [event] = await db.insert(gameEvents).values({
        gameId,
        eventNumber,
        inning: body.inning,
        half: normalizeHalf(body.half),
        batterId: body.batterId ?? null,
        batterSide: batterSideNorm,
        pitcherId: body.pitcherId ?? null,
        eventType: body.eventType,
        eventDetail: body.eventDetail ?? null,
        rbi: body.rbi ?? 0,
        runsScored: runNorm.runsScored,
        outsRecorded,
        errorsOnPlay: eventValidation.normalizedErrorsOnPlay,
        balls: body.balls ?? 0,
        strikes: body.strikes ?? 0,
        runnerFirstId: body.runnerFirstId ?? null,
        runnerSecondId: body.runnerSecondId ?? null,
        runnerThirdId: body.runnerThirdId ?? null,
        runnersScored: runNorm.runnersScored,
        runnerScoredReasons: runNorm.runnerScoredReasons,
        fieldingSequence: body.fieldingSequence ?? null,
        putoutFielderIds: uniqueNumberArray(body.putoutFielderIds),
        assistFielderIds: uniqueNumberArray(body.assistFielderIds),
        errorFielderIds: uniqueNumberArray(body.errorFielderIds),
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

      if (lastEvent.eventType === 'substitution' && lastEvent.eventDetail) {
        await revertSubstitutionLineupChanges(gameId, lastEvent.eventDetail);
      }

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

      const user = request.user;
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
        .where(and(
          eq(gameEvents.gameId, gameId),
          eq(gameEvents.isDeleted, true),
        ))
        .orderBy(desc(gameEvents.eventNumber))
        .limit(1);

      if (!lastDeleted) return reply.status(400).send({ message: 'No events to redo' });

      if (lastDeleted.eventType === 'substitution' && lastDeleted.eventDetail) {
        const r = await redoSubstitutionLineupChanges(gameId, lastDeleted);
        if (!r.ok) {
          return reply.status(400).send({ message: r.message || 'Cannot redo substitution' });
        }
      }

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

      const user = request.user;
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
      if (existing.isDeleted) return reply.status(400).send({ message: 'Deleted events cannot be edited; redo the event first' });

      const allowedFields: Record<string, (v: any) => any> = {
        inning: (v) => Math.max(1, Math.floor(Number(v)) || 1),
        half: (v) => normalizeHalf(v),
        eventType: (v) => v,
        eventDetail: (v) => v ?? null,
        rbi: (v) => v ?? 0,
        runsScored: (v) => v ?? 0,
        outsRecorded: (v) => v ?? 0,
        errorsOnPlay: (v) => v ?? 0,
        balls: (v) => Math.max(0, Math.min(3, Math.floor(Number(v) || 0))),
        strikes: (v) => Math.max(0, Math.min(2, Math.floor(Number(v) || 0))),
        fieldingSequence: (v) => v ?? null,
        putoutFielderIds: (v) => uniqueNumberArray(v),
        assistFielderIds: (v) => uniqueNumberArray(v),
        errorFielderIds: (v) => uniqueNumberArray(v),
        pitchCount: (v) => (v == null || v === '' ? null : Number(v)),
        pitchSequence: (v) => v ?? null,
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
      if (existing.eventType === 'substitution' || updates.eventType === 'substitution') {
        return reply.status(400).send({ message: 'Substitution events cannot be edited here; delete and re-enter the substitution so lineup state stays synchronized' });
      }

      const candidate = {
        eventType: 'eventType' in updates ? updates.eventType : existing.eventType,
        inning: 'inning' in updates ? updates.inning : existing.inning,
        half: 'half' in updates ? updates.half : existing.half,
        outsRecorded: 'outsRecorded' in updates ? updates.outsRecorded : existing.outsRecorded,
        runsScored: 'runsScored' in updates ? updates.runsScored : existing.runsScored,
        runnersScored: 'runnersScored' in updates ? updates.runnersScored : jsonbNumberArray(existing.runnersScored),
        runnerScoredReasons: 'runnerScoredReasons' in updates ? updates.runnerScoredReasons : jsonbStringArray(existing.runnerScoredReasons),
        runnerFirstId: 'runnerFirstId' in updates ? updates.runnerFirstId : existing.runnerFirstId,
        runnerSecondId: 'runnerSecondId' in updates ? updates.runnerSecondId : existing.runnerSecondId,
        runnerThirdId: 'runnerThirdId' in updates ? updates.runnerThirdId : existing.runnerThirdId,
        errorFielderIds: 'errorFielderIds' in updates ? updates.errorFielderIds : uniqueNumberArray(existing.errorFielderIds),
        errorsOnPlay: 'errorsOnPlay' in updates ? updates.errorsOnPlay : existing.errorsOnPlay,
      };
      const previousEvents = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false), sql`${gameEvents.eventNumber} < ${existing.eventNumber}`))
        .orderBy(gameEvents.eventNumber);
      const eventValidation = validateScoringEventPayload(candidate, { expectedState: computeGameState(previousEvents), strictState: true });
      if (!eventValidation.ok) return reply.status(400).send({ message: eventValidation.message });
      if ('errorFielderIds' in updates || 'errorsOnPlay' in updates) {
        updates.errorsOnPlay = eventValidation.normalizedErrorsOnPlay;
      }

      const activeEventsBeforeUpdate = await db.select().from(gameEvents)
        .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
        .orderBy(gameEvents.eventNumber);
      const activeEventsAfterUpdate = activeEventsBeforeUpdate.map((event) =>
        event.id === eventId ? { ...event, ...updates } : event,
      );
      const timelineValidation = validateScoringEventTimeline(activeEventsAfterUpdate);
      if (!timelineValidation.ok) return reply.status(400).send({ message: timelineValidation.message });

      // Basic validation / normalization for scorer attribution.
      if ('runnersScored' in updates || 'runnerScoredReasons' in updates || 'runsScored' in updates) {
        const nextRunners: number[] = 'runnersScored' in updates
          ? updates.runnersScored
          : jsonbNumberArray(existing.runnersScored);
        const nextReasons: string[] = 'runnerScoredReasons' in updates
          ? updates.runnerScoredReasons
          : jsonbStringArray(existing.runnerScoredReasons);
        const nextRunsScored: number = 'runsScored' in updates
          ? updates.runsScored
          : Number(existing.runsScored ?? 0);

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

      const user = request.user;
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

      if (existing.eventType === 'substitution') {
        await rebuildSubstitutionLineupState(gameId, existing.id);
      }

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

      const user = request.user;
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
      /** Distinguishes pinch-hit / pinch-run style subs from defensive replacements in play-by-play. */
      subKind?: 'offensive' | 'defensive';
    };
  }>('/:gameId/substitute', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const { outPlayerId, inPlayerId, teamId, position, inning, half } = request.body;
      const subKind =
        request.body.subKind === 'offensive' || request.body.subKind === 'defensive'
          ? request.body.subKind
          : 'defensive';

      const user = request.user;
      const halfNorm = normalizeHalf(half);
      const inningNum = Math.max(1, Math.floor(Number(inning)) || 1);

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
        subKind,
        position,
        teamId,
        outPlayerId,
        inPlayerId,
        outName,
        inName,
      });

      const newState = await db.transaction(async (tx) => {
        await clearRedoTail(gameId, tx);

        const allEventsBefore = await tx.select().from(gameEvents)
          .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
          .orderBy(gameEvents.eventNumber);
        const stateBefore = computeGameState(allEventsBefore);

        const applied = await applyPlayerSubstitutionLineup(gameId, {
          outPlayerId,
          inPlayerId,
          teamId,
          position,
          inning: inningNum,
          half: halfNorm,
        }, tx);
        if (!applied.ok) throw new Error(`SUBSTITUTION_VALIDATION:${applied.message}`);

        const [maxEvt] = await tx
          .select({ maxNum: max(gameEvents.eventNumber) })
          .from(gameEvents)
          .where(eq(gameEvents.gameId, gameId));
        const eventNumber = ((maxEvt?.maxNum as number) || 0) + 1;

        await tx.insert(gameEvents).values({
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

        const allAfter = await tx.select().from(gameEvents)
          .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
          .orderBy(gameEvents.eventNumber);
        const state = computeGameState(allAfter);

        await tx.update(games).set({
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          currentInning: state.inning,
          currentHalf: state.half,
          currentOuts: state.outs,
          updatedAt: new Date(),
        }).where(eq(games.id, gameId));

        return state;
      });

      try {
        getIO().to(`game:${gameId}`).emit('game:update', { state: newState });
      } catch {}

      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ success: true });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('SUBSTITUTION_VALIDATION:')) {
        return reply.status(400).send({ message: err.message.replace('SUBSTITUTION_VALIDATION:', '') });
      }
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
      const normalizedChanges = changes.map((change) => ({
        playerId: Number(change.playerId),
        newPosition: Number(change.newPosition),
      }));
      if (normalizedChanges.some((change) => !Number.isInteger(change.playerId) || !Number.isInteger(change.newPosition) || change.newPosition < 1 || change.newPosition > 10)) {
        return reply.status(400).send({ message: 'Position changes must include valid player IDs and positions' });
      }
      if (new Set(normalizedChanges.map((change) => change.playerId)).size !== normalizedChanges.length) {
        return reply.status(400).send({ message: 'Each player can only appear once in a position change' });
      }

      const user = request.user;
      const newState = await db.transaction(async (tx) => {
        const snapshots: Array<{
          playerId: number;
          teamId: number;
          oldPosition: number;
          newPosition: number;
          firstName: string;
          lastName: string;
        }> = [];

        for (const change of normalizedChanges) {
          const [row] = await tx.select({
            teamId: gameLineups.teamId,
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

          if (!row) throw new Error(`POSITION_SWAP_VALIDATION:Player #${change.playerId} is not active in this game`);
          if (row.position == null) {
            throw new Error(`POSITION_SWAP_VALIDATION:Player #${change.playerId} has no defensive position (vacant slot)`);
          }
          snapshots.push({
            playerId: change.playerId,
            teamId: row.teamId,
            oldPosition: row.position,
            newPosition: change.newPosition,
            firstName: row.firstName,
            lastName: row.lastName,
          });
        }

        const changeByPlayerId = new Map(normalizedChanges.map((change) => [change.playerId, change.newPosition]));
        const changedTeamIds = [...new Set(snapshots.map((snapshot) => snapshot.teamId))];
        const activeRows = await tx.select({
          playerId: gameLineups.playerId,
          teamId: gameLineups.teamId,
          position: gameLineups.position,
        })
          .from(gameLineups)
          .where(and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.isActive, true),
            inArray(gameLineups.teamId, changedTeamIds),
          ));
        const finalPositionsByTeam = new Map<number, Set<number>>();
        for (const row of activeRows) {
          if (row.playerId == null || row.position == null) continue;
          const finalPosition = changeByPlayerId.get(row.playerId) ?? row.position;
          const positions = finalPositionsByTeam.get(row.teamId) ?? new Set<number>();
          if (positions.has(finalPosition)) {
            throw new Error('POSITION_SWAP_VALIDATION:Two active players on the same team cannot be assigned the same position');
          }
          positions.add(finalPosition);
          finalPositionsByTeam.set(row.teamId, positions);
        }

        await clearRedoTail(gameId, tx);

        const allEventsBefore = await tx.select().from(gameEvents)
          .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
          .orderBy(gameEvents.eventNumber);
        const stateBefore = computeGameState(allEventsBefore);

        for (const change of normalizedChanges) {
          await tx.update(gameLineups)
            .set({ position: change.newPosition })
            .where(and(
              eq(gameLineups.gameId, gameId),
              eq(gameLineups.playerId, change.playerId),
              eq(gameLineups.isActive, true),
            ));
        }

        const [maxEvt] = await tx
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

        await tx.insert(gameEvents).values({
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

        const allAfter = await tx.select().from(gameEvents)
          .where(and(eq(gameEvents.gameId, gameId), eq(gameEvents.isDeleted, false)))
          .orderBy(gameEvents.eventNumber);
        const stateAfter = computeGameState(allAfter);

        await tx.update(games).set({
          homeScore: stateAfter.homeScore,
          awayScore: stateAfter.awayScore,
          currentInning: stateAfter.inning,
          currentHalf: stateAfter.half,
          currentOuts: stateAfter.outs,
          updatedAt: new Date(),
        }).where(eq(games.id, gameId));

        return stateAfter;
      });

      try {
        getIO().to(`game:${gameId}`).emit('game:update', { state: newState });
      } catch {}

      const [game] = await db.select({ isFinalized: games.isFinalized }).from(games).where(eq(games.id, gameId)).limit(1);
      if (game?.isFinalized) await finalizeGame(gameId, user?.id, { recompute: true });

      return reply.send({ success: true });
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('POSITION_SWAP_VALIDATION:')) {
        return reply.status(400).send({ message: err.message.replace('POSITION_SWAP_VALIDATION:', '') });
      }
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
      const user = request.user;
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

      await clearRedoTail(gameId);

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

  // ── PUT /:gameId/active-lineup ── Fix batting order / fielding positions for active players (incl. vacant/ejected slots)
  app.put<{
    Params: { gameId: string };
    Body: {
      home: Array<{ id: number; playerId: number | null; battingOrder: number; position: number | null }>;
      away: Array<{ id: number; playerId: number | null; battingOrder: number; position: number | null }>;
    };
  }>('/:gameId/active-lineup', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      if (Number.isNaN(gameId)) {
        return reply.status(400).send({ message: 'Invalid game id' });
      }

      const [game] = await db
        .select({
          status: games.status,
          isFinalized: games.isFinalized,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
        })
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);
      if (!game) return reply.status(404).send({ message: 'Game not found' });
      if (game.isFinalized) {
        return reply.status(400).send({ message: 'Cannot change lineup after the game is finalized' });
      }
      if (game.status !== 'live' && game.status !== 'suspended') {
        return reply
          .status(400)
          .send({ message: 'Active lineup can only be edited while the game is live or suspended' });
      }

      const body = request.body ?? {};
      const homeRows = Array.isArray(body.home) ? body.home : [];
      const awayRows = Array.isArray(body.away) ? body.away : [];

      function validateSide(
        label: string,
        rows: Array<{ id: number; playerId: number | null; battingOrder: number; position: number | null }>,
      ): string | null {
        if (rows.length === 0) return `${label}: lineup cannot be empty`;
        const ids = rows.map((r) => Number(r.id));
        if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return `${label}: invalid lineup row id`;
        if (new Set(ids).size !== ids.length) return `${label}: duplicate lineup row id`;

        const realPids: number[] = [];
        for (const r of rows) {
          if (r.playerId == null) continue;
          const pid = Number(r.playerId);
          if (!Number.isInteger(pid) || pid <= 0) return `${label}: invalid player id`;
          realPids.push(pid);
        }
        if (new Set(realPids).size !== realPids.length) return `${label}: duplicate player in payload`;

        const bo = rows.map((r) => Number(r.battingOrder));
        if (bo.some((b) => !Number.isInteger(b) || b < 1 || b > 10)) {
          return `${label}: batting order must be integers 1–10`;
        }
        if (new Set(bo).size !== bo.length) return `${label}: duplicate batting order`;

        const filledPositions: number[] = [];
        for (const r of rows) {
          const pid = r.playerId == null ? null : Number(r.playerId);
          if (pid == null) {
            if (r.position != null) {
              return `${label}: vacant slot cannot have a fielding position`;
            }
            continue;
          }
          const pos = Number(r.position);
          if (!Number.isInteger(pos) || pos < 1 || pos > 10) {
            return `${label}: active players need position 1–10`;
          }
          filledPositions.push(pos);
        }
        if (new Set(filledPositions).size !== filledPositions.length) {
          return `${label}: each defensive position (P,C,IF,OF,DH) must be unique — fix duplicate roles (e.g. multiple DH)`;
        }
        return null;
      }

      const errH = validateSide('Home', homeRows);
      if (errH) return reply.status(400).send({ message: errH });
      const errA = validateSide('Away', awayRows);
      if (errA) return reply.status(400).send({ message: errA });

      const activeHome = await db
        .select({ id: gameLineups.id })
        .from(gameLineups)
        .where(
          and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.teamId, game.homeTeamId),
            eq(gameLineups.isActive, true),
          ),
        );
      const activeAway = await db
        .select({ id: gameLineups.id })
        .from(gameLineups)
        .where(
          and(
            eq(gameLineups.gameId, gameId),
            eq(gameLineups.teamId, game.awayTeamId),
            eq(gameLineups.isActive, true),
          ),
        );

      const expectedHomeIds = new Set(activeHome.map((r) => r.id));
      const expectedAwayIds = new Set(activeAway.map((r) => r.id));
      const bodyHomeIds = new Set(homeRows.map((r) => Number(r.id)));
      const bodyAwayIds = new Set(awayRows.map((r) => Number(r.id)));

      if (expectedHomeIds.size !== bodyHomeIds.size || ![...expectedHomeIds].every((id) => bodyHomeIds.has(id))) {
        return reply.status(400).send({
          message: 'Home payload must list exactly one entry per active lineup row (same row ids as the server)',
        });
      }
      if (expectedAwayIds.size !== bodyAwayIds.size || ![...expectedAwayIds].every((id) => bodyAwayIds.has(id))) {
        return reply.status(400).send({
          message: 'Away payload must list exactly one entry per active lineup row (same row ids as the server)',
        });
      }

      await db.transaction(async (tx) => {
        for (const row of homeRows) {
          await tx
            .update(gameLineups)
            .set({
              playerId: row.playerId == null ? null : Number(row.playerId),
              battingOrder: row.battingOrder,
              position: row.playerId == null ? null : Number(row.position),
            })
            .where(
              and(
                eq(gameLineups.id, row.id),
                eq(gameLineups.gameId, gameId),
                eq(gameLineups.teamId, game.homeTeamId),
                eq(gameLineups.isActive, true),
              ),
            );
        }
        for (const row of awayRows) {
          await tx
            .update(gameLineups)
            .set({
              playerId: row.playerId == null ? null : Number(row.playerId),
              battingOrder: row.battingOrder,
              position: row.playerId == null ? null : Number(row.position),
            })
            .where(
              and(
                eq(gameLineups.id, row.id),
                eq(gameLineups.gameId, gameId),
                eq(gameLineups.teamId, game.awayTeamId),
                eq(gameLineups.isActive, true),
              ),
            );
        }
      });

      try {
        getIO().to(`game:${gameId}`).emit('game:update', { lineupAdjusted: true });
      } catch {}

      return reply.send({ success: true });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to update active lineup' });
    }
  });

  // ── POST /:gameId/finalize ── Finalize the game
  app.post<{ Params: { gameId: string } }>('/:gameId/finalize', async (request, reply) => {
    try {
      const gameId = parseInt(request.params.gameId, 10);
      const user = request.user;

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
