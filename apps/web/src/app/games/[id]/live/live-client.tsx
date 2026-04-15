'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useGameSocket } from '@/hooks/useGameSocket';
import { formatPlayByPlay } from '@/lib/format-play';
import { useApiBase } from '@/lib/api-context';
import { getStatAbbreviationMeaning } from '@/lib/stat-abbreviations';
import { aggregatePitchingStatsByPitcher, inningsFromOuts } from '@lbss/shared';
import { normalizeGameEvents, tryExtractEventArray } from '@/lib/normalize-game-events';

/** Fetch a JSON array from the public proxy; returns null on non-OK or parse errors so callers do not replace state with []. */
async function fetchPublicJsonArray(url: string): Promise<any[] | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const data = await r.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Game events: accept array or `{ events: [...] }`; null on malformed HTTP response. */
async function fetchPublicGameEvents(gameId: number): Promise<any[] | null> {
  try {
    const r = await fetch(`/api/proxy/public/games/${gameId}/events`, { cache: 'no-store' });
    if (!r.ok) return null;
    const data = await r.json();
    return tryExtractEventArray(data);
  } catch {
    return null;
  }
}

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
  adjust_score: 'Score adjustment',
};

const RUNNER_EVENT_TYPES = new Set([
  'stolen_base', 'caught_stealing', 'picked_off', 'wild_pitch', 'passed_ball',
  'balk', 'advance', 'advance_on_error', 'defensive_indifference',
  'runner_interference', 'appeal_play', 'tagged_out', 'force_out',
  'hit_by_ball', 'missed_base', 'left_base_early', 'left_base_path',
  'offensive_interference', 'passed_runner', 'hesitation',
  /** Not double_play / triple_play — those close the at-bat as the plate appearance result (GIDP, etc.). */
  'illegal_pitch',
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
  homeTeamShortName?: string | null;
  awayTeamShortName?: string | null;
  homeTeamLogoUrl?: string | null;
  awayTeamLogoUrl?: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
  currentInning: number;
  currentHalf: string;
  currentOuts: number;
  venue: string;
  scheduledAt: string;
}

function ScoreboardTeamLogo({
  name,
  shortName,
  logoUrl,
}: {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
}) {
  const wrap = 'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:h-[4.5rem] sm:w-[4.5rem]';
  if (logoUrl) {
    return <img src={logoUrl} alt={name} className={`${wrap} object-contain`} />;
  }
  const abbr = shortName?.trim()
    || (name.length <= 3
      ? name.toUpperCase()
      : name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase());
  return (
    <div className={`${wrap} bg-slate-50`} aria-hidden>
      <span className="text-center text-[11px] font-bold leading-none tracking-tight text-slate-600 sm:text-xs">{abbr}</span>
    </div>
  );
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
  runnerScoredReasons?: string[] | null;
  errorsOnPlay?: number | null;
  hitType?: string | null;
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
  const [events, setEvents] = useState<GameEvent[]>(() => normalizeGameEvents(initialEvents) as GameEvent[]);
  const [lineups, setLineups] = useState<LineupEntry[]>(initialLineups);
  const [battingBox, setBattingBox] = useState<BattingBoxScore[]>(initialBatting);
  const [pitchingBox, setPitchingBox] = useState<PitchingBoxScore[]>(initialPitching);
  const [seasonCtx, setSeasonCtx] = useState<SeasonContext>(initialSeasonCtx);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('plays');
  const [playMode, setPlayMode] = useState<'compact' | 'expanded'>('compact');
  const [openPitchCards, setOpenPitchCards] = useState<Record<string, boolean>>({});
  const { connected, gameState, lastEvent, isFinal, viewerCount } = useGameSocket(gameId, apiBase);

  /** Always refetch events in the browser — fixes SSR when the server cannot reach the API (common on Vercel). */
  useEffect(() => {
    let cancelled = false;
    fetchPublicGameEvents(gameId).then((evts) => {
      if (cancelled || evts === null) return;
      setEvents(normalizeGameEvents(evts) as GameEvent[]);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  /** While WebSocket is connected we disable polling; refresh once on connect so PBP isn't stuck empty until the next live pitch. */
  useEffect(() => {
    if (!connected) return;
    Promise.all([
      fetchPublicGameEvents(gameId),
      fetchPublicJsonArray(`/api/proxy/public/games/${gameId}/boxscore`),
      fetchPublicJsonArray(`/api/proxy/public/games/${gameId}/pitching-boxscore`),
    ]).then(([evts, box, pbox]) => {
      if (evts !== null) setEvents(normalizeGameEvents(evts) as GameEvent[]);
      if (box !== null) setBattingBox(box);
      if (pbox !== null) setPitchingBox(pbox);
    });
  }, [connected, gameId]);

  // Re-fetch when new event arrives via WebSocket
  useEffect(() => {
    if (!lastEvent) return;
    Promise.all([
      fetchPublicGameEvents(gameId),
      fetchPublicJsonArray(`/api/proxy/public/games/${gameId}/boxscore`),
      fetchPublicJsonArray(`/api/proxy/public/games/${gameId}/pitching-boxscore`),
    ]).then(([evts, box, pbox]) => {
      if (evts !== null) setEvents(normalizeGameEvents(evts) as GameEvent[]);
      if (box !== null) setBattingBox(box);
      if (pbox !== null) setPitchingBox(pbox);
    });
  }, [lastEvent, gameId]);

  // Polling: live games when disconnected, OR still no events while connected (recover stuck empty PBP)
  useEffect(() => {
    const isLive = game?.status === 'live' && !isFinal;
    if (!isLive) return;
    if (connected && events.length > 0) return;
    const interval = setInterval(async () => {
      try {
        const [gData, evts, box, pbox] = await Promise.all([
          fetch(`/api/proxy/public/games/${gameId}`)
            .then(async r => (r.ok ? r.json() : null))
            .catch(() => null),
          fetchPublicGameEvents(gameId),
          fetchPublicJsonArray(`/api/proxy/public/games/${gameId}/boxscore`),
          fetchPublicJsonArray(`/api/proxy/public/games/${gameId}/pitching-boxscore`),
        ]);
        if (gData && typeof gData === 'object' && gData.id) setGame(gData);
        if (evts !== null) setEvents(normalizeGameEvents(evts) as GameEvent[]);
        if (box !== null) setBattingBox(box);
        if (pbox !== null) setPitchingBox(pbox);
      } catch {}
    }, 8000);
    return () => clearInterval(interval);
  }, [game?.status, isFinal, connected, gameId, events.length]);

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
      if (e.eventType === 'adjust_score') {
        let detail: { homeDelta?: number; awayDelta?: number } = {};
        try {
          detail = JSON.parse(e.eventDetail || '{}') as typeof detail;
        } catch { /* ignore */ }
        const hd = Number(detail.homeDelta) || 0;
        const ad = Number(detail.awayDelta) || 0;
        const idx = e.inning - 1;
        if (hd !== 0) {
          while (home.length <= idx) home.push(0);
          home[idx] += hd;
        }
        if (ad !== 0) {
          while (away.length <= idx) away.push(0);
          away[idx] += ad;
        }
        continue;
      }
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

      if (evt.eventType === 'adjust_score') {
        group.atBats.push({
          batterId: null,
          batterName: 'Score correction',
          result: evt,
          pitches: [],
          betweenEvents: [],
          inning: evt.inning,
          half: evt.half,
        });
        currentAB = null;
        continue;
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
          group.atBats.push({
            batterId: evt.batterId,
            batterName: evt.batterName || 'Unknown',
            result: null,
            pitches: [],
            betweenEvents: [evt],
            inning: evt.inning,
            half: evt.half,
          });
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
      if (evt.eventType === 'end_half_inning' || evt.eventType === 'pitch' || evt.eventType === 'adjust_score') continue;
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

  // Build live pitching stats from events (same R/ER rules as finalizeGame — @lbss/shared)
  const livePitchingMap = useMemo(() => {
    const agg = aggregatePitchingStatsByPitcher(
      events.map(e => ({
        eventNumber: e.eventNumber,
        eventType: e.eventType,
        inning: e.inning,
        half: e.half,
        pitcherId: e.pitcherId,
        runsScored: e.runsScored,
        outsRecorded: e.outsRecorded,
        runnerScoredReasons: e.runnerScoredReasons ?? null,
        errorsOnPlay: e.errorsOnPlay ?? null,
        eventDetail: e.eventDetail,
        hitType: e.hitType ?? null,
      })),
    );
    const map: Record<number, { ip: number; outs: number; h: number; r: number; er: number; bb: number; k: number; hr: number; np: number; balls: number; strikes: number; teamId: number }> = {};
    for (const [pid, a] of agg) {
      const pLineup = lineups.find(l => l.playerId === pid);
      const outs = a.outsRecorded;
      map[pid] = {
        ip: inningsFromOuts(outs),
        outs,
        h: a.hitsAllowed,
        r: a.runsAllowed,
        er: a.earnedRuns,
        bb: a.walksAllowed,
        k: a.strikeouts,
        hr: a.homeRunsAllowed,
        np: a.pitchesThrown,
        balls: a.balls,
        strikes: a.strikes,
        teamId: pLineup?.teamId ?? 0,
      };
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
    if (t === 'adjust_score') {
      return { tag: 'NOTE', cls: 'text-slate-500' };
    }
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
      .filter(e => e.eventType !== 'pitch' && e.eventType !== 'end_half_inning' && e.eventType !== 'adjust_score')
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
      <div className="mb-8">
        <h4 className="mb-3 text-sm font-semibold text-slate-800">{teamName}</h4>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[920px] text-[11px] whitespace-nowrap font-mono">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-600">
                  <th className="py-2 pl-3 pr-1 text-left text-[10px] font-semibold uppercase tracking-wide">#</th>
                  <th className="min-w-[90px] py-2 pr-2 text-left text-[10px] font-semibold uppercase tracking-wide">Player</th>
                  <th className="w-7 px-0.5 py-2 text-center text-[10px] font-semibold uppercase tracking-wide">Pos</th>
                  {['PA','AB','R','H','2B','3B','HR','RBI','BB','HBP','SO','Kc','Ks','SB','CS','SF','SH','BU','GDP','FC','CI','AVG','OPS'].map((h) => (
                    <th key={h} title={getStatAbbreviationMeaning(h) ?? undefined} className={`px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide ${h === 'AVG' || h === 'OPS' ? 'w-9 text-slate-700' : 'w-8'}`}>
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
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80';
                return (
                  <tr key={p.playerId} className={`border-b border-slate-100 last:border-0 ${rowBg}`}>
                    <td className="py-2 pl-3 pr-1 text-slate-500">{p.isStarter ? (p.battingOrder || i + 1) : ''}</td>
                    <td className={`py-2 pr-2 font-sans text-slate-900 ${p.isStarter ? 'font-medium' : 'pl-4 text-slate-700'}`}>
                      {p.isStarter ? '' : '↳ '}
                      {p.firstName?.charAt(0)}. {p.lastName}
                    </td>
                    <td className="text-center text-slate-500">{POS_LABELS[p.position] || '—'}</td>
                    <td className="text-center font-mono text-slate-800">{pa}</td>
                    <td className="text-center font-mono text-slate-800">{ab}</td>
                    <td className="text-center font-mono text-slate-800">{r}</td>
                    <td className={`text-center font-mono ${h > 0 ? 'font-bold text-slate-900' : 'text-slate-800'}`}>{h}</td>
                    <td className="text-center font-mono text-slate-800">{dbl}</td>
                    <td className="text-center font-mono text-slate-800">{trp}</td>
                    <td className={`text-center font-mono ${hr > 0 ? 'font-bold text-amber-800' : 'text-slate-800'}`}>{hr}</td>
                    <td className={`text-center font-mono ${rbi > 0 ? 'font-bold text-slate-900' : 'text-slate-800'}`}>{rbi}</td>
                    <td className="text-center font-mono text-slate-800">{bb}</td>
                    <td className="text-center font-mono text-slate-800">{hbp}</td>
                    <td className="text-center font-mono text-slate-800">{so}</td>
                    <td className="text-center font-mono text-slate-600">{kc}</td>
                    <td className="text-center font-mono text-slate-600">{ks}</td>
                    <td className="text-center font-mono text-slate-800">{sb}</td>
                    <td className="text-center font-mono text-slate-800">{cs}</td>
                    <td className="text-center font-mono text-slate-800">{sf}</td>
                    <td className="text-center font-mono text-slate-800">{sac}</td>
                    <td className="text-center font-mono text-slate-800">{b}</td>
                    <td className="text-center font-mono text-slate-800">{gdp}</td>
                    <td className="text-center font-mono text-slate-800">{fc}</td>
                    <td className="text-center font-mono text-slate-800">{ci}</td>
                    <td className="text-center font-mono text-[10px] text-slate-800">{displayAvg}</td>
                    <td className="text-center font-mono text-[10px] text-slate-800">{displayOps}</td>
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
                  <tr className="border-t-2 border-slate-200 bg-slate-100 font-semibold text-slate-900">
                    <td className="py-2 pl-3" colSpan={3}>Totals</td>
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
        </div>
        {(battingNotes.length > 0 || lob > 0) && (
          <div className="mt-2 text-[10px] text-slate-600">
            <span className="font-semibold text-slate-700">Batting notes:</span>{' '}
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
    if (detail === 'in_play') return 'X';
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
    <svg viewBox="0 0 50 50" className="w-10 h-10 shrink-0 drop-shadow-sm" aria-label="Runners on base">
      <rect x="19" y="2" width="12" height="12" rx="1.5" transform="rotate(45 25 8)"
        fill={second ? '#10b981' : '#f1f5f9'} stroke={second ? '#059669' : '#cbd5e1'} strokeWidth="1.25" />
      <rect x="35" y="18" width="12" height="12" rx="1.5" transform="rotate(45 41 24)"
        fill={first ? '#10b981' : '#f1f5f9'} stroke={first ? '#059669' : '#cbd5e1'} strokeWidth="1.25" />
      <rect x="3" y="18" width="12" height="12" rx="1.5" transform="rotate(45 9 24)"
        fill={third ? '#10b981' : '#f1f5f9'} stroke={third ? '#059669' : '#cbd5e1'} strokeWidth="1.25" />
    </svg>
  );

  const OutsIndicator = ({ outs }: { outs: number }) => {
    const o = Math.max(0, Math.min(3, outs));
    return (
      <div
        className="flex items-center justify-end gap-1"
        aria-label={`${o} out${o === 1 ? '' : 's'} after this play`}
        title="Outs in inning (after this play)"
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full border-2 transition-colors ${
              i < o
                ? 'border-red-600 bg-red-600 shadow-[0_0_0_1px_rgba(220,38,38,0.25)]'
                : 'border-slate-300 bg-white'
            }`}
          />
        ))}
      </div>
    );
  };

  const pitchSymbolTone = (s: 'B' | 'S' | 'F' | 'X' | 'P'): string => {
    switch (s) {
      case 'B':
        return 'text-emerald-600';
      case 'S':
        return 'text-red-600';
      case 'F':
        return 'text-amber-600';
      case 'X':
        return 'text-slate-800';
      case 'P':
        return 'text-slate-500';
    }
  };

  const PitchLetterStrip = ({ symbols, max = 24 }: { symbols: ('B' | 'S' | 'F' | 'X' | 'P')[]; max?: number }) => {
    const truncated = symbols.length > max;
    const slice = truncated ? symbols.slice(0, max) : symbols;
    return (
      <span className="font-mono text-[11px] font-semibold tracking-[0.2em] inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {slice.map((s, i) => (
          <span key={i} className={pitchSymbolTone(s)}>
            {s}
          </span>
        ))}
        {truncated && <span className="text-gray-400 font-normal tracking-normal">…</span>}
      </span>
    );
  };

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

    if (!ab.result) {
      return { rows, finalCount: `${balls}-${strikes}` };
    }

    const r = ab.result;
    const title = formatPlayByPlay(r).title;
    const resultType = r.eventType;
    const n = pitchEventsSorted.length;

    const walkLike = new Set(['walk', 'intentional_walk', 'hit_by_pitch', 'catcher_obstruction']);
    const strikeoutLike = new Set([
      'strikeout', 'strikeout_swinging', 'strikeout_looking', 'caught_foul_tip', 'bunt_foul',
      'dropped_third_strike_out', 'dropped_third_strike', 'wild_pitch_third_strike',
    ]);
    const hitLike = new Set([
      'single', 'bunt_single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double',
    ]);
    const inPlayOutLike = new Set([
      'ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'foul_out', 'fielders_choice',
      'sacrifice_fly', 'sacrifice_bunt', 'infield_fly', 'double_play', 'triple_play',
      'error', 'sac_bunt_error', 'sac_fly_error', 'advance_on_error',
    ]);

    const replaceLastRow = (label: string) => {
      if (rows.length === 0) return;
      const last = rows[rows.length - 1];
      rows[rows.length - 1] = { ...last, label };
    };

    const appendRow = (pitchNo: number, label: string) => {
      rows.push({
        pitchNo,
        label,
        count: `${balls}-${strikes}`,
        runnerNotes: [],
      });
    };

    if (walkLike.has(resultType)) {
      if (n === 0) {
        appendRow(1, title);
      } else {
        const last = pitchEventsSorted[n - 1];
        const d = String(last.eventDetail || '').toLowerCase();
        const allBalls = pitchEventsSorted.every(p => String(p.eventDetail || '').toLowerCase() === 'ball');
        if (d === 'ball') {
          if (n === 3 && allBalls) {
            appendRow(4, title);
          } else {
            replaceLastRow(title);
          }
        } else {
          appendRow(n + 1, title);
        }
      }
    } else if (strikeoutLike.has(resultType)) {
      if (n === 0) {
        appendRow(1, title);
      } else {
        const last = pitchEventsSorted[n - 1];
        const d = String(last.eventDetail || '').toLowerCase();
        if (d === 'foul' || d === 'ball') {
          appendRow(n + 1, title);
        } else {
          replaceLastRow(title);
        }
      }
    } else if (hitLike.has(resultType) || inPlayOutLike.has(resultType) || resultType === 'error') {
      if (n === 0) {
        appendRow(1, title);
      } else {
        const last = pitchEventsSorted[n - 1];
        const d = String(last.eventDetail || '').toLowerCase();
        if (d === 'in_play' || d === 'swinging_strike' || d === 'strike' || d === 'called_strike') {
          replaceLastRow(title);
        } else {
          appendRow(n + 1, title);
        }
      }
    } else {
      appendRow(Math.max(1, n + 1), title);
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
    const pitchHeaders = ['Dec','IP','H','R','ER','BB','SO','Kc','Ks','HR','HBP','WP','BF','NP','B','S','%S','GSc','ERA','WHIP'] as const;
    const groupBorder = (h: string) =>
      ['IP','Kc','HR','BF','ERA'].includes(h) ? 'border-l border-slate-200' : '';
    const thWidth = (h: string) =>
      h === '%S' ? 'w-11' : h === 'ERA' || h === 'WHIP' ? 'min-w-[2.75rem]' : h === 'BF' || h === 'NP' || h === 'B' || h === 'S' ? 'min-w-[2.25rem]' : 'min-w-[2rem]';

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

    const pitchCell = (p: PitchingBoxScore, h: string) => {
      const dec = p.decision === 'W' ? 'W' : p.decision === 'L' ? 'L' : p.decision === 'S' ? 'S' : '';
      const era = gameEra(p.earnedRuns ?? 0, p.inningsPitched);
      const whip = gameWhip(p.hits ?? 0, p.walks ?? 0, p.inningsPitched);
      switch (h) {
        case 'Dec':
          return (
            <td
              key={h}
              className={`text-center font-semibold py-2.5 ${dec === 'W' ? 'text-emerald-700' : dec === 'L' ? 'text-rose-700' : dec === 'S' ? 'text-slate-800' : 'text-slate-400'}`}
            >
              {dec || '—'}
            </td>
          );
        case 'IP':
          return (
            <td key={h} className={`text-center text-slate-800 font-mono py-2.5 ${groupBorder(h)}`}>
              {p.inningsPitched}
            </td>
          );
        case 'H': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.hits}</td>;
        case 'R': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.runs}</td>;
        case 'ER': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.earnedRuns}</td>;
        case 'BB': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.walks}</td>;
        case 'SO': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.strikeouts}</td>;
        case 'Kc':
          return (
            <td key={h} className={`text-center text-slate-600 font-mono py-2.5 ${groupBorder(h)}`}>
              {p.strikeoutsLooking ?? '—'}
            </td>
          );
        case 'Ks': return <td key={h} className="text-center text-slate-600 font-mono py-2.5">{p.strikeoutsSwinging ?? '—'}</td>;
        case 'HR':
          return (
            <td key={h} className={`text-center text-slate-800 font-mono py-2.5 ${groupBorder(h)}`}>
              {p.homeRuns}
            </td>
          );
        case 'HBP': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.hitBatters ?? '—'}</td>;
        case 'WP': return <td key={h} className="text-center text-slate-800 font-mono py-2.5">{p.wildPitches ?? '—'}</td>;
        case 'BF':
          return (
            <td key={h} className={`text-center text-slate-600 font-mono py-2.5 ${groupBorder(h)}`}>
              {p.battersFaced ?? '—'}
            </td>
          );
        case 'NP': return <td key={h} className="text-center text-slate-600 font-mono py-2.5">{p.pitchesThrown ?? '—'}</td>;
        case 'B': return <td key={h} className="text-center text-slate-600 font-mono py-2.5">{p.balls ?? '—'}</td>;
        case 'S': return <td key={h} className="text-center text-slate-600 font-mono py-2.5">{p.strikes ?? '—'}</td>;
        case '%S': return <td key={h} className="text-center text-slate-600 font-mono py-2.5">{strikePct(p.balls, p.strikes)}</td>;
        case 'GSc': return <td key={h} className="text-center text-slate-600 font-mono py-2.5">{p.gameScore ?? '—'}</td>;
        case 'ERA':
          return (
            <td key={h} className={`text-center text-slate-900 font-mono text-[10px] py-2.5 ${groupBorder(h)}`}>
              {era}
            </td>
          );
        case 'WHIP': return <td key={h} className="text-center text-slate-900 font-mono text-[10px] py-2.5">{whip}</td>;
        default: return null;
      }
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

    const totalCell = (h: string) => {
      switch (h) {
        case 'Dec': return <td key={h} className="py-2.5" />;
        case 'IP': return <td key={h} className={`text-center font-mono py-2.5 ${groupBorder(h)}`}>{ipResult.display}</td>;
        case 'H': return <td key={h} className="text-center font-mono py-2.5">{tH}</td>;
        case 'R': return <td key={h} className="text-center font-mono py-2.5">{tR}</td>;
        case 'ER': return <td key={h} className="text-center font-mono py-2.5">{tER}</td>;
        case 'BB': return <td key={h} className="text-center font-mono py-2.5">{tBB}</td>;
        case 'SO': return <td key={h} className="text-center font-mono py-2.5">{tK}</td>;
        case 'Kc': return <td key={h} className={`text-center font-mono py-2.5 ${groupBorder(h)}`}>{tKc}</td>;
        case 'Ks': return <td key={h} className="text-center font-mono py-2.5">{tKs}</td>;
        case 'HR': return <td key={h} className={`text-center font-mono py-2.5 ${groupBorder(h)}`}>{tHR}</td>;
        case 'HBP': return <td key={h} className="text-center font-mono py-2.5">{tHBP}</td>;
        case 'WP': return <td key={h} className="text-center font-mono py-2.5">{tWP}</td>;
        case 'BF': return <td key={h} className={`text-center font-mono py-2.5 ${groupBorder(h)}`}>{tBF}</td>;
        case 'NP': return <td key={h} className="text-center font-mono py-2.5">{tNP}</td>;
        case 'B': return <td key={h} className="text-center font-mono py-2.5">{tBalls}</td>;
        case 'S': return <td key={h} className="text-center font-mono py-2.5">{tStrikes}</td>;
        case '%S': return <td key={h} className="text-center font-mono py-2.5">{strikePct(tBalls, tStrikes)}</td>;
        case 'GSc': return <td key={h} className="py-2.5" />;
        case 'ERA': return <td key={h} className={`text-center font-mono text-[10px] py-2.5 ${groupBorder(h)}`}>{tERA}</td>;
        case 'WHIP': return <td key={h} className="text-center font-mono text-[10px] py-2.5">{tWHIP}</td>;
        default: return null;
      }
    };

    return (
      <div className="mb-8">
        <h4 className="text-sm font-semibold text-slate-800 mb-3">{teamName}</h4>
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="min-w-[920px] w-full text-[11px] whitespace-nowrap font-mono">
              <thead>
                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <th className="sticky left-0 z-20 bg-slate-100 text-left py-2.5 pl-3 pr-2 min-w-[7.5rem] text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)]">
                    Pitcher
                  </th>
                  {pitchHeaders.map((h) => (
                    <th
                      key={h}
                      title={getStatAbbreviationMeaning(h) ?? undefined}
                      className={`text-center py-2.5 px-1.5 text-[10px] font-semibold uppercase tracking-wide ${groupBorder(h)} ${thWidth(h)}`}
                    >
                      {h === 'SO' ? 'K' : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pitchers.map((p, i) => {
                  const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/90';
                  return (
                    <tr key={p.playerId} className={`border-b border-slate-100 last:border-0 ${rowBg}`}>
                      <td className={`sticky left-0 z-10 py-2.5 pl-3 pr-2 text-slate-900 font-sans font-medium shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)] ${rowBg}`}>
                        {p.firstName?.charAt(0)}. {p.lastName}
                      </td>
                      {pitchHeaders.map((h) => pitchCell(p, h))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100 text-slate-900 font-semibold">
                  <td className="sticky left-0 z-10 bg-slate-100 py-2.5 pl-3 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)]">
                    Team totals
                  </td>
                  {pitchHeaders.map((h) => totalCell(h))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/schedule" className="text-sm text-slate-600 transition-colors hover:text-slate-900">← Schedule</Link>
          <div className="flex items-center gap-2">
            {status === 'live' && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-live/20 text-live text-[10px] font-bold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                Live
              </span>
            )}
            {status === 'final' && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Final</span>
            )}
            {connected && status === 'live' && (
              <span className="text-[10px] text-green-400">Connected</span>
            )}
            {viewerCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {viewerCount} watching
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
        {/* Scoreboard */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-50/80 to-white" />
          <div className="relative px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-5">
              {/* Main scores row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
                {/* Away */}
                <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
                  <ScoreboardTeamLogo
                    name={game.awayTeamName}
                    shortName={game.awayTeamShortName}
                    logoUrl={game.awayTeamLogoUrl}
                  />
                  <div className="min-w-0 text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Away</div>
                    <div className="truncate font-sans text-sm font-semibold leading-snug text-slate-900 sm:text-base">{game.awayTeamName}</div>
                  </div>
                  <div className="shrink-0 font-sans text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">{displayScore.away}</div>
                </div>

                {/* Inning / status + live widgets */}
                <div className="flex min-w-[5.5rem] flex-col items-center justify-center gap-1.5 px-1">
                  {status === 'live' ? (
                    <>
                      <div className="text-lg font-bold tabular-nums text-emerald-700 sm:text-xl">
                        {displayHalf === 'top' ? '▲' : '▼'} {displayInning}
                      </div>
                      <svg viewBox="0 0 50 50" className="h-9 w-9 sm:h-10 sm:w-10" aria-hidden>
                        <rect x="19" y="2" width="12" height="12" rx="1.5" transform="rotate(45 25 8)"
                          fill={displayBases.second ? '#059669' : '#e2e8f0'} stroke="#94a3b8" strokeWidth="1" />
                        <rect x="35" y="18" width="12" height="12" rx="1.5" transform="rotate(45 41 24)"
                          fill={displayBases.first ? '#059669' : '#e2e8f0'} stroke="#94a3b8" strokeWidth="1" />
                        <rect x="3" y="18" width="12" height="12" rx="1.5" transform="rotate(45 9 24)"
                          fill={displayBases.third ? '#059669' : '#e2e8f0'} stroke="#94a3b8" strokeWidth="1" />
                      </svg>
                      <div className="flex gap-1.5" aria-label={`${displayOuts} out${displayOuts === 1 ? '' : 's'}`}>
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className={`h-2.5 w-2.5 rounded-full border-2 ${
                              i < displayOuts ? 'border-amber-500 bg-amber-500' : 'border-slate-300 bg-white'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">
                      {status}
                    </span>
                  )}
                </div>

                {/* Home */}
                <div className="flex min-w-0 items-center justify-start gap-2 sm:gap-3">
                  <div className="shrink-0 font-sans text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">{displayScore.home}</div>
                  <div className="min-w-0 text-left">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Home</div>
                    <div className="truncate font-sans text-sm font-semibold leading-snug text-slate-900 sm:text-base">{game.homeTeamName}</div>
                  </div>
                  <ScoreboardTeamLogo
                    name={game.homeTeamName}
                    shortName={game.homeTeamShortName}
                    logoUrl={game.homeTeamLogoUrl}
                  />
                </div>
              </div>

              {/* Line score */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/80 px-1 py-2 sm:px-3">
                <table className="w-full min-w-[20rem] table-fixed text-xs font-mono text-slate-800 sm:text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="w-[40%] min-w-[0] py-1.5 pl-2 pr-1 text-left align-bottom font-sans text-[10px] font-semibold uppercase tracking-wide sm:w-[36%]">Team</th>
                      {Array.from({ length: maxInnings }, (_, i) => (
                        <th key={i} className="w-[2.25rem] px-0 py-1.5 text-center font-medium tabular-nums sm:w-10">{i + 1}</th>
                      ))}
                      <th className="w-8 border-l border-slate-200 py-1.5 text-center font-bold text-slate-800 sm:w-9">R</th>
                      <th className="w-8 py-1.5 text-center font-bold text-slate-800 sm:w-9">H</th>
                      <th className="w-8 py-1.5 text-center font-bold text-slate-800 sm:w-9">E</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200/80 bg-white">
                      <td className="text-left align-middle px-2 py-2 font-sans text-[11px] font-semibold leading-snug text-slate-900 sm:text-xs sm:leading-tight">{game.awayTeamName}</td>
                  {Array.from({ length: maxInnings }, (_, i) => {
                    const hasVal = i < awayLineScore.length;
                    const isCurrent = status === 'live' && i + 1 === displayInning && displayHalf === 'top';
                    const isFuture = i + 1 > Math.max(awayLineScore.length, homeLineScore.length);
                    return (
                      <td key={i} className={`py-2 text-center tabular-nums ${isCurrent ? 'text-live font-bold' : hasVal ? 'text-slate-800' : 'text-slate-400'}`}>
                        {hasVal ? awayLineScore[i] : (isCurrent ? '•' : isFuture ? '' : '')}
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-200 py-2 text-center text-base font-bold tabular-nums text-slate-900">{displayScore.away}</td>
                  <td className="py-2 text-center tabular-nums text-slate-700">{awayBatting.reduce((s, b) => s + (b.hits || 0), 0) || awayLineup.reduce((s, p) => s + (liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                  <td className="py-2 text-center tabular-nums text-slate-700">{errorCounts.away}</td>
                </tr>
                <tr className="border-t border-slate-200/80 bg-white">
                  <td className="text-left align-middle px-2 py-2 font-sans text-[11px] font-semibold leading-snug text-slate-900 sm:text-xs sm:leading-tight">{game.homeTeamName}</td>
                  {Array.from({ length: maxInnings }, (_, i) => {
                    const hasVal = i < homeLineScore.length;
                    const isCurrent = status === 'live' && i + 1 === displayInning && displayHalf === 'bot';
                    // If it's top of this inning, home hasn't batted — show empty, not 0
                    const isTopOfThis = status === 'live' && i + 1 === displayInning && displayHalf === 'top';
                    const isFuture = i + 1 > Math.max(awayLineScore.length, homeLineScore.length);
                    return (
                      <td key={i} className={`py-2 text-center tabular-nums ${isCurrent ? 'text-live font-bold' : hasVal ? 'text-slate-800' : 'text-slate-400'}`}>
                        {hasVal ? homeLineScore[i] : (isCurrent ? '•' : (isTopOfThis || isFuture) ? '' : '')}
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-200 py-2 text-center text-base font-bold tabular-nums text-slate-900">{displayScore.home}</td>
                  <td className="py-2 text-center tabular-nums text-slate-700">{homeBatting.reduce((s, b) => s + (b.hits || 0), 0) || homeLineup.reduce((s, p) => s + (liveBattingMap[p.playerId]?.h ?? 0), 0)}</td>
                  <td className="py-2 text-center tabular-nums text-slate-700">{errorCounts.home}</td>
                </tr>
              </tbody>
            </table>
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200/90">
          {([
            { key: 'plays' as Tab, label: 'Play-by-Play' },
            { key: 'boxscore' as Tab, label: 'Box Score' },
            { key: 'pitching' as Tab, label: 'Pitching' },
          ]).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg py-2.5 text-[11px] font-bold uppercase tracking-wide transition-all sm:text-xs ${
                tab === t.key
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                  : 'text-slate-600 hover:bg-white/50 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
          {/* PLAY-BY-PLAY */}
          {tab === 'plays' && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Play-by-Play</h3>
                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/90 p-0.5 ring-1 ring-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setPlayMode('compact')}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${playMode === 'compact' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayMode('expanded')}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${playMode === 'expanded' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Expanded
                  </button>
                </div>
              </div>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : groupedAtBats.length === 0 ? (
                <p className="text-sm text-slate-500">No plays recorded yet</p>
              ) : (
                <div className="space-y-5">
                  {groupedAtBats.map(group => (
                    <div key={group.key}>
                      {/* Inning header */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="rounded border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800">
                          {group.half === 'top' ? 'Top' : 'Bottom'} {ordinalInning(group.inning)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {group.half === 'top' ? game.awayTeamName : game.homeTeamName} batting
                        </div>
                        <div className="flex-1 border-t border-slate-200" />
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
                              const walkLikeResult = ['walk', 'intentional_walk', 'hit_by_pitch', 'catcher_obstruction'].includes(result.eventType);
                              const nP = ab.pitches.length;
                              const lastPitch = nP > 0 ? ab.pitches[nP - 1] : null;
                              const lastDetail = String(lastPitch?.eventDetail || '').toLowerCase();
                              const allBalls = nP > 0 && ab.pitches.every(p => String(p.eventDetail || '').toLowerCase() === 'ball');
                              if (walkLikeResult) {
                                if (nP === 0) {
                                  pitchSymbols.push('B');
                                } else if (nP === 3 && allBalls) {
                                  pitchSymbols.push('B');
                                } else if (lastDetail === 'ball') {
                                  /* Walk merged into last ball row in detail; strip already ends with B */
                                } else {
                                  pitchSymbols.push('B');
                                }
                              } else {
                                if (nP === 0) {
                                  pitchSymbols.push('X');
                                } else if (lastDetail !== 'in_play') {
                                  pitchSymbols.push('X');
                                }
                              }
                            }
                            /** Must match PitchLetterStrip length (includes synthetic B / X for result). */
                            const displayedPitchCount = pitchSymbols.length;
                            const pitchBreakdown = derivePitchBreakdown(ab);
                            const cardKey = `${group.key}-${abIdx}-${ab.result?.id ?? 'runner'}`;
                            const showPitchDetails = playMode === 'expanded' || Boolean(openPitchCards[cardKey]);
                            const contextLine = `${group.half === 'top' ? game.awayTeamName : game.homeTeamName} batting • ${group.half === 'top' ? game.homeTeamName : game.awayTeamName} pitching`;

                            return (
                              <div key={`ab-${abIdx}`} className={`${borderClass} rounded-lg border border-gray-300/90 bg-gray-200/90 px-3 py-3 shadow-sm`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className={`text-[9px] font-medium uppercase tracking-[0.12em] ${tone.cls}`}>{tone.tag}</span>
                                      {displayedPitchCount > 0 && (
                                        <span className="text-[9px] text-gray-600">
                                          {displayedPitchCount} pitch{displayedPitchCount === 1 ? '' : 'es'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[14px] leading-snug text-gray-950 font-semibold">
                                      {formatted ? formatted.title : ab.pitches.length > 0 ? `${ab.batterName} at bat` : stateEvt ? formatEventLine(stateEvt) : `${ab.batterName} play`}
                                    </div>
                                    <div className="text-[10px] text-gray-800 mt-1">
                                      {formatted?.subtitle ? `${formatted.subtitle} • ${contextLine}` : contextLine}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                                    <BaseDiamond first={bases.first} second={bases.second} third={bases.third} />
                                    <OutsIndicator outs={outsAfter} />
                                  </div>
                                </div>
                                <div className="mt-2.5 text-[10px] text-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {pitchSymbols.length > 0 && (
                                    <PitchLetterStrip symbols={pitchSymbols} max={8} />
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
                                        <div className="text-[10px] uppercase tracking-[0.1em] text-gray-500">At-bat detail</div>
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

                                {playMode === 'compact' && runnerSummary && (
                                  <div className="text-[11px] text-gray-600 mt-1.5">{runnerSummary}</div>
                                )}

                                {playMode === 'compact' && ab.betweenEvents.length > 0 && (
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
              <h3 className="mb-5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Box score</h3>
              {renderBattingTable(game.awayTeamName, awayLineup, awayBatting)}
              {renderBattingTable(game.homeTeamName, homeLineup, homeBatting)}
            </div>
          )}

          {/* PITCHING */}
          {tab === 'pitching' && (
            <div>
              <h3 className="mb-5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Pitching</h3>
              {renderPitchingTable(game.awayTeamName, awayPitching)}
              {renderPitchingTable(game.homeTeamName, homePitching)}
              {awayPitching.length === 0 && homePitching.length === 0 && (
                <p className="text-sm text-slate-500">No pitching data yet</p>
              )}
            </div>
          )}
        </div>

        {/* Game info footer */}
        <div className="space-y-0.5 pb-8 text-center text-xs text-slate-500">
          {game.venue && <p>{game.venue}</p>}
          <p>{new Date(game.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>
    </div>
  );
}
