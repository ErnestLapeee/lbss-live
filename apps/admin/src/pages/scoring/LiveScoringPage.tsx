import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut } from '@/lib/api';

/* ── Types ── */
interface Player { playerId: number; firstName: string; lastName: string; jerseyNumber?: string; teamId: number; licensePaid?: string | null }
interface LineupEntry { id: number; playerId: number; battingOrder: number; position: number; isActive: boolean; isStarter: boolean; firstName: string; lastName: string; teamId: number }
interface GameState { inning: number; half: 'top' | 'bot'; outs: number; homeScore: number; awayScore: number; bases: { first: number | null; second: number | null; third: number | null }; homeLineScore: number[]; awayLineScore: number[]; eventCount: number; balls: number; strikes: number }
interface GameEvent { id: number; eventNumber: number; eventType: string; batterId?: number; pitcherId?: number; inning: number; half: string; runsScored?: number; rbi?: number; outsRecorded?: number; eventDetail?: string }
interface GameData { id: number; status: string; homeTeamId: number; awayTeamId: number; homeTeamName: string; awayTeamName: string; isFinalized: boolean }

const POS_LABELS: Record<number, string> = { 1:'P',2:'C',3:'1B',4:'2B',5:'3B',6:'SS',7:'LF',8:'CF',9:'RF',10:'DH' };
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
  { key: 'catcher_obstruction', label: 'CATCHER OBSTRUCTION' },
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

/* ── (Field positions are defined inline in the SVG) ── */

type ScoringStep = 'pitch' | 'strikeout_type' | 'out_type' | 'safe_type' | 'fielding' | 'hit_location' | 'runner' | 'runner_out_detail' | 'runner_action' | 'sub_defense' | 'sub_offense' | 'swap_position' | 'swap_position_pick' | 'misc' | 'adjust_score';

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
}

const NO_RBI_REASONS = new Set(['error', 'wild_pitch', 'passed_ball', 'balk', 'defensive_indifference', 'advance_on_error', 'obstruction']);
const NO_RBI_BATTER_EVENTS = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

const BASE_ORDER: Record<string, number> = { first: 1, second: 2, third: 3, home: 4 };
const BASE_FROM_ORDER: Record<number, 'first' | 'second' | 'third' | 'home'> = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' };

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
  const gameId = parseInt(gameIdStr || '0', 10);

  const [game, setGame] = useState<GameData | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [homeLineup, setHomeLineup] = useState<LineupEntry[]>([]);
  const [awayLineup, setAwayLineup] = useState<LineupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'scoring'>('setup');

  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);
  const [setupHome, setSetupHome] = useState<Array<{ playerId: number; position: number }>>([]);
  const [setupAway, setSetupAway] = useState<Array<{ playerId: number; position: number }>>([]);
  const [setupTeam, setSetupTeam] = useState<'home' | 'away'>('away');

  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [currentBatterIdx, setCurrentBatterIdx] = useState<Record<string, number>>({ home: 0, away: 0 });
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<ScoringStep>('pitch');
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [outSafeTab, setOutSafeTab] = useState<'out' | 'safe'>('safe');
  const [outSafeMorePage, setOutSafeMorePage] = useState(false);
  const [fieldingPositions, setFieldingPositions] = useState<number[]>([]);
  const [runnerQuestions, setRunnerQuestions] = useState<RunnerQuestion[]>([]);
  const [currentRunnerIdx, setCurrentRunnerIdx] = useState(0);

  // Substitution state
  const [subPosition, setSubPosition] = useState<number | null>(null); // defensive position being substituted
  const [subBattingSlot, setSubBattingSlot] = useState<number | null>(null); // batting slot being substituted

  // Runner action state (click on a runner)
  const [activeRunnerBase, setActiveRunnerBase] = useState<'first' | 'second' | 'third' | null>(null);

  // Runner out detail tab
  const [runnerOutSafeTab, setRunnerOutSafeTab] = useState<'out' | 'safe'>('safe');
  const [runnerSafeDest, setRunnerSafeDest] = useState<'first' | 'second' | 'third' | 'home' | null>(null);

  // Hit location state
  const [hitLocationX, setHitLocationX] = useState<number | null>(null);
  const [hitLocationY, setHitLocationY] = useState<number | null>(null);
  const [hitType, setHitType] = useState<string | null>(null);
  const [hitHardness, setHitHardness] = useState<string | null>(null);

  // Adjust score state
  const [adjustHome, setAdjustHome] = useState(0);
  const [adjustAway, setAdjustAway] = useState(0);

  // Per-pitcher pitch count derived from events
  const pitcherPitchCounts = useMemo(() => {
    const counts: Record<number, { total: number; balls: number; strikes: number }> = {};
    const RUNNER_EVENTS = new Set(['stolen_base','caught_stealing','picked_off','wild_pitch','passed_ball','balk','advance','advance_on_error','defensive_indifference','runner_interference','appeal_play','tagged_out','force_out','hit_by_ball','missed_base','left_base_early','left_base_path','offensive_interference','passed_runner','hesitation','double_play','triple_play','end_half_inning','illegal_pitch']);
    const WALK_TYPES = new Set(['walk','intentional_walk']);
    for (const e of events) {
      if (!e.pitcherId) continue;
      if (!counts[e.pitcherId]) counts[e.pitcherId] = { total: 0, balls: 0, strikes: 0 };
      if (e.eventType === 'pitch') {
        counts[e.pitcherId].total++;
        const d = (e.eventDetail || '').toLowerCase();
        if (d === 'ball') counts[e.pitcherId].balls++;
        else counts[e.pitcherId].strikes++;
      } else if (!RUNNER_EVENTS.has(e.eventType)) {
        counts[e.pitcherId].total++;
        // The result event's final pitch: walks/HBP/CI are balls, everything else is a strike (contact or K)
        if (WALK_TYPES.has(e.eventType) || e.eventType === 'hit_by_pitch' || e.eventType === 'catcher_obstruction') {
          counts[e.pitcherId].balls++;
        } else {
          counts[e.pitcherId].strikes++;
        }
      }
    }
    return counts;
  }, [events]);

  const loadState = useCallback(async () => {
    try {
      const data: any = await apiGet(`/admin/scoring/${gameId}/state`);
      setGame(data.game); setGameState(data.state); setEvents(data.events || []);
      setHomeLineup(data.lineups?.home || []); setAwayLineup(data.lineups?.away || []);
      if (data.game.status === 'live' || data.game.status === 'suspended') setPhase('scoring');
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [gameId]);

  const loadRosters = useCallback(async () => {
    try {
      const data: any = await apiGet(`/admin/scoring/${gameId}/roster`);
      setHomeRoster(data.home || []); setAwayRoster(data.away || []);
    } catch {}
  }, [gameId]);

  useEffect(() => { loadState(); loadRosters(); }, [loadState, loadRosters]);

  // Derived
  const battingTeamId = gameState?.half === 'top' ? game?.awayTeamId : game?.homeTeamId;
  const fieldingTeamId = gameState?.half === 'top' ? game?.homeTeamId : game?.awayTeamId;
  const battingLineup = (battingTeamId === game?.homeTeamId ? homeLineup : awayLineup)
    .filter(l => l.isActive).sort((a, b) => a.battingOrder - b.battingOrder);
  const fieldingLineup = (fieldingTeamId === game?.homeTeamId ? homeLineup : awayLineup)
    .filter(l => l.isActive).sort((a, b) => a.battingOrder - b.battingOrder);
  const currentPitcher = fieldingLineup.find(l => l.position === 1);

  const battingSide = gameState?.half === 'top' ? 'away' : 'home';
  const rawIdx = currentBatterIdx[battingSide] || 0;

  const battingOrderSlot = (rawIdx % 9) + 1;
  const currentBatter = battingLineup.find(l => l.battingOrder === battingOrderSlot) ?? null;
  const isEmptySlot = !currentBatter && battingLineup.length > 0;

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
  const handleSetupSubmit = async () => {
    if (setupHome.length === 0 || setupAway.length === 0) { alert('Both teams need at least 1 player'); return; }
    try {
      await apiPost(`/admin/scoring/${gameId}/lineup`, { teamId: game!.homeTeamId, lineup: setupHome.map((p, i) => ({ playerId: p.playerId, battingOrder: i + 1, position: p.position })) });
      await apiPost(`/admin/scoring/${gameId}/lineup`, { teamId: game!.awayTeamId, lineup: setupAway.map((p, i) => ({ playerId: p.playerId, battingOrder: i + 1, position: p.position })) });
      await apiPost(`/admin/scoring/${gameId}/start`, {});
      await loadState(); setPhase('scoring');
    } catch (err: any) { alert(err.message || 'Failed'); }
  };
  const addToSetup = (side: 'home' | 'away', pid: number) => {
    const list = side === 'home' ? setupHome : setupAway;
    if (list.find(p => p.playerId === pid)) return;
    const pos = list.length === 0 ? 1 : Math.min(list.length + 1, 10);
    if (side === 'home') setSetupHome([...list, { playerId: pid, position: pos }]);
    else setSetupAway([...list, { playerId: pid, position: pos }]);
  };
  const removeFromSetup = (side: 'home' | 'away', pid: number) => {
    if (side === 'home') setSetupHome(s => s.filter(p => p.playerId !== pid));
    else setSetupAway(s => s.filter(p => p.playerId !== pid));
  };
  const updatePosition = (side: 'home' | 'away', pid: number, pos: number) => {
    const setter = side === 'home' ? setSetupHome : setSetupAway;
    setter(list => list.map(p => p.playerId === pid ? { ...p, position: pos } : p));
  };

  // Sync local count from server state
  useEffect(() => {
    if (gameState) {
      setBalls(gameState.balls ?? 0);
      setStrikes(gameState.strikes ?? 0);
    }
  }, [gameState?.balls, gameState?.strikes, gameState?.eventCount]);

  // Helper: create a pitch event in the DB
  const submitPitchEvent = async (detail: string) => {
    if (!currentBatter || !gameState) return;
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
    if (submitting || !currentBatter || !gameState) return;
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
    if (submitting || !currentBatter || !gameState) return;
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
    if (submitting || !currentBatter || !gameState) return;
    if (strikes < 2) setStrikes(strikes + 1);
    setSubmitting(true);
    try { await submitPitchEvent('foul'); await loadState(); }
    catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const handleOut = () => { setOutSafeTab('out'); setStep('out_type'); };
  const handleInPlay = () => { setOutSafeTab('safe'); setStep('safe_type'); };

  const ERROR_EVENTS = new Set(['error', 'sac_bunt_error', 'sac_fly_error']);

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

  const goToHitLocationOrRunners = (eventType: string) => {
    if (BATTED_BALL_EVENTS.has(eventType)) {
      setHitLocationX(null); setHitLocationY(null); setHitType(null); setHitHardness(null);
      setStep('hit_location');
    } else {
      checkRunners(eventType);
    }
  };

  const finishHitLocation = () => { if (selectedEvent) checkRunners(selectedEvent); };

  const checkRunners = (eventType: string) => {
    if (!gameState) return;

    const hasRunners = gameState.bases.first || gameState.bases.second || gameState.bases.third;

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

  const answerRunner = (outcome: 'safe' | 'out', destination: string, advanceReason?: string) => {
    const updated = [...runnerQuestions];
    updated[currentRunnerIdx] = { ...updated[currentRunnerIdx], outcome, destination: destination as any, advanceReason: advanceReason || updated[currentRunnerIdx].advanceReason };
    setRunnerQuestions(updated);
    setRunnerOutSafeTab('safe');
    const nextIdx = currentRunnerIdx + 1;
    if (nextIdx < runnerQuestions.length) {
      setCurrentRunnerIdx(nextIdx);
      setRunnerSafeDest(runnerQuestions[nextIdx].minDestination);
    } else {
      setRunnerSafeDest(null);
      // If this came from a between-pitch event, use the special submit path
      if (betweenPitchEvent) {
        submitBetweenPitchPlay(betweenPitchEvent, updated);
      } else {
        submitPlay(selectedEvent!, updated, fieldingPositions);
      }
    }
  };

  // ── Between-pitch event state (WP, PB, balk multi-runner) ──
  const [betweenPitchEvent, setBetweenPitchEvent] = useState<string | null>(null);

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

  const startBetweenPitchRunnerCheck = (action: string, initiatingBase?: 'first' | 'second' | 'third' | null, initiatingDest?: string | null) => {
    if (!gameState) return;
    setBetweenPitchEvent(action);
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
          break;
        }
      }
    }

    const firstUnanswered = runners.findIndex(r => r.outcome === null);
    if (firstUnanswered === -1) {
      submitBetweenPitchPlay(action, runners);
      return;
    }

    setRunnerQuestions(runners);
    setCurrentRunnerIdx(firstUnanswered);
    setRunnerSafeDest(runners[firstUnanswered].minDestination);
    setRunnerOutSafeTab('safe');
    setActiveRunnerBase(null);
    setStep('runner');
  };

  const submitBetweenPitchPlay = async (action: string, runners: RunnerQuestion[]) => {
    if (!gameState || submitting) return;
    setSubmitting(true);
    try {
      let runnerFirstId = gameState.bases.first;
      let runnerSecondId = gameState.bases.second;
      let runnerThirdId = gameState.bases.third;
      let runsScored = 0;
      const runnersScored: number[] = [];

      const detailParts: string[] = [];
      for (const r of runners) {
        if (r.outcome === 'safe') {
          if (r.base === 'first') runnerFirstId = null;
          else if (r.base === 'second') runnerSecondId = null;
          else if (r.base === 'third') runnerThirdId = null;

          if (r.destination === 'home') { runnersScored.push(r.playerId); runsScored++; detailParts.push(`${r.playerName} scores`); }
          else if (r.destination === 'third') { runnerThirdId = r.playerId; detailParts.push(`${r.playerName} to 3rd`); }
          else if (r.destination === 'second') { runnerSecondId = r.playerId; detailParts.push(`${r.playerName} to 2nd`); }
          else if (r.destination === 'first') { runnerFirstId = r.playerId; detailParts.push(`${r.playerName} stays at 1st`); }
        } else if (r.outcome === 'out') {
          if (r.base === 'first') runnerFirstId = null;
          else if (r.base === 'second') runnerSecondId = null;
          else if (r.base === 'third') runnerThirdId = null;
          detailParts.push(`${r.playerName} out`);
        } else {
          detailParts.push(`${r.playerName} stays`);
        }
      }

      const outsRecorded = runners.filter(r => r.outcome === 'out').length;
      const detail = `${action.replace(/_/g, ' ')}: ${detailParts.join(', ')}`;

      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType: action, batterId: null, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored,
        outsRecorded, balls, strikes,
        runnerFirstId, runnerSecondId, runnerThirdId, runnersScored,
        eventDetail: detail,
      });
      setBetweenPitchEvent(null);
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
      startBetweenPitchRunnerCheck(action, activeRunnerBase, dest);
      return;
    }

    const runnerId = gameState.bases[activeRunnerBase];
    if (!runnerId) return;
    setSubmitting(true);
    try {
      const isOut = RUNNER_OUT_ACTIONS.has(action);
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
            const fielder = fieldingLineup.find(l => l.position === posNum);
            if (fielder) errorFielderIds.push(fielder.playerId);
          }
        } else {
          for (let i = 0; i < fld.length; i++) {
            const fielder = fieldingLineup.find(l => l.position === fld[i]);
            if (fielder) {
              if (i === fld.length - 1) putoutFielderIds.push(fielder.playerId);
              else assistFielderIds.push(fielder.playerId);
            }
          }
        }
      }

      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType: action, batterId: runnerId, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored,
        outsRecorded: isOut ? 1 : 0, balls, strikes,
        runnerFirstId, runnerSecondId, runnerThirdId, runnersScored,
        fieldingSequence: isErrorAction && fld.length > 0 ? `E${fld.join('')}` : fieldingSequence,
        putoutFielderIds, assistFielderIds, errorFielderIds,
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
    const outPlayer = fieldingLineup.find(l => l.position === subPosition);
    if (!outPlayer) return;
    try {
      await apiPut(`/admin/scoring/${gameId}/substitute`, {
        outPlayerId: outPlayer.playerId, inPlayerId: newPlayerId,
        teamId: outPlayer.teamId, position: subPosition,
        inning: gameState?.inning ?? 1, half: gameState?.half ?? 'top',
      });
      setSubPosition(null); setStep('pitch');
      await loadState(); await loadRosters();
    } catch (err: any) { alert(err.message || 'Sub failed'); }
  };

  const handlePositionSwap = async (targetPosition: number) => {
    if (!game || subPosition === null) return;
    const currentPlayer = fieldingLineup.find(l => l.position === subPosition);
    const targetPlayer = fieldingLineup.find(l => l.position === targetPosition);
    if (!currentPlayer) return;

    const changes: Array<{ playerId: number; newPosition: number }> = [];
    changes.push({ playerId: currentPlayer.playerId, newPosition: targetPosition });
    if (targetPlayer) {
      changes.push({ playerId: targetPlayer.playerId, newPosition: subPosition });
    }

    try {
      await apiPut(`/admin/scoring/${gameId}/swap-positions`, { changes });
      setSubPosition(null); setStep('pitch');
      await loadState();
    } catch (err: any) { alert(err.message || 'Swap failed'); }
  };

  const handleOffensiveSub = async (newPlayerId: number) => {
    if (!game || subBattingSlot === null) return;
    const outPlayer = battingLineup.find(l => l.battingOrder === subBattingSlot);
    if (!outPlayer) return;
    try {
      await apiPut(`/admin/scoring/${gameId}/substitute`, {
        outPlayerId: outPlayer.playerId, inPlayerId: newPlayerId,
        teamId: outPlayer.teamId, position: outPlayer.position,
        inning: gameState?.inning ?? 1, half: gameState?.half ?? 'top',
      });
      setSubBattingSlot(null); setStep('pitch');
      await loadState(); await loadRosters();
    } catch (err: any) { alert(err.message || 'Sub failed'); }
  };

  // ── Submit play ──
  const submitPlay = async (eventType: string, runners: RunnerQuestion[], fielding: number[]) => {
    if (!currentBatter || !gameState || submitting) return;
    setSubmitting(true);
    try {
      const isOut = OUT_EVENTS.includes(eventType);
      const runnerOuts = runners.filter(r => r.outcome === 'out').length;
      const outsRecorded = (isOut ? 1 : 0) + runnerOuts;
      let runsScored = 0, rbi = 0;
      const runnersScored: number[] = [];
      let runnerFirstId: number | null = null, runnerSecondId: number | null = null, runnerThirdId: number | null = null;

      if (eventType === 'home_run' || eventType === 'inside_park_hr') {
        if (gameState.bases.first) { runnersScored.push(gameState.bases.first); runsScored++; rbi++; }
        if (gameState.bases.second) { runnersScored.push(gameState.bases.second); runsScored++; rbi++; }
        if (gameState.bases.third) { runnersScored.push(gameState.bases.third); runsScored++; rbi++; }
        runnersScored.push(currentBatter.playerId); runsScored++; rbi++;
      } else if (['walk','hit_by_pitch','intentional_walk'].includes(eventType)) {
        if (gameState.bases.first) {
          if (gameState.bases.second) {
            if (gameState.bases.third) { runnersScored.push(gameState.bases.third); runsScored++; rbi++; }
            runnerThirdId = gameState.bases.second;
          } else { runnerThirdId = gameState.bases.third; }
          runnerSecondId = gameState.bases.first;
        } else { runnerSecondId = gameState.bases.second; runnerThirdId = gameState.bases.third; }
        runnerFirstId = currentBatter.playerId;
      } else if (runners.length > 0) {
        for (const r of runners) {
          if (r.outcome === 'safe' && r.destination === 'home') {
            runnersScored.push(r.playerId);
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
          if (['single','bunt_single','error','fielders_choice','dropped_third_strike','wild_pitch_third_strike','sac_bunt_error','sac_fly_error','catcher_obstruction'].includes(eventType)) {
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
          if (['single','bunt_single','error','dropped_third_strike','wild_pitch_third_strike','sac_bunt_error','sac_fly_error','catcher_obstruction'].includes(eventType)) runnerFirstId = currentBatter.playerId;
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
            const fielder = fieldingLineup.find(l => l.position === posNum);
            if (fielder) errorFielderIds.push(fielder.playerId);
          }
        } else {
          // Convention: last position in sequence = putout, all others = assists
          for (let i = 0; i < fielding.length; i++) {
            const posNum = fielding[i];
            const fielder = fieldingLineup.find(l => l.position === posNum);
            if (fielder) {
              if (i === fielding.length - 1) putoutFielderIds.push(fielder.playerId);
              else assistFielderIds.push(fielder.playerId);
            }
          }
        }
      }

      const isErrorPlay = ERROR_EVENTS.has(eventType);
      const DEST_SHORT: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', home: 'home' };
      const runnerParts: string[] = [];
      for (const r of runners) {
        if (r.outcome === 'safe' && r.destination === 'home') {
          runnerParts.push(`${r.playerName} scores`);
        } else if (r.outcome === 'safe' && r.destination && r.destination !== r.base) {
          runnerParts.push(`${r.playerName} to ${DEST_SHORT[r.destination] || r.destination}`);
        } else if (r.outcome === 'out') {
          runnerParts.push(`${r.playerName} out`);
        }
      }
      const runnerSuffix = runnerParts.length > 0 ? `. ${runnerParts.join(', ')}` : '';
      const detail = `${currentBatter.firstName} ${currentBatter.lastName}: ${eventType.replace(/_/g, ' ')}${fieldingSequence ? ` (${isErrorPlay ? 'E' : ''}${fieldingSequence})` : ''}${runnerSuffix}`;
      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType, batterId: currentBatter.playerId, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi, runsScored, outsRecorded,
        balls, strikes, runnerFirstId, runnerSecondId, runnerThirdId, runnersScored, fieldingSequence, eventDetail: detail,
        hitLocationX, hitLocationY, hitType, hitHardness,
        putoutFielderIds, assistFielderIds, errorFielderIds,
      });
      setCurrentBatterIdx(prev => ({ ...prev, [battingSide]: (prev[battingSide] || 0) + 1 }));
      setBalls(0); setStrikes(0); setStep('pitch'); setSelectedEvent(null);
      setFieldingPositions([]); setRunnerQuestions([]); setCurrentRunnerIdx(0);
      setBetweenPitchEvent(null);
      await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); } finally { setSubmitting(false); }
  };

  const handleUndo = async () => {
    try {
      const res: any = await apiPost(`/admin/scoring/${gameId}/undo`, {});
      // If we undid an at-bat result (not a pitch or runner event), go back one batter
      const undoneType = res?.undoneType;
      const RUNNER_SET = new Set(['stolen_base','caught_stealing','picked_off','wild_pitch','passed_ball','balk','advance','advance_on_error','defensive_indifference','runner_interference','appeal_play','tagged_out','force_out','hit_by_ball','missed_base','left_base_early','left_base_path','offensive_interference','passed_runner','hesitation','double_play','triple_play','end_half_inning','illegal_pitch','pitch']);
      if (undoneType && !RUNNER_SET.has(undoneType)) {
        setCurrentBatterIdx(prev => ({ ...prev, [battingSide]: Math.max(0, (prev[battingSide] || 0) - 1) }));
      }
      await loadState();
      cancelWizard();
    } catch (err: any) { alert(err.message); }
  };
  const handleFinalize = async () => {
    if (!confirm('Finalize? Stats computed, standings updated, cannot undo.')) return;
    try { await apiPost(`/admin/scoring/${gameId}/finalize`, {}); alert('Game finalized!'); navigate('/games'); } catch (err: any) { alert(err.message); }
  };
  const handleSkipBatter = () => {
    setCurrentBatterIdx(prev => ({ ...prev, [battingSide]: (prev[battingSide] || 0) + 1 }));
    setBalls(0); setStrikes(0); cancelWizard();
  };
  const handleEndHalfInning = async () => {
    if (!gameState || submitting) return;
    setSubmitting(true);
    try {
      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType: 'end_half_inning', batterId: null, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored: 0,
        outsRecorded: Math.max(0, 3 - gameState.outs), balls: 0, strikes: 0,
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
      await apiPut(`/admin/scoring/${gameId}/adjust-score`, { homeScore: adjustHome, awayScore: adjustAway });
      cancelWizard(); await loadState();
    } catch (err: any) { alert(err.message || 'Failed to adjust score'); }
  };
  const handleMiscEvent = async (eventType: string, detail: string) => {
    if (!gameState || submitting) return;
    setSubmitting(true);
    try {
      await apiPost(`/admin/scoring/${gameId}/event`, {
        eventType, batterId: currentBatter?.playerId, pitcherId: currentPitcher?.playerId,
        inning: gameState.inning, half: gameState.half, rbi: 0, runsScored: 0,
        outsRecorded: 0, balls, strikes,
        runnerFirstId: gameState.bases.first, runnerSecondId: gameState.bases.second, runnerThirdId: gameState.bases.third,
        runnersScored: [], eventDetail: detail,
      });
      cancelWizard(); await loadState();
    } catch (err: any) { alert(err.message || 'Failed'); } finally { setSubmitting(false); }
  };
  const cancelWizard = () => { setStep('pitch'); setSelectedEvent(null); setFieldingPositions([]); setRunnerQuestions([]); setCurrentRunnerIdx(0); setActiveRunnerBase(null); setRunnerActionType(null); setRunnerActionDest(null); setRunnerActionOutType(null); setRunnerActionFielding([]); setSubPosition(null); setSubBattingSlot(null); setRunnerOutSafeTab('safe'); setRunnerSafeDest(null); setHitLocationX(null); setHitLocationY(null); setHitType(null); setHitHardness(null); setBetweenPitchEvent(null); setOutSafeMorePage(false); };

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#0c1220]"><span className="text-gray-400">Loading...</span></div>;
  if (!game) return <div className="flex items-center justify-center h-screen bg-[#0c1220]"><span className="text-red-400">Game not found</span></div>;

  // ── LINEUP SETUP ──
  if (phase === 'setup') {
    const currentRoster = setupTeam === 'home' ? homeRoster : awayRoster;
    const currentSetup = setupTeam === 'home' ? setupHome : setupAway;
    const selectedIds = new Set(currentSetup.map(p => p.playerId));
    return (
      <div className="min-h-screen bg-[#0c1220] text-white">
        <div className="bg-[#162038] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/games')} className="text-sm text-white/50 hover:text-white">← Back</button>
          <h1 className="font-bold text-lg">{game.awayTeamName} @ {game.homeTeamName} — Lineup</h1>
          <button onClick={handleSetupSubmit} disabled={setupHome.length === 0 || setupAway.length === 0} className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white text-sm font-bold rounded-lg">Start Game</button>
        </div>
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex gap-2 mb-6">
            {(['away', 'home'] as const).map(side => (
              <button key={side} onClick={() => setSetupTeam(side)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${setupTeam === side ? 'bg-accent text-white' : 'bg-white/10 text-white/60'}`}>
                {side === 'away' ? game.awayTeamName : game.homeTeamName} ({(side === 'home' ? setupHome : setupAway).length}/9)
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-bold text-white/50 uppercase mb-3">Available</h3>
              <div className="space-y-1">{currentRoster.filter(p => !selectedIds.has(p.playerId)).map(p => (
                <button key={p.playerId} onClick={() => addToSetup(setupTeam, p.playerId)} className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm flex items-center gap-2">
                  {p.jerseyNumber && <span className="text-white/30 font-mono">#{p.jerseyNumber}</span>}
                  <span className="flex-1">{p.firstName.charAt(0)}. {p.lastName}</span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.licensePaid === 'paid' ? 'bg-green-500' : 'bg-red-500'}`} title={p.licensePaid === 'paid' ? 'License paid' : 'License unpaid'} />
                </button>
              ))}</div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/50 uppercase mb-3">Batting Order</h3>
              <div className="space-y-1">{currentSetup.map((entry, idx) => {
                const player = currentRoster.find(p => p.playerId === entry.playerId);
                return (
                  <div key={entry.playerId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                    <span className="text-white/30 font-bold w-6">{idx + 1}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${player?.licensePaid === 'paid' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="flex-1 text-sm">{player ? `${player.firstName.charAt(0)}. ${player.lastName}` : '?'}</span>
                    <select value={entry.position} onChange={e => updatePosition(setupTeam, entry.playerId, Number(e.target.value))} className="bg-white/10 border border-white/10 rounded px-2 py-1 text-xs">
                      {Object.entries(POS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => removeFromSetup(setupTeam, entry.playerId)} className="text-red-400 text-xs">✕</button>
                  </div>
                );
              })}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── SCORING ──
  if (!gameState) return null;

  // Roster for subs (players not in current lineup)
  const fieldingTeamRoster = fieldingTeamId === game.homeTeamId ? homeRoster : awayRoster;
  const battingTeamRoster = battingTeamId === game.homeTeamId ? homeRoster : awayRoster;
  const activeFieldingIds = new Set(fieldingLineup.map(l => l.playerId));
  const activeBattingIds = new Set(battingLineup.map(l => l.playerId));
  const availableFieldingSubs = fieldingTeamRoster.filter(p => !activeFieldingIds.has(p.playerId));
  const availableBattingSubs = battingTeamRoster.filter(p => !activeBattingIds.has(p.playerId));

  const getCurrentPitcherPitches = (pid: number) => pitcherPitchCounts[pid]?.total ?? 0;
  const getCurrentPitcherBalls = (pid: number) => pitcherPitchCounts[pid]?.balls ?? 0;
  const getCurrentPitcherStrikes = (pid: number) => pitcherPitchCounts[pid]?.strikes ?? 0;

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
            <button onClick={() => { if (currentBatter) { setSubBattingSlot(battingOrderSlot); setStep('sub_offense'); } }}
              className="text-white font-bold text-sm hover:text-amber-300 transition-colors flex items-center gap-1">
              <span className="text-white/30 text-xs">#{battingOrderSlot}</span>
              {currentBatter ? `${currentBatter.firstName.charAt(0)}. ${currentBatter.lastName}` : <span className="text-red-400/60 italic">(empty slot)</span>}
            </button>
          </div>

          {/* Pitcher info with pitch count */}
          {currentPitcher && (
            <div className="bg-[#1a2744] rounded-lg px-3 py-2 mb-3 border border-white/5">
              <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider mb-0.5">Pitching</div>
              <button onClick={() => { setSubPosition(1); setStep('sub_defense'); }}
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
            <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider px-1 mb-1.5">
              {battingSide === 'away' ? game.awayTeamName : game.homeTeamName} (Batting)
            </div>
            {Array.from({ length: 9 }, (_, i) => {
              const slot = i + 1;
              const entry = battingLineup.find(l => l.battingOrder === slot);
              const isCurrent = slot === battingOrderSlot;
              return (
                <div key={slot} onClick={() => { if (entry) { setSubBattingSlot(slot); setStep('sub_offense'); } }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] ${isCurrent ? 'bg-amber-500/15 border border-amber-500/20' : 'hover:bg-white/5'}`}>
                  {isCurrent && <span className="text-amber-400 text-xs">▸</span>}
                  <span className={`font-mono w-3 ${isCurrent ? 'text-amber-400' : 'text-white/25'}`}>{slot}</span>
                  {entry ? (
                    <>
                      <span className={`flex-1 truncate ${isCurrent ? 'text-white font-bold' : 'text-white/60'}`}>{entry.firstName.charAt(0)}. {entry.lastName}</span>
                      <span className="text-white/25 text-[10px]">{POS_LABELS[entry.position]}</span>
                    </>
                  ) : <span className="text-white/15 italic text-[10px]">(empty)</span>}
                </div>
              );
            })}
          </div>

          {/* Defensive lineup */}
          <div>
            <div className="text-[9px] text-white/30 font-bold uppercase tracking-wider px-1 mb-1.5">
              {battingSide === 'away' ? game.homeTeamName : game.awayTeamName} (Defense)
            </div>
            {fieldingLineup.sort((a, b) => a.position - b.position).map(entry => (
              <div key={entry.playerId} onClick={() => { setSubPosition(entry.position); setStep('sub_defense'); }}
                className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-white/40 hover:bg-white/5 rounded cursor-pointer">
                <span className="text-white/25 font-mono w-5 text-right">{POS_LABELS[entry.position]}</span>
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
                  {currentBatter.lastName.toUpperCase()}
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
            {/* EMPTY SLOT — automatic out or skip */}
            {step === 'pitch' && isEmptySlot && (
              <div className="bg-[#111d30] rounded-xl border border-white/10 overflow-hidden p-4 text-center">
                <p className="text-xs text-white/40 uppercase font-bold tracking-wide mb-1">Batting slot #{battingOrderSlot} is empty</p>
                <p className="text-white/20 text-[10px] mb-4">No player assigned to this position in the lineup</p>
                <div className="flex gap-2">
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
                      setCurrentBatterIdx(prev => ({ ...prev, [battingSide]: rawIdx + 1 }));
                      await loadState();
                    } catch (err: any) { alert(err.message || 'Failed'); }
                    setSubmitting(false);
                  }} disabled={submitting}
                    className="flex-1 py-3 bg-red-900 hover:bg-red-800 text-white text-xs font-bold rounded-lg uppercase transition-colors disabled:opacity-30">
                    AUTOMATIC OUT
                  </button>
                  <button onClick={() => setCurrentBatterIdx(prev => ({ ...prev, [battingSide]: rawIdx + 1 }))}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white/60 text-xs font-bold rounded-lg uppercase transition-colors">
                    SKIP SLOT
                  </button>
                </div>
              </div>
            )}

            {/* PITCH step */}
            {step === 'pitch' && currentBatter && (
              <div className="grid grid-cols-5 gap-1.5">
                <button onClick={handleBall} disabled={submitting}
                  className="py-4 bg-[#1a6b3a] hover:bg-[#20804a] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#20804a]/50">
                  BALL
                </button>
                <button onClick={handleStrike} disabled={submitting}
                  className="py-4 bg-[#8b2020] hover:bg-[#a02828] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#a02828]/50">
                  STRIKE
                </button>
                <button onClick={handleFoul} disabled={submitting}
                  className="py-4 bg-[#8b7020] hover:bg-[#a08428] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#a08428]/50">
                  FOUL
                </button>
                <button onClick={handleOut} disabled={submitting}
                  className="py-4 bg-[#1a5c3a] hover:bg-[#237548] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#237548]/50">
                  OUT
                </button>
                <button onClick={handleInPlay} disabled={submitting}
                  className="py-4 bg-[#1a3a8b] hover:bg-[#2248a0] text-white font-bold text-sm rounded-lg transition-all disabled:opacity-30 border border-[#2248a0]/50">
                  IN PLAY
                </button>
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
                  <p className="text-[10px] text-red-400/70 uppercase font-bold mb-2">Who committed the error?</p>
                ) : (
                  <p className="text-[10px] text-white/40 uppercase font-bold mb-2">Tap positions on the field above</p>
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
                <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-2">Tap where the ball was hit</p>
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

            {/* RUNNER step (after play) - iScore style */}
            {(step === 'runner' || step === 'runner_out_detail') && runnerQuestions.length > 0 && (() => {
              const q = runnerQuestions[currentRunnerIdx];
              const baseLabel = q.base === 'first' ? 'FIRST' : q.base === 'second' ? 'SECOND' : 'THIRD';

              const markRunnerOut = (outType: string) => {
                const updated = [...runnerQuestions];
                updated[currentRunnerIdx] = { ...updated[currentRunnerIdx], outcome: 'out', destination: null, advanceReason: outType };
                setRunnerQuestions(updated);
                setRunnerOutSafeTab('safe');
                const nextIdx = currentRunnerIdx + 1;
                if (nextIdx < runnerQuestions.length) {
                  setCurrentRunnerIdx(nextIdx);
                  setRunnerSafeDest(runnerQuestions[nextIdx].minDestination);
                  setStep('runner');
                } else {
                  setRunnerSafeDest(null);
                  if (betweenPitchEvent) {
                    submitBetweenPitchPlay(betweenPitchEvent, updated);
                  } else {
                    submitPlay(selectedEvent!, updated, fieldingPositions);
                  }
                }
              };

              const minOrder = BASE_ORDER[q.minDestination] || 1;

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
                    {minOrder > BASE_ORDER[q.base] && (
                      <p className="text-[10px] text-amber-400/70 mt-1">Must advance to at least {q.minDestination.toUpperCase()}</p>
                    )}
                  </div>

                  {/* Out / Safe / Quick tabs */}
                  <div className="flex border-b border-white/10">
                    {(['out', 'safe', 'quick'] as const).map(t => (
                      <button key={t} onClick={() => {
                        if (t === 'out') { setRunnerOutSafeTab('out'); setStep('runner_out_detail'); }
                        else if (t === 'safe') { setRunnerOutSafeTab('safe'); setStep('runner'); }
                        else answerRunner('safe', runnerSafeDest || q.minDestination);
                      }}
                        className={`flex-1 py-2.5 text-sm font-bold capitalize transition-colors ${
                          (t === 'out' && runnerOutSafeTab === 'out') || (t === 'safe' && runnerOutSafeTab === 'safe')
                            ? 'bg-white/10 text-white border-b-2 border-white'
                            : 'text-white/40 hover:text-white/60'
                        }`}>{t === 'quick' ? 'Quick' : t === 'out' ? 'Out' : 'Safe'}</button>
                    ))}
                  </div>

                  {/* Base selector row - click to SELECT destination, not submit */}
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
                        {RUNNER_OUT_TYPES.map(t => (
                          <button key={t.key} onClick={() => markRunnerOut(t.key)}
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
                          const options: { key: string; label: string; action: () => void }[] = [];

                          if (isBetweenPitch) {
                            options.push({ key: 'advance', label: 'ADVANCE', action: () => answerRunner('safe', dest, betweenPitchEvent!) });
                            if (minOrder <= BASE_ORDER[q.base]) {
                              options.push({ key: 'held', label: 'HELD UP', action: () => answerRunner('safe', q.base, 'held') });
                            }
                          } else {
                            options.push({ key: 'on_play', label: 'ADVANCED BY BATTER', action: () => answerRunner('safe', dest, 'on_play') });
                            if (minOrder <= BASE_ORDER[q.base]) {
                              options.push({ key: 'held', label: 'HELD UP', action: () => answerRunner('safe', q.base, 'held') });
                            }
                            if (isBatterError) {
                              options.push({ key: 'advance_on_error', label: 'ADVANCED ON SAME ERROR', action: () => answerRunner('safe', dest, 'advance_on_error') });
                            }
                            options.push({ key: 'stolen_base', label: 'STOLEN BASE', action: () => answerRunner('safe', dest, 'stolen_base') });
                            options.push({ key: 'error', label: 'ERROR', action: () => answerRunner('safe', dest, 'error') });
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
                        <button onClick={() => handleRunnerActionSubmit('advance', selectedDest)}
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
                          {outLabel} — Who was involved?
                        </p>
                        <p className="text-[10px] text-white/30 mt-1">
                          Tap positions in order (assists first, putout last)
                        </p>
                        {fld.length > 0 && (
                          <p className="text-sm text-white font-bold mt-2 tracking-wider">{fld.join(' – ')}</p>
                        )}
                      </div>

                      <div className="p-3">
                        <div className="grid grid-cols-3 gap-2">
                          {POS_GRID.map(p => {
                            const fielder = fieldingLineup.find(l => l.position === p.pos);
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
                        {RUNNER_OUT_TYPES.map(a => (
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
                        ERROR — Who committed it?
                      </p>
                      <p className="text-[10px] text-white/30 mt-1">
                        Tap the fielder who made the error
                      </p>
                      {fld.length > 0 && (
                        <p className="text-sm text-white font-bold mt-2 tracking-wider">E{fld.join('')}</p>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="grid grid-cols-3 gap-2">
                        {POS_GRID.map(p => {
                          const fielder = fieldingLineup.find(l => l.position === p.pos);
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

            {/* DEFENSIVE SUB / POSITION SWAP */}
            {step === 'sub_defense' && subPosition !== null && (() => {
              const currentPlayer = fieldingLineup.find(l => l.position === subPosition);
              const otherPositions = Object.entries(POS_LABELS).filter(([k]) => parseInt(k) !== subPosition && parseInt(k) <= 9);
              return (
                <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-72 overflow-y-auto">
                  <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-2">
                    {POS_LABELS[subPosition]} — {currentPlayer?.lastName ?? ''}
                  </p>
                  <div className="flex gap-1 mb-2">
                    <button onClick={() => setStep('swap_position')}
                      className="flex-1 py-2 bg-blue-900/40 hover:bg-blue-800/40 text-white text-[10px] font-bold rounded uppercase">Move Position</button>
                    <button onClick={() => setStep('sub_defense')}
                      className="flex-1 py-2 bg-white/10 text-white/60 text-[10px] font-bold rounded uppercase">Sub from Bench</button>
                  </div>
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
              const currentPlayer = fieldingLineup.find(l => l.position === subPosition);
              return (
                <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-72 overflow-y-auto">
                  <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-1">
                    Move {currentPlayer?.lastName ?? ''} ({POS_LABELS[subPosition]}) to:
                  </p>
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {Object.entries(POS_LABELS).filter(([k]) => parseInt(k) !== subPosition && parseInt(k) <= 9).map(([k, label]) => {
                      const posNum = parseInt(k);
                      const occupant = fieldingLineup.find(l => l.position === posNum);
                      return (
                        <button key={k} onClick={() => handlePositionSwap(posNum)}
                          className="py-2.5 bg-[#1e2d48] hover:bg-[#283a58] text-white rounded transition-all text-center">
                          <div className="text-xs font-bold">{label}</div>
                          {occupant && <div className="text-[9px] text-white/40 mt-0.5">{occupant.lastName}</div>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-white/30 text-center mt-2">
                    {fieldingLineup.find(l => l.position === subPosition) ? 'Players will swap positions' : 'Player will move to selected position'}
                  </p>
                  <button onClick={() => setStep('sub_defense')} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">← BACK</button>
                </div>
              );
            })()}

            {/* PICK PLAYER FOR POSITION CHANGE (from Misc) */}
            {step === 'swap_position_pick' && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-72 overflow-y-auto">
                <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-2">Select player to move</p>
                <div className="space-y-1">
                  {fieldingLineup.map(entry => (
                    <button key={entry.playerId} onClick={() => { setSubPosition(entry.position); setStep('swap_position'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-xs text-left">
                      <span className="text-white/40 font-bold w-6">{POS_LABELS[entry.position]}</span>
                      <span className="text-white">{entry.firstName.charAt(0)}. {entry.lastName}</span>
                    </button>
                  ))}
                </div>
                <button onClick={cancelWizard} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">CANCEL</button>
              </div>
            )}

            {/* OFFENSIVE SUB (pinch hitter) */}
            {step === 'sub_offense' && subBattingSlot !== null && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 p-3 max-h-64 overflow-y-auto">
                <p className="text-[10px] text-white/40 uppercase font-bold text-center mb-2">
                  Pinch hit for #{subBattingSlot} — {battingLineup.find(l => l.battingOrder === subBattingSlot)?.lastName ?? ''}
                </p>
                <div className="space-y-1">
                  {availableBattingSubs.map(p => (
                    <button key={p.playerId} onClick={() => handleOffensiveSub(p.playerId)}
                      className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded text-xs">{p.firstName.charAt(0)}. {p.lastName}</button>
                  ))}
                  {availableBattingSubs.length === 0 && <p className="text-white/30 text-xs text-center py-2">No subs available</p>}
                </div>
                <button onClick={cancelWizard} className="w-full mt-2 py-2 text-white/40 text-[10px] font-bold uppercase hover:text-white/60">CANCEL</button>
              </div>
            )}

            {/* MISC - iScore style vertical list */}
            {step === 'misc' && (
              <div className="bg-[#111d30] rounded-lg border border-white/10 overflow-hidden max-h-80 flex flex-col">
                <div className="overflow-y-auto divide-y divide-white/5">
                  {[
                    { label: 'Pitching Change', fn: () => { setSubPosition(1); setStep('sub_defense'); } },
                    { label: 'Pinch Hitter', fn: () => { if (currentBatter) { setSubBattingSlot(battingOrderSlot); setStep('sub_offense'); } } },
                    { label: 'Position Change', fn: () => setStep('swap_position_pick') },
                    { label: 'Balk', fn: () => handleMiscEvent('balk', 'Balk') },
                    { label: 'Illegal Pitch', fn: () => handleMiscEvent('illegal_pitch', 'Illegal pitch') },
                    { label: 'No Pitch Strike', fn: () => { if (strikes < 2) setStrikes(s => s + 1); cancelWizard(); } },
                    { label: 'Skip Batter', fn: handleSkipBatter },
                    { label: 'End Half Inning', fn: handleEndHalfInning },
                    { label: 'Adjust Score', fn: openAdjustScore },
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
              <button onClick={handleUndo} className="px-3 py-1.5 text-white/40 hover:text-white">Undo</button>
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
                {evt.eventDetail || evt.eventType}
              </div>
            ))}
            {events.length === 0 && <p className="text-white/15">No plays yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
