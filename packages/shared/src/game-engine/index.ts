import type { BattingStats, GameEvent } from '../types/index.js';
import {
  HIT_EVENTS,
  WALK_EVENTS,
  SACRIFICE_EVENTS,
  AT_BAT_EVENTS,
  PLATE_APPEARANCE_EVENTS,
} from '../constants/index.js';

const emptyBattingStats = (): BattingStats => ({
  plateAppearances: 0,
  atBats: 0,
  hits: 0,
  singles: 0,
  doubles: 0,
  triples: 0,
  homeRuns: 0,
  rbi: 0,
  runs: 0,
  walks: 0,
  strikeouts: 0,
  hitByPitch: 0,
  sacrificeFlies: 0,
  sacrificeBunts: 0,
  stolenBases: 0,
  caughtStealing: 0,
  errors: 0,
});

function isPlateAppearance(eventType: string): boolean {
  return (PLATE_APPEARANCE_EVENTS as readonly string[]).includes(eventType);
}

function isAtBat(eventType: string): boolean {
  return (AT_BAT_EVENTS as readonly string[]).includes(eventType);
}

function isHit(eventType: string): boolean {
  return (HIT_EVENTS as readonly string[]).includes(eventType);
}

function isWalk(eventType: string): boolean {
  return (WALK_EVENTS as readonly string[]).includes(eventType);
}

function isSacrifice(eventType: string): boolean {
  return (SACRIFICE_EVENTS as readonly string[]).includes(eventType);
}

/**
 * Compute batting stats from a list of game events for a specific batter.
 */
export function computeBattingStatsFromEvents(
  events: GameEvent[],
  batterId: number
): BattingStats {
  const stats = emptyBattingStats();
  const batterEvents = events.filter(
    (e) => !e.isDeleted && e.batterId === batterId
  );

  for (const e of batterEvents) {
    if (!isPlateAppearance(e.eventType)) continue;

    stats.plateAppearances += 1;

    if (isAtBat(e.eventType)) {
      stats.atBats += 1;
    }

    if (isHit(e.eventType)) {
      stats.hits += 1;
      switch (e.eventType) {
        case 'single':
          stats.singles += 1;
          break;
        case 'double':
          stats.doubles += 1;
          break;
        case 'triple':
          stats.triples += 1;
          break;
        case 'home_run':
          stats.homeRuns += 1;
          break;
      }
    }

    if (e.eventType === 'walk' || e.eventType === 'intentional_walk') {
      stats.walks += 1;
    }
    if (e.eventType === 'hit_by_pitch') {
      stats.hitByPitch += 1;
    }
    if (e.eventType === 'sacrifice_fly') {
      stats.sacrificeFlies += 1;
    }
    if (e.eventType === 'sacrifice_bunt') {
      stats.sacrificeBunts += 1;
    }

    if (
      e.eventType === 'strikeout_swinging' ||
      e.eventType === 'strikeout_looking'
    ) {
      stats.strikeouts += 1;
    }

    stats.rbi += e.rbi;
    stats.runs += e.runsScored;
    stats.errors += e.errorsOnPlay;

    if (e.eventType === 'stolen_base') {
      stats.stolenBases += 1;
    }
    if (e.eventType === 'caught_stealing') {
      stats.caughtStealing += 1;
    }
  }

  return stats;
}

/**
 * Compute derived batting stats (AVG, OBP, SLG, OPS).
 */
export function computeDerivedBattingStats(stats: BattingStats): {
  battingAvg: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
} {
  const battingAvg =
    stats.atBats > 0 ? Math.round((stats.hits / stats.atBats) * 1000) / 1000 : 0;

  const obpDenom =
    stats.atBats +
    stats.walks +
    stats.hitByPitch +
    stats.sacrificeFlies +
    stats.sacrificeBunts;
  const obpNum = stats.hits + stats.walks + stats.hitByPitch;
  const onBasePct =
    obpDenom > 0 ? Math.round((obpNum / obpDenom) * 1000) / 1000 : 0;

  const totalBases =
    stats.singles +
    stats.doubles * 2 +
    stats.triples * 3 +
    stats.homeRuns * 4;
  const sluggingPct =
    stats.atBats > 0 ? Math.round((totalBases / stats.atBats) * 1000) / 1000 : 0;

  const ops = Math.round((onBasePct + sluggingPct) * 1000) / 1000;

  return { battingAvg, onBasePct, sluggingPct, ops };
}

/**
 * Merge multiple BattingStats into one (e.g., for aggregating game stats).
 */
export function mergeBattingStats(statsList: BattingStats[]): BattingStats {
  const merged = emptyBattingStats();
  for (const s of statsList) {
    merged.plateAppearances += s.plateAppearances;
    merged.atBats += s.atBats;
    merged.hits += s.hits;
    merged.singles += s.singles;
    merged.doubles += s.doubles;
    merged.triples += s.triples;
    merged.homeRuns += s.homeRuns;
    merged.rbi += s.rbi;
    merged.runs += s.runs;
    merged.walks += s.walks;
    merged.strikeouts += s.strikeouts;
    merged.hitByPitch += s.hitByPitch;
    merged.sacrificeFlies += s.sacrificeFlies;
    merged.sacrificeBunts += s.sacrificeBunts;
    merged.stolenBases += s.stolenBases;
    merged.caughtStealing += s.caughtStealing;
    merged.errors += s.errors;
  }
  return merged;
}

export { remapBasesForSubstitutionDetail } from './remap-bases-for-substitution.js';
export type { BaseOccupancy } from './remap-bases-for-substitution.js';
