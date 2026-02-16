import type { GameEvent, EventType } from '../types/game-event.js';
import type { BattingStats } from '../types/stats.js';

const HIT_TYPES: EventType[] = ['single', 'double', 'triple', 'home_run'];
const STRIKEOUT_TYPES: EventType[] = ['strikeout_swinging', 'strikeout_looking'];
const WALK_TYPES: EventType[] = ['walk', 'intentional_walk', 'hit_by_pitch'];

// Events that count as at-bats
function isAtBat(type: EventType): boolean {
  return (
    HIT_TYPES.includes(type) ||
    STRIKEOUT_TYPES.includes(type) ||
    [
      'ground_out',
      'fly_out',
      'line_out',
      'pop_out',
      'fielders_choice',
      'error',
    ].includes(type)
  );
}

// Events that count as plate appearances
function isPlateAppearance(type: EventType): boolean {
  return (
    isAtBat(type) ||
    WALK_TYPES.includes(type) ||
    ['sacrifice_fly', 'sacrifice_bunt'].includes(type)
  );
}

export function computeBattingStatsFromEvents(
  events: GameEvent[],
  playerId: number
): BattingStats {
  const playerEvents = events.filter(
    (e) => !e.isDeleted && e.batterId === playerId
  );

  const stats: BattingStats = {
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
  };

  for (const event of playerEvents) {
    if (isPlateAppearance(event.eventType)) stats.plateAppearances++;
    if (isAtBat(event.eventType)) stats.atBats++;

    switch (event.eventType) {
      case 'single':
        stats.hits++;
        stats.singles++;
        break;
      case 'double':
        stats.hits++;
        stats.doubles++;
        break;
      case 'triple':
        stats.hits++;
        stats.triples++;
        break;
      case 'home_run':
        stats.hits++;
        stats.homeRuns++;
        break;
      case 'walk':
      case 'intentional_walk':
        stats.walks++;
        break;
      case 'hit_by_pitch':
        stats.hitByPitch++;
        break;
      case 'strikeout_swinging':
      case 'strikeout_looking':
        stats.strikeouts++;
        break;
      case 'sacrifice_fly':
        stats.sacrificeFlies++;
        break;
      case 'sacrifice_bunt':
        stats.sacrificeBunts++;
        break;
      case 'stolen_base':
        stats.stolenBases++;
        break;
      case 'caught_stealing':
        stats.caughtStealing++;
        break;
      case 'error':
        stats.errors++;
        break;
    }

    stats.rbi += event.rbi || 0;
  }

  // Count runs scored (when this player's ID appears in runnersScored)
  for (const event of events.filter((e) => !e.isDeleted)) {
    if (event.runnersScored?.includes(playerId)) {
      stats.runs++;
    }
  }

  return stats;
}

export function computeDerivedBattingStats(stats: BattingStats): {
  battingAvg: number;
  onBasePct: number;
  sluggingPct: number;
  ops: number;
} {
  const battingAvg = stats.atBats > 0 ? stats.hits / stats.atBats : 0;

  const obpNumerator = stats.hits + stats.walks + stats.hitByPitch;
  const obpDenominator =
    stats.atBats + stats.walks + stats.hitByPitch + stats.sacrificeFlies;
  const onBasePct =
    obpDenominator > 0 ? obpNumerator / obpDenominator : 0;

  const totalBases =
    stats.singles +
    stats.doubles * 2 +
    stats.triples * 3 +
    stats.homeRuns * 4;
  const sluggingPct =
    stats.atBats > 0 ? totalBases / stats.atBats : 0;

  const ops = onBasePct + sluggingPct;

  return { battingAvg, onBasePct, sluggingPct, ops };
}

export function mergeBattingStats(
  a: BattingStats,
  b: BattingStats
): BattingStats {
  return {
    plateAppearances: a.plateAppearances + b.plateAppearances,
    atBats: a.atBats + b.atBats,
    hits: a.hits + b.hits,
    singles: a.singles + b.singles,
    doubles: a.doubles + b.doubles,
    triples: a.triples + b.triples,
    homeRuns: a.homeRuns + b.homeRuns,
    rbi: a.rbi + b.rbi,
    runs: a.runs + b.runs,
    walks: a.walks + b.walks,
    strikeouts: a.strikeouts + b.strikeouts,
    hitByPitch: a.hitByPitch + b.hitByPitch,
    sacrificeFlies: a.sacrificeFlies + b.sacrificeFlies,
    sacrificeBunts: a.sacrificeBunts + b.sacrificeBunts,
    stolenBases: a.stolenBases + b.stolenBases,
    caughtStealing: a.caughtStealing + b.caughtStealing,
    errors: a.errors + b.errors,
  };
}
