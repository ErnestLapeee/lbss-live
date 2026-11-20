import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBetweenPitchEvent,
  reduceGameState,
  remapBasesForSubstitutionDetail,
  type EventType,
  type GameEvent,
  type GameState,
} from '@lbss/shared';
import { gameTransitionError, normalizeGameStatus } from './game-lifecycle.js';

/** Reference copy of the pre-unification API reducer so parity fixtures verify zero drift. */
function legacyApiComputeGameState(events: GameEvent[]): GameState {
  const state: GameState = {
    inning: 1,
    half: 'top',
    outs: 0,
    homeScore: 0,
    awayScore: 0,
    bases: { first: null, second: null, third: null },
    homeLineScore: [0],
    awayLineScore: [],
    eventCount: 0,
    balls: 0,
    strikes: 0,
  };

  const sorted = events
    .filter((e) => !e.isDeleted)
    .sort((a, b) => a.eventNumber - b.eventNumber);

  for (const event of sorted) {
    if (event.eventType === 'pitch') {
      const detail = (event.eventDetail || '').toLowerCase();
      if (detail === 'ball') state.balls = Math.min(3, state.balls + 1);
      else if (detail === 'foul') {
        if (state.strikes < 2) state.strikes++;
      } else if (detail === 'strike' || detail === 'called_strike' || detail === 'swinging_strike') {
        state.strikes = Math.min(2, state.strikes + 1);
      }
      state.eventCount++;
      continue;
    }

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

    if (event.eventType === 'substitution') {
      state.bases = remapBasesForSubstitutionDetail(state.bases, event.eventDetail);
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

    if (!isBetweenPitchEvent(event.eventType)) {
      state.balls = 0;
      state.strikes = 0;
    }

    if (state.outs >= 3 || event.eventType === 'end_half_inning') {
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

function makeEvent(partial: Partial<GameEvent> & { eventNumber: number; eventType: EventType }): GameEvent {
  return {
    id: partial.eventNumber,
    gameId: 1,
    inning: 1,
    half: 'top',
    batterId: null,
    pitcherId: null,
    eventDetail: null,
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
    isDeleted: false,
    createdAt: '2026-06-01T12:00:00.000Z',
    createdBy: 1,
    ...partial,
  };
}

test('shared reducer matches legacy API reducer across pitches, between-pitch plays, substitutions, youth run-limit end, adjustments, deletes, and extras', () => {
  const fixtures: Array<{ name: string; events: GameEvent[] }> = [
    { name: 'empty game', events: [] },
    {
      name: 'pitch count + between-pitch stolen base + pinch runner + double + 3rd out',
      events: [
        makeEvent({ eventNumber: 1, eventType: 'single', batterId: 10, runnerFirstId: 10 }),
        makeEvent({ eventNumber: 2, eventType: 'pitch', eventDetail: 'ball' }),
        makeEvent({ eventNumber: 3, eventType: 'pitch', eventDetail: 'called_strike' }),
        makeEvent({ eventNumber: 4, eventType: 'pitch', eventDetail: 'foul' }),
        makeEvent({ eventNumber: 5, eventType: 'pitch', eventDetail: 'foul' }),
        makeEvent({ eventNumber: 6, eventType: 'stolen_base', runnerSecondId: 10 }),
        makeEvent({
          eventNumber: 7,
          eventType: 'substitution',
          eventDetail: JSON.stringify({ kind: 'player_change', outPlayerId: 10, inPlayerId: 99, teamId: 2, position: 7 }),
        }),
        makeEvent({ eventNumber: 8, eventType: 'double', batterId: 11, runsScored: 1, runnersScored: [99], runnerSecondId: 11 }),
        makeEvent({ eventNumber: 9, eventType: 'double_play', batterId: 12, outsRecorded: 2 }),
        makeEvent({ eventNumber: 10, eventType: 'strikeout_swinging', batterId: 13, outsRecorded: 1 }),
      ],
    },
    {
      name: 'youth zero-out run-limit end_half_inning + deleted events + unsorted input',
      events: [
        makeEvent({ eventNumber: 3, eventType: 'end_half_inning', inning: 1, half: 'top', outsRecorded: 0 }),
        makeEvent({ eventNumber: 1, eventType: 'home_run', inning: 1, half: 'top', runsScored: 5, runnersScored: [1, 2, 3, 4, 5] }),
        makeEvent({ eventNumber: 2, eventType: 'ground_out', inning: 1, half: 'top', outsRecorded: 1, isDeleted: true }),
      ],
    },
    {
      name: 'manual score adjustment + malformed adjustment + extra inning rollover',
      events: [
        makeEvent({ eventNumber: 1, eventType: 'end_half_inning', inning: 1, half: 'top' }),
        makeEvent({ eventNumber: 2, eventType: 'end_half_inning', inning: 1, half: 'bot' }),
        makeEvent({
          eventNumber: 3,
          eventType: 'adjust_score',
          inning: 0,
          half: 'top',
          eventDetail: JSON.stringify({ homeDelta: 2, awayDelta: -1 }),
        }),
        makeEvent({
          eventNumber: 4,
          eventType: 'adjust_score',
          inning: 2,
          half: 'top',
          eventDetail: '{bad-json',
        }),
        makeEvent({ eventNumber: 5, eventType: 'place_runner_second', inning: 10, half: 'top', runnerSecondId: 44 }),
        makeEvent({ eventNumber: 6, eventType: 'home_run', inning: 10, half: 'top', runsScored: 2, runnersScored: [44, 45] }),
      ],
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(
      reduceGameState(fixture.events),
      legacyApiComputeGameState(fixture.events),
      `reducer parity mismatch for fixture: ${fixture.name}`,
    );
  }
});

test('game lifecycle transitions enforce state machine invariants', () => {
  assert.equal(normalizeGameStatus(' LIVE '), 'live');
  assert.equal(normalizeGameStatus('bogus'), null);

  assert.equal(gameTransitionError({ currentStatus: 'scheduled', targetStatus: 'live', isFinalized: false, source: 'start' }), null);
  assert.equal(gameTransitionError({ currentStatus: 'postponed', targetStatus: 'live', isFinalized: false, source: 'start' }), null);
  assert.ok(gameTransitionError({ currentStatus: 'live', targetStatus: 'live', isFinalized: false, source: 'start' }));
  assert.ok(gameTransitionError({ currentStatus: 'final', targetStatus: 'live', isFinalized: true, source: 'start' }));

  assert.equal(gameTransitionError({ currentStatus: 'live', targetStatus: 'suspended', isFinalized: false, source: 'pause' }), null);
  assert.ok(gameTransitionError({ currentStatus: 'scheduled', targetStatus: 'suspended', isFinalized: false, source: 'pause' }));

  assert.equal(gameTransitionError({ currentStatus: 'suspended', targetStatus: 'live', isFinalized: false, source: 'resume' }), null);
  assert.ok(gameTransitionError({ currentStatus: 'live', targetStatus: 'live', isFinalized: false, source: 'resume' }));

  assert.equal(gameTransitionError({ currentStatus: 'live', targetStatus: 'final', isFinalized: false, source: 'finalize' }), null);
  assert.equal(gameTransitionError({ currentStatus: 'suspended', targetStatus: 'final', isFinalized: false, source: 'finalize' }), null);
  assert.ok(gameTransitionError({ currentStatus: 'scheduled', targetStatus: 'final', isFinalized: false, source: 'finalize' }));
  assert.ok(gameTransitionError({ currentStatus: 'final', targetStatus: 'final', isFinalized: true, source: 'finalize' }));

  // Admin generic edit can postpone/cancel/reschedule pre-game, but cannot bypass scoring lifecycle.
  assert.equal(gameTransitionError({ currentStatus: 'scheduled', targetStatus: 'postponed', isFinalized: false, source: 'admin' }), null);
  assert.equal(gameTransitionError({ currentStatus: 'postponed', targetStatus: 'cancelled', isFinalized: false, source: 'admin' }), null);
  assert.ok(gameTransitionError({ currentStatus: 'scheduled', targetStatus: 'final', isFinalized: false, source: 'admin' }));
  assert.ok(gameTransitionError({ currentStatus: 'live', targetStatus: 'final', isFinalized: false, source: 'admin' }));
  assert.ok(gameTransitionError({ currentStatus: 'live', targetStatus: 'scheduled', isFinalized: false, source: 'admin' }));
  assert.ok(gameTransitionError({ currentStatus: 'final', targetStatus: 'live', isFinalized: true, source: 'admin' }));
});
