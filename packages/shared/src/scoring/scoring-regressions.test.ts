import {
  aggregateBattingCountSplits,
  aggregatePitchingStatsByPitcher,
  applyEvent,
  computePlayerGameBattingLinesFromEvents,
  initialGameState,
  isAtBatEvent,
  isBetweenPitchEvent,
  isPlateAppearanceEvent,
  lineupRulesForSeason,
  pickoffCreditPlayerId,
  validateLineupEntries,
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

const adultRules = lineupRulesForSeason('adult', { fielders: 6 });
const youthRules = lineupRulesForSeason('youth', { fielders: 6, maxRunsPerInning: 5 });
assert(adultRules.maxBattingOrder === 10 && adultRules.youth === false, 'adult lineups stay capped at ten');
assert(youthRules.maxRunsPerInning == null && youthRules.maxFielders > 9, 'a Jaunieši game does not inherit a fielder count or run limit');
const eleven = Array.from({ length: 11 }, (_, i) => ({
  playerId: i + 1,
  battingOrder: i + 1,
  position: i < 9 ? i + 1 : 11 + (i - 9),
}));
assert(validateLineupEntries(eleven, youthRules) == null, 'a Jaunieši lineup can field more than nine and bat the rest');
assert(
  validateLineupEntries([{ playerId: 1, battingOrder: 1, position: null }], youthRules) == null,
  'a Jaunieši player can remain in the batting order without a defensive position',
);
assert(
  validateLineupEntries([{ playerId: 1, battingOrder: 1, position: 11.5 }], youthRules) != null,
  'a Jaunieši defensive position must be an integer',
);
assert(
  validateLineupEntries([{ playerId: 1, battingOrder: 11, position: 1 }], adultRules) != null,
  'adult batting order still stops at ten',
);
const ended = applyEvent(initialGameState(), {
  id: 1,
  gameId: 1,
  eventNumber: 1,
  eventType: 'end_half_inning',
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
  createdAt: '',
  createdBy: null,
});
assert(ended.half === 'bot' && ended.outs === 0 && ended.inning === 1, 'ending a half with no extra outs still flips the inning');

// ── Inherited runners (WBSC 18.4.1): charge the pitcher who allowed the runner to reach ──
const bases = (first: number | null, second: number | null = null, third: number | null = null) => ({
  runnerFirstId: first,
  runnerSecondId: second,
  runnerThirdId: third,
});

const inheritedScore = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'pitch',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    eventDetail: 'ball',
    ...bases(null),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 3,
    eventType: 'pitch',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 20,
    runsScored: 0,
    outsRecorded: 0,
    eventDetail: 'called_strike',
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 4,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 20,
    runsScored: 1,
    outsRecorded: 0,
    errorsOnPlay: 0,
    ...bases(20),
    runnersScored: [10],
  },
]);
assert(inheritedScore.get(1)?.runsAllowed === 1 && inheritedScore.get(1)?.earnedRuns === 1, 'the pitcher who walked the runner is charged the earned run');
assert(inheritedScore.get(1)?.inheritedRunners === 0 && inheritedScore.get(1)?.inheritedRunnersScored === 0, 'the starting pitcher does not inherit his own runner');
assert(inheritedScore.get(2)?.runsAllowed === 0 && inheritedScore.get(2)?.earnedRuns === 0, 'the reliever who allows an inherited runner to score is not charged the run');
assert(inheritedScore.get(2)?.inheritedRunners === 1 && inheritedScore.get(2)?.inheritedRunnersScored === 1, 'a reliever is charged IR and IRS when the inherited runner scores');
assert((inheritedScore.get(1)?.earnedRuns ?? 0) + (inheritedScore.get(2)?.earnedRuns ?? 0) === 1, 'moving the run keeps the same earned-run total');

const inheritedLeft = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'strikeout',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 20,
    runsScored: 0,
    outsRecorded: 1,
    ...bases(10),
    runnersScored: [],
  },
]);
assert(inheritedLeft.get(2)?.inheritedRunners === 1 && inheritedLeft.get(2)?.inheritedRunnersScored === 0, 'a runner left on base is inherited but not scored');
assert(inheritedLeft.get(1)?.runsAllowed === 0 && inheritedLeft.get(2)?.runsAllowed === 0, 'a runner who does not score charges no run');

const unearnedInherited = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'advance_on_error',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 10,
    runsScored: 1,
    outsRecorded: 0,
    ...bases(null),
    runnersScored: [10],
    runnerScoredReasons: ['advance_on_error'],
  },
]);
assert(unearnedInherited.get(1)?.runsAllowed === 1 && unearnedInherited.get(1)?.earnedRuns === 0, 'an unearned inherited run stays unearned when it moves to the responsible pitcher');
assert(unearnedInherited.get(2)?.runsAllowed === 0 && unearnedInherited.get(2)?.earnedRuns === 0 && unearnedInherited.get(2)?.inheritedRunnersScored === 1, 'the reliever keeps the IRS without the unearned run');

const fielderChoice = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'fielders_choice',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 20,
    runsScored: 0,
    outsRecorded: 1,
    hitType: 'grounder',
    ...bases(20),
    runnersScored: [],
  },
  {
    eventNumber: 3,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 30,
    runsScored: 1,
    outsRecorded: 0,
    errorsOnPlay: 0,
    ...bases(30),
    runnersScored: [20],
  },
]);
assert(fielderChoice.get(1)?.runsAllowed === 1 && fielderChoice.get(1)?.earnedRuns === 1, 'a fielder\'s choice transfers the inherited runner\'s run to the original pitcher');
assert(fielderChoice.get(2)?.runsAllowed === 0 && fielderChoice.get(2)?.earnedRuns === 0, 'the reliever is not charged for the transferred inherited runner');
assert(fielderChoice.get(2)?.inheritedRunners === 1 && fielderChoice.get(2)?.inheritedRunnersScored === 1, 'the batter-runner stays inherited after the fielder\'s choice');

const pinchRunner = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'substitution',
    inning: 1,
    half: 'top',
    pitcherId: null,
    batterId: null,
    runsScored: 0,
    outsRecorded: 0,
    eventDetail: JSON.stringify({ kind: 'player_change', outPlayerId: 10, inPlayerId: 55 }),
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 3,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 30,
    runsScored: 1,
    outsRecorded: 0,
    errorsOnPlay: 0,
    ...bases(30),
    runnersScored: [55],
  },
]);
assert(pinchRunner.get(1)?.runsAllowed === 1 && pinchRunner.get(1)?.earnedRuns === 1, 'a pinch runner keeps the original runner\'s pitcher');
assert(pinchRunner.get(2)?.inheritedRunners === 1 && pinchRunner.get(2)?.inheritedRunnersScored === 1, 'the reliever inherits the pinch runner');
assert(pinchRunner.get(2)?.runsAllowed === 0, 'the pinch runner\'s run is not charged to the reliever');

const legacyInherited = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    runsScored: 0,
    outsRecorded: 0,
  },
  {
    eventNumber: 2,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    runsScored: 1,
    outsRecorded: 0,
    errorsOnPlay: 0,
  },
]);
assert(legacyInherited.get(2)?.runsAllowed === 1 && legacyInherited.get(2)?.earnedRuns === 1, 'events without base state still charge the run to the pitcher who threw it');
assert(legacyInherited.get(1)?.runsAllowed === 0, 'events without base state do not move the run back to the previous pitcher');
assert((legacyInherited.get(1)?.inheritedRunners ?? 0) === 0 && (legacyInherited.get(2)?.inheritedRunners ?? 0) === 0, 'events without base state do not invent inherited runners');
assert((legacyInherited.get(1)?.inheritedRunnersScored ?? 0) === 0 && (legacyInherited.get(2)?.inheritedRunnersScored ?? 0) === 0, 'events without base state do not invent inherited runners scored');

const historicalEmptyBases = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(null),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    runsScored: 1,
    outsRecorded: 0,
    errorsOnPlay: 0,
    ...bases(null),
    runnersScored: [],
  },
]);
assert(historicalEmptyBases.get(2)?.runsAllowed === 1 && historicalEmptyBases.get(1)?.runsAllowed === 0, 'a run with no scored runner ids stays on the event pitcher');
assert((historicalEmptyBases.get(2)?.inheritedRunners ?? 0) === 0, 'null bases with an unidentified run are not inherited runners');

const sharedEarnedRun = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'home_run',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 20,
    runsScored: 2,
    outsRecorded: 0,
    errorsOnPlay: 0,
    ...bases(null),
    runnersScored: [10, 20],
  },
]);
assert(sharedEarnedRun.get(1)?.runsAllowed === 1 && sharedEarnedRun.get(1)?.earnedRuns === 1, 'only the inherited runner\'s earned run moves to the pitcher who walked him');
assert(sharedEarnedRun.get(2)?.runsAllowed === 1 && sharedEarnedRun.get(2)?.earnedRuns === 1, 'the reliever keeps the earned run scored by the batter he faced');
assert(sharedEarnedRun.get(2)?.inheritedRunners === 1 && sharedEarnedRun.get(2)?.inheritedRunnersScored === 1, 'the homered inherited runner still counts as IRS');

const choiceKeepsOtherRunner = aggregatePitchingStatsByPitcher([
  {
    eventNumber: 1,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 1,
    batterId: 10,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(10),
    runnersScored: [],
  },
  {
    eventNumber: 2,
    eventType: 'walk',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 20,
    runsScored: 0,
    outsRecorded: 0,
    ...bases(20, 10),
    runnersScored: [],
  },
  {
    eventNumber: 3,
    eventType: 'fielders_choice',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 30,
    runsScored: 0,
    outsRecorded: 1,
    ...bases(30, null, 10),
    runnersScored: [],
  },
  {
    eventNumber: 4,
    eventType: 'single',
    inning: 1,
    half: 'top',
    pitcherId: 2,
    batterId: 40,
    runsScored: 2,
    outsRecorded: 0,
    errorsOnPlay: 0,
    ...bases(40),
    runnersScored: [10, 30],
  },
]);
assert(choiceKeepsOtherRunner.get(1)?.runsAllowed === 1, 'the inherited runner who stays through a fielder\'s choice still belongs to the first pitcher');
assert(choiceKeepsOtherRunner.get(2)?.runsAllowed === 1, 'retiring the reliever\'s own runner does not transfer that responsibility onto the batter');
assert(choiceKeepsOtherRunner.get(2)?.inheritedRunners === 1 && choiceKeepsOtherRunner.get(2)?.inheritedRunnersScored === 1, 'only the runner on base at the pitching change is inherited');
