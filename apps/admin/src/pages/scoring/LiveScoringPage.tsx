import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/* ── Types ── */
interface Player { playerId: number; firstName: string; lastName: string; jerseyNumber?: string; teamId: number; licensePaid?: string | null }
interface LineupEntry { id: number; playerId: number | null; battingOrder: number; position: number | null; isActive: boolean; isStarter: boolean; firstName: string; lastName: string; teamId: number; bats?: string | null }
interface LineupAdjustRow { id: number; playerId: number | null; battingOrder: number; position: number | null; firstName: string; lastName: string }
interface GameState { inning: number; half: 'top' | 'bot'; outs: number; homeScore: number; awayScore: number; bases: { first: number | null; second: number | null; third: number | null }; homeLineScore: number[]; awayLineScore: number[]; eventCount: number; balls: number; strikes: number }
interface GameEvent { id: number; eventNumber: number; eventType: string; batterId?: number; batterSide?: string | null; pitcherId?: number; inning: number; half: string; balls?: number; strikes?: number; runsScored?: number; rbi?: number; outsRecorded?: number; errorsOnPlay?: number; eventDetail?: string; fieldingSequence?: string; putoutFielderIds?: number[]; assistFielderIds?: number[]; errorFielderIds?: number[]; pitchCount?: number | null; pitchSequence?: string | null; hitLocationX?: string | null; hitLocationY?: string | null; hitType?: string | null; hitHardness?: string | null; runnerFirstId?: number | null; runnerSecondId?: number | null; runnerThirdId?: number | null; runnersScored?: number[] }
interface GameData { id: number; status: string; homeTeamId: number; awayTeamId: number; homeTeamName: string; awayTeamName: string; isFinalized: boolean; umpire?: string | null; officialScorer?: string | null }
type PositionChangeDraft = { playerId: number; oldPosition: number; newPosition: number };

interface LineupHintsEntry { pa: number; positions: number[] }

/** Prefer primary defensive positions by season innings; skip slots already taken in this lineup draft. */
function pickLineupFieldingPosition(preferred: number[] | undefined, used: Set<number>): number {
  for (const pos of preferred ?? []) {
    if (Number.isInteger(pos) && pos >= 1 && pos <= 10 && !used.has(pos)) return pos;
  }
  for (let p = 1; p <= 10; p++) {
    if (!used.has(p)) return p;
  }
  return 1;
}

/** Apply batting order / position edits from "Adjust active lineups" before refetch completes. */
function patchLineupBoPos(
  prev: LineupEntry[],
  rows: Array<{ id: number; playerId: number | null; battingOrder: number; position: number | null }>,
): LineupEntry[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return prev.map((entry) => {
    const r = byId.get(entry.id);
    if (!r) return entry;
    return {
      ...entry,
      playerId: r.playerId,
      battingOrder: r.battingOrder,
      position: r.position,
      firstName: r.playerId == null ? '—' : entry.firstName,
      lastName: r.playerId == null ? 'Vacant slot' : entry.lastName,
    };
  });
}

function formatScoringMiniPbpLine(evt: GameEvent, game?: GameData | null): string {
  if (String(evt.eventDetail || '').toLowerCase() === 'automatic_out_empty_slot') {
    return 'Automatic out (empty lineup slot)';
  }
  if (evt.eventType === 'adjust_score') {
    try {
      const d = JSON.parse(evt.eventDetail || '{}') as { homeDelta?: number; awayDelta?: number };
      const h = Number(d.homeDelta) || 0;
      const a = Number(d.awayDelta) || 0;
      const parts: string[] = [];
      if (a !== 0) parts.push(`${a > 0 ? '+' : ''}${a} away`);
      if (h !== 0) parts.push(`${h > 0 ? '+' : ''}${h} home`);
      return parts.length ? `Score adjustment (${parts.join(', ')})` : 'Score adjustment';
    } catch { return 'Score adjustment'; }
  }
  if (evt.eventType === 'place_runner_second') {
    return evt.eventDetail || 'Runner on 2nd (extras)';
  }
  if (evt.eventType === 'substitution') {
    try {
      const d = JSON.parse(evt.eventDetail || '{}') as {
        kind?: string;
        outName?: string;
        inName?: string;
        position?: number;
        changes?: Array<{ firstName?: string; lastName?: string; oldPosition?: number; newPosition?: number }>;
      };
      if (d.kind === 'position_swap' && Array.isArray(d.changes) && d.changes.length > 0) {
        const POS: Record<number, string> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH' };
        const parts = d.changes.map((c) => {
          const nm = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
          const o = POS[c.oldPosition ?? 0] ?? '?';
          const n = POS[c.newPosition ?? 0] ?? '?';
          return `${nm} ${o}→${n}`;
        });
        return `Position change: ${parts.join('; ')}`;
      }
      if (d.kind === 'player_change' || d.outName != null || d.inName != null) {
        const pos = d.position === 1 ? 'P' : (d.position != null ? (POS_LABELS[d.position] ?? `#${d.position}`) : '');
        const role = pos ? ` (${pos})` : '';
        const prefix = d.position === 1 ? 'Pitching change' : 'Substitution';
        return `${prefix}: ${d.inName ?? '?'} replaces ${d.outName ?? '?'}${role}`;
      }
    } catch { /* fall through */ }
    return 'Substitution';
  }
  return evt.eventDetail || evt.eventType;
}

/** Plate-appearance cursor skips these (must stay aligned with derived batter index). */
const SCORER_NON_AB_EVENTS = new Set([
  'pitch', 'stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball',
  'balk', 'advance', 'advance_on_error', 'defensive_indifference',
  'runner_interference', 'appeal_play', 'tagged_out', 'force_out',
  'hit_by_ball', 'missed_base', 'left_base_early', 'left_base_path',
  'offensive_interference', 'passed_runner', 'hesitation',
  'end_half_inning', 'adjust_score', 'illegal_pitch', 'substitution',
  'place_runner_second',
]);

/** Last completed PA batter from this team's previous offensive inning (same half, inning − 1); typical extras tie-break pick. */
function suggestedGhostRunnerFromPrevOffensiveInning(events: GameEvent[], inning: number, half: string): number | null {
  if (inning < 2) return null;
  const h = String(half ?? '').toLowerCase();
  const normHalf = h === 'bottom' || h === 'bot' ? 'bot' : 'top';
  const prevInning = inning - 1;
  const slice = [...events]
    .filter((e) => !(e as { isDeleted?: boolean }).isDeleted)
    .filter((e) => {
      const eh = String(e.half ?? '').toLowerCase();
      const nh = eh === 'bottom' || eh === 'bot' ? 'bot' : 'top';
      return e.inning === prevInning && nh === normHalf;
    })
    .sort((a, b) => a.eventNumber - b.eventNumber);
  for (let i = slice.length - 1; i >= 0; i--) {
    const e = slice[i];
    const bid = e.batterId;
    if (bid == null) continue;
    if (!SCORER_NON_AB_EVENTS.has(e.eventType)) return bid;
  }
  return null;
}

const POS_LABELS: Record<number, string> = { 1:'P',2:'C',3:'1B',4:'2B',5:'3B',6:'SS',7:'LF',8:'CF',9:'RF',10:'DH' };

/** Native `<select>`: solid bg + `color-scheme: dark` so option lists stay readable (Windows/Chrome often default to light popup with invisible text on dark UIs). */
const ADMIN_SELECT_BASE =
  'rounded border border-white/20 bg-[#152238] text-slate-100 [color-scheme:dark]';
const ADMIN_SELECT_SM = `${ADMIN_SELECT_BASE} text-[10px] px-1.5 py-1`;
const ADMIN_SELECT_SM_FLEX = `${ADMIN_SELECT_SM} flex-1 min-w-0`;
const ADMIN_SELECT_ROW = `${ADMIN_SELECT_SM} mt-0.5 w-full`;
const ADMIN_SELECT_MD = `${ADMIN_SELECT_BASE} text-sm px-3 py-2 w-full outline-none focus:border-white/35`;
const ADMIN_SELECT_POS = `${ADMIN_SELECT_BASE} px-2 py-1 text-xs shrink-0`;
const OUT_EVENTS = ['ground_out','fly_out','line_out','pop_out','strikeout_swinging','strikeout_looking','sacrifice_fly','sacrifice_bunt','bunt_out','infield_fly','dropped_third_strike_out','caught_foul_tip','bunt_foul','hit_by_batted_ball','runner_interference_batter','offensive_interference_batter','batting_out_of_turn','fan_interference','thrown_bat','out_of_box','left_base_path_batter','other_out'];

const SAFE_OUTCOMES_P1 = [
  { key: 'walk', label: 'BASE ON BALLS (WALK)' },
  { key: 'intentional_walk', label: 'INTENTIONAL WALK' },
  { key: 'single', label: 'HIT SINGLE' },
  { key: 'double', label: 'HIT DOUBLE' },
  { key: 'triple', label: 'HIT TRIPLE' },
  { key: 'home_run', label: 'HOMERUN' },
  { key: 'inside_park_hr', label: 'IN PARK HOMERUN' },
  { key: 'bunt_single', label: 'BUNT' },
  { key: 'error', label: 'ERROR' },
  { key: 'hit_by_pitch', label: 'HIT BY PITCH' },
  { key: 'dropped_third_strike', label: 'DROPPED 3RD STRIKE' },
  { key: 'wild_pitch_third_strike', label: 'WILD PITCH 3RD STRIKE' },
  { key: 'fielders_choice', label: "FIELDER'S CHOICE" },
];
const SAFE_OUTCOMES_P2 = [
  { key: 'sac_bunt_error', label: 'SAC BUNT WITH ERROR' },
  { key: 'sac_fly_error', label: 'SAC FLY WITH ERROR' },
  { key: 'catcher_obstruction', label: 'CATCHER INTERFERENCE' },
  { key: 'ground_rule_double', label: 'GROUND RULE DOUBLE' },
];

const OUT_OUTCOMES_P1 = [
  { key: 'strikeout_looking', label: 'STRIKEOUT LOOKING' },
  { key: 'strikeout_swinging', label: 'STRIKEOUT SWINGING' },
  { key: 'ground_out', label: 'GROUND OUT' },
  { key: 'line_out', label: 'LINE DRIVE' },
  { key: 'fly_out', label: 'POPUP / FLY OUT' },
  { key: 'bunt_out', label: 'BUNT' },
  { key: 'sacrifice_fly', label: 'SACRIFICE FLY' },
  { key: 'sacrifice_bunt', label: 'SACRIFICE BUNT' },
  { key: 'infield_fly', label: 'INFIELD FLY' },
  { key: 'hit_by_batted_ball', label: 'HIT BY BALL' },
  { key: 'dropped_third_strike_out', label: 'DROPPED 3RD STRIKE' },
  { key: 'runner_interference_batter', label: 'RUNNER INTERFERENCE' },
  { key: 'offensive_interference_batter', label: 'OFFENSIVE INTERFERENCE' },
];
const OUT_OUTCOMES_P2 = [
  { key: 'batting_out_of_turn', label: 'BATTING OUT OF TURN' },
  { key: 'fan_interference', label: 'FAN INTERFERENCE' },
  { key: 'thrown_bat', label: 'THROWN BAT' },
  { key: 'out_of_box', label: 'OUT OF BOX' },
  { key: 'left_base_path_batter', label: 'LEFT BASE PATH' },
  { key: 'other_out', label: 'OTHER' },
];

const RUNNER_OUT_TYPES = [
  { key: 'caught_stealing', label: 'CAUGHT STEALING' },
  { key: 'picked_off', label: 'PICKED OFF' },
  { key: 'tagged_out', label: 'TAGGED OUT' },
  { key: 'force_out', label: 'FORCE OUT' },
  { key: 'double_play', label: 'DOUBLE PLAY' },
  { key: 'triple_play', label: 'TRIPLE PLAY' },
  { key: 'runner_interference', label: 'RUNNER INTERFERENCE' },
  { key: 'hit_by_ball', label: 'HIT BY BALL' },
  { key: 'missed_base', label: 'MISSED BASE' },
  { key: 'left_base_early', label: 'LEFT BASE EARLY' },
  { key: 'left_base_path', label: 'LEFT BASE PATH' },
  { key: 'offensive_interference', label: 'OFFENSIVE INTERFERENCE' },
  { key: 'passed_runner', label: 'PASSED RUNNER' },
  { key: 'hesitation', label: 'HESITATION' },
  { key: 'appeal_play', label: 'OTHER' },
];
const getRunnerOutTypesForOuts = (currentOuts: number) => {
  const outsRemaining = Math.max(0, 3 - currentOuts);
  return RUNNER_OUT_TYPES.filter((type) => {
    if (type.key === 'triple_play') return currentOuts === 0;
    if (type.key === 'double_play') return outsRemaining >= 2;
    return outsRemaining >= 1;
  });
};

/* ── (Field positions are defined inline in the SVG) ── */

type ScoringStep = 'pitch' | 'strikeout_type' | 'out_type' | 'safe_type' | 'fielding' | 'hit_location' | 'runner' | 'batter_advance' | 'runner_out_detail' | 'runner_out_fielding' | 'runner_advance_error_fielding' | 'runner_action' | 'sub_defense' | 'sub_offense' | 'swap_position' | 'swap_position_pick' | 'misc' | 'misc_runner_second' | 'adjust_score';

const BATTED_BALL_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double',
  'ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'bunt_single',
  'sacrifice_fly', 'sacrifice_bunt', 'infield_fly', 'fielders_choice',
  'error', 'sac_bunt_error', 'sac_fly_error',
]);

interface RunnerQuestion {
  base: 'first' | 'second' | 'third';
  playerId: number;
  playerName: string;
  outcome: 'safe' | 'out' | null;
  destination: 'first' | 'second' | 'third' | 'home' | null;
  minDestination: 'first' | 'second' | 'third' | 'home';
  advanceReason?: string;
  fielding?: number[];
  /** Defensive positions charged with an error when this runner advanced on error (e.g. throwing error on a ground out). */
  advanceErrorFielding?: number[];
}

const RUNNER_OUTS_NEED_FIELDING = new Set([
  'caught_stealing', 'picked_off', 'tagged_out', 'force_out', 'double_play', 'triple_play',
]);

const NO_RBI_REASONS = new Set(['error', 'wild_pitch', 'passed_ball', 'balk', 'defensive_indifference', 'advance_on_error', 'obstruction']);
const NO_RBI_BATTER_EVENTS = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

const BASE_ORDER: Record<string, number> = { first: 1, second: 2, third: 3, home: 4 };
const BASE_FROM_ORDER: Record<number, 'first' | 'second' | 'third' | 'home'> = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' };
const uniqNums = (values: number[]) => [...new Set(values)];

/** Fielding positions from an earlier runner on this same batted-ball play (e.g. two runs on one throwing error). */
function getPriorSamePlayErrorFielding(runners: RunnerQuestion[], currentIdx: number): number[] | null {
  for (let i = currentIdx - 1; i >= 0; i--) {
    const r = runners[i];
    if (r.outcome === 'safe' && r.advanceErrorFielding && r.advanceErrorFielding.length > 0) {
      return r.advanceErrorFielding;
    }
  }
  return null;
}

function computeMinDestinations(
  bases: { first: number | null; second: number | null; third: number | null },
  eventType: string
): Record<string, 'first' | 'second' | 'third' | 'home'> {
  const mins: Record<string, 'first' | 'second' | 'third' | 'home'> = {};

  // Where does the batter end up?
  let batterDest = 0; // 0 = out / no base
  if (['single', 'bunt_single', 'error', 'fielders_choice', 'dropped_third_strike',
       'wild_pitch_third_strike', 'sac_bunt_error', 'sac_fly_error', 'catcher_obstruction'].includes(eventType)) {
    batterDest = 1; // first
  } else if (['double', 'ground_rule_double'].includes(eventType)) {
    batterDest = 2; // second
  } else if (eventType === 'triple') {
    batterDest = 3; // third
  }

  // For outs (ground out, fly out, etc.), runners don't HAVE to advance
  // (they may choose to tag up or stay). So min = current base.
  const isHit = batterDest > 0;

  // Occupied base positions in order (closest to home first)
  const occupied: { base: string; order: number }[] = [];
  if (bases.third) occupied.push({ base: 'third', order: 3 });
  if (bases.second) occupied.push({ base: 'second', order: 2 });
  if (bases.first) occupied.push({ base: 'first', order: 1 });

  if (!isHit) {
    // On an out, runners can stay (tag up, etc.) - min = their current base
    for (const r of occupied) {
      mins[r.base] = r.base as any;
    }
    return mins;
  }

  // For hits: the batter occupies a base, forcing runners ahead
  // Process from farthest-from-home first (1st → 2nd → 3rd) so force chains propagate correctly
  // e.g., bases loaded + single: batter takes 1st → forces 1st to 2nd → forces 2nd to 3rd → forces 3rd home
  const takenBases = new Set<number>();
  takenBases.add(batterDest); // batter takes this base

  const occupiedReversed = [...occupied].reverse(); // [1st, 2nd, 3rd]
  for (const r of occupiedReversed) {
    let minDest = r.order; // at minimum, stay where they are
    // But they can't stay at or behind the batter's destination if they'd be behind batter
    if (r.order <= batterDest) {
      minDest = batterDest + 1; // must advance past batter
    }
    // And they can't be on a base already taken by another runner
    while (takenBases.has(minDest) && minDest < 4) {
      minDest++;
    }
    // Cap at home (4)
    if (minDest > 4) minDest = 4;
    takenBases.add(minDest);
    mins[r.base] = BASE_FROM_ORDER[minDest] || 'home';
  }

  return mins;
}

export function LiveScoringPage() {
  const { gameId: gameIdStr } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isScorer = user?.role === 'statistician';
  const gameId = parseInt(gameIdStr || '0', 10);

  const [game, setGame] = useState<GameData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [homeLineup, setHomeLineup] = useState<LineupEntry[]>([]);
  const [awayLineup, setAwayLineup] = useState<LineupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'setup' | 'scoring'>('setup');

  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);
  const [setupHome, setSetupHome] = useState<Array<{ playerId: number | null; position: number | null }>>([]);
  const [setupAway, setSetupAway] = useState<Array<{ playerId: number | null; position: number | null }>>([]);
  const [setupTeam, setSetupTeam] = useState<'home' | 'away'>('away');
  const [setupUmpire, setSetupUmpire] = useState('');
  const [setupScorer, setSetupScorer] = useState('');

  const [addRosterOpen, setAddRosterOpen] = useState(false);
  const [addRosterFirst, setAddRosterFirst] = useState('');
  const [addRosterLast, setAddRosterLast] = useState('');
  const [addRosterJersey, setAddRosterJersey] = useState('');
  const [addRosterBats, setAddRosterBats] = useState('');
  const [addRosterThrows, setAddRosterThrows] = useState('');
  const [addRosterBusy, setAddRosterBusy] = useState(false);

  /** Season PA + defensive position ranks for lineup entry (from API). */
  const [lineupHintsHome, setLineupHintsHome] = useState<Record<number, LineupHintsEntry>>({});
  const [lineupHintsAway, setLineupHintsAway] = useState<Record<number, LineupHintsEntry>>({});

  const [lineupAdjustOpen, setLineupAdjustOpen] = useState(false);
  const [lineupAdjustTeam, setLineupAdjustTeam] = useState<'home' | 'away'>('away');
  const [lineupAdjustHome, setLineupAdjustHome] = useState<LineupAdjustRow[]>([]);
  const [lineupAdjustAway, setLineupAdjustAway] = useState<LineupAdjustRow[]>([]);
  const [lineupAdjustBusy, setLineupAdjustBusy] = useState(false);

  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  /** Switch hitter (bats=S): which box side for the current PA — required before recording pitches/plays. */
  const [switchBatSide, setSwitchBatSide] = useState<'L' | 'R' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);

  const [step, setStep] = useState<ScoringStep>('pitch');
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [outSafeTab, setOutSafeTab] = useState<'out' | 'safe'>('safe');
  const [outSafeMorePage, setOutSafeMorePage] = useState(false);
  const [fieldingPositions, setFieldingPositions] = useState<number[]>([]);
  const [runnerQuestions, setRunnerQuestions] = useState<RunnerQuestion[]>([]);
  const [currentRunnerIdx, setCurrentRunnerIdx] = useState(0);

  // Substitution state
  const [subPosition, setSubPosition] = useState<number | null>(null); // defensive position being substituted
  const [subTeamId, setSubTeamId] = useState<number | null>(null); // team whose defense is being changed
  const [subBattingSlot, setSubBattingSlot] = useState<number | null>(null); // batting slot being substituted
  const [pendingPositionChanges, setPendingPositionChanges] = useState<PositionChangeDraft[]>([]);

  // Runner action state (click on a runner)
  const [activeRunnerBase, setActiveRunnerBase] = useState<'first' | 'second' | 'third' | null>(null);

  // Runner out detail tab
  const [runnerOutSafeTab, setRunnerOutSafeTab] = useState<'out' | 'safe'>('safe');
  const [runnerSafeDest, setRunnerSafeDest] = useState<'first' | 'second' | 'third' | 'home' | null>(null);

  // Runner out fielding sub-step (after picking out type in runner resolution)
  const [runnerOutPendingType, setRunnerOutPendingType] = useState<string | null>(null);
  const [runnerOutFielding, setRunnerOutFielding] = useState<number[]>([]);

  // After "advanced on error" on a non-error batter play (e.g. ground out) — which fielder(s) committed the error
  const [runnerAdvanceErrorFielding, setRunnerAdvanceErrorFielding] = useState<number[]>([]);
  const [runnerAdvanceErrorPending, setRunnerAdvanceErrorPending] = useState<{ reason: string; dest: string } | null>(null);

  // Hit location state
  const [hitLocationX, setHitLocationX] = useState<number | null>(null);
  const [hitLocationY, setHitLocationY] = useState<number | null>(null);
  const [hitType, setHitType] = useState<string | null>(null);
  const [hitHardness, setHitHardness] = useState<string | null>(null);

  // Adjust score state
  const [adjustHome, setAdjustHome] = useState(0);
  const [adjustAway, setAdjustAway] = useState(0);
  const [miscGhostRunnerId, setMiscGhostRunnerId] = useState<number | null>(null);

  // Event timeline panel
  const [showEventTimeline, setShowEventTimeline] = useState(false);

  // Per-pitcher pitch count derived from events. When scorer had no P in the lineup, events often have
  // pitcherId null — infer fielding pitcher per half from active lineup P + pitching-change subs so counts match reality.
  const pitcherPitchCounts = useMemo(() => {
    const counts: Record<number, { total: number; balls: number; strikes: number }> = {};
    if (!game) return counts;
    const RUNNER_EVENTS = new Set(['stolen_base','caught_stealing','picked_off','wild_pitch','passed_ball','balk','advance','advance_on_error','defensive_indifference','runner_interference','appeal_play','tagged_out','force_out','hit_by_ball','missed_base','left_base_early','left_base_path','offensive_interference','passed_runner','hesitation','double_play','triple_play','end_half_inning','illegal_pitch','place_runner_second']);
    const WALK_TYPES = new Set(['walk','intentional_walk']);
    const activePitcherId = (lineup: LineupEntry[]) =>
      lineup.find((l) => l.isActive && l.position === 1 && l.playerId != null)?.playerId ?? null;
    const isTopHalf = (half: string | undefined) => {
      const h = String(half ?? '').toLowerCase();
      return h === 'top' || h === 't';
    };

    let homeP = activePitcherId(homeLineup);
    let awayP = activePitcherId(awayLineup);
    const sorted = [...events].sort((a, b) => a.eventNumber - b.eventNumber);

    for (const e of sorted) {
      if (e.eventType === 'substitution') {
        try {
          const d = JSON.parse(e.eventDetail || '{}') as {
            kind?: string;
            position?: number;
            teamId?: number;
            inPlayerId?: number;
          };
          if (d.kind === 'player_change' && d.position === 1 && d.inPlayerId && d.teamId) {
            if (d.teamId === game.homeTeamId) homeP = d.inPlayerId;
            else if (d.teamId === game.awayTeamId) awayP = d.inPlayerId;
          }
        } catch { /* ignore bad JSON */ }
        continue;
      }

      const fieldingP = isTopHalf(e.half) ? homeP : awayP;
      const pid = e.pitcherId ?? fieldingP;
      if (!pid) continue;

      if (e.pitcherId) {
        if (isTopHalf(e.half)) homeP = e.pitcherId;
        else awayP = e.pitcherId;
      }

      if (!counts[pid]) counts[pid] = { total: 0, balls: 0, strikes: 0 };
      if (e.eventType === 'pitch') {
        counts[pid].total++;
        const d = (e.eventDetail || '').toLowerCase();
        if (d === 'ball') counts[pid].balls++;
        else counts[pid].strikes++;
      } else if (!RUNNER_EVENTS.has(e.eventType)) {
        counts[pid].total++;
        if (WALK_TYPES.has(e.eventType) || e.eventType === 'hit_by_pitch' || e.eventType === 'catcher_obstruction' || e.eventType === 'catcher_interference') {
          counts[pid].balls++;
        } else {
          counts[pid].strikes++;
        }
      }
    }
    return counts;
  }, [events, game, homeLineup, awayLineup]);

  const loadState = useCallback(async () => {
    setLoadError(null);
    try {
      const data: any = await apiGet(`/admin/scoring/${gameId}/state`);
      setGame(data.game); setGameState(data.state); setEvents(data.events || []);
      setHomeLineup(data.lineups?.home || []); setAwayLineup(data.lineups?.away || []);
      if (data.game.status === 'live' || data.game.status === 'suspended' || data.game.status === 'final') setPhase('scoring');
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Failed to load game');
    } finally { setLoading(false); }
  }, [gameId]);

  const loadRosters = useCallback(async () => {
    try {
      const data: any = await apiGet(`/admin/scoring/${gameId}/roster`);
      setHomeRoster(data.home || []); setAwayRoster(data.away || []);
    } catch {}
  }, [gameId]);

  useEffect(() => { loadState(); loadRosters(); }, [loadState, loadRosters]);
  useEffect(() => {
    if (!isScorer || !game) return;
    if (game.isFinalized || game.status === 'final') {
      alert('Scorer accounts cannot open scoring for finished games. Use the Games page.');
      navigate('/games', { replace: true });
    }
  }, [isScorer, game, navigate]);
  useEffect(() => {
    if (!game) return;
    setSetupUmpire(game.umpire ?? '');
    setSetupScorer(game.officialScorer ?? '');
  }, [game?.id]);

  // Derive current batter position from events (computed during render, always in sync)
  const derivedBatterIdx = useMemo(() => {
    let awayABs = 0;
    let homeABs = 0;
    for (const e of events) {
      if (SCORER_NON_AB_EVENTS.has(e.eventType)) continue;
      if (e.half === 'top') awayABs++;
      else if (e.half === 'bot') homeABs++;
    }
    return { away: awayABs, home: homeABs };
  }, [events]);

  // Derived
  const battingTeamId = gameState?.half === 'top' ? game?.awayTeamId : game?.homeTeamId;
  const fieldingTeamId = gameState?.half === 'top' ? game?.homeTeamId : game?.awayTeamId;
  const battingLineup = (battingTeamId === game?.homeTeamId ? homeLineup : awayLineup)
    .filter(l => l.isActive).sort((a, b) => a.battingOrder - b.battingOrder);
  const fieldingLineupActive = useMemo(
    () => (fieldingTeamId === game?.homeTeamId ? homeLineup : awayLineup).filter(l => l.isActive),
    [homeLineup, awayLineup, fieldingTeamId, game?.homeTeamId],
  );
  /** Fielding team: players with a defensive position only (vacant batting slots have no position). */
  const fieldingLineupForSidebar = useMemo(
    () =>
      [...fieldingLineupActive]
        .filter((l) => l.position != null && l.playerId != null)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [fieldingLineupActive],
  );
  const defensiveChangeTeamId = subTeamId ?? fieldingTeamId;
  const offensiveChangeTeamId = subTeamId ?? battingTeamId;
  const defensiveChangeLineup = (defensiveChangeTeamId === game?.homeTeamId ? homeLineup : awayLineup)
    .filter(l => l.isActive).sort((a, b) => a.battingOrder - b.battingOrder);
  const offensiveChangeLineup = (offensiveChangeTeamId === game?.homeTeamId ? homeLineup : awayLineup)
    .filter(l => l.isActive).sort((a, b) => a.battingOrder - b.battingOrder);
  const draftFieldingLineup = useMemo(() => {
    if (pendingPositionChanges.length === 0) return defensiveChangeLineup;
    const nextByPlayerId = new Map(pendingPositionChanges.map(c => [c.playerId, c.newPosition]));
    return defensiveChangeLineup.map(entry => ({
      ...entry,
      position:
        entry.playerId != null
          ? (nextByPlayerId.get(entry.playerId) ?? entry.position)
          : entry.position,
    }));
  }, [defensiveChangeLineup, pendingPositionChanges]);
  const currentPitcher = fieldingLineupActive.find(l => l.position === 1 && l.playerId != null);

  const battingSide = gameState?.half === 'top' ? 'away' : 'home';
  const rawIdx = derivedBatterIdx[battingSide] || 0;

  const battingOrderSlot = (rawIdx % 9) + 1;
  const currentBatter = battingLineup.find(l => l.battingOrder === battingOrderSlot) ?? null;
  const isEmptySlot =
    battingLineup.length > 0 && (currentBatter == null || currentBatter.playerId == null);

  /** Per-PA box side for roster switch hitters; sent on events as batterSide (L/R). */
  const batterSideForCurrentPa = (): 'L' | 'R' | undefined => {
    if (!currentBatter || (currentBatter.bats || '').trim().toUpperCase() !== 'S') return undefined;
    return switchBatSide ?? undefined;
  };

  useEffect(() => {
    setSwitchBatSide(null);
  }, [currentBatter?.playerId, rawIdx, battingSide]);

  const getPlayerName = (id: number) => {
    const p = [...homeLineup, ...awayLineup].find(l => l.playerId === id);
    return p ? `${p.firstName.charAt(0)}. ${p.lastName}` : `#${id}`;
  };
  const getPlayerShort = (id: number) => {
    const p = [...homeLineup, ...awayLineup].find(l => l.playerId === id);
    return p ? `${p.firstName.charAt(0)}. ${p.lastName}` : '';
  };

  useEffect(() => {
    setStep('pitch'); setSelectedEvent(null); setFieldingPositions([]);
    setRunnerQuestions([]); setCurrentRunnerIdx(0); setActiveRunnerBase(null);
  }, [rawIdx, battingSide, gameState?.inning, gameState?.half]);

  // ── Setup handlers ──
  const submitAddRosterPlayer = async () => {
    if (!game) return;
    const first = addRosterFirst.trim();
    const last = addRosterLast.trim();
    if (!first || !last) {
      alert('First and last name are required.');
      return;
    }
    const teamId = setupTeam === 'home' ? game.homeTeamId : game.awayTeamId;
    setAddRosterBusy(true);
    try {
      await apiPost(`/admin/scoring/${gameId}/roster/player`, {
        teamId,
        firstName: first,
        lastName: last,
        jerseyNumber: addRosterJersey.trim() || undefined,
        bats: addRosterBats.trim() || undefined,
        throws: addRosterThrows.trim() || undefined,
      });
      setAddRosterOpen(false);
      setAddRosterFirst('');
      setAddRosterLast('');
      setAddRosterJersey('');
      setAddRosterBats('');
      setAddRosterThrows('');
      await loadRosters();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setAddRosterBusy(false);
    }
  };

  const handleSetupSubmit = async () => {
    if (setupHome.length === 0 || setupAway.length === 0) { alert('Both teams need at least 1 lineup slot'); return; }
    const homeIds = new Set(setupHome.map((p) => p.playerId).filter((id): id is number => id != null));
    const duplicatePlayer = setupAway.find((p) => p.playerId != null && homeIds.has(p.playerId));
    if (duplicatePlayer) {
      const player =
        homeRoster.find((p) => p.playerId === duplicatePlayer.playerId) ??
        awayRoster.find((p) => p.playerId === duplicatePlayer.playerId);
      alert(`${player ? `${player.firstName} ${player.lastName}` : 'This player'} cannot be in both lineups for the same game.`);
      return;
    }
    try {
      await apiPost(`/admin/scoring/${gameId}/lineup`, { teamId: game!.homeTeamId, lineup: setupHome.map((p, i) => ({ playerId: p.playerId, battingOrder: i + 1, position: p.position })) });
      await apiPost(`/admin/scoring/${gameId}/lineup`, { teamId: game!.awayTeamId, lineup: setupAway.map((p, i) => ({ playerId: p.playerId, battingOrder: i + 1, position: p.position })) });
      await apiPost(`/admin/scoring/${gameId}/start`, {
        umpire: setupUmpire.trim(),
        officialScorer: setupScorer.trim(),
      });
      await loadState(); setPhase('scoring');
    } catch (err: any) { alert(err.message || 'Failed'); }
  };
  const addToSetup = (side: 'home' | 'away', pid: number) => {
    const list = side === 'home' ? setupHome : setupAway;
    if (list.find((p) => p.playerId === pid)) return;
    const hintsMap = side === 'home' ? lineupHintsHome : lineupHintsAway;
    const used = new Set(
      list.map((p) => p.position).filter((x): x is number => x != null && x >= 1 && x <= 10),
    );
    const pos = pickLineupFieldingPosition(hintsMap[pid]?.positions, used);
    if (side === 'home') setSetupHome([...list, { playerId: pid, position: pos }]);
    else setSetupAway([...list, { playerId: pid, position: pos }]);
  };
  const addVacantSlotToSetup = (side: 'home' | 'away') => {
    const list = side === 'home' ? setupHome : setupAway;
    if (list.length >= 10) return;
    if (side === 'home') setSetupHome([...list, { playerId: null, position: null }]);
    else setSetupAway([...list, { playerId: null, position: null }]);
  };
  const removeFromSetup = (side: 'home' | 'away', index: number) => {
    if (side === 'home') setSetupHome((s) => s.filter((_, i) => i !== index));
    else setSetupAway((s) => s.filter((_, i) => i !== index));
  };
  const updatePosition = (side: 'home' | 'away', index: number, pos: number) => {
    const setter = side === 'home' ? setSetupHome : setSetupAway;
    setter((list) =>
      list.map((p, i) => (i === index && p.playerId != null ? { ...p, position: pos } : p)),
    );
  };

  const [setupDragFrom, setSetupDragFrom] = useState<number | null>(null);

  const moveSetup = (side: 'home' | 'away', fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const setter = side === 'home' ? setSetupHome : setSetupAway;
    setter((list) => {
      const next = [...list];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next;
    });
  };

  useEffect(() => {
    if (phase !== 'setup' || !game) return;
    let cancelled = false;
    void (async () => {
      try {
        const [h, a] = await Promise.all([
          apiGet(`/admin/scoring/${gameId}/lineup-hints/${game.homeTeamId}`) as Promise<{ players: Record<string, LineupHintsEntry> }>,
          apiGet(`/admin/scoring/${gameId}/lineup-hints/${game.awayTeamId}`) as Promise<{ players: Record<string, LineupHintsEntry> }>,
        ]);
        if (cancelled) return;
        const normalize = (raw: Record<string, LineupHintsEntry>) => {
          const out: Record<number, LineupHintsEntry> = {};
          for (const [k, v] of Object.entries(raw ?? {})) {
            out[Number(k)] = {
              pa: Math.max(0, Number(v.pa) || 0),
              positions: Array.isArray(v.positions)
                ? v.positions.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10)
                : [],
            };
          }
          return out;
        };
        setLineupHintsHome(normalize(h.players ?? {}));
        setLineupHintsAway(normalize(a.players ?? {}));
      } catch {
        if (!cancelled) {
          setLineupHintsHome({});
          setLineupHintsAway({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, gameId, game?.homeTeamId, game?.awayTeamId, homeRoster.length, awayRoster.length]);

  // Sync local count from server state
  useEffect(() => {
    if (gameState) {
      setBalls(gameState.balls ?? 0);
      setStrikes(gameState.strikes ?? 0);
    }
  }, [gameState?.balls, gameState?.strikes, gameState?.eventCount]);

  // Helper: create a pitch event in the DB
  const submitPitchEvent = async (detail: string) => {
    if (!currentBatter || currentBatter.playerId == null || !gameState) return;
    await apiPost(`/admin/scoring/${gameId}/event`, {
      eventType: 'pitch', eventDetail: detail,
      batterId: currentBatter.playerId, pitcherId: currentPitcher?.playerId,
      inning: gameState.inning, half: gameState.half,
      runnerFirstId: gameState.bases.first, runnerSecondId: gameState.bases.second, runnerThirdId: gameState.bases.third,
      runsScored: 0, outsRecorded: 0, runnersScored: [], balls, strikes,
    });
  };

  // ── Pitch handlers (each creates a DB event) ──
  const handleBall = async () => {
    if (submitting || !currentBatter || currentBatter.playerId == null || !gameState) return;
    if ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) return;
    const newBalls = balls + 1;
    if (newBalls >= 4) {
      selectOutcome('walk');
      return;
    }
    setBalls(newBalls);
    setSubmitting(true);
    try { await submitPitchEvent('ball'); await loadState(); }
    catch (err: any) { alert(err.message); setBalls(balls); }
    finally { setSubmitting(false); }
  };

  const handleStrike = async () => {
    if (submitting || !currentBatter || currentBatter.playerId == null || !gameState) return;
    if ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) return;
    if (strikes + 1 >= 3) {
      // Strike 3 → show strikeout type menu
      setStep('strikeout_type');
      return;
    }
    setStrikes(strikes + 1);
    setSubmitting(true);
    try { await submitPitchEvent('strike'); await loadState(); }
    catch (err: any) { alert(err.message); setStrikes(strikes); }
    finally { setSubmitting(false); }
  };

  const handleFoul = async () => {
    if (submitting || !currentBatter || currentBatter.playerId == null || !gameState) return;
    if ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) return;
    if (strikes < 2) setStrikes(strikes + 1);
    setSubmitting(true);
    try { await submitPitchEvent('foul'); await loadState(); }
    catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  /** Temporary pitch hotkeys (B/S/F) — only on main pitch step, not while typing in inputs. */
  const pitchHotkeyRef = useRef({
    phase,
    step,
    submitting,
    currentBatter,
    gameState,
    switchBatSide,
    handleBall,
    handleStrike,
    handleFoul,
  });
  pitchHotkeyRef.current = {
    phase,
    step,
    submitting,
    currentBatter,
    gameState,
    switchBatSide,
    handleBall,
    handleStrike,
    handleFoul,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = pitchHotkeyRef.current;
      if (s.phase !== 'scoring' || s.step !== 'pitch' || s.submitting) return;
      if (!s.currentBatter || s.currentBatter.playerId == null || !s.gameState) return;
      if ((s.currentBatter.bats || '').trim().toUpperCase() === 'S' && !s.switchBatSide) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return;
      }
      const k = e.key.length === 1 ? e.key.toLowerCase() : '';
      if (k === 'b') {
        e.preventDefault();
        void s.handleBall();
      } else if (k === 's') {
        e.preventDefault();
        void s.handleStrike();
      } else if (k === 'f') {
        e.preventDefault();
        void s.handleFoul();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleOut = () => {
    if (currentBatter && (currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) return;
    setOutSafeTab('out'); setStep('out_type');
  };
  const handleInPlay = () => {
    if (currentBatter && (currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) return;
    setOutSafeTab('safe'); setStep('safe_type');
  };

  const ERROR_EVENTS = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

/** Runner picked "advanced on error" / "error" — need who committed the error, unless the batter play is already an error type (fielding captured earlier). */
function needsRunnerAdvanceErrorFieldingPrompt(
  advanceReason: string,
  selectedEvent: string | null,
): boolean {
  if (advanceReason !== 'advance_on_error' && advanceReason !== 'error') return false;
  if (selectedEvent && ERROR_EVENTS.has(selectedEvent)) return false;
  return true;
}

  const NO_FIELDING_OUTS = new Set(['strikeout_swinging', 'strikeout_looking', 'caught_foul_tip', 'bunt_foul',
    'hit_by_batted_ball', 'runner_interference_batter', 'offensive_interference_batter',
    'batting_out_of_turn', 'fan_interference', 'thrown_bat', 'out_of_box', 'left_base_path_batter', 'other_out']);

  const selectOutcome = (eventType: string) => {
    setSelectedEvent(eventType);
    setOutSafeMorePage(false);
    const isOut = OUT_EVENTS.includes(eventType);
    const needsFielding = isOut && !NO_FIELDING_OUTS.has(eventType);
    const needsErrorFielder = ERROR_EVENTS.has(eventType);
    if (needsFielding || needsErrorFielder) { setFieldingPositions([]); setStep('fielding'); }
    else goToHitLocationOrRunners(eventType);
  };

  const finishFielding = () => { if (selectedEvent) goToHitLocationOrRunners(selectedEvent); };

  const inferHitType = (et: string): string | null => {
    if (['ground_out','fielders_choice','bunt_out','bunt_single','sacrifice_bunt','sac_bunt_error'].includes(et)) return 'grounder';
    if (['fly_out','sacrifice_fly','sac_fly_error'].includes(et)) return 'fly_ball';
    if (et === 'line_out') return 'line_drive';
    if (['pop_out','infield_fly'].includes(et)) return 'pop_up';
    if (['single','error'].includes(et)) return 'grounder';
    if (['double','triple','ground_rule_double'].includes(et)) return 'line_drive';
    if (['home_run','inside_park_hr'].includes(et)) return 'fly_ball';
    return null;
  };

  const goToHitLocationOrRunners = (eventType: string) => {
    if (BATTED_BALL_EVENTS.has(eventType)) {
      setHitLocationX(null); setHitLocationY(null);
      setHitType(inferHitType(eventType));
      setHitHardness('medium');
      setStep('hit_location');
    } else {
      checkRunners(eventType);
    }
  };

  const finishHitLocation = () => { if (selectedEvent) checkRunners(selectedEvent); };

  const checkRunners = (eventType: string) => {
    if (!gameState) return;
    const hasRunners = gameState.bases.first || gameState.bases.second || gameState.bases.third;

    // If the batter makes the third out, runner movement cannot change the live state.
    // Runner-made third outs still go through runner resolution because run timing can matter.
    if (OUT_EVENTS.includes(eventType) && gameState.outs + 1 >= 3) {
      submitPlay(eventType, [], fieldingPositions);
      return;
    }

    // Walks / HBP / IBB: auto-advance forced runners, no questions needed
    if (['walk', 'hit_by_pitch', 'intentional_walk'].includes(eventType)) {
      submitPlay(eventType, [], fieldingPositions);
      return;
    }

    // HR / inside-park HR: all runners + batter score automatically
    if (eventType === 'home_run' || eventType === 'inside_park_hr') {
      submitPlay(eventType, [], fieldingPositions);
      return;
    }

    // If no runners on base, skip runner resolution
    if (!hasRunners) {
      // Special case: ROE can include additional batter advance on the same error.
      if (ERROR_EVENTS.has(eventType)) {
        setRunnerQuestions([]);
        setStep('batter_advance');
        return;
      }
      submitPlay(eventType, [], fieldingPositions);
      return;
    }

    // Build runner questions for all occupied bases (closest to home first)
    const mins = computeMinDestinations(gameState.bases, eventType);
    const runners: RunnerQuestion[] = [];
    if (gameState.bases.third) runners.push({ base: 'third', playerId: gameState.bases.third, playerName: getPlayerName(gameState.bases.third), outcome: null, destination: null, minDestination: mins['third'] || 'third' });
    if (gameState.bases.second) runners.push({ base: 'second', playerId: gameState.bases.second, playerName: getPlayerName(gameState.bases.second), outcome: null, destination: null, minDestination: mins['second'] || 'second' });
    if (gameState.bases.first) runners.push({ base: 'first', playerId: gameState.bases.first, playerName: getPlayerName(gameState.bases.first), outcome: null, destination: null, minDestination: mins['first'] || 'first' });

    // Always ask about every runner -- never auto-resolve, because
    // even runners "forced home" can be thrown out (FC, ground out, etc.)
    setRunnerQuestions(runners);
    setCurrentRunnerIdx(0);
    setRunnerSafeDest(runners[0].minDestination);
    setRunnerOutSafeTab('safe');
    setStep('runner');
  };

  const answerRunner = (outcome: 'safe' | 'out', destination: string, advanceReason?: string, advanceErrorFielding?: number[]) => {
    const updated = [...runnerQuestions];
    const row: RunnerQuestion = {
      ...updated[currentRunnerIdx],
      outcome,
      destination: destination as RunnerQuestion['destination'],
      advanceReason: advanceReason || updated[currentRunnerIdx].advanceReason,
    };
    if (advanceErrorFielding && advanceErrorFielding.length > 0) {
      row.advanceErrorFielding = [...advanceErrorFielding];
    }
    updated[currentRunnerIdx] = row;
    setRunnerQuestions(updated);
    setRunnerOutSafeTab('safe');
    // Skip to next UNANSWERED runner (pre-filled runners already have outcome)
    let nextIdx = currentRunnerIdx + 1;
    while (nextIdx < updated.length && updated[nextIdx].outcome !== null) {
      nextIdx++;
    }
    if (nextIdx < updated.length) {
      setCurrentRunnerIdx(nextIdx);
      setRunnerSafeDest(updated[nextIdx].minDestination);
    } else {
      setRunnerSafeDest(null);
      if (betweenPitchEvent) {
        submitBetweenPitchPlay(betweenPitchEvent, updated);
      } else if (selectedEvent && ERROR_EVENTS.has(selectedEvent)) {
        setRunnerQuestions(updated);
        setStep('batter_advance');
      } else {
        submitPlay(selectedEvent!, updated, fieldingPositions);
      }
    }
  };

  // ── Between-pitch event state (WP, PB, balk multi-runner) ──
  const [betweenPitchEvent, setBetweenPitchEvent] = useState<string | null>(null);
  const [betweenPitchInitiatorRunnerId, setBetweenPitchInitiatorRunnerId] = useState<number | null>(null);

  // ── Runner action (click runner on base) ──
  const [runnerActionType, setRunnerActionType] = useState<string | null>(null);
  const [runnerActionDest, setRunnerActionDest] = useState<string | null>(null);
  const [runnerActionOutType, setRunnerActionOutType] = useState<string | null>(null);
  const [runnerActionFielding, setRunnerActionFielding] = useState<number[]>([]);

  const getAvailableBases = (fromBase: string) => {
    const bases: { key: string; label: string }[] = [];
    if (fromBase === 'first') {
      bases.push({ key: 'second', label: '2ND' }, { key: 'third', label: '3RD' }, { key: 'home', label: 'HOME' });
    } else if (fromBase === 'second') {
      bases.push({ key: 'third', label: '3RD' }, { key: 'home', label: 'HOME' });
    } else if (fromBase === 'third') {
      bases.push({ key: 'home', label: 'HOME' });
    }
    return bases;
  };

  const RUNNER_OUT_ACTIONS = new Set(['caught_stealing', 'picked_off', 'runner_interference', 'appeal_play',
    'tagged_out', 'force_out', 'hit_by_ball', 'missed_base', 'left_base_early',
    'left_base_path', 'offensive_interference', 'passed_runner', 'hesitation', 'double_play', 'triple_play']);

  const MULTI_RUNNER_EVENTS = new Set(['wild_pitch', 'passed_ball', 'balk', 'advance_on_error', 'stolen_base', 'defensive_indifference']);

  const startBetweenPitchRunnerCheck = (
    action: string,
    initiatingBase?: 'first' | 'second' | 'third' | null,
    initiatingDest?: string | null,
    initiatingErrorFielding?: number[],
  ) => {
    if (!gameState) return;
    setBetweenPitchEvent(action);
    const initiator = initiatingBase ? (gameState.bases as any)[initiatingBase] as number | null : null;
    setBetweenPitchInitiatorRunnerId(initiator ?? null);
    const runners: RunnerQuestion[] = [];
    if (gameState.bases.third) runners.push({ base: 'third', playerId: gameState.bases.third, playerName: getPlayerName(gameState.bases.third), outcome: null, destination: null, minDestination: 'third' });
    if (gameState.bases.second) runners.push({ base: 'second', playerId: gameState.bases.second, playerName: getPlayerName(gameState.bases.second), outcome: null, destination: null, minDestination: 'second' });
    if (gameState.bases.first) runners.push({ base: 'first', playerId: gameState.bases.first, playerName: getPlayerName(gameState.bases.first), outcome: null, destination: null, minDestination: 'first' });

    if (runners.length === 0) return;

    if (initiatingBase && initiatingDest) {
      for (const r of runners) {
        if (r.base === initiatingBase) {
          r.outcome = 'safe';
          r.destination = initiatingDest as any;
          r.advanceReason = action;
          if (action === 'advance_on_error' && initiatingErrorFielding?.length) {
            r.advanceErrorFielding = [...initiatingErrorFielding];
          }
          break;
        }
      }
    }

    const firstUnanswered = runners.findIndex(r => r.outcome === null);
    if (firstUnanswered === -1) {
      submitBetweenPitchPlay(action, runners, initiator ?? null);
      return;
    }

    setRunnerQuestions(runners);
    setCurrentRunnerIdx(firstUnanswered);
    setRunnerSafeDest(runners[firstUnanswered].minDestination);
    setRunnerOutSafeTab('safe');
    setActiveRunnerBase(null);
    setStep('runner');
  };

  const submitBetweenPitchPlay = async (action: string, runners: RunnerQuestion[], initiatingRunnerId = betweenPitchInitiatorRunnerId) => {
    if (!gameState || submitting) return;
    setSubmitting(true);
    try {
      let runnerFirstId = gameState.bases.first;
      let runnerSecondId = gameState.bases.second;
      let runnerThirdId = gameState.bases.third;
      let runsScored = 0;
      const runnersScored: number[] = [];

      const detailParts: string[] = [];
      const putoutFielderIds: number[] = [];
      const assistFielderIds: number[] = [];
      const errorFielderIds: number[] = [];
      const addFieldingCredits = (positions: number[]) => {
        for (let i = 0; i < positions.length; i++) {
          const fielder = fieldingLineupActive.find(l => l.position === positions[i]);
          if (!fielder || fielder.playerId == null) continue;
          if (i === positions.length - 1) putoutFielderIds.push(fielder.playerId);
          else assistFielderIds.push(fielder.playerId);
        }
      };
      for (const r of runners) {
        if (r.outcome === 'safe') {
          if (r.base === 'first') runnerFirstId = null;
          else if (r.base === 'second') runnerSecondId = null;
          else if (r.base === 'third') runnerThirdId = null;

          const stayed = r.destination === r.base;
          const eStr = r.advanceErrorFielding?.length ? ` E${r.advanceErrorFielding.join('')}` : '';
          if (r.advanceErrorFielding?.length) {
            for (const posNum of r.advanceErrorFielding) {
              const fielder = fieldingLineupActive.find(l => l.position === posNum);
              if (fielder && fielder.playerId != null) errorFielderIds.push(fielder.playerId);
            }
          }
          if (r.destination === 'home') { runnersScored.push(r.playerId); runsScored++; detailParts.push(`${r.playerName} scores${eStr}`); }
          else if (r.destination === 'third') { runnerThirdId = r.playerId; detailParts.push(`${r.playerName}${stayed ? ' stays at 3rd' : ' to 3rd'}${eStr}`); }
          else if (r.destination === 'second') { runnerSecondId = r.playerId; detailParts.push(`${r.playerName}${stayed ? ' stays at 2nd' : ' to 2nd'}${eStr}`); }
          else if (r.destination === 'first') { runnerFirstId = r.playerId; detailParts.push(`${r.playerName} stays at 1st${eStr}`); }
        } else if (r.outcome === 'out') {
          if (r.base === 'first') runnerFirstId = null;
          else if (r.base === 'second') runnerSecondId = null;
          else if (r.base === 'third') runnerThirdId = null;
          if (r.fielding?.length) addFieldingCredits(r.fielding);
          const fldStr = r.fielding?.length ? ` (${r.fielding.join('-')})` : '';
          detailParts.push(`${r.playerName} out${fldStr}`);
        } else {
          detailParts.push(`${r.playerName} stays`);
        }
      }

      const outsRecorded = runners.filter(r => r.outcome === 'out').length;
      const detail = `${action.replace(/_/g, ' ')}: ${detailParts.join(', ')}`;
      const uniqueErrorFielderIds = uniqNums(errorFielderIds);
      const errorsOnPlay = uniqueErrorFielderIds.length;
      const errPosSeq = uniqNums(runners.flatMap(r => r.advanceErrorFielding ?? []));
      const fsErr = errPosSeq.length > 0 ? `E${errPosSeq.join('')}` : null;

      await apiPost(`/admin/scoring/${gameId}/event`, {
        // IMPORTANT: for runner events like stolen_base / caught_stealing we store the initiating runner in batterId
        // so finalize-game can attribute SB/CS to the correct player.
        eventType: action,
        batterId: initiatingRunnerId,
        pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored,
        outsRecorded, balls, strikes,
        runnerFirstId, runnerSecondId, runnerThirdId, runnersScored,
        eventDetail: detail,
        putoutFielderIds: uniqNums(putoutFielderIds), assistFielderIds: uniqNums(assistFielderIds), errorFielderIds: uniqueErrorFielderIds,
        fieldingSequence: fsErr,
        errorsOnPlay,
      });
      setBetweenPitchEvent(null);
      setBetweenPitchInitiatorRunnerId(null);
      setActiveRunnerBase(null); setRunnerActionType(null); setRunnerActionDest(null);
      setRunnerActionOutType(null); setRunnerActionFielding([]);
      setRunnerQuestions([]); setCurrentRunnerIdx(0);
      setStep('pitch');
      await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleRunnerActionSubmit = async (action: string, dest: string | null, fielding?: number[]) => {
    if (!gameState || !activeRunnerBase || submitting) return;

    // For multi-runner events (WP, PB, balk, advance on error), prompt for ALL runners
    if (MULTI_RUNNER_EVENTS.has(action)) {
      startBetweenPitchRunnerCheck(action, activeRunnerBase, dest, fielding);
      return;
    }

    const runnerId = gameState.bases[activeRunnerBase];
    if (!runnerId) return;
    setSubmitting(true);
    try {
      const isOut = RUNNER_OUT_ACTIONS.has(action);
      const outCountForAction =
        action === 'triple_play'
          ? 3
          : action === 'double_play'
            ? 2
            : isOut
              ? 1
              : 0;
      const outsRecorded = outCountForAction;
      const isErrorAction = action === 'advance_on_error';
      const fld = fielding || [];
      const fieldingSequence = fld.length > 0 ? fld.join('-') : null;
      const fldDisplay = isErrorAction && fieldingSequence ? `E${fieldingSequence}` : fieldingSequence;
      const detail = `${getPlayerName(runnerId)}: ${action.replace(/_/g, ' ')}${fldDisplay ? ` (${fldDisplay})` : ''}${dest && !isOut ? ` to ${dest}` : ''}`;

      let runnerFirstId = gameState.bases.first;
      let runnerSecondId = gameState.bases.second;
      let runnerThirdId = gameState.bases.third;
      let runsScored = 0;
      const runnersScored: number[] = [];

      if (activeRunnerBase === 'first') runnerFirstId = null;
      else if (activeRunnerBase === 'second') runnerSecondId = null;
      else if (activeRunnerBase === 'third') runnerThirdId = null;

      if (!isOut && dest) {
        if (dest === 'home') { runnersScored.push(runnerId); runsScored = 1; }
        else if (dest === 'third') runnerThirdId = runnerId;
        else if (dest === 'second') runnerSecondId = runnerId;
        else if (dest === 'first') runnerFirstId = runnerId;
      }

      const putoutFielderIds: number[] = [];
      const assistFielderIds: number[] = [];
      const errorFielderIds: number[] = [];

      if (fld.length > 0) {
        if (isErrorAction) {
          for (const posNum of fld) {
            const fielder = fieldingLineupActive.find(l => l.position === posNum);
            if (fielder && fielder.playerId != null) errorFielderIds.push(fielder.playerId);
          }
        } else {
          for (let i = 0; i < fld.length; i++) {
            const fielder = fieldingLineupActive.find(l => l.position === fld[i]);
            if (fielder && fielder.playerId != null) {
              if (i === fld.length - 1) putoutFielderIds.push(fielder.playerId);
              else assistFielderIds.push(fielder.playerId);
            }
          }
        }
      }

      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType: action, batterId: runnerId, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored,
        outsRecorded, balls, strikes,
        runnerFirstId, runnerSecondId, runnerThirdId, runnersScored,
        fieldingSequence: isErrorAction && fld.length > 0 ? `E${fld.join('')}` : fieldingSequence,
        putoutFielderIds: uniqNums(putoutFielderIds), assistFielderIds: uniqNums(assistFielderIds), errorFielderIds: uniqNums(errorFielderIds),
        errorsOnPlay: uniqNums(errorFielderIds).length,
        eventDetail: detail,
      });
      setActiveRunnerBase(null); setRunnerActionType(null); setRunnerActionDest(null);
      setRunnerActionOutType(null); setRunnerActionFielding([]);
      setStep('pitch');
      await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  // ── Substitution handlers ──
  const handleDefensiveSub = async (newPlayerId: number) => {
    if (!game || subPosition === null) return;
    const outPlayer = defensiveChangeLineup.find(l => l.position === subPosition);
    if (!outPlayer || outPlayer.playerId == null) return;
    try {
      await apiPut(`/admin/scoring/${gameId}/substitute`, {
        outPlayerId: outPlayer.playerId, inPlayerId: newPlayerId,
        teamId: outPlayer.teamId, position: subPosition,
        inning: gameState?.inning ?? 1, half: gameState?.half ?? 'top',
        subKind: 'defensive',
      });
      setSubPosition(null); setSubTeamId(null); setStep('pitch');
      await loadState(); await loadRosters();
    } catch (err: any) { alert(err.message || 'Sub failed'); }
  };

  const handlePositionSwap = async (targetPosition: number) => {
    if (!game || subPosition === null) return;
    const currentPlayer = draftFieldingLineup.find(l => l.position === subPosition);
    const targetPlayer = draftFieldingLineup.find(l => l.position === targetPosition);
    if (!currentPlayer || currentPlayer.playerId == null) return;

    const nextPositions = new Map(
      defensiveChangeLineup
        .filter((l) => l.playerId != null && l.position != null)
        .map((l) => [l.playerId!, l.position!] as const),
    );
    for (const change of pendingPositionChanges) {
      nextPositions.set(change.playerId, change.newPosition);
    }
    nextPositions.set(currentPlayer.playerId, targetPosition);
    if (targetPlayer && targetPlayer.playerId != null) {
      nextPositions.set(targetPlayer.playerId, subPosition);
    }

    const nextChanges = defensiveChangeLineup
      .filter((entry) => entry.playerId != null && entry.position != null)
      .map((entry) => ({
        playerId: entry.playerId!,
        oldPosition: entry.position!,
        newPosition: nextPositions.get(entry.playerId!) ?? entry.position!,
      }))
      .filter((change) => change.oldPosition !== change.newPosition);

    setPendingPositionChanges(nextChanges);
    setSubPosition(targetPlayer ? subPosition : targetPosition);
  };

  const handleCommitPositionChanges = async () => {
    if (pendingPositionChanges.length === 0) return;
    try {
      await apiPut(`/admin/scoring/${gameId}/swap-positions`, {
        changes: pendingPositionChanges.map(({ playerId, newPosition }) => ({ playerId, newPosition })),
      });
      setPendingPositionChanges([]);
      setSubPosition(null);
      setSubTeamId(null);
      setStep('pitch');
      await loadState();
    } catch (err: any) { alert(err.message || 'Swap failed'); }
  };

  const handleOffensiveSub = async (newPlayerId: number) => {
    if (!game || subBattingSlot === null) return;
    const outPlayer = offensiveChangeLineup.find(l => l.battingOrder === subBattingSlot);
    if (!outPlayer || outPlayer.playerId == null) {
      alert('This slot has no player — use Adjust active lineups to assign someone before substituting.');
      return;
    }
    try {
      await apiPut(`/admin/scoring/${gameId}/substitute`, {
        outPlayerId: outPlayer.playerId, inPlayerId: newPlayerId,
        teamId: outPlayer.teamId, position: outPlayer.position,
        inning: gameState?.inning ?? 1, half: gameState?.half ?? 'top',
        subKind: 'offensive',
      });
      setSubBattingSlot(null); setSubTeamId(null); setStep('pitch');
      await loadState(); await loadRosters();
    } catch (err: any) { alert(err.message || 'Sub failed'); }
  };

  // ── Submit play ──
  const submitPlay = async (
    eventType: string,
    runners: RunnerQuestion[],
    fielding: number[],
    batterDestOverride?: 'first' | 'second' | 'third' | 'home'
  ) => {
    if (!currentBatter || currentBatter.playerId == null || !gameState || submitting) return;
    if ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) {
      alert('Select LHB or RHB for this switch hitter before submitting the play.');
      return;
    }
    setSubmitting(true);
    try {
      const isOut = OUT_EVENTS.includes(eventType);
      const runnerOuts = runners.filter(r => r.outcome === 'out').length;
      const outsRecorded = (isOut ? 1 : 0) + runnerOuts;
      let runsScored = 0, rbi = 0;
      const runnersScored: number[] = [];
      const runnerScoredReasons: string[] = [];
      let runnerFirstId: number | null = null, runnerSecondId: number | null = null, runnerThirdId: number | null = null;

      if (eventType === 'home_run' || eventType === 'inside_park_hr') {
        if (gameState.bases.first) { runnersScored.push(gameState.bases.first); runnerScoredReasons.push('on_play'); runsScored++; rbi++; }
        if (gameState.bases.second) { runnersScored.push(gameState.bases.second); runnerScoredReasons.push('on_play'); runsScored++; rbi++; }
        if (gameState.bases.third) { runnersScored.push(gameState.bases.third); runnerScoredReasons.push('on_play'); runsScored++; rbi++; }
        runnersScored.push(currentBatter.playerId); runnerScoredReasons.push('on_play'); runsScored++; rbi++;
      } else if (['walk','hit_by_pitch','intentional_walk'].includes(eventType)) {
        if (gameState.bases.first) {
          if (gameState.bases.second) {
            if (gameState.bases.third) { runnersScored.push(gameState.bases.third); runnerScoredReasons.push('on_play'); runsScored++; rbi++; }
            runnerThirdId = gameState.bases.second;
          } else { runnerThirdId = gameState.bases.third; }
          runnerSecondId = gameState.bases.first;
        } else { runnerSecondId = gameState.bases.second; runnerThirdId = gameState.bases.third; }
        runnerFirstId = currentBatter.playerId;
      } else if (runners.length > 0) {
        for (const r of runners) {
          if (r.outcome === 'safe' && r.destination === 'home') {
            runnersScored.push(r.playerId);
            runnerScoredReasons.push(r.advanceReason || 'on_play');
            runsScored++;
            const noRbi = NO_RBI_BATTER_EVENTS.has(eventType) || NO_RBI_REASONS.has(r.advanceReason || '');
            if (!noRbi) rbi++;
          }
          else if (r.outcome === 'safe') {
            if (r.destination === 'third') runnerThirdId = r.playerId;
            else if (r.destination === 'second') runnerSecondId = r.playerId;
            else if (r.destination === 'first') runnerFirstId = r.playerId;
          }
        }
        if (!isOut) {
          if (batterDestOverride && ERROR_EVENTS.has(eventType)) {
            if (batterDestOverride === 'first') runnerFirstId = currentBatter.playerId;
            else if (batterDestOverride === 'second') runnerSecondId = currentBatter.playerId;
            else if (batterDestOverride === 'third') runnerThirdId = currentBatter.playerId;
            else {
              runnersScored.push(currentBatter.playerId);
              runnerScoredReasons.push('advance_on_error');
              runsScored++;
            }
          } else if (['single','bunt_single','error','fielders_choice','dropped_third_strike','wild_pitch_third_strike','sac_bunt_error','sac_fly_error','catcher_obstruction'].includes(eventType)) {
            if (!runnerFirstId) runnerFirstId = currentBatter.playerId;
            else if (!runnerSecondId) runnerSecondId = currentBatter.playerId;
            else runnerThirdId = currentBatter.playerId;
          } else if (eventType === 'double' || eventType === 'ground_rule_double') {
            if (!runnerSecondId) runnerSecondId = currentBatter.playerId;
            else runnerThirdId = currentBatter.playerId;
          } else if (eventType === 'triple') { if (!runnerThirdId) runnerThirdId = currentBatter.playerId; }
        }
      } else {
        if (!isOut) {
          if (batterDestOverride && ['error', 'sac_bunt_error', 'sac_fly_error'].includes(eventType)) {
            if (batterDestOverride === 'first') runnerFirstId = currentBatter.playerId;
            else if (batterDestOverride === 'second') runnerSecondId = currentBatter.playerId;
            else if (batterDestOverride === 'third') runnerThirdId = currentBatter.playerId;
            else {
              runnersScored.push(currentBatter.playerId);
              runnerScoredReasons.push('advance_on_error');
              runsScored++;
            }
          } else if (['single','bunt_single','error','dropped_third_strike','wild_pitch_third_strike','sac_bunt_error','sac_fly_error','catcher_obstruction'].includes(eventType)) runnerFirstId = currentBatter.playerId;
          else if (eventType === 'double' || eventType === 'ground_rule_double') runnerSecondId = currentBatter.playerId;
          else if (eventType === 'triple') runnerThirdId = currentBatter.playerId;
        } else { runnerFirstId = gameState.bases.first; runnerSecondId = gameState.bases.second; runnerThirdId = gameState.bases.third; }
      }

      const fieldingSequence = fielding.length > 0 ? fielding.join('-') : null;

      // Convert fielding position numbers to player IDs
      const putoutFielderIds: number[] = [];
      const assistFielderIds: number[] = [];
      const errorFielderIds: number[] = [];

      if (fielding.length > 0) {
        const isErrorPlay = ERROR_EVENTS.has(eventType);
        if (isErrorPlay) {
          // For error events: all positions are error fielders
          for (const posNum of fielding) {
            const fielder = fieldingLineupActive.find(l => l.position === posNum);
            if (fielder && fielder.playerId != null) errorFielderIds.push(fielder.playerId);
          }
        } else {
          // Convention: last position in sequence = putout, all others = assists
          for (let i = 0; i < fielding.length; i++) {
            const posNum = fielding[i];
            const fielder = fieldingLineupActive.find(l => l.position === posNum);
            if (fielder && fielder.playerId != null) {
              if (i === fielding.length - 1) putoutFielderIds.push(fielder.playerId);
              else assistFielderIds.push(fielder.playerId);
            }
          }
        }
      }

      for (const r of runners) {
        if (r.outcome !== 'out' || !r.fielding?.length) continue;
        for (let i = 0; i < r.fielding.length; i++) {
          const fielder = fieldingLineupActive.find(l => l.position === r.fielding![i]);
          if (!fielder || fielder.playerId == null) continue;
          if (i === r.fielding.length - 1) putoutFielderIds.push(fielder.playerId);
          else assistFielderIds.push(fielder.playerId);
        }
      }

      // Runners who advanced on a fielding error (e.g. throwing error on a ground out)
      for (const r of runners) {
        if (r.outcome === 'safe' && r.advanceErrorFielding && r.advanceErrorFielding.length > 0) {
          for (const posNum of r.advanceErrorFielding) {
            const fielder = fieldingLineupActive.find(l => l.position === posNum);
            if (fielder && fielder.playerId != null) errorFielderIds.push(fielder.playerId);
          }
        }
      }

      const isErrorPlay = ERROR_EVENTS.has(eventType);
      const DEST_SHORT: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', home: 'home' };
      const runnerParts: string[] = [];
      for (const r of runners) {
        const eStr = r.advanceErrorFielding?.length ? ` E${r.advanceErrorFielding.join('')}` : '';
        if (r.outcome === 'safe' && r.destination === 'home') {
          runnerParts.push(`${r.playerName} scores${eStr}`);
        } else if (r.outcome === 'safe' && r.destination && r.destination !== r.base) {
          runnerParts.push(`${r.playerName} to ${DEST_SHORT[r.destination] || r.destination}${eStr}`);
        } else if (r.outcome === 'out') {
          const fldStr = r.fielding?.length ? ` (${r.fielding.join('-')})` : '';
          runnerParts.push(`${r.playerName} out${fldStr}`);
        }
      }
      const runnerSuffix = runnerParts.length > 0 ? `. ${runnerParts.join(', ')}` : '';
      let batterAdvanceSuffix = '';
      if (batterDestOverride && ERROR_EVENTS.has(eventType) && batterDestOverride !== 'first') {
        const bn = `${currentBatter.firstName} ${currentBatter.lastName}`;
        if (batterDestOverride === 'second') batterAdvanceSuffix = `. ${bn} advances to 2nd on the same error`;
        else if (batterDestOverride === 'third') batterAdvanceSuffix = `. ${bn} advances to 3rd on the same error`;
        else if (batterDestOverride === 'home') batterAdvanceSuffix = `. ${bn} scores on the same error`;
      }
      const detail = `${currentBatter.firstName} ${currentBatter.lastName}: ${eventType.replace(/_/g, ' ')}${fieldingSequence ? ` (${isErrorPlay ? 'E' : ''}${fieldingSequence})` : ''}${runnerSuffix}${batterAdvanceSuffix}`;
      const paSide = batterSideForCurrentPa();
      const uniqueErrorFielderIds = uniqNums(errorFielderIds);
      const errorsOnPlay = uniqueErrorFielderIds.length;
      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType, batterId: currentBatter.playerId, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi, runsScored, outsRecorded,
        balls, strikes, runnerFirstId, runnerSecondId, runnerThirdId, runnersScored, runnerScoredReasons, fieldingSequence, eventDetail: detail,
        hitLocationX, hitLocationY, hitType, hitHardness,
        putoutFielderIds: uniqNums(putoutFielderIds), assistFielderIds: uniqNums(assistFielderIds), errorFielderIds: uniqueErrorFielderIds,
        errorsOnPlay,
        ...(paSide ? { batterSide: paSide } : {}),
      });
      setBalls(0); setStrikes(0); setStep('pitch'); setSelectedEvent(null);
      setFieldingPositions([]); setRunnerQuestions([]); setCurrentRunnerIdx(0);
      setBetweenPitchEvent(null);
      setHitLocationX(null); setHitLocationY(null); setHitType(null); setHitHardness(null);
      await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); } finally { setSubmitting(false); }
  };

  /** Completes the current runner answer after picking error fielder(s) for "advanced on error" / "error" on a safe advance. */
  const finishRunnerAdvanceErrorFielding = () => {
    const pending = runnerAdvanceErrorPending;
    if (!pending || runnerQuestions.length === 0) return;
    const idx = currentRunnerIdx;
    const updated = [...runnerQuestions];
    updated[idx] = {
      ...updated[idx],
      outcome: 'safe',
      destination: pending.dest as 'first' | 'second' | 'third' | 'home',
      advanceReason: pending.reason,
      advanceErrorFielding: runnerAdvanceErrorFielding.length > 0 ? [...runnerAdvanceErrorFielding] : undefined,
    };
    setRunnerQuestions(updated);
    setRunnerAdvanceErrorPending(null);
    setRunnerAdvanceErrorFielding([]);
    setRunnerOutSafeTab('safe');
    let nextIdx = idx + 1;
    while (nextIdx < updated.length && updated[nextIdx].outcome !== null) nextIdx++;
    if (nextIdx < updated.length) {
      setCurrentRunnerIdx(nextIdx);
      setRunnerSafeDest(updated[nextIdx].minDestination);
      setStep('runner');
    } else {
      setRunnerSafeDest(null);
      if (betweenPitchEvent) {
        submitBetweenPitchPlay(betweenPitchEvent, updated);
      } else if (selectedEvent && ERROR_EVENTS.has(selectedEvent)) {
        setRunnerQuestions(updated);
        setStep('batter_advance');
      } else {
        submitPlay(selectedEvent!, updated, fieldingPositions);
      }
    }
  };

  const handleUndo = async () => {
    if (historyBusy) return;
    setHistoryBusy(true);
    try {
      await apiPost(`/admin/scoring/${gameId}/undo`, {});
      await loadState();
      cancelWizard();
    } catch (err: any) { alert(err.message); }
    finally { setHistoryBusy(false); }
  };
  const handleRedo = async () => {
    if (historyBusy) return;
    setHistoryBusy(true);
    try {
      await apiPost(`/admin/scoring/${gameId}/redo`, {});
      await loadState();
      cancelWizard();
    } catch (err: any) { alert(err.message); }
    finally { setHistoryBusy(false); }
  };
  const handleFinalize = async () => {
    if (!confirm('Finalize? Stats and standings will be computed from the event log. Later event edits can recompute official stats.')) return;
    try { await apiPost(`/admin/scoring/${gameId}/finalize`, {}); alert('Game finalized!'); navigate('/games'); } catch (err: any) { alert(err.message); }
  };
  const handleEndHalfInning = async () => {
    if (!gameState || submitting) return;
    const outsToAdd = Math.max(0, 3 - gameState.outs);
    const runnersOn = [gameState.bases.first, gameState.bases.second, gameState.bases.third].filter(Boolean).length;
    if ((outsToAdd > 0 || runnersOn > 0) && !confirm(`End this half inning? This will add ${outsToAdd} out${outsToAdd === 1 ? '' : 's'} and clear ${runnersOn} runner${runnersOn === 1 ? '' : 's'} from base.`)) {
      return;
    }
    setSubmitting(true);
    try {
      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType: 'end_half_inning', batterId: null, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored: 0,
        outsRecorded: outsToAdd, balls: 0, strikes: 0,
        runnerFirstId: null, runnerSecondId: null, runnerThirdId: null,
        runnersScored: [], eventDetail: 'End of half inning (manual)',
      });
      setBalls(0); setStrikes(0); cancelWizard(); await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); } finally { setSubmitting(false); }
  };
  const openAdjustScore = () => {
    setAdjustHome(gameState?.homeScore ?? 0);
    setAdjustAway(gameState?.awayScore ?? 0);
    setStep('adjust_score');
  };
  const submitAdjustScore = async () => {
    try {
      if (!confirm('Adjust the team score only? Player runs, RBIs, and pitcher runs are not changed by this correction.')) return;
      await apiPut(`/admin/scoring/${gameId}/adjust-score`, { homeScore: adjustHome, awayScore: adjustAway });
      cancelWizard(); await loadState();
    } catch (err: any) { alert(err.message || 'Failed to adjust score'); }
  };
  const handleMiscEvent = async (eventType: string, detail: string) => {
    if (!gameState || submitting) return;
    if (currentBatter && (currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) {
      alert('Select LHB or RHB for this switch hitter first.');
      return;
    }
    setSubmitting(true);
    try {
      const miscSide = batterSideForCurrentPa();
      if (eventType === 'balk') {
        const r1 = gameState.bases.first;
        const r2 = gameState.bases.second;
        const r3 = gameState.bases.third;

        // Balk with no runners is effectively an illegal pitch; in our UI "Balk"
        // is intended for the common case with runners where all runners advance.
        if (r1 || r2 || r3) {
          const runnerFirstId = null;
          const runnerSecondId = r1 ?? null;
          const runnerThirdId = r2 ?? null;
          const runnersScored: number[] = [];
          let runsScored = 0;
          const detailParts: string[] = [];

          if (r1) detailParts.push(`${getPlayerName(r1)} to 2nd`);
          if (r2) detailParts.push(`${getPlayerName(r2)} to 3rd`);
          if (r3) {
            runnersScored.push(r3);
            runsScored = 1;
            detailParts.push(`${getPlayerName(r3)} scores`);
          }

          await apiPost(`/admin/scoring/${gameId}/event`, {
            eventType,
            batterId: currentBatter?.playerId ?? null,
            pitcherId: currentPitcher?.playerId,
            inning: gameState.inning,
            half: gameState.half,
            rbi: 0,
            runsScored,
            outsRecorded: 0,
            balls,
            strikes,
            runnerFirstId,
            runnerSecondId,
            runnerThirdId,
            runnersScored,
            eventDetail: `balk: ${detailParts.join(', ')}`,
            ...(miscSide ? { batterSide: miscSide } : {}),
          });
          cancelWizard();
          await loadState();
          return;
        }
      }

      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType, batterId: currentBatter?.playerId, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored: 0,
        outsRecorded: 0, balls, strikes,
        runnerFirstId: gameState.bases.first, runnerSecondId: gameState.bases.second, runnerThirdId: gameState.bases.third,
        runnersScored: [], eventDetail: detail,
        ...(miscSide ? { batterSide: miscSide } : {}),
      });
      cancelWizard(); await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); } finally { setSubmitting(false); }
  };
  const cancelWizard = () => { setStep('pitch'); setSelectedEvent(null); setFieldingPositions([]); setRunnerQuestions([]); setCurrentRunnerIdx(0); setActiveRunnerBase(null); setRunnerActionType(null); setRunnerActionDest(null); setRunnerActionOutType(null); setRunnerActionFielding([]); setSubPosition(null); setSubTeamId(null); setSubBattingSlot(null); setPendingPositionChanges([]); setRunnerOutSafeTab('safe'); setRunnerSafeDest(null); setHitLocationX(null); setHitLocationY(null); setHitType(null); setHitHardness(null); setBetweenPitchEvent(null); setBetweenPitchInitiatorRunnerId(null); setOutSafeMorePage(false); setRunnerOutPendingType(null); setRunnerOutFielding([]); setRunnerAdvanceErrorPending(null); setRunnerAdvanceErrorFielding([]); setMiscGhostRunnerId(null); };

  const submitPlaceRunnerSecond = async () => {
    if (!gameState || submitting || !game || miscGhostRunnerId == null) return;
    if (currentBatter && (currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) {
      alert('Select LHB or RHB for this switch hitter first.');
      return;
    }
    setSubmitting(true);
    try {
      const miscSide = batterSideForCurrentPa();
      const nm = getPlayerName(miscGhostRunnerId);
      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType: 'place_runner_second',
        batterId: null,
        pitcherId: currentPitcher?.playerId,
        inning: gameState.inning,
        half: gameState.half,
        rbi: 0,
        runsScored: 0,
        outsRecorded: 0,
        balls,
        strikes,
        runnerFirstId: gameState.bases.first,
        runnerSecondId: miscGhostRunnerId,
        runnerThirdId: gameState.bases.third,
        runnersScored: [],
        eventDetail: `Runner on 2nd (extras): ${nm}`,
        ...(miscSide ? { batterSide: miscSide } : {}),
      });
      cancelWizard();
      await loadState();
    } catch (err: any) {
      alert(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openLineupAdjust = () => {
    if (!game) return;
    const toRows = (lineup: LineupEntry[]): LineupAdjustRow[] =>
      [...lineup]
        .filter((l) => l.isActive)
        .sort((a, b) => a.battingOrder - b.battingOrder)
        .map((l) => ({
          id: l.id,
          playerId: l.playerId,
          battingOrder: l.battingOrder,
          position: l.position,
          firstName: l.firstName,
          lastName: l.lastName,
        }));
    setLineupAdjustHome(toRows(homeLineup));
    setLineupAdjustAway(toRows(awayLineup));
    setLineupAdjustTeam('away');
    setLineupAdjustOpen(true);
    cancelWizard();
  };

  const updateLineupAdjustRow = (
    side: 'home' | 'away',
    rowId: number,
    patch: Partial<Pick<LineupAdjustRow, 'battingOrder' | 'position' | 'playerId' | 'firstName' | 'lastName'>>,
  ) => {
    const setter = side === 'home' ? setLineupAdjustHome : setLineupAdjustAway;
    setter((rows) => rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  const submitLineupAdjust = async () => {
    setLineupAdjustBusy(true);
    try {
      const homePayload = lineupAdjustHome.map(({ id, playerId, battingOrder, position }) => ({
        id,
        playerId,
        battingOrder,
        position,
      }));
      const awayPayload = lineupAdjustAway.map(({ id, playerId, battingOrder, position }) => ({
        id,
        playerId,
        battingOrder,
        position,
      }));
      await apiPut(`/admin/scoring/${gameId}/active-lineup`, {
        home: homePayload,
        away: awayPayload,
      });
      setHomeLineup((prev) => patchLineupBoPos(prev, homePayload));
      setAwayLineup((prev) => patchLineupBoPos(prev, awayPayload));
      setLineupAdjustOpen(false);
      await loadState();
      await loadRosters();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save lineup');
    } finally {
      setLineupAdjustBusy(false);
    }
  };

  if (!gameIdStr || Number.isNaN(gameId) || gameId <= 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-screen bg-[#0c1220] px-4">
        <p className="text-red-400 text-center">Invalid game link.</p>
        <button type="button" onClick={() => navigate('/games')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm">Back to games</button>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#0c1220]"><span className="text-gray-400">Loading...</span></div>;

  if (loadError && !game) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-screen bg-[#0c1220] px-4">
        <p className="text-red-400 text-center max-w-md">{loadError}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setLoading(true); void loadState(); }} className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-bold">Retry</button>
          <button type="button" onClick={() => navigate('/games')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm">Back to games</button>
        </div>
      </div>
    );
  }

  if (!game) return <div className="flex items-center justify-center h-screen bg-[#0c1220]"><span className="text-red-400">Game not found</span></div>;

  // ── LINEUP SETUP ──
  if (phase === 'setup') {
    const currentRoster = setupTeam === 'home' ? homeRoster : awayRoster;
    const currentSetup = setupTeam === 'home' ? setupHome : setupAway;
    const selectedIds = new Set(currentSetup.map((p) => p.playerId).filter((id): id is number => id != null));
    const opposingSelectedIds = new Set(
      (setupTeam === 'home' ? setupAway : setupHome).map((p) => p.playerId).filter((id): id is number => id != null),
    );
    const availablePlayers = currentRoster.filter(
      (p) => !selectedIds.has(p.playerId) && !opposingSelectedIds.has(p.playerId),
    );
    const hintsMap = setupTeam === 'home' ? lineupHintsHome : lineupHintsAway;
    const availableSorted = [...availablePlayers].sort((a, b) => {
      const paA = hintsMap[a.playerId]?.pa ?? 0;
      const paB = hintsMap[b.playerId]?.pa ?? 0;
      if (paB !== paA) return paB - paA;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });
    return (
      <>
      <div className="min-h-screen bg-[#0c1220] text-white">
        <div className="bg-[#162038] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/games')} className="text-sm text-white/50 hover:text-white">← Back</button>
          <h1 className="font-bold text-lg">{game.awayTeamName} @ {game.homeTeamName} — Lineup</h1>
          <button onClick={handleSetupSubmit} disabled={setupHome.length === 0 || setupAway.length === 0 || !setupUmpire.trim() || !setupScorer.trim()} className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white text-sm font-bold rounded-lg">Start Game</button>
        </div>
        <div className="max-w-6xl mx-auto p-6">
          <div className="mb-4 grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Umpire</span>
              <input
                value={setupUmpire}
                onChange={(e) => setSetupUmpire(e.target.value)}
                placeholder="Umpire name"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Scorer</span>
              <input
                value={setupScorer}
                onChange={(e) => setSetupScorer(e.target.value)}
                placeholder="Scorer name"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {(['away', 'home'] as const).map(side => (
              <button key={side} onClick={() => setSetupTeam(side)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${setupTeam === side ? 'bg-accent text-white' : 'bg-white/10 text-white/60'}`}>
                {side === 'away' ? game.awayTeamName : game.homeTeamName} ({(side === 'home' ? setupHome : setupAway).length}/9)
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-white/50 uppercase">Available</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addVacantSlotToSetup(setupTeam)}
                    className="shrink-0 rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
                  >
                    + Vacant slot
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddRosterOpen(true)}
                    className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    + New player ({setupTeam === 'home' ? game.homeTeamName : game.awayTeamName})
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {availableSorted.map((p) => (
                  <button
                    key={p.playerId}
                    type="button"
                    onClick={() => addToSetup(setupTeam, p.playerId)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm flex items-center gap-2"
                  >
                    {p.jerseyNumber && <span className="text-white/30 font-mono">#{p.jerseyNumber}</span>}
                    <span className="flex-1">
                      {p.firstName.charAt(0)}. {p.lastName}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${p.licensePaid === 'paid' ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/50 uppercase mb-3">Batting order</h3>
              <div className="space-y-1">
                {currentSetup.map((entry, idx) => {
                  const player =
                    entry.playerId != null ? currentRoster.find((pr) => pr.playerId === entry.playerId) : null;
                  return (
                    <div
                      key={`slot-${idx}-${entry.playerId ?? 'vacant'}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(idx));
                        e.dataTransfer.effectAllowed = 'move';
                        setSetupDragFrom(idx);
                      }}
                      onDragEnd={() => setSetupDragFrom(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromStr = e.dataTransfer.getData('text/plain');
                        const from = parseInt(fromStr, 10);
                        if (Number.isNaN(from) || from === idx) return;
                        moveSetup(setupTeam, from, idx);
                        setSetupDragFrom(null);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-transparent cursor-grab active:cursor-grabbing select-none ${
                        setupDragFrom === idx ? 'opacity-50 border-amber-500/40' : 'hover:border-white/10'
                      }`}
                    >
                      <span className="text-white/40 text-lg leading-none" aria-hidden>
                        ⋮⋮
                      </span>
                      <span className="text-white/30 font-bold w-6">{idx + 1}</span>
                      {player && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${player.licensePaid === 'paid' ? 'bg-green-500' : 'bg-red-500'}`}
                        />
                      )}
                      <span className="flex-1 text-sm">
                        {entry.playerId == null
                          ? <span className="text-white/45 italic">Vacant (ejection / empty)</span>
                          : player
                            ? `${player.firstName.charAt(0)}. ${player.lastName}`
                            : '?'}
                      </span>
                      {entry.playerId != null ? (
                        <select
                          value={entry.position ?? 1}
                          onChange={(e) => updatePosition(setupTeam, idx, Number(e.target.value))}
                          className={ADMIN_SELECT_POS}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {Object.entries(POS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] text-white/30 w-[7rem] text-right">No position</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFromSetup(setupTeam, idx)}
                        className="text-red-400 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {addRosterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="add-roster-title">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#162038] p-5 shadow-xl">
            <h2 id="add-roster-title" className="mb-1 text-lg font-bold text-white">Add player to roster</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">First name *</span>
                <input
                  value={addRosterFirst}
                  onChange={(e) => setAddRosterFirst(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
                  autoComplete="given-name"
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Last name *</span>
                <input
                  value={addRosterLast}
                  onChange={(e) => setAddRosterLast(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
                  autoComplete="family-name"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Jersey # (optional)</span>
                <input
                  value={addRosterJersey}
                  onChange={(e) => setAddRosterJersey(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/30"
                  maxLength={5}
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Bats</span>
                <select
                  value={addRosterBats}
                  onChange={(e) => setAddRosterBats(e.target.value)}
                  className={ADMIN_SELECT_MD}
                >
                  <option value="">—</option>
                  <option value="L">L</option>
                  <option value="R">R</option>
                  <option value="S">S</option>
                </select>
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/40">Throws</span>
                <select
                  value={addRosterThrows}
                  onChange={(e) => setAddRosterThrows(e.target.value)}
                  className={ADMIN_SELECT_MD}
                >
                  <option value="">—</option>
                  <option value="L">L</option>
                  <option value="R">R</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={addRosterBusy}
                onClick={() => setAddRosterOpen(false)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/5 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addRosterBusy}
                onClick={() => void submitAddRosterPlayer()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-40"
              >
                {addRosterBusy ? 'Saving…' : 'Save & add to list'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ── SCORING ──
  if (!gameState) return null;

  // Roster for subs (players not in current lineup)
  const defensiveChangeTeamRoster = defensiveChangeTeamId === game.homeTeamId ? homeRoster : awayRoster;
  const activeDefensiveChangeIds = new Set(
    defensiveChangeLineup.map((l) => l.playerId).filter((id): id is number => id != null),
  );
  const offensiveChangeTeamRoster = offensiveChangeTeamId === game.homeTeamId ? homeRoster : awayRoster;
  const activeOffensiveChangeIds = new Set(
    offensiveChangeLineup.map((l) => l.playerId).filter((id): id is number => id != null),
  );
  const availableFieldingSubs = defensiveChangeTeamRoster.filter(p => !activeDefensiveChangeIds.has(p.playerId));
  const availableBattingSubs = offensiveChangeTeamRoster.filter(p => !activeOffensiveChangeIds.has(p.playerId));
  const setSubEditTeam = (teamId: number) => {
    if (subTeamId === teamId) return;
    setSubTeamId(teamId);
    setPendingPositionChanges([]);
  };

  const getCurrentPitcherPitches = (pid: number | null | undefined) =>
    pid != null ? pitcherPitchCounts[pid]?.total ?? 0 : 0;
  const getCurrentPitcherBalls = (pid: number | null | undefined) =>
    pid != null ? pitcherPitchCounts[pid]?.balls ?? 0 : 0;
  const getCurrentPitcherStrikes = (pid: number | null | undefined) =>
    pid != null ? pitcherPitchCounts[pid]?.strikes ?? 0 : 0;

  return (
    <div className="min-h-screen bg-[#0a1029] text-white flex flex-col">
      {/* ── Scoreboard bar ── */}
      <div className="bg-[#060d1a] border-b border-white/10 px-4 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs font-bold font-mono">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-[10px] uppercase w-12">Visitor</span>
              <span className="text-white/80 truncate max-w-[100px]">{game.awayTeamName}</span>
              <span className="text-2xl text-white tabular-nums ml-1">{gameState.awayScore}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-[10px] uppercase w-12">Home</span>
              <span className="text-white/80 truncate max-w-[100px]">{game.homeTeamName}</span>
              <span className="text-2xl text-white tabular-nums ml-1">{gameState.homeScore}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-white/40 text-[10px]">INN</span>
              <span className="text-white text-sm">{gameState.half === 'top' ? '▲' : '▼'} {gameState.inning}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/40 text-[10px]">OUTS</span>
              <div className="flex gap-1">
                {[0,1,2].map(i => <div key={i} className={`w-3 h-3 rounded-full border ${i < gameState.outs ? 'bg-red-500 border-red-400' : 'border-white/20'}`} />)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1"><span className="text-white/40 text-[10px]">B</span>
                {[0,1,2,3].map(i => <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < balls ? 'bg-green-400' : 'bg-white/15'}`} />)}
              </div>
              <div className="flex items-center gap-1"><span className="text-white/40 text-[10px]">S</span>
                {[0,1,2].map(i => <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < strikes ? 'bg-yellow-400' : 'bg-white/15'}`} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex max-w-6xl mx-auto w-full">
        {/* ── Left panel: Lineups + Pitcher info ── */}
        <div className="w-52 shrink-0 border-r border-white/5 overflow-y-auto py-3 px-2">
          {/* Current batter highlight */}
          <div className="bg-[#1a2744] rounded-lg px-3 py-2 mb-3 border border-white/5">
            <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider mb-0.5">At Bat</div>
            <button onClick={() => {
              if (!currentBatter) return;
              setSubTeamId(battingTeamId ?? null);
              setSubPosition(null);
              setSubBattingSlot(battingOrderSlot);
              setStep('sub_offense');
            }}
              className="text-white font-bold text-sm hover:text-amber-300 transition-colors flex items-center gap-1">
              <span className="text-white/30 text-xs">#{battingOrderSlot}</span>
              {currentBatter ? `${currentBatter.firstName.charAt(0)}. ${currentBatter.lastName}` : <span className="text-red-400/60 italic">(empty slot)</span>}
            </button>
          </div>

          {/* Pitcher info with pitch count */}
          {currentPitcher && (
            <div className="bg-[#1a2744] rounded-lg px-3 py-2 mb-3 border border-white/5">
              <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider mb-0.5">Pitching</div>
              <button onClick={() => { setSubTeamId(fieldingTeamId ?? null); setSubPosition(1); setStep('sub_defense'); }}
                className="text-white font-bold text-sm hover:text-amber-300 transition-colors">
                {currentPitcher.firstName} {currentPitcher.lastName}
              </button>
              <div className="flex items-center gap-3 mt-1.5 font-mono text-xs">
                <div className="text-white/50">P <span className="text-white font-bold">{getCurrentPitcherPitches(currentPitcher.playerId)}</span></div>
                <div className="text-green-400/60">B <span className="text-green-400 font-bold">{getCurrentPitcherBalls(currentPitcher.playerId)}</span></div>
                <div className="text-yellow-400/60">S <span className="text-yellow-400 font-bold">{getCurrentPitcherStrikes(currentPitcher.playerId)}</span></div>
              </div>
            </div>
          )}

          {/* Batting lineup */}
          <div className="mb-3">
            <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider px-1 mb-0.5">
              {battingSide === 'away' ? game.awayTeamName : game.homeTeamName}
            </div>
            {Array.from({ length: 9 }, (_, i) => {
              const slot = i + 1;
              const entry = battingLineup.find(l => l.battingOrder === slot);
              const isCurrent = slot === battingOrderSlot;
              return (
                <div
                  key={slot}
                  onClick={() => {
                    if (!entry) return;
                    setSubTeamId(battingTeamId ?? null);
                    setSubPosition(null);
                    setSubBattingSlot(slot);
                    setStep('sub_offense');
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] ${isCurrent ? 'bg-amber-500/15 border border-amber-500/20' : 'hover:bg-white/5'}`}
                >
                  {isCurrent && <span className="text-amber-400 text-xs">▸</span>}
                  <span className={`font-mono w-3 ${isCurrent ? 'text-amber-400' : 'text-white/25'}`}>{slot}</span>
                  {entry ? (
                    <>
                      <span className={`flex-1 truncate ${isCurrent ? 'text-white font-bold' : 'text-white/60'}`}>{entry.firstName.charAt(0)}. {entry.lastName}</span>
                      <span className="text-white/25 text-[10px]">{entry.position != null ? POS_LABELS[entry.position] : '—'}</span>
                    </>
                  ) : <span className="text-white/15 italic text-[10px]">(empty)</span>}
                </div>
              );
            })}
          </div>

          {/* Defensive lineup */}
          <div>
            <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider px-1 mb-1.5">
              {battingSide === 'away' ? game.homeTeamName : game.awayTeamName}
            </div>
            {fieldingLineupForSidebar.map(entry => (
              <div key={entry.id} onClick={() => { setSubTeamId(fieldingTeamId ?? null); setSubPosition(entry.position); setStep('sub_defense'); }}
                className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-white/40 hover:bg-white/5 rounded cursor-pointer">
                <span className="text-white/25 font-mono w-5 text-right">{POS_LABELS[entry.position!]}</span>
                <span className="flex-1 truncate">{entry.firstName.charAt(0)}. {entry.lastName}</span>
                {entry.position === 1 && <span className="text-white/20 font-mono text-[9px]">{getCurrentPitcherPitches(entry.playerId)}p</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Field + Controls ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative flex items-center justify-center px-2 py-1">
            {/*
              Clean baseball diamond with proper 90° foul lines.
              Home=(200,310), 1B=(270,240), 2B=(200,170), 3B=(130,240)
              Diamond side = 70*√2 ≈ 99 units
              Foul lines extend at 45° through 1B/3B to outfield wall.
            */}
            <svg viewBox="0 0 400 400" className="w-full max-w-[600px]">
              <defs>
                <radialGradient id="fg" cx="50%" cy="82%" r="58%">
                  <stop offset="0%" stopColor="#1b5e30" />
                  <stop offset="100%" stopColor="#0d3018" />
                </radialGradient>
                <radialGradient id="dg" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#704828" />
                  <stop offset="100%" stopColor="#4e3015" />
                </radialGradient>
              </defs>

              {/* Outfield grass */}
              <path d="M 60,170 Q 200,-10 340,170 L 270,240 L 200,170 L 130,240 Z" fill="url(#fg)" />
              {/* Infield dirt */}
              <polygon points="200,170 270,240 200,310 130,240" fill="url(#dg)" />
              {/* Grass cutout in infield */}
              <circle cx="200" cy="240" r="16" fill="#1b5e30" />
              {/* Mound rubber */}
              <rect x="196" y="238" width="8" height="2.5" rx="1" fill="rgba(255,255,255,0.4)" />

              {/* Baselines - white chalk */}
              <line x1="200" y1="310" x2="270" y2="240" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
              <line x1="200" y1="310" x2="130" y2="240" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
              <line x1="130" y1="240" x2="200" y2="170" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
              <line x1="270" y1="240" x2="200" y2="170" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />

              {/* Foul lines to outfield (90° from home) */}
              <line x1="200" y1="310" x2="60" y2="170" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1="200" y1="310" x2="340" y2="170" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

              {/* Outfield fence arc */}
              <path d="M 62,168 Q 200,-5 338,168" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />

              {/* ── Bases (small diamonds, clickable when occupied) ── */}
              <g onClick={() => { if (gameState.bases.second && step === 'pitch') { setActiveRunnerBase('second'); setRunnerActionType(null); setRunnerActionDest(null); setStep('runner_action'); } }}
                style={{ cursor: gameState.bases.second ? 'pointer' : 'default' }}>
                <rect x="194" y="164" width="12" height="12" rx="1" transform="rotate(45 200 170)"
                  fill={gameState.bases.second ? '#f97316' : '#ffffff20'} stroke="white" strokeWidth="0.8" />
              </g>
              <g onClick={() => { if (gameState.bases.first && step === 'pitch') { setActiveRunnerBase('first'); setRunnerActionType(null); setRunnerActionDest(null); setStep('runner_action'); } }}
                style={{ cursor: gameState.bases.first ? 'pointer' : 'default' }}>
                <rect x="264" y="234" width="12" height="12" rx="1" transform="rotate(45 270 240)"
                  fill={gameState.bases.first ? '#f97316' : '#ffffff20'} stroke="white" strokeWidth="0.8" />
              </g>
              <g onClick={() => { if (gameState.bases.third && step === 'pitch') { setActiveRunnerBase('third'); setRunnerActionType(null); setRunnerActionDest(null); setStep('runner_action'); } }}
                style={{ cursor: gameState.bases.third ? 'pointer' : 'default' }}>
                <rect x="124" y="234" width="12" height="12" rx="1" transform="rotate(45 130 240)"
                  fill={gameState.bases.third ? '#f97316' : '#ffffff20'} stroke="white" strokeWidth="0.8" />
              </g>
              {/* Home plate */}
              <polygon points="200,307 196,313 200,318 204,313" fill="#ddd" />

              {/* ── Runner names next to bases ── */}
              {gameState.bases.second && <text x="200" y="155" textAnchor="middle" fontSize="9" fill="#f97316" fontWeight="bold">{getPlayerShort(gameState.bases.second)}</text>}
              {gameState.bases.first && <text x="290" y="238" textAnchor="start" fontSize="9" fill="#f97316" fontWeight="bold">{getPlayerShort(gameState.bases.first)}</text>}
              {gameState.bases.third && <text x="110" y="238" textAnchor="end" fontSize="9" fill="#f97316" fontWeight="bold">{getPlayerShort(gameState.bases.third)}</text>}

              {/* ── Fielding position buttons (only shown during fielding step) ── */}
              {step === 'fielding' && (() => {
                const dp: Record<number, { x: number; y: number }> = {
                  1: { x: 200, y: 242 }, 2: { x: 200, y: 350 },
                  3: { x: 300, y: 236 }, 4: { x: 250, y: 195 },
                  5: { x: 100, y: 236 }, 6: { x: 150, y: 195 },
                  7: { x: 80, y: 115 },  8: { x: 200, y: 65 },
                  9: { x: 320, y: 115 },
                };
                return Object.entries(dp).map(([ps, pos]) => {
                  const pn = parseInt(ps);
                  const isSel = fieldingPositions.includes(pn);
                  return (
                    <g key={pn} onClick={() => setFieldingPositions(prev => [...prev, pn])} style={{ cursor: 'pointer' }}>
                      <rect x={pos.x - 18} y={pos.y - 10} width="36" height="22" rx="4"
                        fill={isSel ? '#daa520' : 'rgba(200,200,180,0.92)'}
                        stroke={isSel ? '#f0c040' : 'rgba(100,100,80,0.4)'} strokeWidth="1" />
                      <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="12" fontWeight="bold"
                        fill={isSel ? '#1a0800' : '#333'}>
                        {POS_LABELS[pn]}
                      </text>
                    </g>
                  );
                });
              })()}

              {/* Fielding sequence display */}
              {fieldingPositions.length > 0 && (
                <text x="200" y="210" textAnchor="middle" fontSize="20" fontWeight="bold" fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="3" paintOrder="stroke">
                  {fieldingPositions.join(' - ')}
                </text>
              )}

              {/* Batter name below home */}
              {currentBatter && (
                <text x="200" y="332" textAnchor="middle" fontSize="10" fill="#f97316" fontWeight="bold">
                  {(currentBatter.playerId == null ? 'VACANT' : currentBatter.lastName).toUpperCase()}
                </text>
              )}

              {/* Outs indicator below batter */}
              <g>
                {[0,1,2].map(i => (
                  <circle key={i} cx={190 + i * 10} cy="345" r="4"
                    fill={i < gameState.outs ? '#ef4444' : 'transparent'} stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                ))}
              </g>
            </svg>
          </div>

          {/* ── Wizard panels ── */}
          <div className="px-3 pb-2">
            {/* EMPTY SLOT — automatic out */}
            {step === 'pitch' && isEmptySlot && (
              <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden p-4 text-center">
                <p className="text-xs text-white/40 uppercase font-bold tracking-wide mb-4">Batting slot #{battingOrderSlot} is empty</p>
                  <button onClick={async () => {
                    setSubmitting(true);
                    try {
                      await apiPost(`/admin/scoring/${gameId}/event`, {
                        inning: gameState.inning, half: gameState.half,
                        batterId: null, pitcherId: gameState.half === 'top' ? homeLineup.find(l => l.position === 1)?.playerId : awayLineup.find(l => l.position === 1)?.playerId,
                        eventType: 'strikeout', eventDetail: 'automatic_out_empty_slot',
                        outsRecorded: 1, rbi: 0, runsScored: 0,
                        fieldingSequence: null, runnerFirstId: gameState.bases.first, runnerSecondId: gameState.bases.second, runnerThirdId: gameState.bases.third,
                        runnersScored: [],
                      });
                      await loadState();
                    } catch (err: any) { alert(err.message || 'Failed'); }
                    setSubmitting(false);
                  }} disabled={submitting}
                    className="w-full py-3 bg-red-900 hover:bg-red-800 text-white text-xs font-bold rounded-lg uppercase transition-colors disabled:opacity-30">
                    AUTOMATIC OUT
                  </button>
              </div>
            )}

            {/* PITCH step */}
            {step === 'pitch' && currentBatter && currentBatter.playerId != null && (
              <div className="space-y-2">
                {(currentBatter.bats || '').trim().toUpperCase() === 'S' && (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-950/35 px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSwitchBatSide('L')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                          switchBatSide === 'L' ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/75 hover:bg-white/15'
                        }`}
                      >
                        LHB
                      </button>
                      <button
                        type="button"
                        onClick={() => setSwitchBatSide('R')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                          switchBatSide === 'R' ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/75 hover:bg-white/15'
                        }`}
                      >
                        RHB
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1.5">
                  <button
                    onClick={handleBall}
                    disabled={submitting || ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide)}
                    className="py-4 bg-[#1a6b3a] hover:bg-[#20804a] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#20804a]/50"
                  >
                    BALL
                  </button>
                  <button
                    onClick={handleStrike}
                    disabled={submitting || ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide)}
                    className="py-4 bg-[#8b2020] hover:bg-[#a02828] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#a02828]/50"
                  >
                    STRIKE
                  </button>
                  <button
                    onClick={handleFoul}
                    disabled={submitting || ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide)}
                    className="py-4 bg-[#8b7020] hover:bg-[#a08428] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#a08428]/50"
                  >
                    FOUL
                  </button>
                  <button
                    onClick={handleOut}
                    disabled={submitting || ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide)}
                    className="py-4 bg-[#1a5c3a] hover:bg-[#237548] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#237548]/50"
                  >
                    OUT
                  </button>
                  <button
                    onClick={handleInPlay}
                    disabled={submitting || ((currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide)}
                    className="py-4 bg-[#1a3a8b] hover:bg-[#2248a0] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#2248a0]/50"
                  >
                    IN PLAY
                  </button>
                </div>
              </div>
            )}

            {/* STRIKEOUT TYPE (strike 3 popup - like iScore) */}
            {step === 'strikeout_type' && (
              <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 text-center">
                  <div className="flex justify-center gap-1 mb-2">
                    {(['out', 'safe', 'quick'] as const).map(t => (
                      <button key={t} disabled={t !== 'out'}
                        className={`px-4 py-1.5 text-xs font-bold rounded-full ${t === 'out' ? 'bg-white/10 text-white' : 'text-white/20'}`}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => selectOutcome('strikeout_looking')} disabled={submitting}
                      className="py-4 bg-[#2a3a5a] hover:bg-[#3a4a6a] text-white text-sm font-bold rounded-lg uppercase transition-colors border border-white/10">
                      STRIKEOUT LOOKING
                    </button>
                    <button onClick={() => selectOutcome('strikeout_swinging')} disabled={submitting}
                      className="py-4 bg-[#2a3a5a] hover:bg-[#3a4a6a] text-white text-sm font-bold rounded-lg uppercase transition-colors border border-white/10">
                      STRIKEOUT SWINGING
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => selectOutcome('caught_foul_tip')} disabled={submitting}
                      className="py-3 bg-[#2a3a5a] hover:bg-[#3a4a6a] text-white text-xs font-bold rounded-lg uppercase transition-colors border border-white/10">
                      CAUGHT FOUL TIP
                    </button>
                    <button onClick={() => selectOutcome('bunt_foul')} disabled={submitting}
                      className="py-3 bg-[#2a3a5a] hover:bg-[#3a4a6a] text-white text-xs font-bold rounded-lg uppercase transition-colors border border-white/10">
                      BUNT FOUL
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => selectOutcome('dropped_third_strike_out')} disabled={submitting}
                      className="py-3 bg-[#5a2a2a] hover:bg-[#6a3a3a] text-white text-xs font-bold rounded-lg uppercase transition-colors border border-[#6a3a3a]/50">
                      DROPPED 3RD STRIKE (OUT)
                    </button>
                    <button onClick={() => selectOutcome('dropped_third_strike')} disabled={submitting}
                      className="py-3 bg-[#3a5a2a] hover:bg-[#4a6a3a] text-white text-xs font-bold rounded-lg uppercase transition-colors border border-[#4a6a3a]/50">
                      DROPPED 3RD STRIKE (SAFE)
                    </button>
                  </div>
                </div>
                <button onClick={() => setStep('pitch')}
                  className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">
                  CANCEL
                </button>
              </div>
            )}

            {/* OUT / SAFE panels */}
            {(step === 'out_type' || step === 'safe_type') && (
              <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                <div className="flex border-b border-white/10">
                  <button onClick={() => { setOutSafeTab('out'); setStep('out_type'); setOutSafeMorePage(false); }}
                    className={`flex-1 py-2.5 text-sm font-bold transition-colors ${outSafeTab === 'out' ? 'bg-white/10 text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}`}>Out</button>
                  <button onClick={() => { setOutSafeTab('safe'); setStep('safe_type'); setOutSafeMorePage(false); }}
                    className={`flex-1 py-2.5 text-sm font-bold transition-colors ${outSafeTab === 'safe' ? 'bg-white/10 text-white border-b-2 border-white' : 'text-white/40 hover:text-white/60'}`}>Safe</button>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(outSafeTab === 'safe'
                      ? (outSafeMorePage ? SAFE_OUTCOMES_P2 : SAFE_OUTCOMES_P1)
                      : (outSafeMorePage ? OUT_OUTCOMES_P2 : OUT_OUTCOMES_P1)
                    ).map(o => (
                      <button key={o.key} onClick={() => selectOutcome(o.key)}
                        className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] text-white text-xs font-bold rounded-lg transition-all uppercase border border-white/[0.06]">
                        {o.label}
                      </button>
                    ))}
                    <button onClick={() => setOutSafeMorePage(!outSafeMorePage)}
                      className="py-3 bg-white/[0.04] hover:bg-white/[0.08] text-white/50 text-xs font-bold rounded-lg transition-all uppercase border border-white/[0.06]">
                      {outSafeMorePage ? '← BACK' : 'MORE ...'}
                    </button>
                  </div>
                </div>
                <button onClick={cancelWizard} className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">CANCEL</button>
              </div>
            )}

            {/* FIELDING step */}
            {step === 'fielding' && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 text-center">
                {selectedEvent && ERROR_EVENTS.has(selectedEvent) ? (
                  <p className="text-[10px] text-red-400/70 uppercase font-bold mb-2">Error on</p>
                ) : (
                  <p className="text-[10px] text-white/40 uppercase font-bold mb-2">Fielding</p>
                )}
                <div className="text-xl font-bold font-mono text-white mb-2">{fieldingPositions.length > 0 ? fieldingPositions.join('-') : '—'}</div>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => setFieldingPositions(p => p.slice(0, -1))} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold">UNDO</button>
                  <button onClick={finishFielding} disabled={fieldingPositions.length === 0} className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-30 rounded text-[10px] font-bold">DONE</button>
                </div>
              </div>
            )}

            {/* HIT LOCATION step */}
            {step === 'hit_location' && (
              <div className="bg-[#111d30] rounded-xl border border-white/10 p-3">
                <div className="flex justify-center mb-2">
                  <svg viewBox="0 0 300 200" className="w-full max-w-sm cursor-crosshair"
                    onClick={(e) => {
                      const svg = e.currentTarget;
                      const rect = svg.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 300;
                      const y = ((e.clientY - rect.top) / rect.height) * 200;
                      setHitLocationX(Math.round(x * 10) / 10);
                      setHitLocationY(Math.round(y * 10) / 10);
                    }}>
                    <defs>
                      <radialGradient id="hlFg" cx="50%" cy="82%" r="58%">
                        <stop offset="0%" stopColor="#1b5e30" />
                        <stop offset="100%" stopColor="#0d3018" />
                      </radialGradient>
                      <radialGradient id="hlDg" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#704828" />
                        <stop offset="100%" stopColor="#4e3015" />
                      </radialGradient>
                    </defs>
                    {/* Outfield grass */}
                    <path d="M 45,78 Q 150,-20 255,78 L 202,130 L 150,78 L 98,130 Z" fill="url(#hlFg)" />
                    {/* Infield dirt */}
                    <polygon points="150,78 202,130 150,182 98,130" fill="url(#hlDg)" />
                    {/* Grass cutout */}
                    <circle cx="150" cy="130" r="10" fill="#1b5e30" />
                    {/* Mound rubber */}
                    <rect x="147" y="129" width="6" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
                    {/* Baselines */}
                    <line x1="150" y1="182" x2="202" y2="130" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                    <line x1="150" y1="182" x2="98" y2="130" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                    <line x1="98" y1="130" x2="150" y2="78" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                    <line x1="202" y1="130" x2="150" y2="78" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                    {/* Foul lines */}
                    <line x1="150" y1="182" x2="45" y2="78" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
                    <line x1="150" y1="182" x2="255" y2="78" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
                    {/* Fence arc */}
                    <path d="M 46,77 Q 150,-18 254,77" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                    {/* Bases */}
                    <rect x="147" y="76" width="6" height="6" rx="0.5" transform="rotate(45 150 79)" fill="#ffffff20" stroke="white" strokeWidth="0.5" />
                    <rect x="199" y="128" width="6" height="6" rx="0.5" transform="rotate(45 202 131)" fill="#ffffff20" stroke="white" strokeWidth="0.5" />
                    <rect x="95" y="128" width="6" height="6" rx="0.5" transform="rotate(45 98 131)" fill="#ffffff20" stroke="white" strokeWidth="0.5" />
                    {/* Home plate */}
                    <polygon points="150,180 147,184 150,188 153,184" fill="#ddd" />
                    {hitLocationX != null && hitLocationY != null && (
                      <circle cx={hitLocationX} cy={hitLocationY} r="5" fill="#ef4444" stroke="white" strokeWidth="1.5" opacity="0.9" />
                    )}
                  </svg>
                </div>
                <div className="mb-2">
                  <p className="text-[9px] text-white/30 uppercase font-bold mb-1">Hit Type</p>
                  <div className="flex gap-1">
                    {(['grounder', 'line_drive', 'fly_ball', 'pop_up'] as const).map(t => (
                      <button key={t} onClick={() => setHitType(t)}
                        className={`flex-1 py-2 text-[10px] font-bold rounded-lg uppercase transition-all ${hitType === t ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/[0.06]'}`}>
                        {t.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <p className="text-[9px] text-white/30 uppercase font-bold mb-1">Hardness</p>
                  <div className="flex gap-1">
                    {(['soft', 'medium', 'hard'] as const).map(h => (
                      <button key={h} onClick={() => setHitHardness(h)}
                        className={`flex-1 py-2 text-[10px] font-bold rounded-lg uppercase transition-all ${hitHardness === h ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/[0.06]'}`}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelWizard} className="flex-1 py-2.5 text-white/40 text-xs font-bold uppercase hover:text-white/60">SKIP</button>
                  <button onClick={finishHitLocation}
                    className="flex-1 py-2.5 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded-lg uppercase transition-colors">NEXT</button>
                </div>
              </div>
            )}

            {/* BATTER ADVANCE — where batter ends up on ROE (after fielding + runner resolution if any) */}
            {step === 'batter_advance' && selectedEvent && ERROR_EVENTS.has(selectedEvent) && currentBatter && (
              <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 text-center">
                  <p className="text-[10px] text-amber-400 font-bold uppercase mb-1 tracking-widest">Batter on same error</p>
                  <p className="text-xs text-white/80 font-bold tracking-wide">
                    {currentBatter.firstName} {currentBatter.lastName}
                  </p>
                </div>
                <div className="p-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => submitPlay(selectedEvent, runnerQuestions, fieldingPositions, 'first')}
                    className="w-full py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold uppercase tracking-wide shadow-sm border border-emerald-500/30 transition-colors"
                  >
                    Submit — batter to 1st (ROE)
                  </button>
                  <div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { d: 'second' as const, label: '2nd' },
                        { d: 'third' as const, label: '3rd' },
                        { d: 'home' as const, label: 'Scores' },
                      ]).map(({ d, label }) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => submitPlay(selectedEvent, runnerQuestions, fieldingPositions, d)}
                          className="py-2.5 rounded-lg text-xs font-bold uppercase border border-white/10 bg-white/5 text-white/85 hover:bg-amber-600/20 hover:border-amber-500/35 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { cancelWizard(); }}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-xs font-bold rounded-lg uppercase transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Runner advanced on error — pick fielder(s) charged with the error */}
            {step === 'runner_advance_error_fielding' && runnerAdvanceErrorPending && runnerQuestions.length > 0 && (() => {
              const q = runnerQuestions[currentRunnerIdx];
              const fld = runnerAdvanceErrorFielding;
              const POS_GRID = [
                { pos: 1, label: 'P' },  { pos: 2, label: 'C' },  { pos: 3, label: '1B' },
                { pos: 4, label: '2B' }, { pos: 5, label: '3B' }, { pos: 6, label: 'SS' },
                { pos: 7, label: 'LF' }, { pos: 8, label: 'CF' }, { pos: 9, label: 'RF' },
              ];
              const reasonLabel = runnerAdvanceErrorPending.reason === 'advance_on_error' ? 'ADVANCED ON ERROR' : 'ERROR ON ADVANCE';
              return (
                <div className="bg-[#111d30] rounded-xl border border-amber-500/30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-center">
                    <p className="text-[10px] text-amber-400 font-bold uppercase mb-1 tracking-widest">{reasonLabel}</p>
                    <p className="text-xs text-white/80 font-bold tracking-wide">{q.playerName}</p>
                    {fld.length > 0 && (
                      <p className="text-sm text-white font-bold mt-2 tracking-wider">E{fld.join('')}</p>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      {POS_GRID.map(p => {
                        const fielder = fieldingLineupActive.find(l => l.position === p.pos);
                        return (
                          <button key={p.pos} type="button" onClick={() => setRunnerAdvanceErrorFielding([...runnerAdvanceErrorFielding, p.pos])}
                            className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition-colors">
                            <span className="block text-base">{p.label}</span>
                            {fielder && <span className="block text-[9px] text-white/40 mt-0.5">{fielder.lastName}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 px-3 pb-3">
                    <button type="button" onClick={() => setRunnerAdvanceErrorFielding(runnerAdvanceErrorFielding.slice(0, -1))}
                      disabled={fld.length === 0}
                      className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-lg uppercase disabled:opacity-30 transition-colors">
                      UNDO
                    </button>
                    <button type="button" onClick={() => finishRunnerAdvanceErrorFielding()}
                      disabled={fld.length === 0}
                      className="flex-[2] py-2.5 bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold rounded-lg uppercase disabled:opacity-30 transition-colors">
                      {fld.length > 0 ? `SUBMIT (E${fld.join('')})` : 'SELECT FIELDER(S)'}
                    </button>
                  </div>
                  <button type="button" onClick={() => { setRunnerAdvanceErrorPending(null); setRunnerAdvanceErrorFielding([]); setStep('runner'); }}
                    className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">← BACK</button>
                </div>
              );
            })()}

            {/* RUNNER step (after play) - iScore style */}
            {(step === 'runner' || step === 'runner_out_detail' || step === 'runner_out_fielding') && runnerQuestions.length > 0 && (() => {
              const q = runnerQuestions[currentRunnerIdx];
              const baseLabel = q.base === 'first' ? 'FIRST' : q.base === 'second' ? 'SECOND' : 'THIRD';

              const markRunnerOut = (outType: string, fielding?: number[]) => {
                const updated = [...runnerQuestions];
                updated[currentRunnerIdx] = { ...updated[currentRunnerIdx], outcome: 'out', destination: null, advanceReason: outType, fielding };
                setRunnerQuestions(updated);
                setRunnerOutSafeTab('safe');
                setRunnerOutPendingType(null);
                setRunnerOutFielding([]);
                // Skip to next UNANSWERED runner (pre-filled runners already have outcome)
                let nextIdx = currentRunnerIdx + 1;
                while (nextIdx < updated.length && updated[nextIdx].outcome !== null) {
                  nextIdx++;
                }
                const outsAfterThisChoice = gameState.outs + updated.filter(r => r.outcome === 'out').length;
                if (outsAfterThisChoice >= 3) {
                  setRunnerSafeDest(null);
                  if (betweenPitchEvent) {
                    submitBetweenPitchPlay(betweenPitchEvent, updated);
                  } else if (selectedEvent && ERROR_EVENTS.has(selectedEvent)) {
                    setRunnerQuestions(updated);
                    setStep('batter_advance');
                  } else {
                    submitPlay(selectedEvent!, updated, fieldingPositions);
                  }
                } else if (nextIdx < updated.length) {
                  setCurrentRunnerIdx(nextIdx);
                  setRunnerSafeDest(updated[nextIdx].minDestination);
                  setStep('runner');
                } else {
                  setRunnerSafeDest(null);
                  if (betweenPitchEvent) {
                    submitBetweenPitchPlay(betweenPitchEvent, updated);
                  } else if (selectedEvent && ERROR_EVENTS.has(selectedEvent)) {
                    setRunnerQuestions(updated);
                    setStep('batter_advance');
                  } else {
                    submitPlay(selectedEvent!, updated, fieldingPositions);
                  }
                }
              };

              const startRunnerOutFielding = (outType: string) => {
                if (RUNNER_OUTS_NEED_FIELDING.has(outType)) {
                  setRunnerOutPendingType(outType);
                  setRunnerOutFielding([]);
                  setStep('runner_out_fielding');
                } else {
                  markRunnerOut(outType);
                }
              };

              const minOrder = BASE_ORDER[q.minDestination] || 1;

              // Runner out fielding sub-step
              if (step === 'runner_out_fielding' && runnerOutPendingType) {
                const fld = runnerOutFielding;
                const POS_GRID = [
                  { pos: 1, label: 'P' },  { pos: 2, label: 'C' },  { pos: 3, label: '1B' },
                  { pos: 4, label: '2B' }, { pos: 5, label: '3B' }, { pos: 6, label: 'SS' },
                  { pos: 7, label: 'LF' }, { pos: 8, label: 'CF' }, { pos: 9, label: 'RF' },
                ];
                return (
                  <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 text-center">
                      <p className="text-[10px] text-red-400 font-bold uppercase mb-1 tracking-widest">{runnerOutPendingType.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-white/80 font-bold tracking-wide">
                        {q.playerName}
                      </p>
                      {fld.length > 0 && (
                        <p className="text-sm text-white font-bold mt-2 tracking-wider">{fld.join(' – ')}</p>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="grid grid-cols-3 gap-2">
                        {POS_GRID.map(p => {
                          const fielder = fieldingLineupActive.find(l => l.position === p.pos);
                          return (
                            <button key={p.pos} onClick={() => setRunnerOutFielding([...runnerOutFielding, p.pos])}
                              className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition-colors">
                              <span className="block text-base">{p.label}</span>
                              {fielder && <span className="block text-[9px] text-white/40 mt-0.5">{fielder.lastName}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-2 px-3 pb-3">
                      <button onClick={() => setRunnerOutFielding(runnerOutFielding.slice(0, -1))}
                        disabled={fld.length === 0}
                        className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-lg uppercase disabled:opacity-30 transition-colors">
                        UNDO
                      </button>
                      <button onClick={() => markRunnerOut(runnerOutPendingType!, fld.length > 0 ? fld : undefined)}
                        className="flex-[2] py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-lg uppercase transition-colors">
                        {fld.length > 0 ? `SUBMIT (${fld.join('-')})` : 'SUBMIT (no fielding)'}
                      </button>
                    </div>

                    <button onClick={() => { setRunnerOutPendingType(null); setRunnerOutFielding([]); setStep('runner_out_detail'); }}
                      className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">← BACK</button>
                  </div>
                );
              }

              return (
                <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                  {/* Title */}
                  <div className="px-4 py-3 border-b border-white/5 text-center">
                    {betweenPitchEvent && (
                      <p className="text-[10px] text-amber-400 font-bold uppercase mb-1 tracking-widest">{betweenPitchEvent.replace(/_/g, ' ')}</p>
                    )}
                    <p className="text-xs text-white/50 uppercase font-bold tracking-wide">
                      What happened to the runner on {baseLabel} base,
                    </p>
                    <p className="text-base text-white font-bold mt-0.5">{q.playerName}?</p>
                  </div>

                  {/* Out / Safe / Quick tabs */}
                  <div className="flex border-b border-white/10">
                    {(['out', 'safe', 'quick'] as const).map(t => (
                      <button key={t} onClick={() => {
                        if (t === 'out') { setRunnerOutSafeTab('out'); setStep('runner_out_detail'); }
                        else if (t === 'safe') { setRunnerOutSafeTab('safe'); setStep('runner'); }
                        else {
                          const dest = runnerSafeDest || q.minDestination;
                          const stayedAtBase = dest === q.base;
                          if (stayedAtBase && minOrder <= BASE_ORDER[q.base]) {
                            answerRunner('safe', q.base, 'held');
                          } else {
                            answerRunner('safe', dest, betweenPitchEvent || undefined);
                          }
                        }
                      }}
                        className={`flex-1 py-2.5 text-sm font-bold capitalize transition-colors ${
                          (t === 'out' && runnerOutSafeTab === 'out') || (t === 'safe' && runnerOutSafeTab === 'safe')
                            ? 'bg-white/10 text-white border-b-2 border-white'
                            : 'text-white/40 hover:text-white/60'
                        }`}>{t === 'quick' ? 'Quick' : t === 'out' ? 'Out' : 'Safe'}</button>
                    ))}
                  </div>

                  <div className="flex border-b border-white/10">
                    {(['first','second','third','home'] as const).map(dest => {
                      const isAvailable = BASE_ORDER[dest] >= minOrder;
                      const isSelected = runnerSafeDest === dest;
                      return (
                        <button key={dest}
                          onClick={() => { if (isAvailable) setRunnerSafeDest(dest); }}
                          disabled={!isAvailable}
                          className={`flex-1 py-2.5 text-xs font-bold capitalize transition-colors border-r border-white/5 last:border-r-0 ${
                            isSelected
                              ? 'bg-blue-600/30 text-white border-b-2 border-blue-400'
                              : isAvailable
                                ? 'text-white/50 hover:bg-white/5 hover:text-white cursor-pointer'
                                : 'text-white/15 cursor-not-allowed'
                          }`}>
                          {dest === 'home' ? 'Home' : dest.charAt(0).toUpperCase() + dest.slice(1)}
                        </button>
                      );
                    })}
                  </div>

                  {runnerOutSafeTab === 'out' ? (
                    /* OUT tab - iScore layout */
                    <div className="p-3 max-h-72 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-2">
                        {getRunnerOutTypesForOuts(gameState.outs).map(t => (
                          <button key={t.key} onClick={() => startRunnerOutFielding(t.key)}
                            className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] text-white text-xs font-bold rounded-lg uppercase transition-colors border border-white/[0.06]">
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* SAFE tab - iScore layout */
                    <div className="p-3 max-h-72 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-2">
                        {(() => {
                          const isBatterError = ERROR_EVENTS.has(selectedEvent || '') || ERROR_EVENTS.has(betweenPitchEvent || '');
                          const isBetweenPitch = !!betweenPitchEvent;
                          const dest = runnerSafeDest || q.minDestination;
                          const stayedAtBase = dest === q.base;
                          const priorSamePlayError = getPriorSamePlayErrorFielding(runnerQuestions, currentRunnerIdx);
                          const options: { key: string; label: string; action: () => void }[] = [];

                          if (isBetweenPitch) {
                            // If the selected destination is the current base, prioritize HELD UP first.
                            if (stayedAtBase) {
                              options.push({ key: 'held', label: 'HELD UP', action: () => answerRunner('safe', q.base, 'held') });
                            }
                            if (priorSamePlayError && !stayedAtBase) {
                              options.push({ key: 'same_error', label: 'SAME ERROR (same play)', action: () => {
                                answerRunner('safe', dest, 'advance_on_error', priorSamePlayError);
                              } });
                            }
                            options.push({ key: 'advance', label: 'ADVANCE', action: () => answerRunner('safe', dest, betweenPitchEvent!) });
                            options.push({ key: 'stolen_base', label: 'STOLEN BASE', action: () => answerRunner('safe', dest, 'stolen_base') });
                            options.push({ key: 'on_throw', label: 'ADVANCED ON THROW', action: () => answerRunner('safe', dest, 'on_throw') });
                            if (!stayedAtBase) {
                              options.push({ key: 'held2', label: 'HELD UP', action: () => answerRunner('safe', q.base, 'held') });
                            }
                            options.push({ key: 'error', label: 'ERROR', action: () => {
                              if (needsRunnerAdvanceErrorFieldingPrompt('error', selectedEvent)) {
                                setRunnerAdvanceErrorPending({ reason: 'error', dest });
                                setRunnerAdvanceErrorFielding([]);
                                setStep('runner_advance_error_fielding');
                              } else {
                                answerRunner('safe', dest, 'error');
                              }
                            } });
                            options.push({ key: 'defensive_indifference', label: 'DEF. INDIFFERENCE', action: () => answerRunner('safe', dest, 'defensive_indifference') });
                          } else {
                            if (stayedAtBase) {
                              options.push({ key: 'held', label: 'HELD UP', action: () => answerRunner('safe', q.base, 'held') });
                            }
                            if (priorSamePlayError && !stayedAtBase) {
                              options.push({ key: 'same_error', label: 'SAME ERROR (same play)', action: () => {
                                answerRunner('safe', dest, 'advance_on_error', priorSamePlayError);
                              } });
                            }
                            options.push({ key: 'on_play', label: 'ADVANCED BY BATTER', action: () => answerRunner('safe', dest, 'on_play') });
                            if (!stayedAtBase) {
                              options.push({ key: 'held2', label: 'HELD UP', action: () => answerRunner('safe', q.base, 'held') });
                            }
                            // Allow "advanced on (same) error" even when the batter event is a hit.
                            // This is needed for plays like: single + runner(s) score on an outfield error.
                            options.push({ key: 'advance_on_error', label: 'ADVANCED ON ERROR', action: () => {
                              if (needsRunnerAdvanceErrorFieldingPrompt('advance_on_error', selectedEvent)) {
                                setRunnerAdvanceErrorPending({ reason: 'advance_on_error', dest });
                                setRunnerAdvanceErrorFielding([]);
                                setStep('runner_advance_error_fielding');
                              } else {
                                answerRunner('safe', dest, 'advance_on_error');
                              }
                            } });
                            options.push({ key: 'stolen_base', label: 'STOLEN BASE', action: () => answerRunner('safe', dest, 'stolen_base') });
                            options.push({ key: 'error', label: 'ERROR', action: () => {
                              if (needsRunnerAdvanceErrorFieldingPrompt('error', selectedEvent)) {
                                setRunnerAdvanceErrorPending({ reason: 'error', dest });
                                setRunnerAdvanceErrorFielding([]);
                                setStep('runner_advance_error_fielding');
                              } else {
                                answerRunner('safe', dest, 'error');
                              }
                            } });
                            options.push({ key: 'passed_ball', label: 'PASSED BALL', action: () => answerRunner('safe', dest, 'passed_ball') });
                            options.push({ key: 'wild_pitch', label: 'WILD PITCH', action: () => answerRunner('safe', dest, 'wild_pitch') });
                            options.push({ key: 'defensive_indifference', label: 'DEF. INDIFFERENCE', action: () => answerRunner('safe', dest, 'defensive_indifference') });
                            options.push({ key: 'on_throw', label: 'ON THE THROW', action: () => answerRunner('safe', dest, 'on_throw') });
                            if (dest === 'home') {
                              options.push({ key: 'run_not_scored', label: 'RUN NOT SCORED', action: () => answerRunner('safe', q.base, 'held') });
                            }
                          }

                          return options.map(r => (
                            <button key={r.key} onClick={r.action}
                              className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] text-white text-xs font-bold rounded-lg uppercase transition-colors border border-white/[0.06]">
                              {r.label}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  <button onClick={cancelWizard} className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">CANCEL</button>
                </div>
              );
            })()}

            {/* RUNNER ACTION (click on runner between pitches) - iScore style */}
            {step === 'runner_action' && activeRunnerBase && (() => {
              const runnerId = gameState.bases[activeRunnerBase];
              const baseLabel = activeRunnerBase === 'first' ? 'FIRST' : activeRunnerBase === 'second' ? 'SECOND' : 'THIRD';
              const availBases = getAvailableBases(activeRunnerBase);
              const defaultDest = activeRunnerBase === 'first' ? 'second' : activeRunnerBase === 'second' ? 'third' : 'home';

              // Default selected dest to next base
              const selectedDest = runnerActionDest || defaultDest;

              // Step 1: choose action type (Safe view)
              if (!runnerActionType) {
                return (
                  <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                    {/* Title */}
                    <div className="px-4 py-3 border-b border-white/5 text-center">
                      <p className="text-xs text-white/50 uppercase font-bold tracking-wide">
                        What happened to the runner on {baseLabel} base,
                      </p>
                      <p className="text-base text-white font-bold mt-0.5">{runnerId ? getPlayerName(runnerId) : ''}?</p>
                    </div>

                    {/* Out / Safe tabs */}
                    <div className="flex border-b border-white/10">
                      <button onClick={() => setRunnerActionType('__out__')}
                        className="flex-1 py-2.5 text-sm font-bold text-white/40 hover:text-white/60 transition-colors">Out</button>
                      <button
                        className="flex-1 py-2.5 text-sm font-bold bg-white/10 text-white border-b-2 border-white">Safe</button>
                    </div>

                    {/* Base selector - click to SELECT, not submit */}
                    <div className="flex border-b border-white/10">
                      {availBases.map(b => (
                        <button key={b.key}
                          onClick={() => setRunnerActionDest(b.key)}
                          className={`flex-1 py-2.5 text-xs font-bold capitalize transition-colors border-r border-white/5 last:border-r-0 ${
                            selectedDest === b.key
                              ? 'bg-blue-600/30 text-white border-b-2 border-blue-400'
                              : 'text-white/50 hover:bg-white/5 hover:text-white'
                          }`}>
                          {b.key === 'home' ? 'Home' : b.label}
                        </button>
                      ))}
                    </div>

                    {/* Safe action buttons - iScore style */}
                    <div className="p-3 max-h-72 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'stolen_base', label: 'STOLEN BASE' },
                          { key: 'wild_pitch', label: 'WILD PITCH' },
                          { key: 'passed_ball', label: 'PASSED BALL' },
                          { key: 'balk', label: 'BALK' },
                          { key: 'defensive_indifference', label: 'DEF. INDIFFERENCE' },
                          { key: 'advance', label: 'ON THE THROW' },
                        ].map(a => (
                          <button key={a.key} onClick={() => handleRunnerActionSubmit(a.key, selectedDest)}
                            className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] border border-white/[0.06] text-white text-xs font-bold rounded-lg uppercase transition-colors">
                            {a.label}
                          </button>
                        ))}
                        <button onClick={() => { setRunnerActionType('__error__'); setRunnerActionDest(selectedDest); setRunnerActionFielding([]); }}
                          className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] border border-white/[0.06] text-white text-xs font-bold rounded-lg uppercase transition-colors">
                          ERROR
                        </button>
                        {/* Pickoff attempt means runner stays at current base (does not advance). */}
                        <button onClick={() => handleRunnerActionSubmit('advance', activeRunnerBase)}
                          className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] border border-white/[0.06] text-white text-xs font-bold rounded-lg uppercase transition-colors">
                          PICKOFF ATTEMPT
                        </button>
                      </div>
                    </div>

                    <button onClick={() => { setActiveRunnerBase(null); setRunnerActionType(null); setRunnerActionDest(null); setStep('pitch'); }}
                      className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">CANCEL</button>
                  </div>
                );
              }

              // Show Out panel – step 1: choose out type, step 2: fielding positions
              if (runnerActionType === '__out__') {
                // Step 2: Fielding positions for the chosen out type
                if (runnerActionOutType) {
                  const fld = runnerActionFielding;
                  const POS_GRID = [
                    { pos: 1, label: 'P' },  { pos: 2, label: 'C' },  { pos: 3, label: '1B' },
                    { pos: 4, label: '2B' }, { pos: 5, label: '3B' }, { pos: 6, label: 'SS' },
                    { pos: 7, label: 'LF' }, { pos: 8, label: 'CF' }, { pos: 9, label: 'RF' },
                  ];
                  const outLabel = runnerActionOutType.replace(/_/g, ' ').toUpperCase();
                  return (
                    <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/5 text-center">
                        <p className="text-xs text-white/50 uppercase font-bold tracking-wide">
                          {outLabel}
                        </p>
                        {fld.length > 0 && (
                          <p className="text-sm text-white font-bold mt-2 tracking-wider">{fld.join(' – ')}</p>
                        )}
                      </div>

                      <div className="p-3">
                        <div className="grid grid-cols-3 gap-2">
                          {POS_GRID.map(p => {
                            const fielder = fieldingLineupActive.find(l => l.position === p.pos);
                            return (
                              <button key={p.pos} onClick={() => setRunnerActionFielding([...runnerActionFielding, p.pos])}
                                className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition-colors">
                                <span className="block text-base">{p.label}</span>
                                {fielder && <span className="block text-[9px] text-white/40 mt-0.5">{fielder.lastName}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-2 px-3 pb-3">
                        <button onClick={() => setRunnerActionFielding(runnerActionFielding.slice(0, -1))}
                          disabled={fld.length === 0}
                          className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-lg uppercase disabled:opacity-30 transition-colors">
                          UNDO
                        </button>
                        <button onClick={() => handleRunnerActionSubmit(runnerActionOutType!, null, fld.length > 0 ? fld : undefined)}
                          className="flex-[2] py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-lg uppercase transition-colors">
                          {fld.length > 0 ? `SUBMIT (${fld.join('-')})` : 'SUBMIT (no fielding)'}
                        </button>
                      </div>

                      <button onClick={() => { setRunnerActionOutType(null); setRunnerActionFielding([]); }}
                        className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">← BACK</button>
                    </div>
                  );
                }

                // Step 1: Choose out type
                return (
                  <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 text-center">
                      <p className="text-xs text-white/50 uppercase font-bold tracking-wide">
                        What happened to the runner on {baseLabel} base,
                      </p>
                      <p className="text-base text-white font-bold mt-0.5">{runnerId ? getPlayerName(runnerId) : ''}?</p>
                    </div>

                    <div className="flex border-b border-white/10">
                      <button
                        className="flex-1 py-2.5 text-sm font-bold bg-white/10 text-white border-b-2 border-white">Out</button>
                      <button onClick={() => setRunnerActionType(null)}
                        className="flex-1 py-2.5 text-sm font-bold text-white/40 hover:text-white/60 transition-colors">Safe</button>
                    </div>

                    <div className="p-3 max-h-72 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-2">
                        {getRunnerOutTypesForOuts(gameState.outs).map(a => (
                          <button key={a.key} onClick={() => { setRunnerActionOutType(a.key); setRunnerActionFielding([]); }}
                            className="py-3 bg-[#1e2d48]/80 hover:bg-[#283a58] border border-white/[0.06] text-white text-xs font-bold rounded-lg uppercase transition-colors">
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button onClick={() => { setActiveRunnerBase(null); setRunnerActionType(null); setStep('pitch'); }}
                      className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">CANCEL</button>
                  </div>
                );
              }

              if (runnerActionType === '__error__') {
                const fld = runnerActionFielding;
                const POS_GRID = [
                  { pos: 1, label: 'P' },  { pos: 2, label: 'C' },  { pos: 3, label: '1B' },
                  { pos: 4, label: '2B' }, { pos: 5, label: '3B' }, { pos: 6, label: 'SS' },
                  { pos: 7, label: 'LF' }, { pos: 8, label: 'CF' }, { pos: 9, label: 'RF' },
                ];
                return (
                  <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 text-center">
                        <p className="text-xs text-red-400/70 uppercase font-bold tracking-wide">
                        ERROR
                      </p>
                      {fld.length > 0 && (
                        <p className="text-sm text-white font-bold mt-2 tracking-wider">E{fld.join('')}</p>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="grid grid-cols-3 gap-2">
                        {POS_GRID.map(p => {
                          const fielder = fieldingLineupActive.find(l => l.position === p.pos);
                          return (
                            <button key={p.pos} onClick={() => setRunnerActionFielding([...runnerActionFielding, p.pos])}
                              className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold rounded-lg transition-colors">
                              <span className="block text-base">{p.label}</span>
                              {fielder && <span className="block text-[9px] text-white/40 mt-0.5">{fielder.lastName}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-2 px-3 pb-3">
                      <button onClick={() => setRunnerActionFielding(runnerActionFielding.slice(0, -1))}
                        disabled={fld.length === 0}
                        className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-lg uppercase disabled:opacity-30 transition-colors">
                        UNDO
                      </button>
                      <button onClick={() => handleRunnerActionSubmit('advance_on_error', runnerActionDest, fld.length > 0 ? fld : undefined)}
                        disabled={fld.length === 0}
                        className="flex-[2] py-2.5 bg-amber-700 hover:bg-amber-600 text-white text-xs font-bold rounded-lg uppercase disabled:opacity-30 transition-colors">
                        {fld.length > 0 ? `SUBMIT (E${fld.join('')})` : 'SELECT FIELDER'}
                      </button>
                    </div>

                    <button onClick={() => { setRunnerActionType(null); setRunnerActionFielding([]); }}
                      className="w-full py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 transition-colors">← BACK</button>
                  </div>
                );
              }

              setRunnerActionType(null);
              return null;
            })()}

            {/* PLAYER SUB / POSITION SWAP */}
            {step === 'sub_defense' && subPosition !== null && (() => {
              const currentPlayer = draftFieldingLineup.find(l => l.position === subPosition);
              const changeTeamName = defensiveChangeTeamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName;
              return (
                <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-72 overflow-y-auto">
                  <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-2">
                    {changeTeamName} · {POS_LABELS[subPosition]} — {currentPlayer?.lastName ?? ''}
                  </p>
                  <div className="mb-2 grid grid-cols-2 gap-1">
                    {[
                      { id: game.awayTeamId, label: game.awayTeamName },
                      { id: game.homeTeamId, label: game.homeTeamName },
                    ].map(team => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setSubEditTeam(team.id)}
                        className={`rounded px-2 py-1.5 text-[9px] font-bold uppercase transition-colors ${
                          defensiveChangeTeamId === team.id ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                        }`}
                      >
                        {team.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 mb-2">
                    <button onClick={() => setStep('swap_position')}
                      className="flex-1 py-2 bg-blue-900/40 hover:bg-blue-800/40 text-white text-[10px] font-bold rounded uppercase">Arrange Positions</button>
                    <button onClick={() => setStep('sub_defense')}
                      className="flex-1 py-2 bg-white/10 text-white/60 text-[10px] font-bold rounded uppercase">Replace Player</button>
                  </div>
                  {pendingPositionChanges.length > 0 && (
                    <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                      <p className="text-[9px] font-bold uppercase text-amber-200/80">Pending position changes</p>
                      <div className="mt-1 space-y-0.5">
                        {pendingPositionChanges.map(change => {
                          const player = defensiveChangeLineup.find(l => l.playerId === change.playerId);
                          return (
                            <div key={change.playerId} className="text-[10px] text-white/70">
                              {player ? `${player.firstName.charAt(0)}. ${player.lastName}` : `#${change.playerId}`} {POS_LABELS[change.oldPosition]} → {POS_LABELS[change.newPosition]}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button onClick={handleCommitPositionChanges}
                          className="flex-1 rounded bg-amber-600 px-2 py-1.5 text-[10px] font-bold uppercase text-white hover:bg-amber-500">Commit All</button>
                        <button onClick={() => setPendingPositionChanges([])}
                          className="rounded bg-white/10 px-2 py-1.5 text-[10px] font-bold uppercase text-white/60 hover:bg-white/15">Clear</button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    {availableFieldingSubs.map(p => (
                      <button key={p.playerId} onClick={() => handleDefensiveSub(p.playerId)}
                        className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-xs">{p.firstName.charAt(0)}. {p.lastName}</button>
                    ))}
                    {availableFieldingSubs.length === 0 && <p className="text-white/30 text-xs text-center py-2">No bench players</p>}
                  </div>
                  <button onClick={cancelWizard} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">CANCEL</button>
                </div>
              );
            })()}

            {/* SWAP POSITION picker */}
            {step === 'swap_position' && subPosition !== null && (() => {
              const currentPlayer = draftFieldingLineup.find(l => l.position === subPosition);
              const changeTeamName = defensiveChangeTeamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName;
              return (
                <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-72 overflow-y-auto">
                  <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-1">
                    {changeTeamName}: move {currentPlayer?.lastName ?? ''} ({POS_LABELS[subPosition]}) to:
                  </p>
                  <div className="mb-2 grid grid-cols-2 gap-1">
                    {[
                      { id: game.awayTeamId, label: game.awayTeamName },
                      { id: game.homeTeamId, label: game.homeTeamName },
                    ].map(team => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setSubEditTeam(team.id)}
                        className={`rounded px-2 py-1.5 text-[9px] font-bold uppercase transition-colors ${
                          defensiveChangeTeamId === team.id ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                        }`}
                      >
                        {team.label}
                      </button>
                    ))}
                  </div>
                  <div className="mb-2 grid grid-cols-3 gap-1">
                    {[...draftFieldingLineup]
                      .filter((e) => e.playerId != null && e.position != null)
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((entry) => (
                      <button key={entry.playerId!} onClick={() => setSubPosition(entry.position!)}
                        className={`rounded px-1 py-1.5 text-[9px] transition-all ${entry.position === subPosition ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                        <span className="font-bold">{POS_LABELS[entry.position!]}</span> {entry.lastName}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {Object.entries(POS_LABELS).filter(([k]) => parseInt(k) !== subPosition && parseInt(k) <= 9).map(([k, label]) => {
                      const posNum = parseInt(k);
                      const occupant = draftFieldingLineup.find(l => l.position === posNum);
                      return (
                        <button key={k} onClick={() => handlePositionSwap(posNum)}
                          className="py-2.5 bg-[#1e2d48] hover:bg-[#283a58] text-white rounded transition-all text-center">
                          <div className="text-xs font-bold">{label}</div>
                          {occupant && <div className="text-[9px] text-white/40 mt-0.5">{occupant.lastName}</div>}
                        </button>
                      );
                    })}
                  </div>
                  {pendingPositionChanges.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      <button onClick={handleCommitPositionChanges}
                        className="flex-1 rounded bg-amber-600 px-2 py-2 text-[10px] font-bold uppercase text-white hover:bg-amber-500">
                        Commit {pendingPositionChanges.length} Change{pendingPositionChanges.length === 1 ? '' : 's'}
                      </button>
                      <button onClick={() => setPendingPositionChanges([])}
                        className="rounded bg-white/10 px-2 py-2 text-[10px] font-bold uppercase text-white/60 hover:bg-white/15">Clear</button>
                    </div>
                  )}
                  <button onClick={() => setStep('sub_defense')} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">← BACK</button>
                </div>
              );
            })()}

            {/* PICK PLAYER FOR POSITION CHANGE (from Misc) */}
            {step === 'swap_position_pick' && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-72 overflow-y-auto">
                <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-2">
                  {defensiveChangeTeamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName} defense
                </p>
                <div className="mb-2 grid grid-cols-2 gap-1">
                  {[
                    { id: game.awayTeamId, label: game.awayTeamName },
                    { id: game.homeTeamId, label: game.homeTeamName },
                  ].map(team => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setSubEditTeam(team.id)}
                      className={`rounded px-2 py-1.5 text-[9px] font-bold uppercase transition-colors ${
                        defensiveChangeTeamId === team.id ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                      }`}
                    >
                      {team.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  {draftFieldingLineup
                    .filter((e) => e.playerId != null && e.position != null)
                    .map((entry) => (
                    <button key={entry.playerId!} onClick={() => { setSubPosition(entry.position!); setStep('swap_position'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-xs text-left">
                      <span className="text-white/40 font-bold w-6">{POS_LABELS[entry.position!]}</span>
                      <span className="text-white">{entry.firstName.charAt(0)}. {entry.lastName}</span>
                    </button>
                  ))}
                </div>
                <button onClick={cancelWizard} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">CANCEL</button>
              </div>
            )}

            {/* LINEUP REPLACEMENT — opened from At Bat, batting-order list, or Misc */}
            {step === 'sub_offense' && subBattingSlot !== null && (() => {
              const offenseTeamName = offensiveChangeTeamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName;
              const phName = offensiveChangeLineup.find(l => l.battingOrder === subBattingSlot);
              return (
                <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-64 overflow-y-auto">
                  <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-1">
                    {offenseTeamName} · #{subBattingSlot} — {phName ? `${phName.firstName.charAt(0)}. ${phName.lastName}` : 'open slot'}
                  </p>
                  <div className="mb-2 grid grid-cols-2 gap-1">
                    {[
                      { id: game.awayTeamId, label: game.awayTeamName },
                      { id: game.homeTeamId, label: game.homeTeamName },
                    ].map(team => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setSubEditTeam(team.id)}
                        className={`rounded px-2 py-1.5 text-[9px] font-bold uppercase transition-colors ${
                          offensiveChangeTeamId === team.id ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/70'
                        }`}
                      >
                        {team.label}
                      </button>
                    ))}
                  </div>
                  <div className="mb-2 grid grid-cols-3 gap-1">
                    {Array.from({ length: 9 }, (_, i) => {
                      const slot = i + 1;
                      const entry = offensiveChangeLineup.find(l => l.battingOrder === slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => entry && setSubBattingSlot(slot)}
                          disabled={!entry}
                          className={`rounded px-1 py-1.5 text-[9px] transition-colors ${
                            subBattingSlot === slot
                              ? 'bg-amber-500/20 text-amber-200'
                              : entry
                                ? 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80'
                                : 'bg-white/[0.03] text-white/15'
                          }`}
                        >
                          <span className="font-bold">#{slot}</span> {entry ? entry.lastName : 'empty'}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1">
                    {availableBattingSubs.map(p => (
                      <button key={p.playerId} onClick={() => handleOffensiveSub(p.playerId)}
                        className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-xs text-white">{p.firstName.charAt(0)}. {p.lastName}</button>
                    ))}
                    {availableBattingSubs.length === 0 && <p className="text-white/30 text-xs text-center py-2">No bench players available</p>}
                  </div>
                  <button onClick={cancelWizard} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">CANCEL</button>
                </div>
              );
            })()}

            {/* MISC - iScore style vertical list */}
            {step === 'misc' && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 overflow-hidden max-h-80 flex flex-col">
                <div className="overflow-y-auto divide-y divide-white/5">
                  {[
                    { label: 'Pitching Change', fn: () => { setSubTeamId(fieldingTeamId ?? null); setSubPosition(1); setStep('sub_defense'); } },
                    { label: 'Replace Lineup Player', fn: () => {
                      if (!currentBatter) return;
                      setSubTeamId(battingTeamId ?? null);
                      setSubPosition(null);
                      setSubBattingSlot(battingOrderSlot);
                      setStep('sub_offense');
                    } },
                    { label: 'Balk', fn: () => handleMiscEvent('balk', 'Balk') },
                    { label: 'Illegal Pitch', fn: () => handleMiscEvent('illegal_pitch', 'Illegal pitch') },
                    { label: 'Runner on 2nd (extras)', fn: () => {
                      if (!gameState || !game) return;
                      if (currentBatter && (currentBatter.bats || '').trim().toUpperCase() === 'S' && !switchBatSide) {
                        alert('Select LHB or RHB for this switch hitter first.');
                        return;
                      }
                      const sug = suggestedGhostRunnerFromPrevOffensiveInning(events, gameState.inning, gameState.half);
                      const fallback = battingLineup.find((l) => l.playerId != null)?.playerId ?? null;
                      setMiscGhostRunnerId(sug ?? fallback);
                      setStep('misc_runner_second');
                    } },
                    { label: 'End Half Inning', fn: handleEndHalfInning },
                    { label: 'Adjust Score', fn: openAdjustScore },
                    { label: 'Adjust starting lineups', fn: openLineupAdjust },
                    { label: 'End Game', fn: handleFinalize },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn}
                      className="w-full py-3 px-4 text-sm text-blue-400 hover:bg-white/5 text-center transition-colors">
                      {item.label}
                    </button>
                  ))}
                </div>
                <button onClick={cancelWizard} className="py-3 text-white/40 text-xs font-bold uppercase border-t border-white/10 hover:text-white/60 shrink-0">CANCEL</button>
              </div>
            )}

            {step === 'misc_runner_second' && gameState && game && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 flex flex-col max-h-[22rem]">
                <p className="text-xs text-white/50 uppercase font-bold text-center mb-2">Runner on 2nd (extras)</p>
                {(() => {
                  const sug = suggestedGhostRunnerFromPrevOffensiveInning(events, gameState.inning, gameState.half);
                  if (sug == null) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => setMiscGhostRunnerId(sug)}
                      className="mb-2 w-full py-1.5 px-2 rounded bg-amber-500/15 text-[10px] text-amber-100 hover:bg-amber-500/25 border border-amber-500/25"
                    >
                      Use suggested: {getPlayerName(sug)}
                    </button>
                  );
                })()}
                <div className="overflow-y-auto space-y-1 flex-1 min-h-0 mb-2 pr-0.5">
                  {battingLineup.filter((l) => l.playerId != null).map((l) => (
                    <button
                      key={l.playerId}
                      type="button"
                      onClick={() => setMiscGhostRunnerId(l.playerId!)}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                        miscGhostRunnerId === l.playerId
                          ? 'bg-emerald-600/40 text-white border border-emerald-400/40'
                          : 'bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      #{l.battingOrder} {l.firstName.charAt(0)}. {l.lastName}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 pt-1 border-t border-white/10">
                  <button
                    type="button"
                    onClick={submitPlaceRunnerSecond}
                    disabled={submitting || miscGhostRunnerId == null}
                    className="w-full py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:pointer-events-none text-white text-[10px] font-bold rounded uppercase"
                  >
                    {submitting ? 'Saving…' : 'Confirm runner on 2nd'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMiscGhostRunnerId(null); setStep('misc'); }}
                    className="w-full py-2 text-white/45 text-[10px] font-bold uppercase hover:text-white/70"
                  >
                    Back
                  </button>
                  <button type="button" onClick={cancelWizard} className="w-full py-2 text-white/35 text-[10px] font-bold uppercase hover:text-white/55">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ADJUST SCORE */}
            {step === 'adjust_score' && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 p-4">
                <p className="text-xs text-white/40 uppercase font-bold text-center mb-4">Adjust Score</p>
                <div className="flex items-center gap-6 justify-center mb-4">
                  <div className="text-center">
                    <p className="text-[10px] text-white/40 uppercase mb-1">{game.awayTeamName}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setAdjustAway(Math.max(0, adjustAway - 1))} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white font-bold">−</button>
                      <span className="text-2xl font-bold text-white tabular-nums w-8 text-center">{adjustAway}</span>
                      <button onClick={() => setAdjustAway(adjustAway + 1)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white font-bold">+</button>
                    </div>
                  </div>
                  <span className="text-white/20 text-lg">—</span>
                  <div className="text-center">
                    <p className="text-[10px] text-white/40 uppercase mb-1">{game.homeTeamName}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setAdjustHome(Math.max(0, adjustHome - 1))} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white font-bold">−</button>
                      <span className="text-2xl font-bold text-white tabular-nums w-8 text-center">{adjustHome}</span>
                      <button onClick={() => setAdjustHome(adjustHome + 1)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded text-white font-bold">+</button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelWizard} className="flex-1 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">CANCEL</button>
                  <button onClick={submitAdjustScore} className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white text-[10px] font-bold rounded uppercase">SAVE</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom bar ── */}
          <div className="bg-[#060d1a] border-t border-white/10 px-3 py-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase">
              <button onClick={() => navigate('/games')} className="px-3 py-1.5 text-white/40 hover:text-white">Exit</button>
              <button onClick={handleUndo} disabled={historyBusy} className="px-3 py-1.5 text-white/40 hover:text-white disabled:opacity-30">Undo</button>
              <button onClick={handleRedo} disabled={historyBusy} className="px-3 py-1.5 text-white/40 hover:text-white disabled:opacity-30">Redo</button>
              <button onClick={() => setShowEventTimeline(v => !v)} className="px-3 py-1.5 text-white/40 hover:text-white">Log</button>
              <button onClick={cancelWizard} className="px-3 py-1.5 text-white/40 hover:text-white">Reset</button>
              <button onClick={() => setStep('misc')} className="px-3 py-1.5 text-white/40 hover:text-white">Misc</button>
            </div>
          </div>
        </div>

        {/* Right sidebar: line score + play-by-play */}
        <div className="w-52 shrink-0 border-l border-white/5 overflow-y-auto py-2 px-2 text-[9px] hidden lg:block">
          {/* Line score */}
          <table className="w-full font-mono mb-3">
            <thead><tr className="text-white/20">
              <th className="text-left w-10"></th>
              {Array.from({ length: Math.max(gameState.homeLineScore.length, gameState.awayLineScore.length, 1) }, (_, i) =>
                <th key={i} className="text-center w-3">{i+1}</th>
              )}
              <th className="text-center pl-1 font-bold">R</th><th className="text-center pl-1">H</th><th className="text-center pl-1">E</th>
            </tr></thead>
            <tbody>
              <tr><td className="text-white/50">{game.awayTeamName?.slice(0,4)}</td>
                {gameState.awayLineScore.map((s,i) => <td key={i} className="text-center text-white/50">{s}</td>)}
                <td className="text-center font-bold text-white pl-1">{gameState.awayScore}</td><td className="text-center text-white/30">-</td><td className="text-center text-white/30">-</td>
              </tr>
              <tr><td className="text-white/50">{game.homeTeamName?.slice(0,4)}</td>
                {gameState.homeLineScore.map((s,i) => <td key={i} className="text-center text-white/50">{s}</td>)}
                <td className="text-center font-bold text-white pl-1">{gameState.homeScore}</td><td className="text-center text-white/30">-</td><td className="text-center text-white/30">-</td>
              </tr>
            </tbody>
          </table>
          {/* Play-by-play */}
          <div className="border-t border-white/5 pt-2">
            {[...events].reverse().slice(0, 15).map(evt => (
              <div key={evt.eventNumber} className="py-0.5 leading-tight text-white/35 border-b border-white/[0.03]">
                <span className="text-white/20">{evt.half === 'top' ? '▲' : '▼'}{evt.inning}</span>{' '}
                {formatScoringMiniPbpLine(evt, game)}
              </div>
            ))}
            {events.length === 0 && <p className="text-white/15">No plays yet</p>}
          </div>
        </div>
      </div>

      {/* ── Event Timeline Panel (modal overlay) ── */}
      {showEventTimeline && (
        <EventTimelinePanel
          gameId={gameId}
          events={events}
          homeLineup={homeLineup}
          awayLineup={awayLineup}
          onClose={() => setShowEventTimeline(false)}
          onRefresh={async () => { await loadState(); cancelWizard(); }}
        />
      )}

      {lineupAdjustOpen && game && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-labelledby="lineup-adjust-title">
          <div className="w-full max-w-lg max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-white/10 bg-[#0f1a2a] p-4 shadow-xl">
            <h2 id="lineup-adjust-title" className="text-center text-sm font-bold uppercase tracking-wider text-white mb-1">
              Adjust active lineups
            </h2>
            <div className="flex gap-1 mb-3">
              {(['away', 'home'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setLineupAdjustTeam(side)}
                  className={`flex-1 rounded-lg py-2 text-[10px] font-bold uppercase ${
                    lineupAdjustTeam === side ? 'bg-accent text-white' : 'bg-white/10 text-white/50 hover:text-white/80'
                  }`}
                >
                  {side === 'away' ? game.awayTeamName : game.homeTeamName}
                </button>
              ))}
            </div>
            <div className="space-y-2 mb-4">
              {(lineupAdjustTeam === 'home' ? lineupAdjustHome : lineupAdjustAway).map((row) => {
                const sideRows = lineupAdjustTeam === 'home' ? lineupAdjustHome : lineupAdjustAway;
                const roster = lineupAdjustTeam === 'home' ? homeRoster : awayRoster;
                const hintsMap = lineupAdjustTeam === 'home' ? lineupHintsHome : lineupHintsAway;
                const takenIds = new Set(
                  sideRows.filter((r) => r.id !== row.id && r.playerId != null).map((r) => r.playerId as number),
                );
                const pickable = roster.filter((p) => !takenIds.has(p.playerId) || p.playerId === row.playerId);
                return (
                  <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2">
                    <label className="flex flex-col gap-0.5 text-[10px] text-white/40 min-w-[140px] flex-[2]">
                      <span>Player</span>
                      <select
                        value={row.playerId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') {
                            updateLineupAdjustRow(lineupAdjustTeam, row.id, {
                              playerId: null,
                              position: null,
                              firstName: '—',
                              lastName: 'Vacant slot',
                            });
                            return;
                          }
                          const pid = Number(v);
                          const pl = roster.find((p) => p.playerId === pid);
                          const used = new Set(
                            sideRows
                              .filter((r) => r.id !== row.id && r.position != null)
                              .map((r) => r.position as number),
                          );
                          const pos = pickLineupFieldingPosition(hintsMap[pid]?.positions, used);
                          updateLineupAdjustRow(lineupAdjustTeam, row.id, {
                            playerId: pid,
                            position: pos,
                            firstName: pl?.firstName ?? '',
                            lastName: pl?.lastName ?? '',
                          });
                        }}
                        className={`${ADMIN_SELECT_SM} w-full min-w-0`}
                      >
                        <option value="">Vacant slot</option>
                        {pickable.map((p) => (
                          <option key={p.playerId} value={p.playerId}>
                            {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}{p.firstName} {p.lastName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-white/40">
                      BO
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={row.battingOrder}
                        onChange={(e) =>
                          updateLineupAdjustRow(lineupAdjustTeam, row.id, {
                            battingOrder: Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)),
                          })
                        }
                        className="w-11 rounded border border-white/15 bg-[#152238] px-1 py-0.5 text-[11px] text-slate-100 [color-scheme:dark]"
                      />
                    </label>
                    {row.playerId != null ? (
                      <label className="flex items-center gap-1 text-[10px] text-white/40 flex-1 min-w-[100px]">
                        Pos
                        <select
                          value={row.position ?? 1}
                          onChange={(e) =>
                            updateLineupAdjustRow(lineupAdjustTeam, row.id, { position: Number(e.target.value) })
                          }
                          className={`${ADMIN_SELECT_SM} flex-1 min-w-0`}
                        >
                          {Object.entries(POS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="text-[10px] text-white/30 flex-1 min-w-[80px]">No defensive position</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={lineupAdjustBusy}
                onClick={() => setLineupAdjustOpen(false)}
                className="flex-1 rounded-lg border border-white/15 py-2 text-[11px] font-bold uppercase text-white/70 hover:bg-white/5 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={lineupAdjustBusy}
                onClick={() => void submitLineupAdjust()}
                className="flex-1 rounded-lg bg-green-600 py-2 text-[11px] font-bold uppercase text-white hover:bg-green-500 disabled:opacity-40"
              >
                {lineupAdjustBusy ? 'Saving…' : 'Save both teams'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Event Timeline Panel – overlay for viewing/editing/deleting events
   ══════════════════════════════════════════════════════════════════════════ */

interface TimelinePanelProps {
  gameId: number;
  events: GameEvent[];
  homeLineup: LineupEntry[];
  awayLineup: LineupEntry[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

function EventTimelinePanel({ gameId, events, homeLineup, awayLineup, onClose, onRefresh }: TimelinePanelProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [previewState, setPreviewState] = useState<{ eventNumber: number; state: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scoreEditPlayerIds, setScoreEditPlayerIds] = useState<number[]>([]);
  const [mode, setMode] = useState<'log' | 'stats'>('log');
  const [statsLoading, setStatsLoading] = useState(false);
  const [gameStats, setGameStats] = useState<{ batting: any[]; pitching: any[]; fielding: any[] } | null>(null);
  const [statsEdits, setStatsEdits] = useState<Record<string, Record<string, any>>>({});

  const allPlayers = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of [...homeLineup, ...awayLineup]) {
      if (p.playerId != null) map.set(p.playerId, `${p.firstName} ${p.lastName}`);
    }
    return map;
  }, [homeLineup, awayLineup]);

  const playerName = (id?: number | null) => id ? (allPlayers.get(id) || `#${id}`) : '';

  const EVENT_TYPE_OPTIONS = [
    'pitch', 'single', 'bunt_single', 'double', 'ground_rule_double', 'triple', 'home_run', 'inside_park_hr',
    'walk', 'intentional_walk', 'hit_by_pitch', 'catcher_obstruction', 'catcher_interference',
    'strikeout', 'strikeout_swinging', 'strikeout_looking', 'caught_foul_tip', 'bunt_foul', 'dropped_third_strike', 'dropped_third_strike_out', 'wild_pitch_third_strike',
    'ground_out', 'fly_out', 'line_out', 'pop_out', 'foul_out', 'bunt_out', 'infield_fly', 'sacrifice_fly', 'sacrifice_bunt', 'fielders_choice',
    'double_play', 'triple_play', 'error', 'sac_bunt_error', 'sac_fly_error',
    'stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball', 'balk', 'defensive_indifference',
    'advance', 'advance_on_error', 'runner_interference', 'appeal_play', 'tagged_out', 'force_out', 'hit_by_ball',
    'missed_base', 'left_base_early', 'left_base_path', 'offensive_interference', 'passed_runner', 'hesitation', 'illegal_pitch',
    'end_half_inning', 'substitution', 'adjust_score', 'place_runner_second', 'interference', 'other',
  ];

  const playerOptions = [...allPlayers.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const setPlayerArray = (field: 'putoutFielderIds' | 'assistFielderIds' | 'errorFielderIds', id: number, checked: boolean) => {
    setEditForm(f => {
      const next = new Set<number>(Array.isArray(f[field]) ? f[field] : []);
      if (checked) next.add(id); else next.delete(id);
      const arr = [...next];
      return {
        ...f,
        [field]: arr,
        ...(field === 'errorFielderIds' ? { errorsOnPlay: arr.length } : {}),
      };
    });
  };

  const RUN_SCORE_REASON_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'on_play', label: 'On play' },
    { value: 'wild_pitch', label: 'Wild pitch' },
    { value: 'passed_ball', label: 'Passed ball' },
    { value: 'error', label: 'Error' },
    { value: 'advance_on_error', label: 'Advance on error' },
    { value: 'obstruction', label: 'Obstruction' },
    { value: 'defensive_indifference', label: 'Def. indifference' },
    { value: 'stolen_base', label: 'Stolen base' },
    { value: 'on_throw', label: 'On throw' },
    { value: 'held', label: 'Held up' },
    { value: 'other', label: 'Other' },
  ];

  const eventColor = (type: string) => {
    if (type === 'pitch') return 'text-white/25';
    if (['single', 'double', 'triple', 'home_run', 'inside_park_hr', 'bunt_single', 'ground_rule_double', 'walk', 'intentional_walk', 'hit_by_pitch'].includes(type)) return 'text-green-400';
    if (['ground_out', 'fly_out', 'line_out', 'pop_out', 'strikeout_swinging', 'strikeout_looking', 'sacrifice_fly', 'sacrifice_bunt', 'bunt_out', 'infield_fly', 'dropped_third_strike_out'].includes(type)) return 'text-red-400';
    if (['stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball', 'balk', 'advance', 'advance_on_error', 'tagged_out', 'force_out'].includes(type)) return 'text-orange-400';
    if (['end_half_inning', 'substitution'].includes(type)) return 'text-blue-400';
    return 'text-white/40';
  };

  const handlePreview = async (eventNumber: number) => {
    if (previewState?.eventNumber === eventNumber) { setPreviewState(null); return; }
    try {
      const res = await apiGet<{ state: any; eventCount: number }>(`/admin/scoring/${gameId}/state-at/${eventNumber}`);
      setPreviewState({ eventNumber, state: res.state });
    } catch { /* ignore */ }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await apiGet<{ batting: any[]; pitching: any[]; fielding: any[] }>(`/admin/games/${gameId}/stats`);
      setGameStats(res);
      setStatsEdits({});
    } catch (err: any) {
      alert(err.message || 'Failed to load game stats');
      setGameStats({ batting: [], pitching: [], fielding: [] });
    } finally {
      setStatsLoading(false);
    }
  };

  const setRowEdit = (kind: 'batting' | 'pitching' | 'fielding', playerId: number, patch: Record<string, any>) => {
    const key = `${kind}:${playerId}`;
    setStatsEdits(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };

  const saveRow = async (kind: 'batting' | 'pitching' | 'fielding', playerId: number) => {
    const key = `${kind}:${playerId}`;
    const patch = statsEdits[key] || {};
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try {
      await apiPut(`/admin/games/${gameId}/stats/${kind}/${playerId}`, patch);
      await loadStats();
      await onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (eventId: number) => {
    if (!confirm('Delete this event? Game state will be recomputed.')) return;
    setBusy(true);
    try {
      await apiDelete(`/admin/scoring/${gameId}/event/${eventId}`);
      await onRefresh();
    } catch (err: any) { alert(err.message); }
    finally { setBusy(false); }
  };

  const startEdit = (evt: GameEvent) => {
    setEditingId(evt.id);
    const scored = (evt.runnersScored as any as number[]) || [];
    const reasons = (evt as any).runnerScoredReasons as string[] | undefined;
    setScoreEditPlayerIds(scored);
    setEditForm({
      inning: evt.inning ?? 1,
      half: evt.half ?? 'top',
      eventType: evt.eventType,
      eventDetail: evt.eventDetail || '',
      rbi: evt.rbi ?? 0,
      runsScored: evt.runsScored ?? 0,
      outsRecorded: evt.outsRecorded ?? 0,
      balls: evt.balls ?? 0,
      strikes: evt.strikes ?? 0,
      batterId: evt.batterId ?? null,
      batterSide: evt.batterSide ?? null,
      pitcherId: evt.pitcherId ?? null,
      errorsOnPlay: (evt as any).errorsOnPlay ?? 0,
      runnerFirstId: evt.runnerFirstId ?? null,
      runnerSecondId: evt.runnerSecondId ?? null,
      runnerThirdId: evt.runnerThirdId ?? null,
      fieldingSequence: evt.fieldingSequence ?? '',
      putoutFielderIds: Array.isArray(evt.putoutFielderIds) ? evt.putoutFielderIds : [],
      assistFielderIds: Array.isArray(evt.assistFielderIds) ? evt.assistFielderIds : [],
      errorFielderIds: Array.isArray(evt.errorFielderIds) ? evt.errorFielderIds : [],
      pitchCount: evt.pitchCount ?? null,
      pitchSequence: evt.pitchSequence ?? '',
      runnersScored: scored,
      runnerScoredReasons: Array.isArray(reasons) ? reasons : scored.map(() => 'on_play'),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusy(true);
    try {
      // Normalize score arrays: ensure reasons aligns with runnersScored.
      const scored: number[] = Array.isArray(editForm.runnersScored) ? editForm.runnersScored : [];
      let reasons: string[] = Array.isArray(editForm.runnerScoredReasons) ? editForm.runnerScoredReasons : [];
      if (reasons.length !== scored.length) {
        reasons = scored.map((_, i) => reasons[i] || 'on_play');
      }
      const errorFielderIds: number[] = Array.isArray(editForm.errorFielderIds) ? editForm.errorFielderIds : [];
      const payload = {
        ...editForm,
        runnersScored: scored,
        runnerScoredReasons: reasons,
        errorFielderIds,
        errorsOnPlay: errorFielderIds.length > 0 ? errorFielderIds.length : (parseInt(String(editForm.errorsOnPlay ?? 0), 10) || 0),
        // If user didn't set runsScored explicitly, keep it consistent with scorers.
        runsScored: typeof editForm.runsScored === 'number' ? editForm.runsScored : scored.length,
      };
      await apiPut(`/admin/scoring/${gameId}/event/${editingId}`, payload);
      setEditingId(null);
      setScoreEditPlayerIds([]);
      await onRefresh();
    } catch (err: any) { alert(err.message); }
    finally { setBusy(false); }
  };

  const BASE_NAMES: Record<string, string> = { first: '1B', second: '2B', third: '3B' };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-[#0a1628] border-l border-white/10 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-bold text-sm uppercase tracking-wider">{mode === 'log' ? 'Game Log' : 'Manual Stats'}</h2>
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => { setMode('log'); setPreviewState(null); }}
                className={`px-2 py-1 text-[9px] font-bold rounded uppercase ${mode === 'log' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
              >
                Log
              </button>
              <button
                onClick={async () => { setMode('stats'); setPreviewState(null); if (!gameStats) await loadStats(); }}
                className={`px-2 py-1 text-[9px] font-bold rounded uppercase ${mode === 'stats' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'}`}
              >
                Stats
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg font-bold">&times;</button>
        </div>

        {/* State preview bar */}
        {mode === 'log' && previewState && (
          <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-500/20 text-[10px]">
            <div className="flex items-center gap-3 text-white/70">
              <span className="font-bold text-blue-400">State @ event #{previewState.eventNumber}</span>
              <span>{previewState.state.half === 'top' ? '▲' : '▼'}{previewState.state.inning}</span>
              <span>{previewState.state.outs} out{previewState.state.outs !== 1 ? 's' : ''}</span>
              <span>Score: {previewState.state.awayScore}-{previewState.state.homeScore}</span>
              <span>
                {previewState.state.bases.first ? '1B' : ''}{' '}
                {previewState.state.bases.second ? '2B' : ''}{' '}
                {previewState.state.bases.third ? '3B' : ''}
                {!previewState.state.bases.first && !previewState.state.bases.second && !previewState.state.bases.third ? 'Empty' : ''}
              </span>
            </div>
            <button onClick={() => setPreviewState(null)} className="text-blue-400 hover:text-blue-300 mt-0.5">Close preview</button>
          </div>
        )}

        {/* Event list */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'log' && (
            <>
              {events.length === 0 && <p className="text-white/20 text-center mt-8 text-xs">No events yet</p>}
              {events.map((evt, i) => {
            const showInningDivider = i === 0 || evt.inning !== events[i - 1].inning || evt.half !== events[i - 1].half;
            return (
              <div key={evt.id}>
                {showInningDivider && (
                  <div className="px-4 py-1 bg-white/[0.03] text-[9px] text-white/30 font-bold uppercase tracking-wider border-b border-white/5">
                    {evt.half === 'top' ? '▲' : '▼'} Inning {evt.inning}
                  </div>
                )}
                <div className={`px-4 py-1.5 border-b border-white/[0.04] hover:bg-white/[0.03] ${previewState?.eventNumber === evt.eventNumber ? 'bg-blue-900/20' : ''}`}>
                  {editingId === evt.id ? (
                    <div className="space-y-1.5 py-1">
                      <div className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] text-amber-100/80">
                        Editing or deleting an earlier event replays downstream game state. If the game is finalized, official stats will be recomputed from the event log.
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Inning:</label>
                        <input type="number" min={1} value={editForm.inning ?? 1} onChange={e => setEditForm(f => ({ ...f, inning: parseInt(e.target.value, 10) || 1 }))} className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                        <select value={editForm.half ?? 'top'} onChange={e => setEditForm(f => ({ ...f, half: e.target.value }))} className={ADMIN_SELECT_SM_FLEX}>
                          <option value="top">Top</option>
                          <option value="bot">Bottom</option>
                        </select>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Type:</label>
                        <select value={editForm.eventType || ''} onChange={e => setEditForm(f => ({ ...f, eventType: e.target.value }))} className={ADMIN_SELECT_SM_FLEX}>
                          {EVENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Detail:</label>
                        <input value={editForm.eventDetail || ''} onChange={e => setEditForm(f => ({ ...f, eventDetail: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Batter:</label>
                        <select value={editForm.batterId ?? ''} onChange={e => setEditForm(f => ({ ...f, batterId: e.target.value === '' ? null : parseInt(e.target.value, 10) }))} className={ADMIN_SELECT_SM_FLEX}>
                          <option value="">—</option>
                          {playerOptions.map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Bat side:</label>
                        <select
                          value={editForm.batterSide ?? ''}
                          onChange={e => setEditForm(f => ({ ...f, batterSide: e.target.value === '' ? null : e.target.value }))}
                          className={ADMIN_SELECT_SM_FLEX}
                        >
                          <option value="">—</option>
                          <option value="L">LHB</option>
                          <option value="R">RHB</option>
                        </select>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Pitcher:</label>
                        <select value={editForm.pitcherId ?? ''} onChange={e => setEditForm(f => ({ ...f, pitcherId: e.target.value === '' ? null : parseInt(e.target.value, 10) }))} className={ADMIN_SELECT_SM_FLEX}>
                          <option value="">—</option>
                          {playerOptions.map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Count:</label>
                        <input type="number" min={0} max={3} value={editForm.balls ?? 0} onChange={e => setEditForm(f => ({ ...f, balls: parseInt(e.target.value, 10) || 0 }))} className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                        <span className="text-white/25 pt-0.5">balls</span>
                        <input type="number" min={0} max={2} value={editForm.strikes ?? 0} onChange={e => setEditForm(f => ({ ...f, strikes: parseInt(e.target.value, 10) || 0 }))} className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                        <span className="text-white/25 pt-0.5">strikes</span>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">RBI:</label>
                        <input type="number" value={editForm.rbi ?? 0} onChange={e => setEditForm(f => ({ ...f, rbi: parseInt(e.target.value) || 0 }))} className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                        <label className="text-white/40 w-10 shrink-0 ml-2">Runs:</label>
                        <input type="number" value={editForm.runsScored ?? 0} onChange={e => setEditForm(f => ({ ...f, runsScored: parseInt(e.target.value) || 0 }))} className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                        <label className="text-white/40 w-10 shrink-0 ml-2">Outs:</label>
                        <input type="number" value={editForm.outsRecorded ?? 0} onChange={e => setEditForm(f => ({ ...f, outsRecorded: parseInt(e.target.value) || 0 }))} className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <label className="text-white/40 w-16 shrink-0">Errors:</label>
                        <input type="number" value={editForm.errorsOnPlay ?? 0} onChange={e => setEditForm(f => ({ ...f, errorsOnPlay: parseInt(e.target.value) || 0 }))} className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        {[
                          ['runnerFirstId', '1B'],
                          ['runnerSecondId', '2B'],
                          ['runnerThirdId', '3B'],
                        ].map(([field, label]) => (
                          <label key={field} className="text-white/40">
                            {label}
                            <select value={editForm[field] ?? ''} onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value === '' ? null : parseInt(e.target.value, 10) }))} className={ADMIN_SELECT_ROW}>
                              <option value="">Empty</option>
                              {playerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>

                      <div className="space-y-1 rounded bg-white/[0.03] border border-white/10 p-2">
                        <div className="flex gap-2 text-[10px]">
                          <label className="text-white/40 w-16 shrink-0">Seq:</label>
                          <input value={editForm.fieldingSequence || ''} onChange={e => setEditForm(f => ({ ...f, fieldingSequence: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-[10px]" />
                        </div>
                        {[
                          ['putoutFielderIds', 'PO'],
                          ['assistFielderIds', 'A'],
                          ['errorFielderIds', 'E'],
                        ].map(([field, label]) => (
                          <div key={field}>
                            <div className="text-white/40 text-[9px] font-bold">{label} fielders</div>
                            <div className="grid grid-cols-2 gap-1 mt-1">
                              {playerOptions.map(([id, name]) => (
                                <label key={`${field}:${id}`} className="flex items-center gap-1 text-[9px] text-white/45">
                                  <input
                                    type="checkbox"
                                    checked={Array.isArray(editForm[field]) && editForm[field].includes(id)}
                                    onChange={e => setPlayerArray(field as 'putoutFielderIds' | 'assistFielderIds' | 'errorFielderIds', id, e.target.checked)}
                                  />
                                  <span className="truncate">{name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Scorers */}
                      <div className="mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/40 text-[10px] font-bold">Runners scored</span>
                          <button
                            onClick={() => {
                              setEditForm(f => ({ ...f, runnersScored: [], runnerScoredReasons: [] }));
                              setScoreEditPlayerIds([]);
                            }}
                            className="text-[9px] text-white/30 hover:text-white/60"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-1.5">
                          {playerOptions.map(([id, name]) => {
                            const checked = (editForm.runnersScored || []).includes(id);
                            return (
                              <label key={id} className={`flex items-center gap-2 px-2 py-1 rounded border text-[9px] ${checked ? 'bg-green-900/20 border-green-700/40 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const prevScored: number[] = Array.isArray(editForm.runnersScored) ? editForm.runnersScored : [];
                                    const prevReasons: string[] = Array.isArray(editForm.runnerScoredReasons) ? editForm.runnerScoredReasons : [];
                                    const reasonByPlayer = new Map(prevScored.map((pid, i) => [pid, prevReasons[i] || 'on_play']));
                                    const next = new Set<number>(prevScored);
                                    if (e.target.checked) next.add(id); else next.delete(id);
                                    const arr = [...next];
                                    setEditForm(f => ({
                                      ...f,
                                      runnersScored: arr,
                                      runnerScoredReasons: arr.map(pid => reasonByPlayer.get(pid) || 'on_play'),
                                    }));
                                  }}
                                />
                                <span className="truncate">{name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Reason per scorer (order matches runnersScored) */}
                      {(editForm.runnersScored || []).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {(editForm.runnersScored || []).map((pid: number, idx: number) => (
                            <div key={`${pid}:${idx}`} className="flex items-center gap-2 text-[10px]">
                              <div className="w-24 text-white/50 truncate">{playerName(pid)}</div>
                              <select
                                value={(editForm.runnerScoredReasons || [])[idx] || 'on_play'}
                                onChange={(e) => {
                                  const next = [...(editForm.runnerScoredReasons || [])];
                                  next[idx] = e.target.value;
                                  setEditForm(f => ({ ...f, runnerScoredReasons: next }));
                                }}
                                className={ADMIN_SELECT_SM_FLEX}
                              >
                                {RUN_SCORE_REASON_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1.5 mt-1">
                        <button onClick={saveEdit} disabled={busy} className="px-2 py-0.5 bg-green-700 hover:bg-green-600 text-white text-[9px] font-bold rounded uppercase">Save</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white/60 text-[9px] font-bold rounded uppercase">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="text-white/15 text-[9px] w-5 shrink-0 text-right mt-0.5">#{evt.eventNumber}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold ${eventColor(evt.eventType)}`}>{evt.eventType.replace(/_/g, ' ').toUpperCase()}</span>
                          {evt.batterId ? <span className="text-white/25 text-[9px]">{playerName(evt.batterId)}</span> : null}
                        </div>
                        {evt.eventDetail && <div className="text-white/30 text-[9px] truncate">{evt.eventDetail}</div>}
                        <div className="flex gap-2 text-[8px] text-white/15 mt-0.5">
                          {(evt.runsScored ?? 0) > 0 && <span className="text-green-500/60">{evt.runsScored}R</span>}
                          {(evt.rbi ?? 0) > 0 && <span className="text-green-500/60">{evt.rbi}RBI</span>}
                          {(evt.outsRecorded ?? 0) > 0 && <span className="text-red-400/60">{evt.outsRecorded}OUT</span>}
                        </div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button onClick={() => handlePreview(evt.eventNumber)} title="Preview state" className={`px-1 py-0.5 text-[8px] rounded ${previewState?.eventNumber === evt.eventNumber ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>&#9654;</button>
                        <button onClick={() => startEdit(evt)} title="Edit" className="px-1 py-0.5 text-[8px] bg-white/5 text-white/30 hover:text-white/60 rounded">&#9998;</button>
                        <button onClick={() => handleDelete(evt.id)} title="Delete" disabled={busy} className="px-1 py-0.5 text-[8px] bg-white/5 text-red-400/50 hover:text-red-400 rounded">&times;</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
              })}
            </>
          )}

          {mode === 'stats' && (
            <div className="p-4 space-y-6">
              {statsLoading && <div className="text-white/40 text-xs">Loading…</div>}
              {!statsLoading && !gameStats && <div className="text-white/30 text-xs">No stats loaded.</div>}

              {!statsLoading && gameStats && (
                <>
                  <div className="text-white/30 text-[10px]">
                    Edit per-game lines here (post-game corrections). Saving will recompute season totals + standings.
                  </div>

                  {/* Pitching */}
                  <section>
                    <div className="text-white font-bold text-[10px] uppercase tracking-wider mb-2">Pitching</div>
                    <div className="space-y-2">
                      {gameStats.pitching.length === 0 && <div className="text-white/20 text-xs">No pitching rows</div>}
                      {gameStats.pitching.map((p: any) => (
                        <div key={`p:${p.playerId}`} className="bg-white/5 border border-white/10 rounded p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-white text-xs font-bold truncate">{playerName(p.playerId)}</div>
                            <button
                              onClick={() => saveRow('pitching', p.playerId)}
                              disabled={busy || Object.keys(statsEdits[`pitching:${p.playerId}`] || {}).length === 0}
                              className="px-2 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-30 text-white text-[9px] font-bold rounded uppercase"
                            >
                              Save
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
                            {[
                              ['inningsPitched','IP'],
                              ['runsAllowed','R'],
                              ['earnedRuns','ER'],
                              ['wildPitches','WP'],
                              ['walksAllowed','BB'],
                              ['hitsAllowed','H'],
                              ['strikeouts','K'],
                            ].map(([k, label]) => (
                              <label key={k} className="text-white/40">
                                {label}
                                <input
                                  value={(statsEdits[`pitching:${p.playerId}`]?.[k] ?? p[k] ?? '')}
                                  onChange={(e) => setRowEdit('pitching', p.playerId, { [k]: e.target.value })}
                                  className="mt-0.5 w-full bg-[#0b1a30] border border-white/10 rounded px-1 py-0.5 text-white"
                                />
                              </label>
                            ))}

                            <label className="text-white/40">
                              Dec
                              <select
                                value={(statsEdits[`pitching:${p.playerId}`]?.decision ?? p.decision ?? '')}
                                onChange={(e) => setRowEdit('pitching', p.playerId, { decision: e.target.value || null })}
                                className={ADMIN_SELECT_ROW}
                              >
                                <option value="">—</option>
                                <option value="W">W</option>
                                <option value="L">L</option>
                                <option value="S">S</option>
                                <option value="H">H</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Batting */}
                  <section>
                    <div className="text-white font-bold text-[10px] uppercase tracking-wider mb-2">Batting</div>
                    <div className="space-y-2">
                      {gameStats.batting.length === 0 && <div className="text-white/20 text-xs">No batting rows</div>}
                      {gameStats.batting.map((b: any) => (
                        <div key={`b:${b.playerId}`} className="bg-white/5 border border-white/10 rounded p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-white text-xs font-bold truncate">{playerName(b.playerId)}</div>
                            <button
                              onClick={() => saveRow('batting', b.playerId)}
                              disabled={busy || Object.keys(statsEdits[`batting:${b.playerId}`] || {}).length === 0}
                              className="px-2 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-30 text-white text-[9px] font-bold rounded uppercase"
                            >
                              Save
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
                            {[
                              ['atBats','AB'],
                              ['hits','H'],
                              ['runs','R'],
                              ['rbi','RBI'],
                              ['walks','BB'],
                              ['strikeouts','SO'],
                            ].map(([k, label]) => (
                              <label key={k} className="text-white/40">
                                {label}
                                <input
                                  value={(statsEdits[`batting:${b.playerId}`]?.[k] ?? b[k] ?? '')}
                                  onChange={(e) => setRowEdit('batting', b.playerId, { [k]: e.target.value })}
                                  className="mt-0.5 w-full bg-[#0b1a30] border border-white/10 rounded px-1 py-0.5 text-white"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Fielding */}
                  <section>
                    <div className="text-white font-bold text-[10px] uppercase tracking-wider mb-2">Fielding</div>
                    <div className="space-y-2">
                      {gameStats.fielding.length === 0 && <div className="text-white/20 text-xs">No fielding rows</div>}
                      {gameStats.fielding.map((f: any) => (
                        <div key={`f:${f.playerId}`} className="bg-white/5 border border-white/10 rounded p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-white text-xs font-bold truncate">{playerName(f.playerId)}</div>
                            <button
                              onClick={() => saveRow('fielding', f.playerId)}
                              disabled={busy || Object.keys(statsEdits[`fielding:${f.playerId}`] || {}).length === 0}
                              className="px-2 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-30 text-white text-[9px] font-bold rounded uppercase"
                            >
                              Save
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
                            {[
                              ['putouts','PO'],
                              ['assists','A'],
                              ['errors','E'],
                              ['passedBalls','PB'],
                            ].map(([k, label]) => (
                              <label key={k} className="text-white/40">
                                {label}
                                <input
                                  value={(statsEdits[`fielding:${f.playerId}`]?.[k] ?? f[k] ?? '')}
                                  onChange={(e) => setRowEdit('fielding', f.playerId, { [k]: e.target.value })}
                                  className="mt-0.5 w-full bg-[#0b1a30] border border-white/10 rounded px-1 py-0.5 text-white"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/10 text-[9px] text-white/20">
          {mode === 'log'
            ? `${events.length} event${events.length !== 1 ? 's' : ''}`
            : `Manual edits: ${Object.keys(statsEdits).length}`}
        </div>
      </div>
    </div>
  );
}
