'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useGameSocket } from '@/hooks/useGameSocket';
import { formatPlayByPlay } from '@/lib/format-play';
import { useApiBase } from '@/lib/api-context';
import { getStatAbbreviationMeaning } from '@/lib/stat-abbreviations';

const POS_LABELS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH',
};

const EVENT_LABELS: Record<string, string> = {
  pitch: 'Pitch',
  single: 'Single', bunt_single: 'Bunt Single', double: 'Double', triple: 'Triple',
  home_run: 'Home Run', inside_park_hr: 'Inside-the-park HR',
  ground_rule_double: 'Ground Rule Double',
  walk: 'Walk', intentional_walk: 'Intentional Walk', hit_by_pitch: 'Hit By Pitch',
  strikeout: 'Strikeout', strikeout_swinging: 'Strikeout Swinging', strikeout_looking: 'Strikeout Looking',
  ground_out: 'Ground Out', fly_out: 'Fly Out', line_out: 'Line Out', pop_out: 'Pop Out',
  bunt_out: 'Bunt Out', foul_out: 'Foul Out',
  sacrifice_fly: 'Sacrifice Fly', sacrifice_bunt: 'Sacrifice Bunt',
  fielders_choice: "Fielder's Choice",
  double_play: 'Double Play', triple_play: 'Triple Play',
  error: 'Error', sac_bunt_error: 'Error on Sac Bunt', sac_fly_error: 'Error on Sac Fly',
  dropped_third_strike: 'Dropped 3rd Strike',
  dropped_third_strike_out: 'Dropped 3rd Strike (Out)',
  wild_pitch_third_strike: 'Wild Pitch 3rd Strike',
  infield_fly: 'Infield Fly',
  caught_foul_tip: 'Caught Foul Tip',
  bunt_foul: 'Bunt Foul (3rd Strike)',
  catcher_obstruction: "Catcher's Obstruction",
  stolen_base: 'Stolen Base', caught_stealing: 'Caught Stealing',
  picked_off: 'Picked Off', wild_pitch: 'Wild Pitch', passed_ball: 'Passed Ball',
  balk: 'Balk', defensive_indifference: 'Defensive Indifference',
  advance_on_error: 'Error (Runner)',
  end_half_inning: 'End of Inning',
};

const RUNNER_EVENT_TYPES = new Set([
  'stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball',
  'balk', 'advance', 'advance_on_error', 'defensive_indifference',
  'runner_interference', 'appeal_play', 'tagged_out', 'force_out',
  'hit_by_ball', 'missed_base', 'left_base_early', 'left_base_path',
  'offensive_interference', 'passed_runner', 'hesitation',
  'double_play', 'triple_play', 'illegal_pitch', 'end_half_inning',
]);

interface AtBat {
  batterId: number | null;
  batterName: string;
  result: GameEvent | null;
  pitches: GameEvent[];
  betweenEvents: GameEvent[];
  inning: number;
  half: string;
}

interface GameData {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  status: string;
  currentInning: number;
  currentHalf: string;
  currentOuts: number;
  venue: string;
  scheduledAt: string;
}

interface GameEvent {
  id: number;
  eventNumber: number;
  eventType: string;
  inning: number;
  half: string;
  batterId: number | null;
  pitcherId: number | null;
  rbi: number;
  runsScored: number;
  outsRecorded: number;
  eventDetail: string | null;
  fieldingSequence: string | null;
  runnerFirstId: number | null;
  runnerSecondId: number | null;
  runnerThirdId: number | null;
  runnersScored: number[];
  batterName: string | null;
  pitcherName: string | null;
  runnerFirstName: string | null;
  runnerSecondName: string | null;
  runnerThirdName: string | null;
  runnersScoredNames: string[];
  balls: number;
  strikes: number;
}

interface LineupEntry {
  playerId: number;
  teamId: number;
  battingOrder: number;
  position: number;
  isStarter: boolean;
  isActive: boolean;
  firstName: string;
  lastName: string;
}

interface BattingBoxScore {
  playerId: number;
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
  stolenBases: number;
  firstName: string;
  lastName: string;
  hitByPitch?: number;
  sacrificeFlies?: number;
  sacrificeBunts?: number;
  caughtStealing?: number;
  groundOuts?: number;
  flyOuts?: number;
  groundedIntoDoublePlays?: number;
  intentionalWalks?: number;
  reachedOnError?: number;
  totalBases?: number;
  buntSingles?: number;
  strikeoutsLooking?: number;
  strikeoutsSwinging?: number;
  pickedOff?: number;
  fieldersChoice?: number;
  catcherInterference?: number;
  groundedIntoTriplePlay?: number;
}

interface PitchingBoxScore {
  playerId: number;
  teamId: number;
  inningsPitched: string;
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  homeRuns: number;
  pitchesThrown: number | null;
  balls: number | null;
  strikes: number | null;
  decision: string | null;
  isStarter: boolean;
  firstName: string;
  lastName: string;
  hitBatters?: number;
  battersFaced?: number;
  balks?: number;
  intentionalWalks?: number;
  groundOuts?: number;
  flyOuts?: number;
  wildPitches?: number;
  gameScore?: number | null;
  qualityStarts?: number;
  shutouts?: number;
  completeGames?: number;
  strikeoutsLooking?: number;
  strikeoutsSwinging?: number;
}

interface SeasonContext {
  batting: {
    playerId: number; atBats: number; hits: number; walks: number; homeRuns: number;
    rbi: number; runs: number; strikeouts: number; stolenBases: number;
    hitByPitch: number; sacrificeFlies: number; totalBases: number;
    avg: string | null; obp: string | null; slg: string | null; ops: string | null;
  }[];
  pitching: { playerId: number; era: string | null; wins: number; losses: number; strikeouts: number }[];
}

type Tab = 'plays' | 'boxscore' | 'pitching';

interface LiveGameClientProps {
  gameId: number;
  initialData: any;
  initialEvents: GameEvent[];
  initialLineups: LineupEntry[];
  initialBatting: BattingBoxScore[];
  initialPitching: PitchingBoxScore[];
  initialSeasonCtx: SeasonContext;
}

export function LiveGameClient({
  gameId, initialData, initialEvents, initialLineups,
  initialBatting, initialPitching, initialSeasonCtx,
}: LiveGameClientProps) {
  const apiBase = useApiBase();
  const [game, setGame] = useState<GameData | null>(initialData);
  const [events, setEvents] = useState<GameEvent[]>(initialEvents);
  const [lineups, setLineups] = useState<LineupEntry[]>(initialLineups);
  const [battingBox, setBattingBox] = useState<BattingBoxScore[]>(initialBatting);
  const [pitchingBox, setPitchingBox] = useState<PitchingBoxScore[]>(initialPitching);
  const [seasonCtx, setSeasonCtx] = useState<SeasonContext>(initialSeasonCtx);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('plays');
  const [playMode, setPlayMode] = useState<'compact' | 'expanded'>('compact');
  const [openPitchCards, setOpenPitchCards] = useState<Record<string, boolean>>({});
  const { connected, gameState, lastEvent, isFinal, viewerCount } = useGameSocket(gameId, apiBase);

  // Re-fetch when new event arrives via WebSocket
  useEffect(() => {
    if (!lastEvent) return;
    Promise.all([
      fetch(`/api/proxy/public/games/${gameId}/events`).then(r => r.json()).catch(() => []),
      fetch(`/api/proxy/public/games/${gameId}/boxscore`).then(r => r.json()).catch(() => []),
      fetch(`/api/proxy/public/games/${gameId}/pitching-boxscore`).then(r => r.json()).catch(() => []),
    ]).then(([evts, box, pbox]) => {
      if (Array.isArray(evts)) setEvents(evts);
      if (Array.isArray(box)) setBattingBox(box);
      if (Array.isArray(pbox)) setPitchingBox(pbox);
    });
  }, [lastEvent, gameId]);

  // Polling fallback: refresh every 8s for live games when WebSocket isn't connected
  useEffect(() => {
    const isLive = game?.status === 'live' && !isFinal;
    if (!isLive || connected) return;
    const interval = setInterval(async () => {
      try {
        const [gData, evts, box, pbox] = await Promise.all([
          fetch(`/api/proxy/public/games/${gameId}`).then(r => r.json()).catch(() => null),
          fetch(`/api/proxy/public/games/${gameId}/events`).then(r => r.json()).catch(() => []),
          fetch(`/api/proxy/public/games/${gameId}/boxscore`).then(r => r.json()).catch(() => []),
          fetch(`/api/proxy/public/games/${gameId}/pitching-boxscore`).then(r => r.json()).catch(() => []),
        ]);
        if (gData && typeof gData === 'object' && gData.id) setGame(gData);
        if (Array.isArray(evts)) setEvents(evts);
        if (Array.isArray(box)) setBattingBox(box);
        if (Array.isArray(pbox)) setPitchingBox(pbox);
      } catch {}
    }, 8000);
    return () => clearInterval(interval);
  }, [game?.status, isFinal, connected, gameId]);

  const displayScore = {
    home: gameState?.homeScore ?? game?.homeScore ?? 0,
    away: gameState?.awayScore ?? game?.awayScore ?? 0,
  };
  const displayInning = gameState?.inning ?? game?.currentInning ?? 1;
  const displayHalf = gameState?.half ?? game?.currentHalf ?? 'top';
  const displayOuts = gameState?.outs ?? game?.currentOuts ?? 0;
  const displayBases = gameState?.bases ?? { first: null, second: null, third: null };

  // Compute linescore from events as fallback (for final games without WebSocket)
  const evtLineScore = useMemo(() => {
    const home: number[] = [];
    const away: number[] = [];
    for (const e of events) {
      if (e.eventType === 'pitch' || e.eventType === 'end_half_inning') continue;
      const runs = e.runsScored ?? 0;
      if (runs === 0) continue;
      const idx = e.inning - 1;
      if (e.half === 'top') {
        while (away.length <= idx) away.push(0);
        away[idx] += runs;
      } else {
        while (home.length <= idx) home.push(0);
        home[idx] += runs;
      }
    }
    const maxLen = Math.max(home.length, away.length);
    while (home.length < maxLen) home.push(0);
    while (away.length < maxLen) away.push(0);
    return { home, away };
  }, [events]);

  const homeLineScore = gameState?.homeLineScore ?? (evtLineScore.home.length > 0 ? evtLineScore.home : []);
  const awayLineScore = gameState?.awayLineScore ?? (evtLineScore.away.length > 0 ? evtLineScore.away : []);
  const maxInnings = Math.max(homeLineScore.length, awayLineScore.length, displayInning, 1);

  // Compute team error counts from events
  const errorCounts = useMemo(() => {
    const errorTypes = new Set(['error', 'sac_bunt_error', 'sac_fly_error', 'advance_on_error']);
    let awayErrors = 0;
    let homeErrors = 0;
    for (const e of events) {
      if (errorTypes.has(e.eventType)) {
        // Errors are charged to the fielding team (opposite of batting team)
        if (e.half === 'top') homeErrors++; // top = away batting, home fielding
        else awayErrors++; // bot = home batting, away fielding
      }
    }
    return { home: homeErrors, away: awayErrors };
  }, [events]);

  const status = isFinal ? 'final' : game?.status ?? 'scheduled';

  // Group events by at-bat for play-by-play
  const groupedAtBats = useMemo(() => {
    const groups: { key: string; inning: number; half: string; atBats: AtBat[] }[] = [];
    const filtered = events.filter(e => e.eventType !== 'end_half_inning');
    let currentAB: AtBat | null = null;

    for (const evt of filtered) {
      const key = `${evt.half}-${evt.inning}`;
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, inning: evt.inning, half: evt.half, atBats: [] };
        groups.push(group);
        if (currentAB) { /* close previous AB when inning changes */ currentAB = null; }
      }

      if (evt.eventType === 'pitch') {
        if (!currentAB) {
          currentAB = { batterId: evt.batterId, batterName: evt.batterName || 'Unknown', result: null, pitches: [], betweenEvents: [], inning: evt.inning, half: evt.half };
          group.atBats.push(currentAB);
        }
        currentAB.pitches.push(evt);
      } else if (RUNNER_EVENT_TYPES.has(evt.eventType)) {
        if (currentAB) {
          currentAB.betweenEvents.push(evt);
        } else {
          group.atBats.push({ batterId: evt.batterId, batterName: evt.batterName || 'Unknown', result: evt, pitches: [], betweenEvents: [], inning: evt.inning, half: evt.half });
        }
      } else {
        if (!currentAB) {
          currentAB = { batterId: evt.batterId, batterName: evt.batterName || 'Unknown', result: null, pitches: [], betweenEvents: [], inning: evt.inning, half: evt.half };
          group.atBats.push(currentAB);
        }
        currentAB.result = evt;
        currentAB = null; // close at-bat
      }
    }
    // Reverse: latest inning first, latest at-bat first within each inning
    for (const g of groups) g.atBats.reverse();
    return groups.reverse();
  }, [events]);

  // Build live batting stats from events for live games (before finalization)
  const liveBattingMap = useMemo(() => {
    const map: Record<number, { pa: number; ab: number; h: number; r: number; rbi: number; bb: number; so: number; hr: number; tb: number; hbp: number; sf: number; sb: number; cs: number }> = {};
    const getOrCreate = (id: number) => {
      if (!map[id]) map[id] = { pa: 0, ab: 0, h: 0, r: 0, rbi: 0, bb: 0, so: 0, hr: 0, tb: 0, hbp: 0, sf: 0, sb: 0, cs: 0 };
      return map[id];
    };

    const hitTypes = new Set(['single', 'bunt_single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double']);
    const outTypes = new Set(['ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'foul_out', 'fielders_choice', 'infield_fly']);
    const kTypes = new Set(['strikeout', 'strikeout_swinging', 'strikeout_looking', 'caught_foul_tip', 'bunt_foul', 'dropped_third_strike_out', 'dropped_third_strike', 'wild_pitch_third_strike']);
    const walkTypes = new Set(['walk', 'intentional_walk']);
    const sacFly = new Set(['sacrifice_fly', 'sac_fly_error']);
    const sacBunt = new Set(['sacrifice_bunt', 'sac_bunt_error']);

    for (const evt of events) {
      if (evt.eventType === 'end_half_inning' || evt.eventType === 'pitch') continue;
      if (RUNNER_EVENT_TYPES.has(evt.eventType)) {
        if (evt.eventType === 'stolen_base' && evt.batterId) getOrCreate(evt.batterId).sb++;
        if (evt.eventType === 'caught_stealing' && evt.batterId) getOrCreate(evt.batterId).cs++;
        if (evt.runnersScored && Array.isArray(evt.runnersScored)) {
          for (const rid of evt.runnersScored) getOrCreate(rid as number).r++;
        }
        continue;
      }
      if (!evt.batterId) continue;
      const b = getOrCreate(evt.batterId);
      b.pa++;

      if (hitTypes.has(evt.eventType)) {
        b.ab++; b.h++;
        if (evt.eventType === 'single' || evt.eventType === 'bunt_single') b.tb += 1;
        else if (evt.eventType === 'double' || evt.eventType === 'ground_rule_double') b.tb += 2;
        else if (evt.eventType === 'triple') b.tb += 3;
        else if (evt.eventType === 'home_run' || evt.eventType === 'inside_park_hr') { b.tb += 4; b.hr++; }
      } else if (outTypes.has(evt.eventType)) { b.ab++; }
      else if (kTypes.has(evt.eventType)) { b.ab++; b.so++; }
      else if (walkTypes.has(evt.eventType)) { b.bb++; }
      else if (evt.eventType === 'hit_by_pitch') { b.hbp++; }
      else if (sacFly.has(evt.eventType)) { b.sf++; }
      else if (sacBunt.has(evt.eventType)) { /* sac bunt: PA but not AB */ }
      else if (evt.eventType === 'error') { b.ab++; }
      else if (evt.eventType === 'catcher_obstruction') { /* PA but not AB, like HBP */ }

      b.rbi += evt.rbi || 0;

      if (evt.runnersScored && Array.isArray(evt.runnersScored)) {
        for (const rid of evt.runnersScored) getOrCreate(rid as number).r++;
      }
    }
    return map;
  }, [events]);

  // Season stats map
  const seasonBattingMap = useMemo(() => {
    const m: Record<number, typeof seasonCtx.batting[0]> = {};
    for (const s of seasonCtx.batting) m[s.playerId] = s;
    return m;
  }, [seasonCtx.batting]);

  const seasonPitchingMap = useMemo(() => {
    const m: Record<number, typeof seasonCtx.pitching[0]> = {};
    for (const s of seasonCtx.pitching) m[s.playerId] = s;
    return m;
  }, [seasonCtx.pitching]);

  // Lineups organized by team
  const homeLineup = useMemo(() =>
    lineups.filter(l => l.teamId === game?.homeTeamId && l.battingOrder > 0)
      .sort((a, b) => {
        if (a.battingOrder !== b.battingOrder) return a.battingOrder - b.battingOrder;
        if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
        return a.playerId - b.playerId;
      }), [lineups, game]);
  const awayLineup = useMemo(() =>
    lineups.filter(l => l.teamId === game?.awayTeamId && l.battingOrder > 0)
      .sort((a, b) => {
        if (a.battingOrder !== b.battingOrder) return a.battingOrder - b.battingOrder;
        if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
        return a.playerId - b.playerId;
      }), [lineups, game]);

  // Build live pitching stats from events
  const livePitchingMap = useMemo(() => {
    const map: Record<number, { ip: number; outs: number; h: number; r: number; er: number; bb: number; k: number; hr: number; np: number; balls: number; strikes: number; teamId: number }> = {};
    const hitTypes = new Set(['single', 'bunt_single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double']);
    const walkTypes = new Set(['walk', 'intentional_walk']);
    const kTypes = new Set(['strikeout', 'strikeout_swinging', 'strikeout_looking', 'caught_foul_tip', 'bunt_foul', 'dropped_third_strike_out', 'dropped_third_strike', 'wild_pitch_third_strike']);

    for (const evt of events) {
      if (!evt.pitcherId) continue;
      if (!map[evt.pitcherId]) {
        const pLineup = lineups.find(l => l.playerId === evt.pitcherId);
        map[evt.pitcherId] = { ip: 0, outs: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0, np: 0, balls: 0, strikes: 0, teamId: pLineup?.teamId ?? 0 };
      }
      const p = map[evt.pitcherId];
      if (evt.eventType === 'pitch') {
        p.np++;
        const d = (evt.eventDetail || '').toLowerCase();
        if (d === 'ball') p.balls++;
        else p.strikes++;
        continue;
      }
      if (RUNNER_EVENT_TYPES.has(evt.eventType)) {
        p.outs += evt.outsRecorded || 0;
        p.r += evt.runsScored || 0;
        continue;
      }
      p.np++; // result event = 1 more pitch
      p.strikes++; // the final pitch of an at-bat is always a strike (K, contact) or ball (BB) - count accordingly
      if (walkTypes.has(evt.eventType) || evt.eventType === 'hit_by_pitch' || evt.eventType === 'catcher_obstruction') { p.strikes--; p.balls++; }
      p.outs += evt.outsRecorded || 0;
      p.r += evt.runsScored || 0;
      p.er += evt.runsScored || 0;
      if (hitTypes.has(evt.eventType)) p.h++;
      if (walkTypes.has(evt.eventType)) p.bb++;
      if (kTypes.has(evt.eventType)) p.k++;
      if (evt.eventType === 'home_run' || evt.eventType === 'inside_park_hr') p.hr++;
    }
    for (const pid of Object.keys(map)) {
      const p = map[Number(pid)];
      const fullInn = Math.floor(p.outs / 3);
      const partial = p.outs % 3;
      p.ip = fullInn + partial * 0.1;
    }
    return map;
  }, [events, lineups]);

  const homePitching = useMemo(() => {
    const finalized = pitchingBox.filter(p => p.teamId === game?.homeTeamId);
    if (finalized.length > 0) {
      return finalized.map(p => {
        const live = livePitchingMap[p.playerId];
        return { ...p, balls: live?.balls ?? null, strikes: live?.strikes ?? null };
      });
    }
    return Object.entries(livePitchingMap)
      .filter(([, v]) => v.teamId === game?.homeTeamId)
      .map(([pid, v]) => {
        const p = lineups.find(l => l.playerId === Number(pid));
        return { playerId: Number(pid), teamId: v.teamId, inningsPitched: String(v.ip), hits: v.h, runs: v.r, earnedRuns: v.er, walks: v.bb, strikeouts: v.k, homeRuns: v.hr, pitchesThrown: v.np, balls: v.balls, strikes: v.strikes, decision: null, isStarter: true, firstName: p?.firstName || '', lastName: p?.lastName || '' } as PitchingBoxScore;
      });
  }, [pitchingBox, game, livePitchingMap, lineups]);

  const awayPitching = useMemo(() => {
    const finalized = pitchingBox.filter(p => p.teamId === game?.awayTeamId);
    if (finalized.length > 0) {
      return finalized.map(p => {
        const live = livePitchingMap[p.playerId];
        return { ...p, balls: live?.balls ?? null, strikes: live?.strikes ?? null };
      });
    }
    return Object.entries(livePitchingMap)
      .filter(([, v]) => v.teamId === game?.awayTeamId)
      .map(([pid, v]) => {
        const p = lineups.find(l => l.playerId === Number(pid));
        return { playerId: Number(pid), teamId: v.teamId, inningsPitched: String(v.ip), hits: v.h, runs: v.r, earnedRuns: v.er, walks: v.bb, strikeouts: v.k, homeRuns: v.hr, pitchesThrown: v.np, balls: v.balls, strikes: v.strikes, decision: null, isStarter: true, firstName: p?.firstName || '', lastName: p?.lastName || '' } as PitchingBoxScore;
      });
  }, [pitchingBox, game, livePitchingMap, lineups]);

  const homeBatting = useMemo(() =>
    battingBox.filter(b => b.teamId === game?.homeTeamId), [battingBox, game]);
  const awayBatting = useMemo(() =>
    battingBox.filter(b => b.teamId === game?.awayTeamId), [battingBox, game]);

  if (!game) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center">
        <div className="text-[#6b7280]">Game not found</div>
      </div>
    );
  }

  const formatEventLine = (evt: GameEvent): string => {
    const label = EVENT_LABELS[evt.eventType] || evt.eventType.replace(/_/g, ' ');
    const name = evt.batterName || 'Unknown';
    const fs = evt.fieldingSequence ? ` (${evt.fieldingSequence})` : '';
    return `${name} — ${label}${fs}`;
  };

  const fmtAvg = (h: number, ab: number) => ab > 0 ? (h / ab).toFixed(3) : '—';
  const fmtOps = (h: number, ab: number, bb: number, hbp: number, sf: number, tb: number) => {
    const obpDenom = ab + bb + hbp + sf;
    const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0;
    const slg = ab > 0 ? tb / ab : 0;
    return (obp + slg) > 0 ? (obp + slg).toFixed(3) : '—';
  };

  const playTone = (ab: AtBat): { tag: string; cls: string } => {
    const t = ab.result?.eventType || '';
    if ((ab.result?.runsScored ?? 0) > 0) {
      return { tag: 'SCORING', cls: 'text-emerald-700' };
    }
    if (['single', 'bunt_single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double'].includes(t)) {
      return { tag: 'HIT', cls: 'text-emerald-700' };
    }
    if (['walk', 'intentional_walk', 'hit_by_pitch'].includes(t)) {
      return { tag: 'PASS', cls: 'text-emerald-700' };
    }
    if (['error', 'sac_bunt_error', 'sac_fly_error', 'advance_on_error'].includes(t)) {
      return { tag: 'ERROR', cls: 'text-amber-700' };
    }
    if (['stolen_base', 'caught_stealing', 'picked_off', 'defensive_indifference'].includes(t) || (!ab.result && ab.betweenEvents.some(e => ['stolen_base', 'caught_stealing', 'picked_off', 'defensive_indifference'].includes(e.eventType)))) {
      return { tag: 'RUNNER', cls: 'text-slate-600' };
    }
    if (['ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'strikeout', 'strikeout_swinging', 'strikeout_looking', 'double_play', 'triple_play', 'fielders_choice'].includes(t)) {
      return { tag: 'OUT', cls: 'text-rose-700' };
    }
    if (!ab.result && ab.betweenEvents.length > 0) {
      return { tag: 'RUNNER', cls: 'text-slate-600' };
    }
    return { tag: 'PLAY', cls: 'text-slate-600' };
  };

  const teamLobMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (!game) return map;
    const filtered = events
      .filter(e => e.eventType !== 'pitch' && e.eventType !== 'end_half_inning')
      .sort((a, b) => a.eventNumber - b.eventNumber);
    let outs = 0;
    for (const evt of filtered) {
      outs += evt.outsRecorded ?? 0;
      if (outs < 3) continue;
      const battingTeamId = evt.half === 'top' ? game.awayTeamId : game.homeTeamId;
      const lobThisHalf = [evt.runnerFirstId, evt.runnerSecondId, evt.runnerThirdId].filter(Boolean).length;
      map[battingTeamId] = (map[battingTeamId] ?? 0) + lobThisHalf;
      outs = 0;
    }
    return map;
  }, [events, game]);

  const renderBattingTable = (teamName: string, lineup: LineupEntry[], batting: BattingBoxScore[]) => {
    const battingMap: Record<number, BattingBoxScore> = {};
    for (const b of batting) battingMap[b.playerId] = b;

    const rows = lineup.length > 0 ? lineup : batting.map(b => ({
      playerId: b.playerId, teamId: b.teamId, battingOrder: 0, position: 0,
      isStarter: true, isActive: true, firstName: b.firstName, lastName: b.lastName,
    }));
    const teamId = rows[0]?.teamId ?? batting[0]?.teamId ?? 0;

    const shortName = (p: LineupEntry) => `${p.firstName?.charAt(0)}. ${p.lastName}`;
    const battingNotes = (() => {
      const collectNames = (predicate: (box: BattingBoxScore | undefined, live: typeof liveBattingMap[number] | undefined) => boolean) =>
        rows
          .filter(p => predicate(battingMap[p.playerId], liveBattingMap[p.playerId]))
          .map(shortName);
      const parts: string[] = [];
      const doublesNames = collectNames((box) => (box?.doubles ?? 0) > 0);
      if (doublesNames.length > 0) parts.push(`2B: ${doublesNames.join(', ')}`);
      const triplesNames = collectNames((box) => (box?.triples ?? 0) > 0);
      if (triplesNames.length > 0) parts.push(`3B: ${triplesNames.join(', ')}`);
      const hrNames = collectNames((box, live) => (box?.homeRuns ?? live?.hr ?? 0) > 0);
      if (hrNames.length > 0) parts.push(`HR: ${hrNames.join(', ')}`);
      const sfNames = collectNames((box, live) => (box?.sacrificeFlies ?? live?.sf ?? 0) > 0);
      if (sfNames.length > 0) parts.push(`SF: ${sfNames.join(', ')}`);
      const shNames = collectNames((box) => (box?.sacrificeBunts ?? 0) > 0);
      if (shNames.length > 0) parts.push(`SH: ${shNames.join(', ')}`);
      const gdpNames = collectNames((box) => (box?.groundedIntoDoublePlays ?? 0) > 0);
      if (gdpNames.length > 0) parts.push(`GDP: ${gdpNames.join(', ')}`);
      return parts;
    })();
    const lob = teamLobMap[teamId] ?? 0;

    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">{teamName}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] whitespace-nowrap font-mono">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left py-1.5 pl-2 pr-1 w-8">#</th>
                <th className="text-left py-1.5 pr-2 min-w-[90px]">Player</th>
                <th className="text-center px-0.5 w-7">Pos</th>
                {['PA','AB','R','H','2B','3B','HR','RBI','BB','HBP','SO','Kc','Ks','SB','CS','SF','SH','B','GDP','FC','CI','AVG','OPS'].map((h) => (
                  <th key={h} title={getStatAbbreviationMeaning(h) ?? undefined} className={`text-center px-1 ${h === 'AVG' || h === 'OPS' ? 'w-9 text-gray-700' : 'w-8'}`}>
                    {h === 'SH' ? 'SAC' : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const box = battingMap[p.playerId];
                const live = liveBattingMap[p.playerId];
                const pa = box?.plateAppearances ?? live?.pa ?? 0;
                const ab = box?.atBats ?? live?.ab ?? 0;
                const h = box?.hits ?? live?.h ?? 0;
                const r = box?.runs ?? live?.r ?? 0;
                const rbi = box?.rbi ?? live?.rbi ?? 0;
                const bb = box?.walks ?? live?.bb ?? 0;
                const so = box?.strikeouts ?? live?.so ?? 0;
                const hr = box?.homeRuns ?? live?.hr ?? 0;
                const dbl = box?.doubles ?? 0;
                const trp = box?.triples ?? 0;
                const hbp = box?.hitByPitch ?? live?.hbp ?? 0;
                const sf = box?.sacrificeFlies ?? live?.sf ?? 0;
                const sac = box?.sacrificeBunts ?? 0;
                const sb = status === 'live' ? (live?.sb ?? box?.stolenBases ?? 0) : (box?.stolenBases ?? live?.sb ?? 0);
                const cs = status === 'live' ? (live?.cs ?? box?.caughtStealing ?? 0) : (box?.caughtStealing ?? live?.cs ?? 0);
                const kc = box?.strikeoutsLooking ?? 0;
                const ks = box?.strikeoutsSwinging ?? 0;
                const b = box?.buntSingles ?? 0;
                const gdp = box?.groundedIntoDoublePlays ?? 0;
                const fc = box?.fieldersChoice ?? 0;
                const ci = box?.catcherInterference ?? 0;
                const tb = box?.totalBases ?? live?.tb ?? 0;
                const displayAvg = fmtAvg(h, ab);
                const displayOps = fmtOps(h, ab, bb, hbp, sf, tb);
                return (
                  <tr key={p.playerId} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="py-1.5 pl-2 pr-1 text-gray-500">{p.isStarter ? (p.battingOrder || i + 1) : ''}</td>
                    <td className={`py-1.5 pr-2 text-gray-900 font-sans ${p.isStarter ? 'font-medium' : 'pl-4 text-gray-700'}`}>
                      {p.isStarter ? '' : '↳ '}
                      {p.firstName?.charAt(0)}. {p.lastName}
                    </td>
                    <td className="text-center text-gray-500">{POS_LABELS[p.position] || '—'}</td>
                    <td className="text-center text-gray-700 font-mono">{pa}</td>
                    <td className="text-center text-gray-700 font-mono">{ab}</td>
                    <td className="text-center text-gray-700 font-mono">{r}</td>
                    <td className={`text-center font-mono ${h > 0 ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>{h}</td>
                    <td className="text-center text-gray-700 font-mono">{dbl}</td>
                    <td className="text-center text-gray-700 font-mono">{trp}</td>
                    <td className={`text-center font-mono ${hr > 0 ? 'text-amber-700 font-bold' : 'text-gray-700'}`}>{hr}</td>
                    <td className={`text-center font-mono ${rbi > 0 ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>{rbi}</td>
                    <td className="text-center text-gray-700 font-mono">{bb}</td>
                    <td className="text-center text-gray-700 font-mono">{hbp}</td>
                    <td className="text-center text-gray-700 font-mono">{so}</td>
                    <td className="text-center text-gray-600 font-mono">{kc}</td>
                    <td className="text-center text-gray-600 font-mono">{ks}</td>
                    <td className="text-center text-gray-700 font-mono">{sb}</td>
                    <td className="text-center text-gray-700 font-mono">{cs}</td>
                    <td className="text-center text-gray-700 font-mono">{sf}</td>
                    <td className="text-center text-gray-700 font-mono">{sac}</td>
                    <td className="text-center text-gray-700 font-mono">{b}</td>
                    <td className="text-center text-gray-700 font-mono">{gdp}</td>
                    <td className="text-center text-gray-700 font-mono">{fc}</td>
                    <td className="text-center text-gray-700 font-mono">{ci}</td>
                    <td className="text-center text-gray-700 font-mono text-[10px]">{displayAvg}</td>
                    <td className="text-center text-gray-700 font-mono text-[10px]">{displayOps}</td>
                  </tr>
                );
              })}
            </tbody>
            {(() => {
              const tPA = rows.reduce((s, p) => s + (battingMap[p.playerId]?.plateAppearances ?? liveBattingMap[p.playerId]?.pa ?? 0), 0);
              const tAB = rows.reduce((s, p) => s + (battingMap[p.playerId]?.atBats ?? liveBattingMap[p.playerId]?.ab ?? 0), 0);
              const tR = rows.reduce((s, p) => s + (battingMap[p.playerId]?.runs ?? liveBattingMap[p.playerId]?.r ?? 0), 0);
              const tH = rows.reduce((s, p) => s + (battingMap[p.playerId]?.hits ?? liveBattingMap[p.playerId]?.h ?? 0), 0);
              const tDbl = rows.reduce((s, p) => s + (battingMap[p.playerId]?.doubles ?? 0), 0);
              const tTrp = rows.reduce((s, p) => s + (battingMap[p.playerId]?.triples ?? 0), 0);
              const tHR = rows.reduce((s, p) => s + (battingMap[p.playerId]?.homeRuns ?? liveBattingMap[p.playerId]?.hr ?? 0), 0);
              const tRBI = rows.reduce((s, p) => s + (battingMap[p.playerId]?.rbi ?? liveBattingMap[p.playerId]?.rbi ?? 0), 0);
              const tBB = rows.reduce((s, p) => s + (battingMap[p.playerId]?.walks ?? liveBattingMap[p.playerId]?.bb ?? 0), 0);
              const tHBP = rows.reduce((s, p) => s + (battingMap[p.playerId]?.hitByPitch ?? liveBattingMap[p.playerId]?.hbp ?? 0), 0);
              const tSO = rows.reduce((s, p) => s + (battingMap[p.playerId]?.strikeouts ?? liveBattingMap[p.playerId]?.so ?? 0), 0);
              const tKc = rows.reduce((s, p) => s + (battingMap[p.playerId]?.strikeoutsLooking ?? 0), 0);
              const tKs = rows.reduce((s, p) => s + (battingMap[p.playerId]?.strikeoutsSwinging ?? 0), 0);
              const tSB = rows.reduce((s, p) => s + (status === 'live'
                ? (liveBattingMap[p.playerId]?.sb ?? battingMap[p.playerId]?.stolenBases ?? 0)
                : (battingMap[p.playerId]?.stolenBases ?? liveBattingMap[p.playerId]?.sb ?? 0)
              ), 0);
              const tCS = rows.reduce((s, p) => s + (status === 'live'
                ? (liveBattingMap[p.playerId]?.cs ?? battingMap[p.playerId]?.caughtStealing ?? 0)
                : (battingMap[p.playerId]?.caughtStealing ?? liveBattingMap[p.playerId]?.cs ?? 0)
              ), 0);
              const tSF = rows.reduce((s, p) => s + (battingMap[p.playerId]?.sacrificeFlies ?? liveBattingMap[p.playerId]?.sf ?? 0), 0);
              const tSAC = rows.reduce((s, p) => s + (battingMap[p.playerId]?.sacrificeBunts ?? 0), 0);
              const tB = rows.reduce((s, p) => s + (battingMap[p.playerId]?.buntSingles ?? 0), 0);
              const tGDP = rows.reduce((s, p) => s + (battingMap[p.playerId]?.groundedIntoDoublePlays ?? 0), 0);
              const tFC = rows.reduce((s, p) => s + (battingMap[p.playerId]?.fieldersChoice ?? 0), 0);
              const tCI = rows.reduce((s, p) => s + (battingMap[p.playerId]?.catcherInterference ?? 0), 0);
              const tTB = rows.reduce((s, p) => {
                const box = battingMap[p.playerId];
                const live = liveBattingMap[p.playerId];
                return s + (box?.totalBases ?? live?.tb ?? 0);
              }, 0);
              return (
                <tfoot>
                  <tr className="border-t border-gray-200 text-gray-700 font-bold">
                    <td className="py-1.5 pl-2" colSpan={3}>Totals</td>
                    <td className="text-center font-mono">{tPA}</td>
                    <td className="text-center font-mono">{tAB}</td>
                    <td className="text-center font-mono">{tR}</td>
                    <td className="text-center font-mono">{tH}</td>
                    <td className="text-center font-mono">{tDbl}</td>
                    <td className="text-center font-mono">{tTrp}</td>
                    <td className="text-center font-mono">{tHR}</td>
                    <td className="text-center font-mono">{tRBI}</td>
                    <td className="text-center font-mono">{tBB}</td>
                    <td className="text-center font-mono">{tHBP}</td>
                    <td className="text-center font-mono">{tSO}</td>
                    <td className="text-center font-mono">{tKc}</td>
                    <td className="text-center font-mono">{tKs}</td>
                    <td className="text-center font-mono">{tSB}</td>
                    <td className="text-center font-mono">{tCS}</td>
                    <td className="text-center font-mono">{tSF}</td>
                    <td className="text-center font-mono">{tSAC}</td>
                    <td className="text-center font-mono">{tB}</td>
                    <td className="text-center font-mono">{tGDP}</td>
                    <td className="text-center font-mono">{tFC}</td>
                    <td className="text-center font-mono">{tCI}</td>
                    <td className="text-center font-mono text-[10px]">{fmtAvg(tH, tAB)}</td>
                    <td className="text-center font-mono text-[10px]">{fmtOps(tH, tAB, tBB, tHBP, tSF, tTB)}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
        {(battingNotes.length > 0 || lob > 0) && (
          <div className="mt-1 text-[10px] text-gray-600">
            <span className="font-semibold text-gray-700">Batting notes:</span>{' '}
            {[...battingNotes, `LOB: ${lob}`].join(' | ')}
          </div>
        )}
      </div>
    );
  };

  const baseStateFromEvent = (evt?: GameEvent | null) => ({
    first: Boolean(evt?.runnerFirstId),
    second: Boolean(evt?.runnerSecondId),
    third: Boolean(evt?.runnerThirdId),
  });

  const pitchSymbol = (evt: GameEvent): 'B' | 'S' | 'F' | 'X' | 'P' => {
    const detail = String(evt.eventDetail || '').toLowerCase();
    if (detail === 'ball') return 'B';
    if (detail === 'foul') return 'F';
    if (detail === 'strike' || detail === 'called_strike' || detail === 'swinging_strike') return 'S';
    return 'P';
  };

  const ordinalInning = (inning: number) => {
    if (inning % 100 >= 11 && inning % 100 <= 13) return `${inning}th`;
    const suffix = inning % 10 === 1 ? 'st' : inning % 10 === 2 ? 'nd' : inning % 10 === 3 ? 'rd' : 'th';
    return `${inning}${suffix}`;
  };

  const compactRunnerSummary = (ab: AtBat) => {
    const entries: string[] = [];
    for (const re of ab.betweenEvents) {
      const title = formatPlayByPlay(re).title;
      if (title) entries.push(title);
    }
    if (ab.result?.runsScored && ab.result.runsScored > 0) {
      entries.push(`${ab.result.runsScored} run${ab.result.runsScored > 1 ? 's' : ''} scored`);
    }
    return entries.join(' → ');
  };

  const BaseDiamond = ({ first, second, third }: { first: boolean; second: boolean; third: boolean }) => (
    <svg viewBox="0 0 50 50" className="w-9 h-9 shrink-0" aria-label="Base occupancy">
      <rect x="19" y="2" width="12" height="12" rx="1.5" transform="rotate(45 25 8)"
        fill={second ? 'rgba(16, 185, 129, 0.35)' : 'rgba(0,0,0,0.05)'} stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
      <rect x="35" y="18" width="12" height="12" rx="1.5" transform="rotate(45 41 24)"
        fill={first ? 'rgba(16, 185, 129, 0.35)' : 'rgba(0,0,0,0.05)'} stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
      <rect x="3" y="18" width="12" height="12" rx="1.5" transform="rotate(45 9 24)"
        fill={third ? 'rgba(16, 185, 129, 0.35)' : 'rgba(0,0,0,0.05)'} stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
    </svg>
  );

  const pitchSequenceInline = (symbols: ('B' | 'S' | 'F' | 'X' | 'P')[]) => symbols.join(' ');

  const pitchLabel = (evt?: GameEvent | null) => {
    const detail = String(evt?.eventDetail || '').toLowerCase();
    if (detail === 'ball') return 'Ball';
    if (detail === 'called_strike') return 'Called strike';
    if (detail === 'swinging_strike') return 'Swinging strike';
    if (detail === 'strike') return 'Strike';
    if (detail === 'foul') return 'Foul';
    if (detail === 'in_play') return 'Ball in play';
    if (!evt) return 'Pitch';
    return detail ? detail.replace(/_/g, ' ') : 'Pitch';
  };

  const derivePitchBreakdown = (ab: AtBat) => {
    const runnerEventsSorted = [...ab.betweenEvents].sort((a, b) => a.eventNumber - b.eventNumber);
    const pitchEventsSorted = [...ab.pitches].sort((a, b) => a.eventNumber - b.eventNumber);
    const rows: { pitchNo: number; label: string; count: string; runnerNotes: string[] }[] = [];
    let balls = 0;
    let strikes = 0;

    for (let i = 0; i < pitchEventsSorted.length; i++) {
      const pitchEvt = pitchEventsSorted[i];
      const nextPitch = pitchEventsSorted[i + 1];
      const d = String(pitchEvt.eventDetail || '').toLowerCase();
      if (d === 'ball') balls = Math.min(3, balls + 1);
      else if (d === 'foul') strikes = Math.min(2, strikes + 1);
      else if (d === 'strike' || d === 'called_strike' || d === 'swinging_strike') strikes = Math.min(2, strikes + 1);

      const runnerNotes = runnerEventsSorted
        .filter(re => re.eventNumber > pitchEvt.eventNumber && (!nextPitch || re.eventNumber < nextPitch.eventNumber))
        .map(re => formatPlayByPlay(re).title);

      rows.push({
        pitchNo: i + 1,
        label: pitchLabel(pitchEvt),
        count: `${balls}-${strikes}`,
        runnerNotes,
      });
    }

    if (ab.result) {
      const resultPitchNo = Math.max(1, pitchEventsSorted.length);
      const resultType = ab.result.eventType;
      const contactLike = !['walk', 'intentional_walk', 'hit_by_pitch', 'catcher_obstruction'].includes(resultType);
      if (contactLike) {
        rows.push({
          pitchNo: resultPitchNo,
          label: 'Ball in play',
          count: `${balls}-${strikes}`,
          runnerNotes: [],
        });
      }
      rows.push({
        pitchNo: resultPitchNo,
        label: formatPlayByPlay(ab.result).title,
        count: `${balls}-${strikes}`,
        runnerNotes: [],
      });
    }

    return { rows, finalCount: `${balls}-${strikes}` };
  };

  const gameEra = (er: number, ipStr: string) => {
    const ip = parseFloat(String(ipStr).replace(',', '.')) || 0;
    if (ip <= 0) return '—';
    return ((er / ip) * 9).toFixed(2);
  };
  const gameWhip = (h: number, bb: number, ipStr: string) => {
    const ip = parseFloat(String(ipStr).replace(',', '.')) || 0;
    if (ip <= 0) return '—';
    return ((h + bb) / ip).toFixed(2);
  };

  const strikePct = (balls: number | null | undefined, strikes: number | null | undefined) => {
    const b = balls ?? 0;
    const s = strikes ?? 0;
    const total = b + s;
    if (total <= 0) return '—';
    return `${Math.round((s / total) * 100)}%`;
  };

  const renderPitchingTable = (teamName: string, pitchers: PitchingBoxScore[]) => {
    if (pitchers.length === 0) return null;
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">{teamName} — Pitching</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] whitespace-nowrap font-mono">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left py-1.5 pl-2 min-w-[90px]">Pitcher</th>
                {['Dec','IP','H','R','ER','BB','SO','Kc','Ks','HR','HBP','WP','BF','NP','B','S','%S','GSc','ERA','WHIP'].map((h) => (
                  <th key={h} title={getStatAbbreviationMeaning(h) ?? undefined} className={`text-center px-1 ${h === '%S' ? 'w-10' : h === 'ERA' || h === 'WHIP' ? 'w-9' : h === 'BF' || h === 'NP' || h === 'B' || h === 'S' ? 'w-9' : 'w-8'}`}>
                    {h === 'SO' ? 'K' : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pitchers.map((p, i) => {
                const dec = p.decision === 'W' ? 'W' : p.decision === 'L' ? 'L' : p.decision === 'S' ? 'S' : '';
                const era = gameEra(p.earnedRuns ?? 0, p.inningsPitched);
                const whip = gameWhip(p.hits ?? 0, p.walks ?? 0, p.inningsPitched);
                return (
                  <tr key={p.playerId} className={`border-b border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="py-1.5 pl-2 text-gray-900 font-sans font-medium">{p.firstName?.charAt(0)}. {p.lastName}</td>
                    <td className={`text-center font-semibold ${dec === 'W' ? 'text-emerald-700' : dec === 'L' ? 'text-rose-700' : dec === 'S' ? 'text-gray-800' : 'text-gray-500'}`}>{dec || '—'}</td>
                    <td className="text-center text-gray-700 font-mono">{p.inningsPitched}</td>
                    <td className="text-center text-gray-700 font-mono">{p.hits}</td>
                    <td className="text-center text-gray-700 font-mono">{p.runs}</td>
                    <td className="text-center text-gray-700 font-mono">{p.earnedRuns}</td>
                    <td className="text-center text-gray-700 font-mono">{p.walks}</td>
                    <td className="text-center text-gray-700 font-mono">{p.strikeouts}</td>
                    <td className="text-center text-gray-600 font-mono">{p.strikeoutsLooking ?? '—'}</td>
                    <td className="text-center text-gray-600 font-mono">{p.strikeoutsSwinging ?? '—'}</td>
                    <td className="text-center text-gray-700 font-mono">{p.homeRuns}</td>
                    <td className="text-center text-gray-700 font-mono">{p.hitBatters ?? '—'}</td>
                    <td className="text-center text-gray-700 font-mono">{p.wildPitches ?? '—'}</td>
                    <td className="text-center text-gray-600 font-mono">{p.battersFaced ?? '—'}</td>
                    <td className="text-center text-gray-600 font-mono">{p.pitchesThrown ?? '—'}</td>
                    <td className="text-center text-gray-600 font-mono">{p.balls ?? '—'}</td>
                    <td className="text-center text-gray-600 font-mono">{p.strikes ?? '—'}</td>
                    <td className="text-center text-gray-600 font-mono">{strikePct(p.balls, p.strikes)}</td>
                    <td className="text-center text-gray-600 font-mono">{p.gameScore ?? '—'}</td>
                    <td className="text-center text-gray-700 font-mono text-[10px]">{era}</td>
                    <td className="text-center text-gray-700 font-mono text-[10px]">{whip}</td>
                  </tr>
                );
              })}
            </tbody>
            {(() => {
              const sumIp = (arr: PitchingBoxScore[]) => {
                let thirds = 0;
                for (const p of arr) {
                  const s = String(p.inningsPitched || '0');
                  const parts = s.split('.');
                  thirds += parseInt(parts[0] || '0') * 3 + parseInt(parts[1] || '0');
                }
                const full = Math.floor(thirds / 3);
                const rem = thirds % 3;
                return { display: rem > 0 ? `${full}.${rem}` : `${full}`, ip: thirds / 3 };
              };
              const ipResult = sumIp(pitchers);
              const tH = pitchers.reduce((s, p) => s + (p.hits ?? 0), 0);
              const tR = pitchers.reduce((s, p) => s + (p.runs ?? 0), 0);
              const tER = pitchers.reduce((s, p) => s + (p.earnedRuns ?? 0), 0);
              const tBB = pitchers.reduce((s, p) => s + (p.walks ?? 0), 0);
              const tK = pitchers.reduce((s, p) => s + (p.strikeouts ?? 0), 0);
              const tKc = pitchers.reduce((s, p) => s + (p.strikeoutsLooking ?? 0), 0);
              const tKs = pitchers.reduce((s, p) => s + (p.strikeoutsSwinging ?? 0), 0);
              const tHR = pitchers.reduce((s, p) => s + (p.homeRuns ?? 0), 0);
              const tHBP = pitchers.reduce((s, p) => s + (p.hitBatters ?? 0), 0);
              const tWP = pitchers.reduce((s, p) => s + (p.wildPitches ?? 0), 0);
              const tBF = pitchers.reduce((s, p) => s + (p.battersFaced ?? 0), 0);
              const tNP = pitchers.reduce((s, p) => s + (p.pitchesThrown ?? 0), 0);
              const tBalls = pitchers.reduce((s, p) => s + (p.balls ?? 0), 0);
              const tStrikes = pitchers.reduce((s, p) => s + (p.strikes ?? 0), 0);
              const tERA = ipResult.ip > 0 ? ((tER / ipResult.ip) * 9).toFixed(2) : '—';
              const tWHIP = ipResult.ip > 0 ? ((tH + tBB) / ipResult.ip).toFixed(2) : '—';
              return (
                <tfoot>
                  <tr className="border-t border-gray-200 text-gray-700 font-bold">
                    <td className="py-1.5 pl-2">Totals</td>
                    <td></td>
                    <td className="text-center font-mono">{ipResult.display}</td>
                    <td className="text-center font-mono">{tH}</td>
                    <td className="text-center font-mono">{tR}</td>
                    <td className="text-center font-mono">{tER}</td>
                    <td className="text-center font-mono">{tBB}</td>
                    <td className="text-center font-mono">{tK}</td>
                    <td className="text-center font-mono">{tKc}</td>
                    <td className="text-center font-mono">{tKs}</td>
                    <td className="text-center font-mono">{tHR}</td>
                    <td className="text-center font-mono">{tHBP}</td>
                    <td className="text-center font-mono">{tWP}</td>
                    <td className="text-center font-mono">{tBF}</td>
                    <td className="text-center font-mono">{tNP}</td>
                    <td className="text-center font-mono">{tBalls}</td>
                    <td className="text-center font-mono">{tStrikes}</td>
                    <td className="text-center font-mono">{strikePct(tBalls, tStrikes)}</td>
                    <td></td>
                    <td className="text-center font-mono text-[10px]">{tERA}</td>
                    <td className="text-center font-mono text-[10px]">{tWHIP}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* Header */}
      <div className="bg-white border-b border-[#d1d5db]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/schedule" className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors">← Schedule</Link>
          <div className="flex items-center gap-2">
            {status === 'live' && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-live/20 text-live text-[10px] font-bold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                Live
              </span>
            )}
            {status === 'final' && (
              <span className="px-2 py-0.5 rounded-full bg-[#f3f4f6] text-[#6b7280] text-[10px] font-bold uppercase border border-[#d1d5db]">Final</span>
            )}
            {connected && status === 'live' && (
              <span className="text-[10px] text-green-400">Connected</span>
            )}
            {viewerCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[#6b7280]">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {viewerCount} watching
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* Scoreboard */}
        <div
          className="bg-[#111827] rounded-xl border border-[#1f2937] p-4"
          style={{ backgroundColor: '#111827', color: '#e5e7eb' }}
        >
          <div className="flex items-center justify-between max-w-xl mx-auto">
            {/* Away */}
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] text-[#6b7280] uppercase tracking-wider">Away</div>
                <div className="text-base font-bold text-white">{game.awayTeamName}</div>
              </div>
              <div className="text-4xl font-bold font-mono text-white">{displayScore.away}</div>
            </div>

            {/* Inning + Bases + Outs */}
            <div className="flex flex-col items-center gap-2">
              {status === 'live' ? (
                <div className="text-xl font-bold text-white">{displayHalf === 'top' ? '▲' : '▼'} {displayInning}</div>
              ) : (
                <div className="text-sm font-bold text-[#6b7280] uppercase">{status}</div>
              )}
              {status === 'live' && (
                <>
                  <svg viewBox="0 0 50 50" className="w-10 h-10">
                    <rect x="19" y="2" width="12" height="12" rx="1.5" transform="rotate(45 25 8)"
                      fill={displayBases.second ? '#22c55e' : 'rgba(0,0,0,0.06)'} stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
                    <rect x="35" y="18" width="12" height="12" rx="1.5" transform="rotate(45 41 24)"
                      fill={displayBases.first ? '#22c55e' : 'rgba(0,0,0,0.06)'} stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
                    <rect x="3" y="18" width="12" height="12" rx="1.5" transform="rotate(45 9 24)"
                      fill={displayBases.third ? '#22c55e' : 'rgba(0,0,0,0.06)'} stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
                  </svg>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className={`w-3 h-3 rounded-full border ${i < displayOuts ? 'bg-amber-500 border-amber-400' : 'border-[#9ca3af]'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Home */}
            <div className="flex items-center gap-3">
              <div className="text-4xl font-bold font-mono text-white">{displayScore.home}</div>
              <div className="text-right">
                <div className="text-[10px] text-[#6b7280] uppercase tracking-wider">Home</div>
                <div className="text-base font-bold text-white">{game.homeTeamName}</div>
              </div>
            </div>
          </div>

          {/* Line score */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[min(100%,28rem)] text-[11px] font-mono max-w-2xl mx-auto">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left px-2 py-1 align-bottom font-sans font-semibold text-[10px] uppercase tracking-wide">Team</th>
                  {Array.from({ length: maxInnings }, (_, i) => (
                    <th key={i} className="text-center w-6 px-0.5">{i + 1}</th>
                  ))}
                  <th className="text-center w-7 border-l border-white/20 font-bold">R</th>
                  <th className="text-center w-7 font-bold">H</th>
                  <th className="text-center w-7 font-bold">E</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-left align-top px-2 py-1.5 font-sans font-semibold text-gray-100 leading-snug break-words max-w-[14rem]">{game.awayTeamName}</td>
                  {Array.from({ length: maxInnings }, (_, i) => {
                    const hasVal = i < awayLineScore.length;
                    const isCurrent = status === 'live' && i + 1 === displayInning && displayHalf === 'top';
                    const isFuture = i + 1 > Math.max(awayLineScore.length, homeLineScore.length);
                    return (
                      <td key={i} className={`text-center tabular-nums ${isCurrent ? 'text-live font-bold' : hasVal ? 'text-gray-200' : 'text-gray-500'}`}>
                        {hasVal ? awayLineScore[i] : (isCurrent ? '•' : isFuture ? '' : '')}
                      </td>
                    );
                  })}
                  <td className="text-center font-bold text-white border-l border-white/25">{displayScore.away}</td>
                  <td className="text-center text-gray-200 tabular-nums">{awayBatting.reduce((s, b) => s + (b.hits || 0), 0) || awayLineup.reduce((s, p) => s + (liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                  <td className="text-center text-gray-200 tabular-nums">{errorCounts.away}</td>
                </tr>
                <tr>
                  <td className="text-left align-top px-2 py-1.5 font-sans font-semibold text-gray-100 leading-snug break-words max-w-[14rem]">{game.homeTeamName}</td>
                  {Array.from({ length: maxInnings }, (_, i) => {
                    const hasVal = i < homeLineScore.length;
                    const isCurrent = status === 'live' && i + 1 === displayInning && displayHalf === 'bot';
                    // If it's top of this inning, home hasn't batted — show empty, not 0
                    const isTopOfThis = status === 'live' && i + 1 === displayInning && displayHalf === 'top';
                    const isFuture = i + 1 > Math.max(awayLineScore.length, homeLineScore.length);
                    return (
                      <td key={i} className={`text-center tabular-nums ${isCurrent ? 'text-live font-bold' : hasVal ? 'text-gray-200' : 'text-gray-500'}`}>
                        {hasVal ? homeLineScore[i] : (isCurrent ? '•' : (isTopOfThis || isFuture) ? '' : '')}
                      </td>
                    );
                  })}
                  <td className="text-center font-bold text-white border-l border-white/25">{displayScore.home}</td>
                  <td className="text-center text-gray-200 tabular-nums">{homeBatting.reduce((s, b) => s + (b.hits || 0), 0) || homeLineup.reduce((s, p) => s + (liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                  <td className="text-center text-gray-200 tabular-nums">{errorCounts.home}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-lg border border-[#d1d5db] p-1">
          {([
            { key: 'plays' as Tab, label: 'Play-by-Play' },
            { key: 'boxscore' as Tab, label: 'Box Score' },
            { key: 'pitching' as Tab, label: 'Pitching' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors ${tab === t.key ? 'bg-[#e5e7eb] text-[#111827]' : 'text-[#6b7280] hover:text-[#111827]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-xl border border-[#d1d5db] p-4">
          {/* PLAY-BY-PLAY */}
          {tab === 'plays' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Play-by-Play</h3>
                <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-md p-0.5">
                  <button
                    onClick={() => setPlayMode('compact')}
                    className={`px-2 py-1 text-[10px] uppercase font-bold rounded ${playMode === 'compact' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Compact
                  </button>
                  <button
                    onClick={() => setPlayMode('expanded')}
                    className={`px-2 py-1 text-[10px] uppercase font-bold rounded ${playMode === 'expanded' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Expanded
                  </button>
                </div>
              </div>
              {loading ? (
                <p className="text-gray-400 text-sm">Loading...</p>
              ) : groupedAtBats.length === 0 ? (
                <p className="text-gray-400 text-sm">No plays recorded yet</p>
              ) : (
                <div className="space-y-5">
                  {groupedAtBats.map(group => (
                    <div key={group.key}>
                      {/* Inning header */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-[11px] font-bold text-gray-800 bg-gray-100 border border-gray-200 rounded px-2.5 py-1">
                          {group.half === 'top' ? 'Top' : 'Bottom'} {ordinalInning(group.inning)}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {group.half === 'top' ? game.awayTeamName : game.homeTeamName} batting
                        </div>
                        <div className="flex-1 border-t border-gray-200" />
                      </div>

                      {/* At-bats in this inning-half (newest first, cumulative outs) */}
                      <div className="space-y-1 pl-1">
                        {(() => {
                          const absChronological = [...group.atBats].reverse();
                          const cumOuts: number[] = [];
                          let runningOuts = 0;
                          for (const ab of absChronological) {
                            runningOuts += (ab.result?.outsRecorded ?? 0);
                            for (const re of ab.betweenEvents) runningOuts += (re.outsRecorded ?? 0);
                            cumOuts.push(runningOuts);
                          }
                          cumOuts.reverse();

                          return group.atBats.map((ab, abIdx) => {
                            const result = ab.result;
                            const outsAfter = cumOuts[abIdx] ?? 0;
                            const HIT_SET = new Set(['single', 'bunt_single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double']);
                            const WALK_SET = new Set(['walk', 'intentional_walk', 'hit_by_pitch']);
                            const OUT_SET = new Set(['ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'foul_out', 'strikeout', 'strikeout_swinging', 'strikeout_looking', 'sacrifice_fly', 'sacrifice_bunt', 'infield_fly', 'dropped_third_strike_out', 'caught_foul_tip', 'bunt_foul', 'double_play', 'triple_play', 'fielders_choice']);
                            const isHit = result && HIT_SET.has(result.eventType);
                            const isWalk = result && WALK_SET.has(result.eventType);
                            const isOut = result && OUT_SET.has(result.eventType);
                            const isRunnerOnly = !result && ab.betweenEvents.length > 0;

                            let borderClass = 'border-l border-gray-200';
                            if (result && result.runsScored > 0) borderClass = 'border-l border-emerald-400/40';
                            else if (isHit || isWalk) borderClass = 'border-l border-emerald-400/25';
                            else if (isOut) borderClass = 'border-l border-rose-400/25';
                            else if (isRunnerOnly) borderClass = 'border-l border-gray-300';

                            const formatted = result
                              ? formatPlayByPlay(result, { outsBefore: outsAfter - (result.outsRecorded ?? 0), outsAfter })
                              : null;
                            const stateEvt = result ?? ab.betweenEvents[ab.betweenEvents.length - 1] ?? ab.pitches[ab.pitches.length - 1] ?? null;
                            const bases = baseStateFromEvent(stateEvt);
                            const tone = playTone(ab);
                            const runnerSummary = compactRunnerSummary(ab);
                            const pitchSymbols: ('B' | 'S' | 'F' | 'X' | 'P')[] = ab.pitches.map(pitchSymbol);
                            if (result) {
                              const resultSymbol: 'B' | 'S' | 'F' | 'X' | 'P' =
                                ['walk', 'intentional_walk', 'hit_by_pitch', 'catcher_obstruction'].includes(result.eventType) ? 'B' : 'X';
                              pitchSymbols.push(resultSymbol);
                            }
                            const pitchBreakdown = derivePitchBreakdown(ab);
                            const pitchSummary = pitchSymbols.length > 8
                              ? `${pitchSequenceInline(pitchSymbols.slice(0, 8))} ...`
                              : pitchSequenceInline(pitchSymbols);
                            const cardKey = `${group.key}-${abIdx}-${ab.result?.id ?? 'runner'}`;
                            const showPitchDetails = playMode === 'expanded' || Boolean(openPitchCards[cardKey]);
                            const contextLine = `${group.half === 'top' ? game.awayTeamName : game.homeTeamName} batting • ${group.half === 'top' ? game.homeTeamName : game.awayTeamName} pitching`;

                            return (
                              <div key={`ab-${abIdx}`} className={`${borderClass} rounded-lg border border-gray-300/90 bg-gray-200/90 px-3 py-3 shadow-sm`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className={`text-[9px] font-medium uppercase tracking-[0.12em] ${tone.cls}`}>{tone.tag}</span>
                                      {ab.pitches.length > 0 && (
                                        <span className="text-[9px] text-gray-600">{ab.pitches.length} pitch{ab.pitches.length === 1 ? '' : 'es'}</span>
                                      )}
                                    </div>
                                    <div className="text-[14px] leading-snug text-gray-950 font-semibold">
                                      {formatted ? formatted.title : ab.pitches.length > 0 ? `${ab.batterName} at bat` : stateEvt ? formatEventLine(stateEvt) : `${ab.batterName} play`}
                                    </div>
                                    <div className="text-[10px] text-gray-800 mt-1">
                                      {formatted?.subtitle ? `${formatted.subtitle} • ${contextLine}` : contextLine}
                                    </div>
                                  </div>
                                  <div className="shrink-0 pt-0.5">
                                    <BaseDiamond first={bases.first} second={bases.second} third={bases.third} />
                                  </div>
                                </div>
                                <div className="mt-2.5 text-[10px] text-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {pitchSummary && (
                                    <span className="font-mono tracking-wide">Pitches: {pitchSummary}</span>
                                  )}
                                  {playMode === 'expanded' && formatted?.chips?.map((chip, ci) => (
                                    <span key={ci}>{chip}</span>
                                  ))}
                                </div>

                                {pitchBreakdown.rows.length > 0 && (
                                  <div className="mt-1.5">
                                    {playMode === 'compact' && (
                                      <button
                                        type="button"
                                        className="text-[10px] text-gray-500 hover:text-gray-700 transition-colors"
                                        onClick={() =>
                                          setOpenPitchCards(prev => ({ ...prev, [cardKey]: !prev[cardKey] }))
                                        }
                                      >
                                        {showPitchDetails ? 'Hide pitches' : 'View pitches'}
                                      </button>
                                    )}
                                    {showPitchDetails && (
                                      <div className="mt-1.5 pl-2 border-l border-gray-200 space-y-1.5">
                                        <div className="text-[10px] uppercase tracking-[0.1em] text-gray-500">Pitch sequence</div>
                                        {pitchBreakdown.rows.map((row, ri) => (
                                          <div key={`${cardKey}-pitch-${ri}`} className="text-[11px] text-gray-800">
                                            <span className="text-gray-600">Pitch {row.pitchNo}</span>
                                            <span className="mx-1.5 text-gray-400">-</span>
                                            <span>{row.label}</span>
                                            {row.runnerNotes.map((note, ni) => (
                                              <div key={`${cardKey}-pitch-${ri}-runner-${ni}`} className="text-[10px] text-gray-600 ml-4 mt-0.5">
                                                {note}
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {runnerSummary && (
                                  <div className="text-[11px] text-gray-600 mt-1.5">{runnerSummary}</div>
                                )}

                                {playMode === 'expanded' && ab.betweenEvents.length > 0 && (
                                  <div className="mt-1.5 space-y-1">
                                    {ab.betweenEvents.map((re, rei) => {
                                      const reFormatted = formatPlayByPlay(re);
                                      return (
                                        <div key={`re-${rei}`} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                                          <span className="text-gray-500 mt-px">↳</span>
                                          <div>
                                            <span>{reFormatted.title}</span>
                                            {re.runsScored > 0 && <span className="text-gray-600 ml-1">({re.runsScored} run{re.runsScored > 1 ? 's' : ''})</span>}
                                            {re.outsRecorded > 0 && <span className="text-gray-600 ml-1">({re.outsRecorded} out{re.outsRecorded > 1 ? 's' : ''})</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BOX SCORE */}
          {tab === 'boxscore' && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Box Score</h3>
              <div className="text-[9px] text-gray-400 mb-4 flex gap-3">
                <span>All counts from this game</span>
                <span className="text-cyan-800">AVG/OPS = this game only</span>
              </div>
              {renderBattingTable(game.awayTeamName, awayLineup, awayBatting)}
              {renderBattingTable(game.homeTeamName, homeLineup, homeBatting)}
            </div>
          )}

          {/* PITCHING */}
          {tab === 'pitching' && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pitching</h3>
              <div className="text-[9px] text-gray-400 mb-4 flex gap-3">
                <span>All counts from this game</span>
                <span className="text-amber-800">ERA / WHIP = this game only</span>
              </div>
              {renderPitchingTable(game.awayTeamName, awayPitching)}
              {renderPitchingTable(game.homeTeamName, homePitching)}
              {awayPitching.length === 0 && homePitching.length === 0 && (
                <p className="text-gray-400 text-sm">No pitching data yet</p>
              )}
            </div>
          )}
        </div>

        {/* Game info footer */}
        <div className="text-center text-xs text-gray-400 space-y-0.5 pb-8">
          {game.venue && <p>{game.venue}</p>}
          <p>{new Date(game.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    </div>
  );
}
