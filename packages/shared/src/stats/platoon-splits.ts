/**
 * Platoon / handedness splits from plate-appearance events.
 * Mirrors packages/api/src/services/finalize-game.ts batting PA classification.
 */

const HIT_EVENTS = new Set([
  'single',
  'bunt_single',
  'double',
  'ground_rule_double',
  'triple',
  'home_run',
  'inside_park_hr',
]);

const STRIKEOUT_EVENTS = new Set([
  'strikeout',
  'strikeout_swinging',
  'strikeout_looking',
  'caught_foul_tip',
  'bunt_foul',
  'dropped_third_strike',
  'dropped_third_strike_out',
  'wild_pitch_third_strike',
]);

const WALK_EVENTS = new Set(['walk', 'intentional_walk']);

const SACRIFICE_FLY_EVENTS = new Set(['sacrifice_fly', 'sac_fly_error']);
const SACRIFICE_BUNT_EVENTS = new Set(['sacrifice_bunt', 'sac_bunt_error']);

const NON_PA_EVENTS = new Set([
  'pitch',
  'stolen_base',
  'caught_stealing',
  'picked_off',
  'balk',
  'illegal_pitch',
  'wild_pitch',
  'passed_ball',
  'end_half_inning',
  'advance',
  'defensive_indifference',
  'runner_interference',
  'appeal_play',
  'tagged_out',
  'force_out',
  'hit_by_ball',
  'missed_base',
  'left_base_early',
  'left_base_path',
  'offensive_interference',
  'passed_runner',
  'hesitation',
  'double_play',
  'triple_play',
  'advance_on_error',
  'adjust_score',
  'substitution',
]);

function isPlateAppearance(t: string): boolean {
  return !NON_PA_EVENTS.has(t);
}

function isAtBat(t: string): boolean {
  if (!isPlateAppearance(t)) return false;
  if (WALK_EVENTS.has(t)) return false;
  if (t === 'hit_by_pitch') return false;
  if (t === 'catcher_obstruction') return false;
  if (SACRIFICE_FLY_EVENTS.has(t)) return false;
  if (SACRIFICE_BUNT_EVENTS.has(t)) return false;
  return true;
}

export type BattingPlatoonBucket = 'vsRhp' | 'vsLhp';
export type PitchingPlatoonBucket = 'vsRhb' | 'vsLhb';

/** Raw PA row from game_events (batting perspective: this player is the batter). */
export interface PlatoonBattingEventRow {
  eventType: string;
  rbi?: number | null;
  outsRecorded?: number | null;
  hitType?: string | null;
  eventNumber?: number | null;
  /** Opposing pitcher's throws (R/L/S/…); null if unknown */
  pitcherThrows?: string | null;
}

/** Raw PA row (pitching perspective: this player is the pitcher). */
export interface PlatoonPitchingEventRow {
  eventType: string;
  rbi?: number | null;
  outsRecorded?: number | null;
  hitType?: string | null;
  eventNumber?: number | null;
  /** Batter's bats (R/L/S/…); null if unknown */
  batterBats?: string | null;
}

export interface PlatoonBattingLine {
  plateAppearances: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  walks: number;
  intentionalWalks: number;
  strikeouts: number;
  hitByPitch: number;
  sacrificeFlies: number;
  sacrificeBunts: number;
  rbi: number;
  battingAvg: number | null;
  onBasePct: number | null;
  sluggingPct: number | null;
  ops: number | null;
}

function emptyLine(): PlatoonBattingLine {
  return {
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    walks: 0,
    intentionalWalks: 0,
    strikeouts: 0,
    hitByPitch: 0,
    sacrificeFlies: 0,
    sacrificeBunts: 0,
    rbi: 0,
    battingAvg: null,
    onBasePct: null,
    sluggingPct: null,
    ops: null,
  };
}

function finalizeLine(line: PlatoonBattingLine): PlatoonBattingLine {
  const ab = line.atBats;
  const h = line.hits;
  const bb = line.walks;
  const hbp = line.hitByPitch;
  const sf = line.sacrificeFlies;
  const singles = Math.max(0, h - line.doubles - line.triples - line.homeRuns);
  const tb = singles + 2 * line.doubles + 3 * line.triples + 4 * line.homeRuns;
  const obDenom = ab + bb + hbp + sf;
  const obp = obDenom > 0 ? (h + bb + hbp) / obDenom : null;
  const slg = ab > 0 ? tb / ab : null;
  const avg = ab > 0 ? h / ab : null;
  const ops = obp != null && slg != null ? obp + slg : null;
  return {
    ...line,
    battingAvg: avg,
    onBasePct: obp,
    sluggingPct: slg,
    ops,
  };
}

function applyPaToLine(line: PlatoonBattingLine, e: PlatoonBattingEventRow | PlatoonPitchingEventRow): void {
  const t = e.eventType;
  if (!isPlateAppearance(t)) return;

  line.plateAppearances++;
  if (isAtBat(t)) line.atBats++;
  line.rbi += e.rbi ?? 0;

  if (HIT_EVENTS.has(t)) {
    line.hits++;
    if (t === 'double' || t === 'ground_rule_double') line.doubles++;
    else if (t === 'triple') line.triples++;
    else if (t === 'home_run' || t === 'inside_park_hr') line.homeRuns++;
  }

  if (STRIKEOUT_EVENTS.has(t)) line.strikeouts++;
  if (WALK_EVENTS.has(t)) line.walks++;
  if (t === 'intentional_walk') line.intentionalWalks++;
  if (t === 'hit_by_pitch') line.hitByPitch++;
  if (SACRIFICE_FLY_EVENTS.has(t)) line.sacrificeFlies++;
  if (SACRIFICE_BUNT_EVENTS.has(t)) line.sacrificeBunts++;
}

/** R vs L only; switch / missing / other → excluded from splits. */
export function battingBucketFromPitcherThrows(
  raw: string | null | undefined,
): BattingPlatoonBucket | null {
  const c = (raw ?? '').trim().charAt(0).toUpperCase();
  if (c === 'R') return 'vsRhp';
  if (c === 'L') return 'vsLhp';
  return null;
}

/** R vs L only; switch / missing / other → excluded from splits. */
export function pitchingBucketFromBatterBats(
  raw: string | null | undefined,
): PitchingPlatoonBucket | null {
  const c = (raw ?? '').trim().charAt(0).toUpperCase();
  if (c === 'R') return 'vsRhb';
  if (c === 'L') return 'vsLhb';
  return null;
}

function accumulateBatting(rows: (PlatoonBattingEventRow | PlatoonPitchingEventRow)[]): PlatoonBattingLine {
  const acc = emptyLine();
  for (const e of rows) {
    const t = e.eventType;
    if (!isPlateAppearance(t)) continue;
    applyPaToLine(acc, e);
  }
  return finalizeLine(acc);
}

/**
 * Aggregate batting platoon splits (this player batting vs RHP/LHP).
 */
export function aggregateBattingPlatoon(rows: PlatoonBattingEventRow[]): Record<BattingPlatoonBucket, PlatoonBattingLine> {
  const buckets: Record<BattingPlatoonBucket, PlatoonBattingEventRow[]> = {
    vsRhp: [],
    vsLhp: [],
  };
  for (const r of rows) {
    if (!isPlateAppearance(r.eventType)) continue;
    const b = battingBucketFromPitcherThrows(r.pitcherThrows);
    if (b) buckets[b].push(r);
  }
  return {
    vsRhp: accumulateBatting(buckets.vsRhp),
    vsLhp: accumulateBatting(buckets.vsLhp),
  };
}

/**
 * Aggregate opponent batting lines by batter handedness (this player pitching).
 * Interprets the same PA stat rules from the batter’s perspective → “against” slash lines.
 */
export function aggregatePitchingPlatoon(rows: PlatoonPitchingEventRow[]): Record<PitchingPlatoonBucket, PlatoonBattingLine> {
  const buckets: Record<PitchingPlatoonBucket, PlatoonPitchingEventRow[]> = {
    vsRhb: [],
    vsLhb: [],
  };
  for (const r of rows) {
    if (!isPlateAppearance(r.eventType)) continue;
    const b = pitchingBucketFromBatterBats(r.batterBats);
    if (b) buckets[b].push(r);
  }
  return {
    vsRhb: accumulateBatting(buckets.vsRhb),
    vsLhb: accumulateBatting(buckets.vsLhb),
  };
}
