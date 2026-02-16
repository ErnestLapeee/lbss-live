import type { GameEvent } from '../types/game-event.js';

export interface GameState {
  inning: number;
  half: 'top' | 'bot';
  outs: number;
  homeScore: number;
  awayScore: number;
  bases: {
    first: number | null;
    second: number | null;
    third: number | null;
  };
  homeLineScore: number[];
  awayLineScore: number[];
  eventCount: number;
}

export function initialGameState(): GameState {
  return {
    inning: 1,
    half: 'top',
    outs: 0,
    homeScore: 0,
    awayScore: 0,
    bases: { first: null, second: null, third: null },
    homeLineScore: [0],
    awayLineScore: [],
    eventCount: 0,
  };
}

export function applyEvent(state: GameState, event: GameEvent): GameState {
  // Clone state
  const next = {
    ...state,
    bases: { ...state.bases },
    homeLineScore: [...state.homeLineScore],
    awayLineScore: [...state.awayLineScore],
  };

  // Track runs scored on this play
  const runs = event.runsScored || 0;

  // Update score based on which half
  if (event.half === 'top') {
    next.awayScore += runs;
    // Update line score for the correct inning
    while (next.awayLineScore.length < event.inning) {
      next.awayLineScore.push(0);
    }
    next.awayLineScore[event.inning - 1] += runs;
  } else {
    next.homeScore += runs;
    while (next.homeLineScore.length < event.inning) {
      next.homeLineScore.push(0);
    }
    next.homeLineScore[event.inning - 1] += runs;
  }

  // Update outs
  next.outs = state.outs + (event.outsRecorded || 0);

  // Update bases after the play
  next.bases = {
    first: event.runnerFirstId ?? null,
    second: event.runnerSecondId ?? null,
    third: event.runnerThirdId ?? null,
  };

  // Check for half-inning change (3 outs)
  if (next.outs >= 3) {
    next.outs = 0;
    next.bases = { first: null, second: null, third: null };
    if (event.half === 'top') {
      next.half = 'bot';
      // Ensure homeLineScore has entry for this inning
      while (next.homeLineScore.length < event.inning) {
        next.homeLineScore.push(0);
      }
    } else {
      next.half = 'top';
      next.inning = event.inning + 1;
      // Ensure awayLineScore has entry for next inning
      while (next.awayLineScore.length < event.inning + 1) {
        next.awayLineScore.push(0);
      }
      while (next.homeLineScore.length < event.inning + 1) {
        next.homeLineScore.push(0);
      }
    }
  } else {
    next.inning = event.inning;
    next.half = event.half;
  }

  next.eventCount = state.eventCount + 1;

  return next;
}

export function reduceGameState(events: GameEvent[]): GameState {
  return events
    .filter((e) => !e.isDeleted)
    .sort((a, b) => a.eventNumber - b.eventNumber)
    .reduce(applyEvent, initialGameState());
}
