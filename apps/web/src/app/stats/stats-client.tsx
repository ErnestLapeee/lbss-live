'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePlayerModal } from '@/components/player-modal';
import { useApiBase } from '@/lib/api-context';

/* ── Types ── */

interface Season {
  id: number;
  name: string;
  year: number;
  isActive: boolean;
}

interface BattingStat {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
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
  stolenBases: number;
  caughtStealing: number;
  sacrificeFlies: number;
  sacrificeBunts: number;
  battingAvg: string | null;
  onBasePct: string | null;
  sluggingPct: string | null;
  ops: string | null;
}

interface PitchingStat {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  saves: number;
  inningsPitched: string | null;
  hitsAllowed: number;
  runsAllowed: number;
  earnedRuns: number;
  walksAllowed: number;
  strikeouts: number;
  homeRunsAllowed: number;
  hitBatters: number;
  wildPitches: number;
  era: string | null;
  whip: string | null;
  strikeoutRate: string | null;
  walkRate: string | null;
}

interface FieldingStat {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  games: number;
  innings: string | null;
  putouts: number;
  assists: number;
  errors: number;
  doublePlays: number;
  triplePlays: number;
  passedBalls: number;
  catcherStolenBases: number;
  catcherCaughtStealing: number;
  pickoffs: number;
  fieldingPct: string | null;
  position?: number | null;
  sba?: number;
}

const POSITION_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'P' },
  { value: '2', label: 'C' },
  { value: '3', label: '1B' },
  { value: '4', label: '2B' },
  { value: '5', label: '3B' },
  { value: '6', label: 'SS' },
  { value: '7', label: 'LF' },
  { value: '8', label: 'CF' },
  { value: '9', label: 'RF' },
];

interface LeaderEntry {
  playerId: number;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  value: string | number | null;
}

interface LeadersData {
  [key: string]: {
    label: string;
    players: LeaderEntry[];
  };
}

type SortDirection = 'asc' | 'desc';
type StatsTab = 'batting' | 'pitching' | 'fielding';

/* ── Column definitions ── */

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  sticky?: boolean;
  highlight?: boolean;
}

const BATTING_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'plateAppearances', label: 'PA', align: 'right' },
  { key: 'atBats', label: 'AB', align: 'right' },
  { key: 'runs', label: 'R', align: 'right' },
  { key: 'hits', label: 'H', align: 'right' },
  { key: 'doubles', label: '2B', align: 'right' },
  { key: 'triples', label: '3B', align: 'right' },
  { key: 'homeRuns', label: 'HR', align: 'right' },
  { key: 'rbi', label: 'RBI', align: 'right' },
  { key: 'walks', label: 'BB', align: 'right' },
  { key: 'hitByPitch', label: 'HBP', align: 'right' },
  { key: 'strikeouts', label: 'SO', align: 'right' },
  { key: 'stolenBases', label: 'SB', align: 'right' },
  { key: 'battingAvg', label: 'AVG', align: 'right', highlight: true },
  { key: 'onBasePct', label: 'OBP', align: 'right' },
  { key: 'sluggingPct', label: 'SLG', align: 'right' },
  { key: 'ops', label: 'OPS', align: 'right', highlight: true },
];

const PITCHING_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'gamesStarted', label: 'GS', align: 'right' },
  { key: 'wins', label: 'W', align: 'right' },
  { key: 'losses', label: 'L', align: 'right' },
  { key: 'saves', label: 'SV', align: 'right' },
  { key: 'inningsPitched', label: 'IP', align: 'right' },
  { key: 'hitsAllowed', label: 'H', align: 'right' },
  { key: 'runsAllowed', label: 'R', align: 'right' },
  { key: 'earnedRuns', label: 'ER', align: 'right' },
  { key: 'walksAllowed', label: 'BB', align: 'right' },
  { key: 'strikeouts', label: 'SO', align: 'right' },
  { key: 'homeRunsAllowed', label: 'HR', align: 'right' },
  { key: 'hitBatters', label: 'HBP', align: 'right' },
  { key: 'wildPitches', label: 'WP', align: 'right' },
  { key: 'era', label: 'ERA', align: 'right', highlight: true },
  { key: 'whip', label: 'WHIP', align: 'right', highlight: true },
];

const FIELDING_COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left', sticky: true },
  { key: 'teamName', label: 'Team', align: 'left' },
  { key: 'games', label: 'G', align: 'right' },
  { key: 'putouts', label: 'PO', align: 'right' },
  { key: 'assists', label: 'A', align: 'right' },
  { key: 'errors', label: 'E', align: 'right' },
  { key: 'doublePlays', label: 'DP', align: 'right' },
  { key: 'passedBalls', label: 'PB', align: 'right' },
  { key: 'catcherStolenBases', label: 'SB', align: 'right' },
  { key: 'catcherCaughtStealing', label: 'CS', align: 'right' },
  { key: 'sba', label: 'SBA', align: 'right' },
  { key: 'pickoffs', label: 'PK', align: 'right' },
  { key: 'fieldingPct', label: 'FP%', align: 'right', highlight: true },
];

const BATTING_LEADER_CATS = ['battingAvg', 'homeRuns', 'rbi', 'hits', 'stolenBases', 'ops'];
const PITCHING_LEADER_CATS = ['era', 'strikeouts', 'wins', 'whip', 'saves', 'inningsPitched'];

/* ── Helpers ── */

function formatStatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  if (num >= 0 && num < 2 && String(value).includes('.')) {
    return num.toFixed(3).replace(/^0/, '');
  }
  return String(value).includes('.') ? num.toFixed(2) : String(Math.round(num));
}

function TeamLogo({ name, shortName, logoUrl, size = 'sm' }: { name: string; shortName?: string | null; logoUrl?: string | null; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-8 h-8' : 'w-5 h-5';
  const textSize = size === 'md' ? 'text-[10px]' : 'text-[8px]';

  if (logoUrl) {
    return <img src={logoUrl} alt={name} className={`${dim} object-contain rounded`} />;
  }

  const abbr = shortName || (name.length <= 3
    ? name.toUpperCase()
    : name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase());

  return (
    <div className={`${dim} rounded bg-primary-mid flex items-center justify-center shrink-0`}>
      <span className={`${textSize} font-bold text-white/80`}>{abbr}</span>
    </div>
  );
}

/* ── Main Component ── */

export function StatsClient() {
  const apiBase = useApiBase();
  const { openModal, renderModal } = usePlayerModal();
  const [tab, setTab] = useState<StatsTab>('batting');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [battingStats, setBattingStats] = useState<BattingStat[]>([]);
  const [pitchingStats, setPitchingStats] = useState<PitchingStat[]>([]);
  const [fieldingStats, setFieldingStats] = useState<FieldingStat[]>([]);
  const [fieldingPosition, setFieldingPosition] = useState<string>('all');
  const [fieldingByPosLoading, setFieldingByPosLoading] = useState(false);
  const [battingLeaders, setBattingLeaders] = useState<LeadersData | null>(null);
  const [pitchingLeaders, setPitchingLeaders] = useState<LeadersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<string>('battingAvg');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // Load seasons
  useEffect(() => {
    fetch(`${apiBase}/api/public/stats/seasons`)
      .then(r => r.json())
      .then((data: Season[]) => {
        const list = Array.isArray(data) ? data : [];
        setSeasons(list);
        if (list.length > 0) {
          const active = list.find(s => s.isActive) || list[0];
          setSelectedSeasonId(active.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [apiBase]);

  // Load all stats when season changes
  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoading(true);

    Promise.all([
      fetch(`${apiBase}/api/public/stats/batting?seasonId=${selectedSeasonId}`).then(r => r.json()).catch(() => []),
      fetch(`${apiBase}/api/public/stats/leaders?seasonId=${selectedSeasonId}`).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/public/stats/pitching?seasonId=${selectedSeasonId}`).then(r => r.json()).catch(() => []),
      fetch(`${apiBase}/api/public/stats/pitching-leaders?seasonId=${selectedSeasonId}`).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/public/stats/fielding?seasonId=${selectedSeasonId}`).then(r => r.json()).catch(() => []),
    ])
      .then(([batting, bLeaders, pitching, pLeaders, fielding]) => {
        setBattingStats(Array.isArray(batting) ? batting : []);
        setBattingLeaders(bLeaders && typeof bLeaders === 'object' && !Array.isArray(bLeaders) ? bLeaders : null);
        setPitchingStats(Array.isArray(pitching) ? pitching : []);
        setPitchingLeaders(pLeaders && typeof pLeaders === 'object' && !Array.isArray(pLeaders) ? pLeaders : null);
        setFieldingStats(Array.isArray(fielding) ? fielding.map((f: any) => ({
          ...f,
          sba: (f.catcherStolenBases || 0) + (f.catcherCaughtStealing || 0),
        })) : []);
      })
      .finally(() => setLoading(false));
  }, [selectedSeasonId]);

  // Fetch fielding stats by position when filter changes
  useEffect(() => {
    if (!selectedSeasonId || tab !== 'fielding') return;
    if (fieldingPosition === 'all') {
      // Re-fetch the standard season totals
      setFieldingByPosLoading(true);
      fetch(`${apiBase}/api/public/stats/fielding?seasonId=${selectedSeasonId}`)
        .then(r => r.json())
        .then(data => {
          setFieldingStats(Array.isArray(data) ? data.map((f: any) => ({
            ...f,
            sba: (f.catcherStolenBases || 0) + (f.catcherCaughtStealing || 0),
          })) : []);
        })
        .catch(() => setFieldingStats([]))
        .finally(() => setFieldingByPosLoading(false));
      return;
    }
    setFieldingByPosLoading(true);
    fetch(`${apiBase}/api/public/stats/fielding-by-position?seasonId=${selectedSeasonId}&position=${fieldingPosition}`)
      .then(r => r.json())
      .then(data => {
        setFieldingStats(Array.isArray(data) ? data.map((f: any) => ({
          ...f,
          sba: (f.catcherStolenBases || 0) + (f.catcherCaughtStealing || 0),
        })) : []);
      })
      .catch(() => setFieldingStats([]))
      .finally(() => setFieldingByPosLoading(false));
  }, [fieldingPosition, selectedSeasonId, tab]);

  // Reset fielding position filter when season changes
  useEffect(() => {
    setFieldingPosition('all');
  }, [selectedSeasonId]);

  // Reset sort when tab changes
  useEffect(() => {
    if (tab === 'batting') {
      setSortKey('battingAvg');
      setSortDir('desc');
    } else if (tab === 'pitching') {
      setSortKey('era');
      setSortDir('asc');
    } else {
      setSortKey('fieldingPct');
      setSortDir('desc');
    }
  }, [tab]);

  // Sort logic
  const handleSort = useCallback((key: string) => {
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      // ERA and WHIP: lower is better so default to asc
      const lowerIsBetter = ['era', 'whip', 'walkRate'];
      const textCols = ['name', 'teamName'];
      if (textCols.includes(key)) {
        setSortDir('asc');
      } else if (lowerIsBetter.includes(key)) {
        setSortDir('asc');
      } else {
        setSortDir('desc');
      }
    }
  }, [sortKey]);

  const sortedBatting = useMemo(() => sortData(battingStats, sortKey, sortDir), [battingStats, sortKey, sortDir]);
  const sortedPitching = useMemo(() => sortData(pitchingStats, sortKey, sortDir), [pitchingStats, sortKey, sortDir]);
  const sortedFielding = useMemo(() => sortData(fieldingStats, sortKey, sortDir), [fieldingStats, sortKey, sortDir]);

  const currentColumns = tab === 'batting' ? BATTING_COLUMNS : tab === 'pitching' ? PITCHING_COLUMNS : FIELDING_COLUMNS;
  const currentData = tab === 'batting' ? sortedBatting : tab === 'pitching' ? sortedPitching : sortedFielding;
  const currentLeaders = tab === 'batting' ? battingLeaders : tab === 'pitching' ? pitchingLeaders : null;
  const currentLeaderCats = tab === 'batting' ? BATTING_LEADER_CATS : PITCHING_LEADER_CATS;
  const hasData = tab === 'batting' ? battingStats.length > 0 : tab === 'pitching' ? pitchingStats.length > 0 : fieldingStats.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        {/* Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden bg-surface-alt">
          <button
            onClick={() => setTab('batting')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              tab === 'batting'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            Batting
          </button>
          <button
            onClick={() => setTab('pitching')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              tab === 'pitching'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            Pitching
          </button>
          <button
            onClick={() => setTab('fielding')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              tab === 'fielding'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            Fielding
          </button>
        </div>

        {/* Season selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text-muted">Season:</label>
          <select
            value={selectedSeasonId ?? ''}
            onChange={(e) => setSelectedSeasonId(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData && !currentLeaders ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt p-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.05] flex items-center justify-center">
            <svg className="w-8 h-8 text-text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-text-muted text-lg font-medium">
            No {tab} statistics available yet
          </p>
          <p className="text-text-faint text-sm mt-2">
            Stats will appear here once games are played and recorded.
          </p>
        </div>
      ) : (
        <>
          {/* ── Leaders ── */}
          {currentLeaders && Object.keys(currentLeaders).length > 0 && (
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-6 rounded-full bg-accent" />
                <h2 className="font-heading text-xl font-bold tracking-tight">
                  {tab === 'batting' ? 'Batting' : tab === 'pitching' ? 'Pitching' : 'Fielding'} Leaders
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentLeaderCats.map(catKey => {
                  const cat = currentLeaders[catKey];
                  if (!cat || cat.players.length === 0) return null;
                  const leader = cat.players[0];
                  const runnersUp = cat.players.slice(1, 5);

                  return (
                    <div
                      key={catKey}
                      className="rounded-xl border border-border bg-surface overflow-hidden hover:border-accent/20 transition-colors"
                    >
                      <div className="px-4 py-2.5 bg-surface-alt border-b border-border">
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          {cat.label}
                        </h3>
                      </div>

                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-gold">1</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <TeamLogo
                              name={leader.teamName}
                              shortName={leader.teamShortName}
                              logoUrl={leader.teamLogoUrl}
                              size="sm"
                            />
                            <span className="font-semibold text-sm truncate">
                              {leader.firstName} {leader.lastName}
                            </span>
                          </div>
                          <span className="text-[11px] text-text-faint">{leader.teamName}</span>
                        </div>
                        <span className="font-heading text-xl font-bold stat-value shrink-0">
                          {formatStatValue(leader.value)}
                        </span>
                      </div>

                      {runnersUp.length > 0 && (
                        <div className="border-t border-border divide-y divide-border/50">
                          {runnersUp.map((player, idx) => (
                            <div key={player.playerId} className="px-4 py-2 flex items-center gap-3 hover:bg-surface-alt/50 transition-colors">
                              <span className="text-[11px] font-bold text-text-faint w-5 text-center shrink-0">
                                {idx + 2}
                              </span>
                              <TeamLogo
                                name={player.teamName}
                                shortName={player.teamShortName}
                                logoUrl={player.teamLogoUrl}
                                size="sm"
                              />
                              <span className="text-sm truncate flex-1">
                                {player.firstName} {player.lastName}
                              </span>
                              <span className="text-sm font-mono font-semibold text-text-muted shrink-0">
                                {formatStatValue(player.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Stats Table ── */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-accent" />
                <h2 className="font-heading text-xl font-bold tracking-tight">
                  {tab === 'batting' ? 'Batting' : tab === 'pitching' ? 'Pitching' : 'Fielding'} Statistics
                </h2>
                <span className="text-[11px] font-medium text-text-faint bg-surface-alt px-2 py-0.5 rounded">
                  {currentData.length} players
                </span>
              </div>

              {/* Position filter for fielding */}
              {tab === 'fielding' && (
                <div className="flex items-center gap-1 sm:ml-auto">
                  <span className="text-[10px] font-medium text-text-faint mr-1.5">Position:</span>
                  <div className="flex rounded-lg border border-border overflow-hidden bg-surface-alt">
                    {POSITION_FILTERS.map(pf => (
                      <button
                        key={pf.value}
                        onClick={() => setFieldingPosition(pf.value)}
                        className={`px-2 py-1 text-[11px] font-semibold transition-colors ${
                          fieldingPosition === pf.value
                            ? 'bg-accent text-white'
                            : 'text-text-muted hover:text-text hover:bg-surface'
                        }`}
                      >
                        {pf.label}
                      </button>
                    ))}
                  </div>
                  {fieldingByPosLoading && (
                    <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin ml-2" />
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-text-faint w-10">
                        #
                      </th>
                      {currentColumns.map(col => (
                        <th
                          key={col.key}
                          className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-accent ${
                            col.align === 'left' ? 'text-left' : 'text-right'
                          } ${sortKey === col.key ? 'text-accent' : 'text-text-faint'} ${
                            col.sticky ? 'sticky left-0 bg-surface-alt z-10' : ''
                          }`}
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortKey === col.key && (
                              <svg className={`w-3 h-3 ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                              </svg>
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.map((stat: any, idx: number) => (
                      <tr
                        key={stat.playerId}
                        className="border-b border-border/50 last:border-0 hover:bg-surface-alt/50 transition-colors"
                      >
                        <td className="px-3 py-2 text-center text-[11px] text-text-faint font-mono">
                          {idx + 1}
                        </td>
                        {currentColumns.map(col => {
                          let cellValue: React.ReactNode;

                          if (col.key === 'name') {
                            cellValue = (
                              <div className="flex items-center gap-2">
                                <TeamLogo
                                  name={stat.teamName}
                                  shortName={stat.teamShortName}
                                  logoUrl={stat.teamLogoUrl}
                                  size="sm"
                                />
                                <button
                                  onClick={() => openModal(stat.playerSlug || `player-${stat.playerId}`, stat.firstName, stat.lastName)}
                                  className="font-semibold text-text hover:text-white hover:underline transition-colors text-left"
                                >
                                  {stat.firstName} {stat.lastName}
                                </button>
                              </div>
                            );
                          } else if (col.key === 'teamName') {
                            cellValue = (
                              <span className="text-text-muted">{stat.teamShortName || stat.teamName}</span>
                            );
                          } else {
                            const raw = stat[col.key];
                            cellValue = (
                              <span className={`font-mono ${col.highlight ? 'font-bold stat-value' : 'text-text-muted'}`}>
                                {formatStatValue(raw)}
                              </span>
                            );
                          }

                          return (
                            <td
                              key={col.key}
                              className={`px-3 py-2 ${
                                col.align === 'left' ? 'text-left' : 'text-right'
                              } ${col.sticky ? 'sticky left-0 bg-surface z-10' : ''}`}
                            >
                              {cellValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {currentData.length === 0 && (
                      <tr>
                        <td colSpan={currentColumns.length + 1} className="px-4 py-12 text-center text-text-muted">
                          No {tab} data available for this season.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table legend */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-faint">
              {tab === 'batting' ? (
                <>
                  <span><strong>G</strong> Games</span>
                  <span><strong>PA</strong> Plate Appearances</span>
                  <span><strong>AB</strong> At Bats</span>
                  <span><strong>R</strong> Runs</span>
                  <span><strong>H</strong> Hits</span>
                  <span><strong>2B</strong> Doubles</span>
                  <span><strong>3B</strong> Triples</span>
                  <span><strong>HR</strong> Home Runs</span>
                  <span><strong>RBI</strong> Runs Batted In</span>
                  <span><strong>BB</strong> Walks</span>
                  <span><strong>HBP</strong> Hit By Pitch</span>
                  <span><strong>SO</strong> Strikeouts</span>
                  <span><strong>SB</strong> Stolen Bases</span>
                  <span><strong>AVG</strong> Batting Average</span>
                  <span><strong>OBP</strong> On-Base Pct</span>
                  <span><strong>SLG</strong> Slugging Pct</span>
                  <span><strong>OPS</strong> On-Base + Slugging</span>
                </>
              ) : tab === 'pitching' ? (
                <>
                  <span><strong>G</strong> Games</span>
                  <span><strong>GS</strong> Games Started</span>
                  <span><strong>W</strong> Wins</span>
                  <span><strong>L</strong> Losses</span>
                  <span><strong>SV</strong> Saves</span>
                  <span><strong>IP</strong> Innings Pitched</span>
                  <span><strong>H</strong> Hits Allowed</span>
                  <span><strong>R</strong> Runs Allowed</span>
                  <span><strong>ER</strong> Earned Runs</span>
                  <span><strong>BB</strong> Walks</span>
                  <span><strong>SO</strong> Strikeouts</span>
                  <span><strong>HR</strong> Home Runs Allowed</span>
                  <span><strong>HBP</strong> Hit Batters</span>
                  <span><strong>WP</strong> Wild Pitches</span>
                  <span><strong>ERA</strong> Earned Run Average</span>
                  <span><strong>WHIP</strong> Walks + Hits / IP</span>
                </>
              ) : (
                <>
                  <span><strong>G</strong> Games</span>
                  <span><strong>PO</strong> Putouts</span>
                  <span><strong>A</strong> Assists</span>
                  <span><strong>E</strong> Errors</span>
                  <span><strong>DP</strong> Double Plays</span>
                  <span><strong>PB</strong> Passed Balls</span>
                  <span><strong>SB</strong> Stolen Bases Allowed</span>
                  <span><strong>CS</strong> Caught Stealing</span>
                  <span><strong>SBA</strong> Stolen Base Attempts (SB + CS)</span>
                  <span><strong>PK</strong> Pickoffs</span>
                  <span><strong>FP%</strong> Fielding Percentage</span>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {/* Player modal */}
      {renderModal()}
    </div>
  );
}

/* ── Sort utility ── */

function sortData<T extends { firstName: string; lastName: string; teamName: string }>(
  data: T[],
  sortKey: string,
  sortDir: SortDirection
): T[] {
  const sorted = [...data];
  sorted.sort((a, b) => {
    let aVal: any;
    let bVal: any;

    if (sortKey === 'name') {
      aVal = `${(a as any).lastName} ${(a as any).firstName}`;
      bVal = `${(b as any).lastName} ${(b as any).firstName}`;
    } else if (sortKey === 'teamName') {
      aVal = (a as any).teamName;
      bVal = (b as any).teamName;
    } else {
      aVal = (a as any)[sortKey];
      bVal = (b as any)[sortKey];
      aVal = aVal !== null && aVal !== undefined ? parseFloat(String(aVal)) : -Infinity;
      bVal = bVal !== null && bVal !== undefined ? parseFloat(String(bVal)) : -Infinity;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });
  return sorted;
}
