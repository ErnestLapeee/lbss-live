/**
 * Single source of truth for pitcher R/ER and related counts from raw game events.
 * Earned runs follow Rule 9.16 via `computeEarnedRunsByEventNumber` (shared reconstruction).
 *
 * When an event includes base/runner ids, a run is charged to the pitcher who allowed
 * that runner to reach (WBSC 18.4.1), and a reliever who entered with the runner on
 * base is credited with an inherited runner. Events that omit base/runner ids keep
 * charging every run to the pitcher who threw the pitch.
 */

import {
  BASE_ON_BALLS_EVENTS,
  HIT_EVENTS as SHARED_HIT_EVENTS,
  STRIKEOUT_EVENTS as SHARED_STRIKEOUT_EVENTS,
  isPlateAppearanceEvent,
} from '../constants/event-types.js';
import { remapBasesForSubstitutionDetail } from '../game-engine/remap-bases-for-substitution.js';
import { computeEarnedRunsByEventNumber } from './earned-runs-rule-916.js';

const HIT_EVENTS = new Set<string>(SHARED_HIT_EVENTS);

const STRIKEOUT_LOOKING = new Set(['strikeout_looking', 'caught_foul_tip', 'bunt_foul']);
const STRIKEOUT_SWINGING = new Set(['strikeout_swinging', 'dropped_third_strike', 'dropped_third_strike_out', 'wild_pitch_third_strike']);
const STRIKEOUT_EVENTS = new Set<string>(SHARED_STRIKEOUT_EVENTS);
const WALK_EVENTS = new Set<string>(BASE_ON_BALLS_EVENTS);

const GROUND_BALL_OUTS = new Set(['ground_out', 'bunt_out']);
const FLY_BALL_OUTS = new Set(['fly_out', 'line_out', 'pop_out', 'infield_fly', 'foul_out']);

export interface PitchingEventInput {
  eventNumber: number;
  eventType: string;
  inning: number;
  half: string;
  pitcherId?: number | null;
  batterId?: number | null;
  runsScored?: number | null;
  outsRecorded?: number | null;
  runnerScoredReasons?: string[] | null;
  errorsOnPlay?: number | null;
  eventDetail?: string | null;
  hitType?: string | null;
  /** Post-play base state. Omit (undefined) when the event has no recorded bases. */
  runnerFirstId?: number | null;
  runnerSecondId?: number | null;
  runnerThirdId?: number | null;
  /** Player ids of runners who scored on this play, same order as runnerScoredReasons. */
  runnersScored?: number[] | null;
}

/** Re-export for callers that need per-event ER (e.g. audits). */
export { computeEarnedRunsByEventNumber } from './earned-runs-rule-916.js';

/** Aggregated pitching line for one pitcher (same basis as finalize-game player_game_pitching). */
export interface PitchingAggregate {
  outsRecorded: number;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walksAllowed: number;
  strikeouts: number;
  homeRunsAllowed: number;
  hitBatters: number;
  wildPitches: number;
  pitchesThrown: number;
  balls: number;
  strikes: number;
  firstPitchStrikes: number;
  firstPitchTotal: number;
  battersFaced: number;
  balks: number;
  intentionalWalks: number;
  groundOuts: number;
  flyOuts: number;
  strikeoutsLooking: number;
  strikeoutsSwinging: number;
  inheritedRunners: number;
  inheritedRunnersScored: number;
}

function emptyAgg(): PitchingAggregate {
  return {
    outsRecorded: 0,
    hitsAllowed: 0,
    runsAllowed: 0,
    earnedRuns: 0,
    walksAllowed: 0,
    strikeouts: 0,
    homeRunsAllowed: 0,
    hitBatters: 0,
    wildPitches: 0,
    pitchesThrown: 0,
    balls: 0,
    strikes: 0,
    firstPitchStrikes: 0,
    firstPitchTotal: 0,
    battersFaced: 0,
    balks: 0,
    intentionalWalks: 0,
    groundOuts: 0,
    flyOuts: 0,
    strikeoutsLooking: 0,
    strikeoutsSwinging: 0,
    inheritedRunners: 0,
    inheritedRunnersScored: 0,
  };
}

/** Keep in sync with UNEARNED_REASONS in earned-runs-rule-916.ts. */
const UNEARNED_REASONS = new Set([
  'passed_ball',
  'advance_on_error',
  'error',
  'defensive_indifference',
  'obstruction',
  'catcher_obstruction',
  'catcher_interference',
]);

interface RunnerCharge {
  playerId: number;
  responsiblePitcherId: number;
  /** Relievers who entered with this runner (or a predecessor FC runner) on base. */
  inheritedBy: Set<number>;
}

interface BaseChargeState {
  first: RunnerCharge | null;
  second: RunnerCharge | null;
  third: RunnerCharge | null;
}

function emptyBases(): BaseChargeState {
  return { first: null, second: null, third: null };
}

function snapshotProvided(e: PitchingEventInput): boolean {
  return (
    e.runnerFirstId !== undefined
    || e.runnerSecondId !== undefined
    || e.runnerThirdId !== undefined
    || e.runnersScored !== undefined
  );
}

function scoredRunnerIds(e: PitchingEventInput): number[] {
  if (!Array.isArray(e.runnersScored)) return [];
  const ids: number[] = [];
  for (const raw of e.runnersScored) {
    const id = Number(raw);
    if (Number.isFinite(id) && id !== 0) ids.push(id);
  }
  return ids;
}

/**
 * Base/runner identity is usable when the caller passed it through and any runs
 * on the play name the runners who scored. A run total with an empty
 * `runnersScored` is a legacy event and stays on the throwing pitcher.
 */
function hasKnownBaseState(e: PitchingEventInput): boolean {
  if (!snapshotProvided(e)) return false;
  const runs = e.runsScored ?? 0;
  if (runs > 0 && scoredRunnerIds(e).length === 0) return false;
  return true;
}

function earnedFlagsForRuns(e: PitchingEventInput, totalEarned: number): boolean[] {
  const runs = Math.max(0, e.runsScored ?? 0);
  const flags = Array<boolean>(runs).fill(false);
  if (runs === 0 || totalEarned <= 0) return flags;
  if (totalEarned >= runs) {
    flags.fill(true);
    return flags;
  }

  const reasons = e.runnerScoredReasons ?? [];
  if (reasons.length > 0) {
    for (let i = 0; i < runs; i++) {
      const reason = reasons[i] || 'on_play';
      flags[i] = !UNEARNED_REASONS.has(reason);
    }
  } else {
    for (let i = 0; i < totalEarned; i++) flags[i] = true;
  }

  let sum = flags.reduce((n, flag) => n + (flag ? 1 : 0), 0);
  for (let i = runs - 1; i >= 0 && sum > totalEarned; i--) {
    if (flags[i]) {
      flags[i] = false;
      sum--;
    }
  }
  for (let i = 0; i < runs && sum < totalEarned; i++) {
    if (!flags[i]) {
      flags[i] = true;
      sum++;
    }
  }
  return flags;
}

function cloneRunner(runner: RunnerCharge, playerId = runner.playerId): RunnerCharge {
  return {
    playerId,
    responsiblePitcherId: runner.responsiblePitcherId,
    inheritedBy: new Set(runner.inheritedBy),
  };
}

function runnersOn(bases: BaseChargeState): RunnerCharge[] {
  return [bases.first, bases.second, bases.third].filter((runner): runner is RunnerCharge => runner != null);
}

function findRunner(bases: BaseChargeState, playerId: number): RunnerCharge | null {
  return runnersOn(bases).find((runner) => runner.playerId === playerId) ?? null;
}

function remapRunnersForSubstitution(bases: BaseChargeState, eventDetail: string | null | undefined): BaseChargeState {
  const ids = remapBasesForSubstitutionDetail(
    {
      first: bases.first?.playerId ?? null,
      second: bases.second?.playerId ?? null,
      third: bases.third?.playerId ?? null,
    },
    eventDetail,
  );
  const retarget = (runner: RunnerCharge | null, nextId: number | null): RunnerCharge | null => {
    if (nextId == null || runner == null) return null;
    return runner.playerId === nextId ? runner : cloneRunner(runner, nextId);
  };
  return {
    first: retarget(bases.first, ids.first),
    second: retarget(bases.second, ids.second),
    third: retarget(bases.third, ids.third),
  };
}

/** Lowest base first: the runner a fielder's choice most directly replaces. */
function inheritedRunnerRetiredOnFielderChoice(bases: BaseChargeState, e: PitchingEventInput): RunnerCharge | null {
  if (e.eventType !== 'fielders_choice' || e.batterId == null) return null;
  const postIds = new Set(
    [e.runnerFirstId, e.runnerSecondId, e.runnerThirdId].filter((id): id is number => id != null && id !== 0),
  );
  const scored = new Set(scoredRunnerIds(e));
  const batterReached = postIds.has(e.batterId) || scored.has(e.batterId);
  if (!batterReached || findRunner(bases, e.batterId)) return null;
  for (const runner of runnersOn(bases)) {
    if (postIds.has(runner.playerId) || scored.has(runner.playerId)) continue;
    if (runner.inheritedBy.size > 0) return runner;
  }
  return null;
}

function postBasesFromEvent(
  previous: BaseChargeState,
  e: PitchingEventInput,
  pitcherId: number,
): BaseChargeState {
  const transfer = inheritedRunnerRetiredOnFielderChoice(previous, e);
  const placed = (playerId: number | null | undefined): RunnerCharge | null => {
    if (playerId == null || playerId === 0) return null;
    const existing = findRunner(previous, playerId);
    if (existing) return cloneRunner(existing);
    if (transfer && e.batterId != null && playerId === e.batterId) return cloneRunner(transfer, playerId);
    return {
      playerId,
      responsiblePitcherId: pitcherId,
      inheritedBy: new Set(),
    };
  };
  return {
    first: placed(e.runnerFirstId),
    second: placed(e.runnerSecondId),
    third: placed(e.runnerThirdId),
  };
}

/**
 * Aggregate pitching stats per pitcher from chronological events (same rules as finalizeGame).
 * Runs and their earned-run share follow the pitcher responsible for the runner when base
 * state is present; otherwise they stay on `pitcherId`.
 */
export function aggregatePitchingStatsByPitcher(events: PitchingEventInput[]): Map<number, PitchingAggregate> {
  const earnedByEvent = computeEarnedRunsByEventNumber(events);
  const out = new Map<number, PitchingAggregate>();
  const firstPitchStrike = new Map<number, boolean | null>();

  const ensure = (pitcherId: number): PitchingAggregate => {
    const existing = out.get(pitcherId);
    if (existing) return existing;
    const created = emptyAgg();
    out.set(pitcherId, created);
    return created;
  };

  const addRuns = (pitcherId: number, runs: number, earned: number) => {
    if (pitcherId === 0 || (runs === 0 && earned === 0)) return;
    const line = ensure(pitcherId);
    line.runsAllowed += runs;
    line.earnedRuns += earned;
  };

  const chargeLegacy = (pitcherId: number, e: PitchingEventInput) => {
    addRuns(pitcherId, e.runsScored ?? 0, earnedByEvent.get(e.eventNumber) ?? 0);
  };

  const chargeByResponsibility = (pitcherId: number, e: PitchingEventInput, bases: BaseChargeState) => {
    const runs = e.runsScored ?? 0;
    if (runs <= 0) return;
    const flags = earnedFlagsForRuns(e, earnedByEvent.get(e.eventNumber) ?? 0);
    const scored = scoredRunnerIds(e);
    const transfer = inheritedRunnerRetiredOnFielderChoice(bases, e);
    for (let i = 0; i < runs; i++) {
      const runnerId = scored[i];
      let runner = runnerId != null ? findRunner(bases, runnerId) : null;
      if (!runner && transfer && e.batterId != null && runnerId === e.batterId) runner = transfer;
      const earned = flags[i] ? 1 : 0;
      if (runner && runner.responsiblePitcherId !== 0) {
        addRuns(runner.responsiblePitcherId, 1, earned);
        for (const relieverId of runner.inheritedBy) {
          ensure(relieverId).inheritedRunnersScored += 1;
        }
      } else {
        addRuns(pitcherId, 1, earned);
      }
    }
  };

  const noteEntrance = (pitcherId: number, bases: BaseChargeState, activePitcher: number | null): number => {
    if (activePitcher != null && pitcherId !== activePitcher) {
      for (const runner of runnersOn(bases)) {
        if (runner.inheritedBy.has(pitcherId)) continue;
        runner.inheritedBy.add(pitcherId);
        ensure(pitcherId).inheritedRunners += 1;
      }
    }
    return pitcherId;
  };

  const countNonRunStats = (pitcherId: number, e: PitchingEventInput) => {
    const a = ensure(pitcherId);
    const t = e.eventType;
    const currentPaFirstPitchStrike = firstPitchStrike.has(pitcherId) ? firstPitchStrike.get(pitcherId)! : null;

    if (t === 'pitch') {
      a.pitchesThrown++;
      const detail = String(e.eventDetail || '').toLowerCase();
      if (detail === 'ball') a.balls++;
      else a.strikes++;
      if (currentPaFirstPitchStrike == null) {
        firstPitchStrike.set(pitcherId, detail !== 'ball');
      }
      return;
    }

    if (!isPlateAppearanceEvent(t)) {
      if (t === 'balk') a.balks++;
      if (t === 'wild_pitch') a.wildPitches++;
      a.outsRecorded += e.outsRecorded ?? 0;
      return;
    }

    a.battersFaced++;
    a.pitchesThrown++;
    if (WALK_EVENTS.has(t) || t === 'hit_by_pitch' || t === 'catcher_obstruction' || t === 'catcher_interference') {
      a.balls++;
    } else {
      a.strikes++;
    }
    a.firstPitchTotal++;
    const inferredFirstPitchStrike = !(WALK_EVENTS.has(t) || t === 'hit_by_pitch' || t === 'catcher_obstruction' || t === 'catcher_interference');
    if ((currentPaFirstPitchStrike ?? inferredFirstPitchStrike) === true) a.firstPitchStrikes++;
    firstPitchStrike.set(pitcherId, null);

    a.outsRecorded += e.outsRecorded ?? 0;

    if (HIT_EVENTS.has(t)) a.hitsAllowed++;
    if (WALK_EVENTS.has(t)) a.walksAllowed++;
    if (t === 'intentional_walk') a.intentionalWalks++;
    if (STRIKEOUT_EVENTS.has(t)) {
      a.strikeouts++;
      if (STRIKEOUT_LOOKING.has(t)) a.strikeoutsLooking++;
      else if (STRIKEOUT_SWINGING.has(t)) a.strikeoutsSwinging++;
      else a.strikeoutsSwinging++;
    }
    if (t === 'home_run' || t === 'inside_park_hr') a.homeRunsAllowed++;
    if (t === 'hit_by_pitch') a.hitBatters++;

    if (GROUND_BALL_OUTS.has(t)) a.groundOuts++;
    if (FLY_BALL_OUTS.has(t)) a.flyOuts++;
    if (t === 'fielders_choice') {
      if (e.hitType === 'grounder') a.groundOuts++;
      else a.flyOuts++;
    }
  };

  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.eventNumber - b.event.eventNumber || a.index - b.index)
    .map((item) => item.event);

  let halfKey = '';
  let bases = emptyBases();
  let tracking = true;
  let activePitcher: number | null = null;
  let outs = 0;

  for (const e of sorted) {
    const key = `${e.inning}:${e.half}`;
    if (key !== halfKey) {
      halfKey = key;
      bases = emptyBases();
      tracking = true;
      activePitcher = null;
      outs = 0;
    }

    const pitcherId = e.pitcherId;
    const validPitcher = pitcherId != null && pitcherId !== 0;
    const known = hasKnownBaseState(e);

    if (e.eventType === 'substitution') {
      if (tracking) bases = remapRunnersForSubstitution(bases, e.eventDetail);
      if (validPitcher && tracking) activePitcher = noteEntrance(pitcherId, bases, activePitcher);
      if (validPitcher) {
        if (tracking && known) chargeByResponsibility(pitcherId, e, bases);
        else chargeLegacy(pitcherId, e);
        countNonRunStats(pitcherId, e);
      }
      continue;
    }

    if (validPitcher && tracking && known) {
      activePitcher = noteEntrance(pitcherId, bases, activePitcher);
    }

    if (validPitcher && e.eventType !== 'pitch') {
      if (tracking && known) chargeByResponsibility(pitcherId, e, bases);
      else chargeLegacy(pitcherId, e);
    }

    if (known && tracking) {
      bases = postBasesFromEvent(bases, e, validPitcher ? pitcherId : (activePitcher ?? 0));
    } else if (known && !tracking) {
      bases = postBasesFromEvent(emptyBases(), e, validPitcher ? pitcherId : 0);
      tracking = true;
      if (validPitcher) activePitcher = pitcherId;
    } else if (!known) {
      tracking = false;
      bases = emptyBases();
      activePitcher = null;
    }

    if (validPitcher) countNonRunStats(pitcherId, e);

    if (e.eventType !== 'pitch') {
      outs += e.outsRecorded ?? 0;
      if (outs >= 3 || e.eventType === 'end_half_inning') {
        bases = emptyBases();
        outs = 0;
      }
    }
  }

  return out;
}

/** Baseball IP from outs (7.1 = 7⅓). */
export function inningsFromOuts(outs: number): number {
  const fullInnings = Math.floor(outs / 3);
  const partialOuts = outs % 3;
  return fullInnings + partialOuts * 0.1;
}
