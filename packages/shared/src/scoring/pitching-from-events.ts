/**
 * Single source of truth for pitcher R/ER and related counts from raw game events.
 * Mirrors packages/api/src/services/finalize-game.ts (per-pitcher loop + inning cutoffs).
 */

import {
  BASE_ON_BALLS_EVENTS,
  HIT_EVENTS as SHARED_HIT_EVENTS,
  STRIKEOUT_EVENTS as SHARED_STRIKEOUT_EVENTS,
  isPlateAppearanceEvent,
} from '../constants/event-types.js';

const HIT_EVENTS = new Set<string>(SHARED_HIT_EVENTS);

const STRIKEOUT_LOOKING = new Set(['strikeout_looking', 'caught_foul_tip', 'bunt_foul']);
const STRIKEOUT_SWINGING = new Set(['strikeout_swinging', 'dropped_third_strike', 'dropped_third_strike_out', 'wild_pitch_third_strike']);
const STRIKEOUT_EVENTS = new Set<string>(SHARED_STRIKEOUT_EVENTS);
const WALK_EVENTS = new Set<string>(BASE_ON_BALLS_EVENTS);

const GROUND_BALL_OUTS = new Set(['ground_out', 'bunt_out']);
const FLY_BALL_OUTS = new Set(['fly_out', 'line_out', 'pop_out', 'infield_fly', 'foul_out']);

/**
 * Per-run reasons that mark the run as unearned (scorer / rulebook tags).
 * Note: `wild_pitch` and `balk` are not listed here — MLB Rule 9.16 does not make those runs
 * automatically unearned; earned vs unearned follows reconstruction, which we do not model in full.
 */
const UNEARNED_REASONS = new Set([
  'passed_ball',
  'advance_on_error',
  'error',
  'defensive_indifference',
  'obstruction',
  'catcher_obstruction',
  'catcher_interference',
]);

const ERROR_EVENT_TYPES = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

/**
 * Between-pitch events where a scored run with no `runnerScoredReasons` is treated as unearned.
 * WP/balk omitted — same as UNEARNED_REASONS note (not automatic unearned in MLB).
 */
const NON_PA_UNEARNED_WITHOUT_REASONS = new Set([
  'passed_ball',
  'advance_on_error',
  'defensive_indifference',
]);

/**
 * Earned runs credited on one event. When reasons are missing, at most one unearned run per
 * `errorsOnPlay` is assumed (avoids negative ER when errors > runs).
 */
function earnedRunsFromPlay(
  runsScored: number,
  runnerScoredReasons: string[] | null | undefined,
  errorsOnPlay: number | null | undefined,
  ctx: { isPlateAppearance: boolean; eventType: string },
): number {
  if (runsScored <= 0) return 0;
  const reasons = runnerScoredReasons || [];
  if (reasons.length > 0) {
    let earned = 0;
    for (let i = 0; i < runsScored; i++) {
      const reason = reasons[i] || 'on_play';
      if (!UNEARNED_REASONS.has(reason)) earned++;
    }
    return earned;
  }

  if (!ctx.isPlateAppearance && NON_PA_UNEARNED_WITHOUT_REASONS.has(ctx.eventType)) return 0;

  const errs = errorsOnPlay ?? 0;
  return Math.max(0, runsScored - Math.min(runsScored, errs));
}

export interface PitchingEventInput {
  eventNumber: number;
  eventType: string;
  inning: number;
  half: string;
  pitcherId?: number | null;
  runsScored?: number | null;
  outsRecorded?: number | null;
  runnerScoredReasons?: string[] | null;
  errorsOnPlay?: number | null;
  eventDetail?: string | null;
  hitType?: string | null;
}

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
}

function buildInningCutoffMap(events: PitchingEventInput[]): Map<string, number> {
  const inningCutoffEventNumber = new Map<string, number>();
  const byHalfInning = new Map<string, PitchingEventInput[]>();
  for (const e of events) {
    if (e.eventType === 'pitch') continue;
    const key = `${e.inning}:${e.half}`;
    const arr = byHalfInning.get(key) || [];
    arr.push(e);
    byHalfInning.set(key, arr);
  }

  for (const [key, evts] of byHalfInning) {
    evts.sort((a, b) => (a.eventNumber ?? 0) - (b.eventNumber ?? 0));
    let outsSim = 0;
    let cutoff: number | null = null;
    for (const e of evts) {
      if (cutoff != null) break;
      const outsRecorded = e.outsRecorded ?? 0;
      const extraOut = ERROR_EVENT_TYPES.has(e.eventType) ? 1 : 0;
      outsSim += outsRecorded + extraOut;
      if (outsSim >= 3) cutoff = e.eventNumber ?? null;
    }
    if (cutoff != null) inningCutoffEventNumber.set(key, cutoff);
  }
  return inningCutoffEventNumber;
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
  };
}

/**
 * Aggregate pitching stats per pitcher from chronological events (same rules as finalizeGame).
 */
export function aggregatePitchingStatsByPitcher(events: PitchingEventInput[]): Map<number, PitchingAggregate> {
  const inningCutoffEventNumber = buildInningCutoffMap(events);
  const eventsByPitcher = new Map<number, PitchingEventInput[]>();
  for (const e of events) {
    if (e.pitcherId == null || e.pitcherId === 0) continue;
    const pitcherEvents = eventsByPitcher.get(e.pitcherId);
    if (pitcherEvents) {
      pitcherEvents.push(e);
    } else {
      eventsByPitcher.set(e.pitcherId, [e]);
    }
  }
  const out = new Map<number, PitchingAggregate>();

  for (const [pitcherId, pitcherEvents] of eventsByPitcher) {
    const a = emptyAgg();

    let currentPaFirstPitchStrike: boolean | null = null;

    for (const e of pitcherEvents) {
      const t = e.eventType;

      if (t === 'pitch') {
        a.pitchesThrown++;
        const detail = String(e.eventDetail || '').toLowerCase();
        if (detail === 'ball') a.balls++;
        else a.strikes++;
        if (currentPaFirstPitchStrike == null) {
          currentPaFirstPitchStrike = detail !== 'ball';
        }
        continue;
      }

      if (!isPlateAppearanceEvent(t)) {
        if (t === 'balk') a.balks++;
        if (t === 'wild_pitch') a.wildPitches++;
        a.outsRecorded += e.outsRecorded ?? 0;
        const runs = e.runsScored ?? 0;
        a.runsAllowed += runs;
        a.earnedRuns += earnedRunsFromPlay(runs, e.runnerScoredReasons, e.errorsOnPlay, {
          isPlateAppearance: false,
          eventType: t,
        });
        continue;
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
      currentPaFirstPitchStrike = null;

      a.outsRecorded += e.outsRecorded ?? 0;

      const runsScoredOnPlay = e.runsScored ?? 0;
      a.runsAllowed += runsScoredOnPlay;

      let inningExtended = false;
      const hk = `${e.inning}:${e.half}`;
      const cutoff = inningCutoffEventNumber.get(hk);
      if (cutoff != null && (e.eventNumber ?? 0) > cutoff) inningExtended = true;

      if (inningExtended || ERROR_EVENT_TYPES.has(t)) {
        // unearned — runs already in runsAllowed
      } else {
        a.earnedRuns += earnedRunsFromPlay(
          runsScoredOnPlay,
          e.runnerScoredReasons as string[] | null,
          e.errorsOnPlay,
          { isPlateAppearance: true, eventType: t },
        );
      }

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
    }

    out.set(pitcherId, a);
  }

  return out;
}

/** Baseball IP from outs (7.1 = 7⅓). */
export function inningsFromOuts(outs: number): number {
  const fullInnings = Math.floor(outs / 3);
  const partialOuts = outs % 3;
  return fullInnings + partialOuts * 0.1;
}
