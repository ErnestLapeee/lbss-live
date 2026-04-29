/**
 * Single source of truth for pitcher R/ER and related counts from raw game events.
 * Earned runs follow Rule 9.16 via `computeEarnedRunsByEventNumber` (shared reconstruction).
 */

import {
  BASE_ON_BALLS_EVENTS,
  HIT_EVENTS as SHARED_HIT_EVENTS,
  STRIKEOUT_EVENTS as SHARED_STRIKEOUT_EVENTS,
  isPlateAppearanceEvent,
} from '../constants/event-types.js';
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
  runsScored?: number | null;
  outsRecorded?: number | null;
  runnerScoredReasons?: string[] | null;
  errorsOnPlay?: number | null;
  eventDetail?: string | null;
  hitType?: string | null;
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
  const earnedByEvent = computeEarnedRunsByEventNumber(events);
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
        a.earnedRuns += earnedByEvent.get(e.eventNumber) ?? 0;
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

      a.earnedRuns += earnedByEvent.get(e.eventNumber) ?? 0;

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
