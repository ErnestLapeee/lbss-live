/**
 * Earned run allocation aligned with MLB Official Baseball Rules (Rule 9.16).
 *
 * Strategy:
 * 1. When `runnerScoredReasons` has one entry per run scored on the play, trust per-run
 *    tagging (earned unless reason is in the unearned set).
 * 2. Otherwise infer using errorsOnPlay and event type, and the inning-reconstruction
 *    cutoff: plays strictly after the point where the defense would have recorded three outs
 *    absent prolonging errors score no earned runs.
 *
 * This replaces simpler heuristics while staying compatible with existing event fields.
 */

import { isPlateAppearanceEvent } from '../constants/event-types.js';

const ERROR_EVENT_TYPES = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

/** Per-run reasons that mark the run as unearned (scorer tags). */
const UNEARNED_REASONS = new Set([
  'passed_ball',
  'advance_on_error',
  'error',
  'defensive_indifference',
  'obstruction',
  'catcher_obstruction',
  'catcher_interference',
]);

const NON_PA_UNEARNED_WITHOUT_REASONS = new Set([
  'passed_ball',
  'advance_on_error',
  'defensive_indifference',
]);

export interface EventLike916 {
  eventNumber: number;
  inning: number;
  half: string;
  eventType: string;
  runsScored?: number | null;
  outsRecorded?: number | null;
  errorsOnPlay?: number | null;
  runnerScoredReasons?: string[] | null;
}

function earnedRunsFromPlayFallback(
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

/**
 * First event number in this half-inning at which reconstructed outs reach 3
 * (pitch / substitution events skipped). Used for “would the inning have ended?”
 */
function thirdOutCutoffEventNumber(hi: EventLike916[]): number | null {
  let outsSim = 0;
  const sorted = [...hi].sort((a, b) => a.eventNumber - b.eventNumber);
  for (const e of sorted) {
    if (e.eventType === 'pitch' || e.eventType === 'substitution') continue;

    let delta = (e.outsRecorded ?? 0) + (e.errorsOnPlay ?? 0);
    if (ERROR_EVENT_TYPES.has(e.eventType) && (e.errorsOnPlay ?? 0) === 0 && (e.outsRecorded ?? 0) === 0) {
      delta += 1;
    }
    outsSim += delta;
    if (outsSim >= 3) return e.eventNumber;
  }
  return null;
}

function earnedRunsOneEvent(
  e: EventLike916,
  cutoff: number | null,
): number {
  const runs = e.runsScored ?? 0;
  if (runs <= 0) return 0;

  const reasons = e.runnerScoredReasons || [];
  const isPa = isPlateAppearanceEvent(e.eventType);

  // Fully tagged — highest precision
  if (reasons.length === runs) {
    let earned = 0;
    for (let i = 0; i < runs; i++) {
      const reason = reasons[i] || 'on_play';
      if (!UNEARNED_REASONS.has(reason)) earned++;
    }
    // After reconstruction third out, no runs can be earned (inning over without the mistake chain).
    if (cutoff != null && e.eventNumber > cutoff) return 0;
    return earned;
  }

  // Inning would already be over in clean reconstruction before this play’s runs
  if (cutoff != null && e.eventNumber > cutoff) return 0;

  // Batter reached only on error — runs scored on this PA are unearned unless fully tagged above
  if (ERROR_EVENT_TYPES.has(e.eventType)) {
    return 0;
  }

  return earnedRunsFromPlayFallback(runs, reasons, e.errorsOnPlay, {
    isPlateAppearance: isPa,
    eventType: e.eventType,
  });
}

/**
 * Map eventNumber → earned runs charged on that event (0 if none).
 * Pass **all** game events in any order; events without runsScored get 0.
 */
export function computeEarnedRunsByEventNumber(events: EventLike916[]): Map<number, number> {
  const result = new Map<number, number>();
  const list = [...events].sort((a, b) => a.eventNumber - b.eventNumber);

  const byHalf = new Map<string, EventLike916[]>();
  for (const e of list) {
    const k = `${e.inning}:${e.half}`;
    const arr = byHalf.get(k);
    if (arr) arr.push(e);
    else byHalf.set(k, [e]);
  }

  for (const hi of byHalf.values()) {
    const cutoff = thirdOutCutoffEventNumber(hi);
    for (const e of hi) {
      result.set(e.eventNumber, earnedRunsOneEvent(e, cutoff));
    }
  }

  // Events never seen (shouldn’t happen)
  for (const e of list) {
    if (!result.has(e.eventNumber)) result.set(e.eventNumber, 0);
  }

  return result;
}
