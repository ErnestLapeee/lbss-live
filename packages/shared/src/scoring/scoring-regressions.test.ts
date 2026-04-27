import {
  aggregateBattingCountSplits,
  aggregatePitchingStatsByPitcher,
  isAtBatEvent,
  isBetweenPitchEvent,
  isPlateAppearanceEvent,
} from '../index.js';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const pitcherLines = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'advance_on_error',
    inning: 1,
    half: 'top',
    pitcherId: 42,
    runsScored: 2,
    outsRecorded: 0,
    runnerScoredReasons: ['advance_on_error', 'advance_on_error'],
  },
]);
const pitcherLine = pitcherLines.get(42);
assert(pitcherLine?.runsAllowed === 2, 'advance_on_error should charge pitcher runs allowed');
assert(pitcherLine?.earnedRuns === 0, 'advance_on_error runs should remain unearned');

assert(isPlateAppearanceEvent('catcher_interference'), 'catcher_interference should be a PA');
assert(!isAtBatEvent('catcher_interference'), 'catcher_interference should not be an AB');
assert(isBetweenPitchEvent('advance_on_error'), 'advance_on_error should preserve the current count');

const countSplits = aggregateBattingCountSplits([
  { eventNumber: 1, gameId: 1, eventType: 'pitch', eventDetail: 'called_strike', balls: 0, strikes: 0 },
  { eventNumber: 2, gameId: 1, eventType: 'single', balls: 0, strikes: 1 },
  { eventNumber: 3, gameId: 1, eventType: 'pitch', eventDetail: 'ball', balls: 0, strikes: 0 },
  { eventNumber: 4, gameId: 1, eventType: 'advance_on_error', balls: 1, strikes: 0 },
  { eventNumber: 5, gameId: 1, eventType: 'walk', balls: 3, strikes: 0 },
]);

assert(countSplits.firstPitch.total === 2, 'first-pitch totals should count both PAs');
assert(countSplits.firstPitch.strikes === 1, 'called strike should count as first-pitch strike');
assert(countSplits.counts.find((line) => line.count === '0-1')?.hits === 1, '0-1 single should land in the 0-1 split');
assert(countSplits.counts.find((line) => line.count === '3-0')?.walks === 1, 'between-pitch events should not reset count before the walk');
