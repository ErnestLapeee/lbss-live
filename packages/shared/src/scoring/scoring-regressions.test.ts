import {
  aggregateBattingCountSplits,
  aggregatePitchingStatsByPitcher,
  computePlayerGameBattingLinesFromEvents,
  isAtBatEvent,
  isBetweenPitchEvent,
  isPlateAppearanceEvent,
  pickoffCreditPlayerId,
  remapBasesForSubstitutionDetail,
} from '../index.js';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const prBases = remapBasesForSubstitutionDetail(
  { first: 10, second: 20, third: null },
  JSON.stringify({ kind: 'player_change', outPlayerId: 20, inPlayerId: 55 }),
);
assert(prBases.first === 10 && prBases.second === 55 && prBases.third == null, 'substitution should remap occupied bases for pinch runner');

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
assert(isBetweenPitchEvent('place_runner_second'), 'place_runner_second should preserve the current count');

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
assert(countSplits.reachedCounts.find((line) => line.count === '0-0')?.plateAppearances === 2, '0-0 reached count should include all PAs');
assert(countSplits.reachedCounts.find((line) => line.count === '1-0')?.walks === 1, 'walk should count as the final result after reaching 1-0');
assert(countSplits.reachedCounts.find((line) => line.count === '3-0')?.walks === 1, 'walk should count as the final result after reaching 3-0');

// ── Pitching ER parity (non-PA wild pitch vs PA reasons; errorsOnPlay cap) ──
const wpBetween = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'wild_pitch',
    inning: 1,
    half: 'top',
    pitcherId: 7,
    runsScored: 1,
    outsRecorded: 0,
    runnerScoredReasons: null,
    errorsOnPlay: 0,
  },
]);
assert(wpBetween.get(7)?.runsAllowed === 1, 'WP should charge RA');
assert(wpBetween.get(7)?.earnedRuns === 1, 'WP run without reasons defaults to earned (no full 9.16 reconstruction)');

const paTwoRunsOneErr = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 8,
    runsScored: 2,
    outsRecorded: 0,
    runnerScoredReasons: null,
    errorsOnPlay: 1,
  },
]);
assert(paTwoRunsOneErr.get(8)?.earnedRuns === 1, 'two runs one error no reasons should credit one ER');

const oneRunTwoErrors = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 9,
    runsScored: 1,
    outsRecorded: 0,
    runnerScoredReasons: null,
    errorsOnPlay: 2,
  },
]);
assert(oneRunTwoErrors.get(9)?.earnedRuns === 0, 'errors cannot exceed runs when inferring ER');

const wpWithReasons = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'wild_pitch',
    inning: 2,
    half: 'top',
    pitcherId: 10,
    runsScored: 1,
    outsRecorded: 0,
    runnerScoredReasons: ['wild_pitch'],
    errorsOnPlay: 0,
  },
]);
assert(wpWithReasons.get(10)?.earnedRuns === 1, 'wild_pitch in runnerScoredReasons is descriptive, not automatic unearned');

const pbBetween = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'passed_ball',
    inning: 1,
    half: 'top',
    pitcherId: 11,
    runsScored: 1,
    outsRecorded: 0,
    runnerScoredReasons: null,
    errorsOnPlay: 0,
  },
]);
assert(pbBetween.get(11)?.earnedRuns === 0, 'passed_ball without reasons stays unearned (catcher responsibility convention)');

// Rule 9.16 — runs scoring after clean third out (extra chances / inning reconstruction)
const extendedInning = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'strikeout',
    inning: 1,
    half: 'top',
    pitcherId: 50,
    runsScored: 0,
    outsRecorded: 1,
    runnerScoredReasons: null,
    errorsOnPlay: 0,
  },
  {
    eventNumber: 2,
    eventType: 'strikeout',
    inning: 1,
    half: 'top',
    pitcherId: 50,
    runsScored: 0,
    outsRecorded: 1,
    runnerScoredReasons: null,
    errorsOnPlay: 0,
  },
  {
    eventNumber: 3,
    eventType: 'strikeout',
    inning: 1,
    half: 'top',
    pitcherId: 50,
    runsScored: 0,
    outsRecorded: 1,
    runnerScoredReasons: null,
    errorsOnPlay: 0,
  },
  {
    eventNumber: 4,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 50,
    runsScored: 1,
    outsRecorded: 0,
    runnerScoredReasons: null,
    errorsOnPlay: 0,
  },
]);
assert(extendedInning.get(50)?.earnedRuns === 0, 'run scoring after third reconstructed out should be unearned');

assert(isPlateAppearanceEvent('sacrifice_fly') && !isAtBatEvent('sacrifice_fly'), 'a clean sacrifice fly is a plate appearance and not an at-bat');
assert(isPlateAppearanceEvent('sacrifice_bunt') && !isAtBatEvent('sacrifice_bunt'), 'a clean sacrifice bunt is a plate appearance and not an at-bat');
assert(isPlateAppearanceEvent('sac_fly_error') && !isAtBatEvent('sac_fly_error'), 'a sacrifice fly with an error is not an at-bat');
assert(isPlateAppearanceEvent('sac_bunt_error') && !isAtBatEvent('sac_bunt_error'), 'a sacrifice bunt with an error is not an at-bat');
assert(isAtBatEvent('error') && isPlateAppearanceEvent('error'), 'reached on error stays an at-bat');

const sacLines = computePlayerGameBattingLinesFromEvents({
  events: [
    { id: 1, eventNumber: 1, eventType: 'sac_fly_error', half: 'top', batterId: 11, rbi: 1, outsRecorded: 1 },
    { id: 2, eventNumber: 2, eventType: 'sac_bunt_error', half: 'top', batterId: 11, rbi: 0, outsRecorded: 0 },
    { id: 3, eventNumber: 3, eventType: 'sacrifice_fly', half: 'top', batterId: 11, rbi: 1, outsRecorded: 1 },
    { id: 4, eventNumber: 4, eventType: 'error', half: 'top', batterId: 11, rbi: 0, outsRecorded: 0 },
    { id: 5, eventNumber: 5, eventType: 'picked_off', half: 'top', batterId: 11, outsRecorded: 1 },
  ],
  homeTeamId: 1,
  awayTeamId: 2,
  playerTeamMap: new Map([[11, 2]]),
});
const sac = sacLines.get(11);
assert(sac?.plateAppearances === 4, 'sacrifice-with-error plays stay plate appearances');
assert(sac?.atBats === 1, 'only the reached-on-error play is an at-bat');
assert(sac?.sacrificeFlies === 2, 'clean and error sacrifice flies both count as sacrifice flies');
assert(sac?.sacrificeBunts === 1, 'a sacrifice bunt with an error still counts as a sacrifice bunt');
assert(sac?.reachedOnError === 1, 'a sacrifice error is not reached on error');
assert(sac?.pickedOff === 1, 'the runner still gets a batting pickoff');

const positions = new Map<number, number>([[1, 101], [2, 102], [3, 103]]);
assert(
  pickoffCreditPlayerId({ fieldingSequence: '1-3', positionToPlayer: positions, assistFielderIds: [101], putoutFielderIds: [103] }) === 101,
  'a 1-3 pickoff credits the pitcher',
);
assert(
  pickoffCreditPlayerId({ fieldingSequence: '2-3', positionToPlayer: positions, assistFielderIds: [102], putoutFielderIds: [103] }) === 102,
  'a 2-3 snap throw credits the catcher, not the pitcher',
);
assert(
  pickoffCreditPlayerId({ assistFielderIds: [102], putoutFielderIds: [103] }) === 102,
  'without a sequence the first assist gets the pickoff',
);
assert(pickoffCreditPlayerId({ putoutFielderIds: [] }) == null, 'a pickoff with no fielder does not invent a pitcher credit');
