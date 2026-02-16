'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useGameSocket } from '@/hooks/useGameSocket';
import { formatPlayByPlay } from '@/lib/format-play';
import { useApiBase } from '@/lib/api-context';

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

const PITCH_LABELS: Record<string, string> = {
  ball: 'Ball', strike: 'Strike', called_strike: 'Called Strike', swinging_strike: 'Swinging Strike', foul: 'Foul',
};

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
  const { connected, gameState, lastEvent, isFinal, viewerCount } = useGameSocket(gameId, apiBase);

  // Re-fetch when new event arrives via WebSocket
  useEffect(() => {
    if (!lastEvent) return;
    Promise.all([
      fetch(`${apiBase}/api/public/games/${gameId}/events`).then(r => r.json()).catch(() => []),
      fetch(`${apiBase}/api/public/games/${gameId}/boxscore`).then(r => r.json()).catch(() => []),
      fetch(`${apiBase}/api/public/games/${gameId}/pitching-boxscore`).then(r => r.json()).catch(() => []),
    ]).then(([evts, box, pbox]) => {
      if (Array.isArray(evts)) setEvents(evts);
      if (Array.isArray(box)) setBattingBox(box);
      if (Array.isArray(pbox)) setPitchingBox(pbox);
    });
  }, [lastEvent, gameId, apiBase]);

  // Polling fallback: refresh every 8s for live games when WebSocket isn't connected
  useEffect(() => {
    const isLive = game?.status === 'live' && !isFinal;
    if (!isLive || connected) return;
    const interval = setInterval(async () => {
      try {
        const [gData, evts, box, pbox] = await Promise.all([
          fetch(`${apiBase}/api/public/games/${gameId}`).then(r => r.json()).catch(() => null),
          fetch(`${apiBase}/api/public/games/${gameId}/events`).then(r => r.json()).catch(() => []),
          fetch(`${apiBase}/api/public/games/${gameId}/boxscore`).then(r => r.json()).catch(() => []),
          fetch(`${apiBase}/api/public/games/${gameId}/pitching-boxscore`).then(r => r.json()).catch(() => []),
        ]);
        if (gData && typeof gData === 'object' && gData.id) setGame(gData);
        if (Array.isArray(evts)) setEvents(evts);
        if (Array.isArray(box)) setBattingBox(box);
        if (Array.isArray(pbox)) setPitchingBox(pbox);
      } catch {}
    }, 8000);
    return () => clearInterval(interval);
  }, [game?.status, isFinal, connected, apiBase, gameId]);

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
    const map: Record<number, { pa: number; ab: number; h: number; r: number; rbi: number; bb: number; so: number; hr: number; tb: number; hbp: number; sf: number }> = {};
    const getOrCreate = (id: number) => {
      if (!map[id]) map[id] = { pa: 0, ab: 0, h: 0, r: 0, rbi: 0, bb: 0, so: 0, hr: 0, tb: 0, hbp: 0, sf: 0 };
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
        if (evt.eventType === 'stolen_base' && evt.batterId) getOrCreate(evt.batterId);
        if (evt.eventType === 'caught_stealing' && evt.batterId) getOrCreate(evt.batterId);
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
    lineups.filter(l => l.teamId === game?.homeTeamId && l.isStarter && l.battingOrder > 0)
      .sort((a, b) => a.battingOrder - b.battingOrder), [lineups, game]);
  const awayLineup = useMemo(() =>
    lineups.filter(l => l.teamId === game?.awayTeamId && l.isStarter && l.battingOrder > 0)
      .sort((a, b) => a.battingOrder - b.battingOrder), [lineups, game]);

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
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-text-muted">Game not found</div>
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

  const renderBattingTable = (teamName: string, lineup: LineupEntry[], batting: BattingBoxScore[]) => {
    const battingMap: Record<number, BattingBoxScore> = {};
    for (const b of batting) battingMap[b.playerId] = b;

    const rows = lineup.length > 0 ? lineup : batting.map(b => ({
      playerId: b.playerId, teamId: b.teamId, battingOrder: 0, position: 0,
      isStarter: true, isActive: true, firstName: b.firstName, lastName: b.lastName,
    }));

    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">{teamName}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-white/30 border-b border-white/10">
                <th className="text-left py-1.5 pl-2 pr-1 w-8">#</th>
                <th className="text-left py-1.5 pr-2 min-w-[100px]">Player</th>
                <th className="text-center px-1 w-8">Pos</th>
                <th className="text-center px-1 w-8">AB</th>
                <th className="text-center px-1 w-8">R</th>
                <th className="text-center px-1 w-8">H</th>
                <th className="text-center px-1 w-8">RBI</th>
                <th className="text-center px-1 w-8">BB</th>
                <th className="text-center px-1 w-8">SO</th>
                <th className="text-center px-1 w-8">HR</th>
                <th className="text-center px-1 w-10 text-cyan-400/70">AVG</th>
                <th className="text-center px-1 w-10 text-cyan-400/70">OPS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const box = battingMap[p.playerId];
                const live = liveBattingMap[p.playerId];
                const ab = box?.atBats ?? live?.ab ?? 0;
                const h = box?.hits ?? live?.h ?? 0;
                const r = box?.runs ?? live?.r ?? 0;
                const rbi = box?.rbi ?? live?.rbi ?? 0;
                const bb = box?.walks ?? live?.bb ?? 0;
                const so = box?.strikeouts ?? live?.so ?? 0;
                const hr = box?.homeRuns ?? live?.hr ?? 0;
                const hbp = live?.hbp ?? 0;
                const sf = live?.sf ?? 0;
                const tb = live?.tb ?? (box ? (box.singles || 0) + (box.doubles || 0) * 2 + (box.triples || 0) * 3 + (box.homeRuns || 0) * 4 : 0);
                // Season + this game combined AVG/OPS
                const season = seasonBattingMap[p.playerId];
                const combinedAb = (season?.atBats ?? 0) + ab;
                const combinedH = (season?.hits ?? 0) + h;
                const combinedBb = (season?.walks ?? 0) + bb;
                const combinedHbp = (season?.hitByPitch ?? 0) + hbp;
                const combinedSf = (season?.sacrificeFlies ?? 0) + sf;
                const combinedTb = (season?.totalBases ?? 0) + tb;
                const displayAvg = fmtAvg(combinedH, combinedAb);
                const displayOps = fmtOps(combinedH, combinedAb, combinedBb, combinedHbp, combinedSf, combinedTb);
                return (
                  <tr key={p.playerId} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="py-1.5 pl-2 pr-1 text-white/30 font-mono">{p.battingOrder || i + 1}</td>
                    <td className="py-1.5 pr-2 text-white font-medium">{p.firstName?.charAt(0)}. {p.lastName}</td>
                    <td className="text-center text-white/40">{POS_LABELS[p.position] || '—'}</td>
                    <td className="text-center text-white/70 font-mono">{ab}</td>
                    <td className="text-center text-white/70 font-mono">{r}</td>
                    <td className={`text-center font-mono ${h > 0 ? 'text-white font-bold' : 'text-white/70'}`}>{h}</td>
                    <td className={`text-center font-mono ${rbi > 0 ? 'text-white font-bold' : 'text-white/70'}`}>{rbi}</td>
                    <td className="text-center text-white/70 font-mono">{bb}</td>
                    <td className="text-center text-white/70 font-mono">{so}</td>
                    <td className={`text-center font-mono ${hr > 0 ? 'text-amber-400 font-bold' : 'text-white/70'}`}>{hr}</td>
                    <td className="text-center text-cyan-400/80 font-mono text-[10px] font-semibold">{displayAvg}</td>
                    <td className="text-center text-cyan-400/80 font-mono text-[10px] font-semibold">{displayOps}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 text-white/50 font-bold">
                <td className="py-1.5 pl-2" colSpan={3}>Totals</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.atBats ?? liveBattingMap[p.playerId]?.ab ?? 0), 0)}</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.runs ?? liveBattingMap[p.playerId]?.r ?? 0), 0)}</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.hits ?? liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.rbi ?? liveBattingMap[p.playerId]?.rbi ?? 0), 0)}</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.walks ?? liveBattingMap[p.playerId]?.bb ?? 0), 0)}</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.strikeouts ?? liveBattingMap[p.playerId]?.so ?? 0), 0)}</td>
                <td className="text-center font-mono">{rows.reduce((s, p) => s + (battingMap[p.playerId]?.homeRuns ?? liveBattingMap[p.playerId]?.hr ?? 0), 0)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const renderPitchingTable = (teamName: string, pitchers: PitchingBoxScore[]) => {
    if (pitchers.length === 0) return null;
    return (
      <div className="mb-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">{teamName} — Pitching</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-white/30 border-b border-white/10">
                <th className="text-left py-1.5 pl-2 min-w-[100px]">Pitcher</th>
                <th className="text-center px-1 w-8">Dec</th>
                <th className="text-center px-1 w-8">IP</th>
                <th className="text-center px-1 w-8">H</th>
                <th className="text-center px-1 w-8">R</th>
                <th className="text-center px-1 w-8">ER</th>
                <th className="text-center px-1 w-8">BB</th>
                <th className="text-center px-1 w-8">K</th>
                <th className="text-center px-1 w-8">HR</th>
                <th className="text-center px-1 w-10">NP</th>
                <th className="text-center px-1 w-8">B</th>
                <th className="text-center px-1 w-8">S</th>
                <th className="text-center px-1 w-10 text-amber-400/50">ERA</th>
              </tr>
            </thead>
            <tbody>
              {pitchers.map((p, i) => {
                const season = seasonPitchingMap[p.playerId];
                const dec = p.decision === 'W' ? 'W' : p.decision === 'L' ? 'L' : p.decision === 'S' ? 'S' : '';
                return (
                  <tr key={p.playerId} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="py-1.5 pl-2 text-white font-medium">{p.firstName?.charAt(0)}. {p.lastName}</td>
                    <td className={`text-center font-bold ${dec === 'W' ? 'text-emerald-400' : dec === 'L' ? 'text-red-400' : dec === 'S' ? 'text-blue-400' : 'text-white/30'}`}>{dec || '—'}</td>
                    <td className="text-center text-white/70 font-mono">{p.inningsPitched}</td>
                    <td className="text-center text-white/70 font-mono">{p.hits}</td>
                    <td className="text-center text-white/70 font-mono">{p.runs}</td>
                    <td className="text-center text-white/70 font-mono">{p.earnedRuns}</td>
                    <td className="text-center text-white/70 font-mono">{p.walks}</td>
                    <td className="text-center text-white/70 font-mono">{p.strikeouts}</td>
                    <td className="text-center text-white/70 font-mono">{p.homeRuns}</td>
                    <td className="text-center text-white/50 font-mono">{p.pitchesThrown ?? '—'}</td>
                    <td className="text-center text-white/50 font-mono">{p.balls ?? '—'}</td>
                    <td className="text-center text-white/50 font-mono">{p.strikes ?? '—'}</td>
                    <td className="text-center text-amber-400/60 font-mono text-[10px]">{season?.era ? Number(season.era).toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <div className="bg-primary-light border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/schedule" className="text-sm text-white/40 hover:text-white transition-colors">← Schedule</Link>
          <div className="flex items-center gap-2">
            {status === 'live' && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-live/20 text-live text-[10px] font-bold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                Live
              </span>
            )}
            {status === 'final' && (
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[10px] font-bold uppercase">Final</span>
            )}
            {connected && status === 'live' && (
              <span className="text-[10px] text-green-400">Connected</span>
            )}
            {viewerCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-white/40">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {viewerCount} watching
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* Scoreboard */}
        <div className="bg-primary-light rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            {/* Away */}
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Away</div>
                <div className="text-base font-bold text-white">{game.awayTeamName}</div>
              </div>
              <div className="text-4xl font-bold font-mono text-white">{displayScore.away}</div>
            </div>

            {/* Inning + Bases + Outs */}
            <div className="flex flex-col items-center gap-2">
              {status === 'live' ? (
                <div className="text-xl font-bold text-white">{displayHalf === 'top' ? '▲' : '▼'} {displayInning}</div>
              ) : (
                <div className="text-sm font-bold text-white/40 uppercase">{status}</div>
              )}
              {status === 'live' && (
                <>
                  <svg viewBox="0 0 50 50" className="w-10 h-10">
                    <rect x="19" y="2" width="12" height="12" rx="1.5" transform="rotate(45 25 8)"
                      fill={displayBases.second ? '#22c55e' : 'rgba(255,255,255,0.1)'} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                    <rect x="35" y="18" width="12" height="12" rx="1.5" transform="rotate(45 41 24)"
                      fill={displayBases.first ? '#22c55e' : 'rgba(255,255,255,0.1)'} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                    <rect x="3" y="18" width="12" height="12" rx="1.5" transform="rotate(45 9 24)"
                      fill={displayBases.third ? '#22c55e' : 'rgba(255,255,255,0.1)'} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                  </svg>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className={`w-3 h-3 rounded-full border ${i < displayOuts ? 'bg-amber-500 border-amber-400' : 'border-white/20'}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Home */}
            <div className="flex items-center gap-3">
              <div className="text-4xl font-bold font-mono text-white">{displayScore.home}</div>
              <div className="text-right">
                <div className="text-[10px] text-white/30 uppercase tracking-wider">Home</div>
                <div className="text-base font-bold text-white">{game.homeTeamName}</div>
              </div>
            </div>
          </div>

          {/* Line score */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[10px] font-mono max-w-xl mx-auto">
              <thead>
                <tr className="text-white/25">
                  <th className="text-left px-1 w-16"></th>
                  {Array.from({ length: maxInnings }, (_, i) => (
                    <th key={i} className="text-center w-5">{i + 1}</th>
                  ))}
                  <th className="text-center w-6 border-l border-white/10 font-bold">R</th>
                  <th className="text-center w-6 font-bold">H</th>
                  <th className="text-center w-6 font-bold">E</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-white/50 px-1 font-semibold text-[11px]">{game.awayTeamName?.slice(0, 5)}</td>
                  {Array.from({ length: maxInnings }, (_, i) => {
                    const hasVal = i < awayLineScore.length;
                    const isCurrent = status === 'live' && i + 1 === displayInning && displayHalf === 'top';
                    const isFuture = i + 1 > Math.max(awayLineScore.length, homeLineScore.length);
                    return (
                      <td key={i} className={`text-center ${isCurrent ? 'text-live font-bold' : hasVal ? 'text-white/60' : 'text-white/15'}`}>
                        {hasVal ? awayLineScore[i] : (isCurrent ? '•' : isFuture ? '' : '')}
                      </td>
                    );
                  })}
                  <td className="text-center font-bold text-white border-l border-white/10">{displayScore.away}</td>
                  <td className="text-center text-white/60">{awayBatting.reduce((s, b) => s + (b.hits || 0), 0) || awayLineup.reduce((s, p) => s + (liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                  <td className="text-center text-white/60">{errorCounts.away}</td>
                </tr>
                <tr>
                  <td className="text-white/50 px-1 font-semibold text-[11px]">{game.homeTeamName?.slice(0, 5)}</td>
                  {Array.from({ length: maxInnings }, (_, i) => {
                    const hasVal = i < homeLineScore.length;
                    const isCurrent = status === 'live' && i + 1 === displayInning && displayHalf === 'bot';
                    // If it's top of this inning, home hasn't batted — show empty, not 0
                    const isTopOfThis = status === 'live' && i + 1 === displayInning && displayHalf === 'top';
                    const isFuture = i + 1 > Math.max(awayLineScore.length, homeLineScore.length);
                    return (
                      <td key={i} className={`text-center ${isCurrent ? 'text-live font-bold' : hasVal ? 'text-white/60' : 'text-white/15'}`}>
                        {hasVal ? homeLineScore[i] : (isCurrent ? '•' : (isTopOfThis || isFuture) ? '' : '')}
                      </td>
                    );
                  })}
                  <td className="text-center font-bold text-white border-l border-white/10">{displayScore.home}</td>
                  <td className="text-center text-white/60">{homeBatting.reduce((s, b) => s + (b.hits || 0), 0) || homeLineup.reduce((s, p) => s + (liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                  <td className="text-center text-white/60">{errorCounts.home}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-primary-light rounded-lg border border-white/10 p-1">
          {([
            { key: 'plays' as Tab, label: 'Play-by-Play' },
            { key: 'boxscore' as Tab, label: 'Box Score' },
            { key: 'pitching' as Tab, label: 'Pitching' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-bold uppercase rounded transition-colors ${tab === t.key ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-primary-light rounded-xl border border-white/10 p-4">
          {/* PLAY-BY-PLAY */}
          {tab === 'plays' && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">Play-by-Play</h3>
              {loading ? (
                <p className="text-white/20 text-sm">Loading...</p>
              ) : groupedAtBats.length === 0 ? (
                <p className="text-white/20 text-sm">No plays recorded yet</p>
              ) : (
                <div className="space-y-5">
                  {groupedAtBats.map(group => (
                    <div key={group.key}>
                      {/* Inning header */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-xs font-bold text-white/60 bg-white/5 rounded px-2 py-1">
                          {group.half === 'top' ? '▲' : '▼'} {group.inning}{group.inning === 1 ? 'st' : group.inning === 2 ? 'nd' : group.inning === 3 ? 'rd' : 'th'}
                        </div>
                        <div className="text-[10px] text-white/30">
                          {group.half === 'top' ? game.awayTeamName : game.homeTeamName} batting
                        </div>
                        <div className="flex-1 border-t border-white/5" />
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

                            let borderClass = 'border-l-2 border-white/5';
                            if (result && result.runsScored > 0) borderClass = 'border-l-2 border-emerald-500';
                            else if (isHit) borderClass = 'border-l-2 border-blue-500';
                            else if (isOut) borderClass = 'border-l-2 border-red-500/40';
                            else if (isWalk) borderClass = 'border-l-2 border-emerald-400/50';
                            else if (isRunnerOnly) borderClass = 'border-l-2 border-amber-500/50';

                            const formatted = result
                              ? formatPlayByPlay(result, { outsBefore: outsAfter - (result.outsRecorded ?? 0), outsAfter })
                              : null;

                            return (
                              <div key={`ab-${abIdx}`} className={`${borderClass} pl-3 py-2 rounded-r`}>
                                {/* Title line — human-readable play description */}
                                {formatted ? (
                                  <div className="text-[13px] leading-snug text-white/90">{formatted.title}</div>
                                ) : ab.pitches.length > 0 ? (
                                  <div className="text-[13px] leading-snug text-white/50 italic">{ab.batterName} at bat…</div>
                                ) : null}

                                {/* Subtitle — pitcher + state */}
                                {formatted && formatted.subtitle && (
                                  <div className="text-[10px] text-white/30 mt-0.5">{formatted.subtitle}</div>
                                )}

                                {/* State chips — outs + bases + RBI */}
                                {formatted && formatted.chips.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {formatted.chips.map((chip, ci) => {
                                      let chipClass = 'bg-white/5 text-white/40';
                                      if (chip.includes('out')) chipClass = 'bg-red-900/15 text-red-400/50';
                                      else if (chip.includes('RBI')) chipClass = 'bg-emerald-900/20 text-emerald-400/70';
                                      else chipClass = 'bg-amber-900/15 text-amber-400/60';
                                      return (
                                        <span key={ci} className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${chipClass}`}>
                                          {chip}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Pitch sequence */}
                                {ab.pitches.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {(() => {
                                      let b = 0, s = 0;
                                      return ab.pitches.map((p, pi) => {
                                        const detail = (p.eventDetail || '').toLowerCase();
                                        if (detail === 'ball') b++;
                                        else if (detail === 'foul') { if (s < 2) s++; }
                                        else if (detail === 'strike' || detail === 'called_strike' || detail === 'swinging_strike') s++;
                                        const label = PITCH_LABELS[detail] || detail;
                                        const isBall = detail === 'ball';
                                        const isStrike = detail.includes('strike');
                                        return (
                                          <span key={pi} className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${isBall ? 'bg-green-900/30 text-green-400/70' : isStrike ? 'bg-red-900/20 text-red-400/60' : 'bg-yellow-900/20 text-yellow-400/60'}`}>
                                            {label} {b}-{s}
                                          </span>
                                        );
                                      });
                                    })()}
                                  </div>
                                )}

                                {/* Runner events during at-bat — also formatted */}
                                {ab.betweenEvents.map((re, rei) => {
                                  const reFormatted = formatPlayByPlay(re);
                                  return (
                                    <div key={`re-${rei}`} className="text-[11px] text-amber-400/70 mt-1 ml-1 flex items-start gap-1.5">
                                      <span className="text-amber-500 mt-px">◆</span>
                                      <div>
                                        <span>{reFormatted.title}</span>
                                        {re.outsRecorded > 0 && <span className="text-red-400/60 ml-1">({re.outsRecorded} out)</span>}
                                      </div>
                                    </div>
                                  );
                                })}
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">Box Score</h3>
              <div className="text-[9px] text-white/20 mb-4 flex gap-3">
                <span>Game stats in white</span>
                <span className="text-cyan-400/50">AVG/OPS computed from this game</span>
              </div>
              {renderBattingTable(game.awayTeamName, awayLineup, awayBatting)}
              {renderBattingTable(game.homeTeamName, homeLineup, homeBatting)}
            </div>
          )}

          {/* PITCHING */}
          {tab === 'pitching' && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/30 mb-3">Pitching</h3>
              <div className="text-[9px] text-white/20 mb-4 flex gap-3">
                <span>Game stats in white</span>
                <span className="text-amber-400/40">Season ERA in gold</span>
              </div>
              {renderPitchingTable(game.awayTeamName, awayPitching)}
              {renderPitchingTable(game.homeTeamName, homePitching)}
              {awayPitching.length === 0 && homePitching.length === 0 && (
                <p className="text-white/20 text-sm">No pitching data yet</p>
              )}
            </div>
          )}
        </div>

        {/* Game info footer */}
        <div className="text-center text-xs text-white/20 space-y-0.5 pb-8">
          {game.venue && <p>{game.venue}</p>}
          <p>{new Date(game.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    </div>
  );
}
