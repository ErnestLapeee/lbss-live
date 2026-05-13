/**
 * Per-player batting lines from raw game events — same basis as finalize-game `player_game_batting`.
 */

import {
  BASE_ON_BALLS_EVENTS,
  HIT_EVENTS as SHARED_HIT_EVENTS,
  STRIKEOUT_EVENTS as SHARED_STRIKEOUT_EVENTS,
  isAtBatEvent,
  isPlateAppearanceEvent,
} from '../constants/event-types.js';

const STRIKEOUT_LOOKING = new Set(['strikeout_looking', 'caught_foul_tip', 'bunt_foul']);
const STRIKEOUT_SWINGING = new Set([
  'strikeout_swinging',
  'dropped_third_strike',
  'dropped_third_strike_out',
  'wild_pitch_third_strike',
]);
const HIT_EVENTS = new Set<string>(SHARED_HIT_EVENTS);
const STRIKEOUT_EVENTS = new Set<string>(SHARED_STRIKEOUT_EVENTS);
const WALK_EVENTS = new Set<string>(BASE_ON_BALLS_EVENTS);

const SACRIFICE_FLY_EVENTS = new Set(['sacrifice_fly', 'sac_fly_error']);
const SACRIFICE_BUNT_EVENTS = new Set(['sacrifice_bunt', 'sac_bunt_error']);
const GROUND_BALL_OUTS = new Set(['ground_out', 'bunt_out']);
const FLY_BALL_OUTS = new Set(['fly_out', 'line_out', 'pop_out', 'infield_fly', 'foul_out']);

export interface BattingFromEventsRow {
  id: number | null | undefined;
  eventNumber: number | null | undefined;
  eventType: string;
  half: string | null | undefined;
  batterId: number | null | undefined;
  rbi?: number | null;
  outsRecorded?: number | null;
  runnersScored?: unknown;
  runnerFirstId?: number | null;
  runnerSecondId?: number | null;
  runnerThirdId?: number | null;
  hitType?: string | null;
  /** When true, event is ignored (caller may omit deleted rows instead). */
  isDeleted?: boolean | null;
}

/** One row per player — matches DB `player_game_batting` counting columns (errors column is always 0 in finalize). */
export interface PlayerGameBattingCounts {
  teamId: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  runs: number;
  walks: number;
  strikeouts: number;
  hitByPitch: number;
  sacrificeFlies: number;
  sacrificeBunts: number;
  stolenBases: number;
  caughtStealing: number;
  groundOuts: number;
  flyOuts: number;
  groundedIntoDoublePlays: number;
  intentionalWalks: number;
  reachedOnError: number;
  totalBases: number;
  buntSingles: number;
  strikeoutsLooking: number;
  strikeoutsSwinging: number;
  pickedOff: number;
  fieldersChoice: number;
  catcherInterference: number;
  groundedIntoTriplePlay: number;
}

function isPlateAppearance(t: string): boolean {
  return isPlateAppearanceEvent(t);
}

function isAtBat(t: string): boolean {
  return isAtBatEvent(t);
}

function buildRunnerActorByEventId(events: BattingFromEventsRow[]): Map<number, number> {
  const runnerActorByEventId = new Map<number, number>();
  let prev = { first: null as number | null, second: null as number | null, third: null as number | null };
  const getBaseState = (e: BattingFromEventsRow) => ({
    first: e.runnerFirstId ?? null,
    second: e.runnerSecondId ?? null,
    third: e.runnerThirdId ?? null,
  });
  for (const e of events) {
    if (e.isDeleted) continue;
    if (!e?.id) {
      prev = getBaseState(e);
      continue;
    }
    const t = e.eventType;
    const cur = getBaseState(e);

    if (t === 'stolen_base') {
      if (prev.first && cur.second === prev.first) runnerActorByEventId.set(e.id, prev.first);
      else if (prev.second && cur.third === prev.second) runnerActorByEventId.set(e.id, prev.second);
      else if (prev.first && cur.third === prev.first) runnerActorByEventId.set(e.id, prev.first);
    } else if (t === 'caught_stealing' || t === 'picked_off') {
      const prevIds = [prev.first, prev.second, prev.third].filter(Boolean) as number[];
      const curIds = new Set([cur.first, cur.second, cur.third].filter(Boolean) as number[]);
      const removed = prevIds.find((id) => !curIds.has(id));
      if (removed) runnerActorByEventId.set(e.id, removed);
    }

    prev = cur;
  }
  return runnerActorByEventId;
}

export interface ComputePlayerGameBattingLinesArgs {
  events: BattingFromEventsRow[];
  homeTeamId: number;
  awayTeamId: number;
  /** Active lineup team first, then any player fallback (same as finalize-game). */
  playerTeamMap: Map<number, number>;
}

/**
 * Returns batting lines for every player who appears on events (PA batter, inferred runner actors, on-base, scored).
 * Aligns with `finalize-game` insertion into `player_game_batting`.
 */
export function computePlayerGameBattingLinesFromEvents(
  args: ComputePlayerGameBattingLinesArgs,
): Map<number, PlayerGameBattingCounts> {
  const { events, homeTeamId, awayTeamId, playerTeamMap } = args;
  const clean = events.filter((e) => !e.isDeleted);
  const runnerActorByEventId = buildRunnerActorByEventId(clean);

  const batterIds = new Set<number>();
  for (const e of clean) {
    if (e.batterId) batterIds.add(e.batterId);
    if (e.id != null) {
      const actor = runnerActorByEventId.get(e.id);
      if (actor) batterIds.add(actor);
    }
    for (const sc of (e.runnersScored as number[]) || []) batterIds.add(sc);
    for (const r of [e.runnerFirstId, e.runnerSecondId, e.runnerThirdId]) {
      if (r != null) batterIds.add(r);
    }
  }

  const offensiveTeamForHalf = (half: string | null | undefined) =>
    half === 'top' ? awayTeamId : homeTeamId;

  const out = new Map<number, PlayerGameBattingCounts>();

  for (const batterId of batterIds) {
    const playerEvents = clean.filter((e) => e.batterId === batterId && isPlateAppearance(e.eventType));
    let teamId = playerTeamMap.get(batterId);
    if (teamId == null) {
      const ev = clean.find(
        (e) =>
          e.batterId === batterId ||
          e.runnerFirstId === batterId ||
          e.runnerSecondId === batterId ||
          e.runnerThirdId === batterId ||
          ((e.runnersScored as number[]) || []).includes(batterId) ||
          (e.id != null && runnerActorByEventId.get(e.id) === batterId),
      );
      teamId = ev ? offensiveTeamForHalf(ev.half) : homeTeamId;
    }

    let pa = 0,
      ab = 0,
      hits = 0,
      singles = 0,
      doubles = 0,
      triples = 0,
      homeRuns = 0;
    let rbi = 0,
      walks = 0,
      strikeouts = 0,
      hitByPitch = 0;
    let sacrificeFlies = 0,
      sacrificeBunts = 0;
    let stolenBases = 0,
      caughtStealing = 0;
    let groundOuts = 0,
      flyOuts = 0,
      groundedIntoDoublePlays = 0;
    let intentionalWalks = 0,
      reachedOnError = 0;
    let buntSingles = 0,
      strikeoutsLooking = 0,
      strikeoutsSwinging = 0;
    let fieldersChoice = 0,
      catcherInterference = 0,
      groundedIntoTriplePlay = 0;
    const gidpGitpEventNums = new Set<number>();

    for (const e of playerEvents) {
      const t = e.eventType;
      pa++;
      if (isAtBat(t)) ab++;
      rbi += e.rbi ?? 0;

      if (HIT_EVENTS.has(t)) {
        hits++;
        if (t === 'single' || t === 'bunt_single') {
          singles++;
          if (t === 'bunt_single') buntSingles++;
        } else if (t === 'double' || t === 'ground_rule_double') doubles++;
        else if (t === 'triple') triples++;
        else if (t === 'home_run' || t === 'inside_park_hr') homeRuns++;
      }

      if (STRIKEOUT_EVENTS.has(t)) {
        strikeouts++;
        if (STRIKEOUT_LOOKING.has(t)) strikeoutsLooking++;
        else if (STRIKEOUT_SWINGING.has(t)) strikeoutsSwinging++;
        else strikeoutsSwinging++;
      }
      if (WALK_EVENTS.has(t)) walks++;
      if (t === 'intentional_walk') intentionalWalks++;
      if (t === 'hit_by_pitch') hitByPitch++;
      if (SACRIFICE_FLY_EVENTS.has(t)) sacrificeFlies++;
      if (SACRIFICE_BUNT_EVENTS.has(t)) sacrificeBunts++;
      if (t === 'error' || t === 'sac_bunt_error' || t === 'sac_fly_error' || t === 'catcher_obstruction' || t === 'catcher_interference') {
        if (t === 'error') reachedOnError++;
        if (t === 'catcher_obstruction' || t === 'catcher_interference') catcherInterference++;
      }

      if (GROUND_BALL_OUTS.has(t)) groundOuts++;
      if (FLY_BALL_OUTS.has(t)) flyOuts++;
      if (t === 'fielders_choice') {
        fieldersChoice++;
        const ht = e.hitType;
        if (ht === 'grounder') groundOuts++;
        else flyOuts++;
      }

      const outs = e.outsRecorded ?? 0;
      if (outs >= 3 && (GROUND_BALL_OUTS.has(t) || t === 'fielders_choice')) {
        groundedIntoTriplePlay++;
        if (e.eventNumber != null) gidpGitpEventNums.add(e.eventNumber);
      } else if (outs === 2 && (GROUND_BALL_OUTS.has(t) || t === 'fielders_choice')) {
        groundedIntoDoublePlays++;
        if (e.eventNumber != null) gidpGitpEventNums.add(e.eventNumber);
      }
    }

    for (const e of clean) {
      if (e.batterId !== batterId) continue;
      if (e.eventType !== 'double_play' && e.eventType !== 'triple_play') continue;
      if (e.eventNumber != null && gidpGitpEventNums.has(e.eventNumber)) continue;
      if (e.eventType === 'triple_play') groundedIntoTriplePlay++;
      else groundedIntoDoublePlays++;
    }

    let pickedOff = 0;
    for (const e of clean) {
      const actorId = (e.batterId ?? (e.id != null ? runnerActorByEventId.get(e.id) : undefined)) as
        | number
        | undefined;
      if (e.eventType === 'picked_off' && actorId === batterId) pickedOff++;
    }

    for (const e of clean) {
      const actorId = (e.batterId ?? (e.id != null ? runnerActorByEventId.get(e.id) : undefined)) as
        | number
        | undefined;
      if (e.eventType === 'stolen_base' && actorId === batterId) stolenBases++;
      if (e.eventType === 'caught_stealing' && actorId === batterId) caughtStealing++;
    }

    let runs = 0;
    for (const e of clean) {
      const scored = (e.runnersScored as number[]) || [];
      if (scored.includes(batterId)) runs++;
    }

    const totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;

    out.set(batterId, {
      teamId,
      plateAppearances: pa,
      atBats: ab,
      hits,
      singles,
      doubles,
      triples,
      homeRuns,
      rbi,
      runs,
      walks,
      strikeouts,
      hitByPitch,
      sacrificeFlies,
      sacrificeBunts,
      stolenBases,
      caughtStealing,
      groundOuts,
      flyOuts,
      groundedIntoDoublePlays,
      intentionalWalks,
      reachedOnError,
      totalBases,
      buntSingles,
      strikeoutsLooking,
      strikeoutsSwinging,
      pickedOff,
      fieldersChoice,
      catcherInterference,
      groundedIntoTriplePlay,
    });
  }

  return out;
}
