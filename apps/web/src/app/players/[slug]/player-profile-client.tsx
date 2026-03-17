'use client';

import { useState, useEffect } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';


interface Season {
  id: number;
  name: string;
  year: number;
}

interface PlayerProfileClientProps {
  slug: string;
  initialBattingStats: any[];
  seasons: Season[];
}

type Tab = 'batting' | 'pitching' | 'fielding' | 'gamelog' | 'spraychart';

const fmtRate = (v: any) => (v != null && v !== '' ? Number(v).toFixed(3).replace(/^0/, '') : '—');
const fmtEra = (v: any) => (v != null && v !== '' ? Number(v).toFixed(2) : '—');
const fmtIp = (v: any) => (v != null ? v : '—');
const n = (v: any) => v ?? 0;

const sumBattingRows = (rows: any[]) => {
  if (!rows.length) return null;
  const acc: any = {};
  const keysToSum = [
    'games',
    'plateAppearances',
    'atBats',
    'runs',
    'hits',
    'doubles',
    'triples',
    'homeRuns',
    'rbi',
    'walks',
    'strikeouts',
    'stolenBases',
    'caughtStealing',
    'hitByPitch',
    'sacrificeFlies',
  ];
  for (const r of rows) {
    for (const k of keysToSum) acc[k] = (acc[k] || 0) + (Number(r[k] ?? 0) || 0);
  }
  const ab = acc.atBats || 0;
  const h = acc.hits || 0;
  const tb = rows.reduce((s, r) => s + Number(r.totalBases ?? 0), 0);
  const hitByPitch = acc.hitByPitch || 0;
  const sacrificeFlies = acc.sacrificeFlies || 0;
  const obDenom = ab + acc.walks + hitByPitch + sacrificeFlies;
  const obp = obDenom > 0 ? (h + acc.walks + hitByPitch) / obDenom : 0;
  const slg = ab > 0 ? tb / ab : 0;
  const babipDenom =
    ab -
    (acc.strikeouts || 0) -
    rows.reduce((s, r) => s + Number(r.homeRuns ?? 0), 0) +
    sacrificeFlies;
  const babip =
    babipDenom > 0
      ? (h - rows.reduce((s, r) => s + Number(r.homeRuns ?? 0), 0)) / babipDenom
      : 0;

  return {
    ...acc,
    battingAvg: ab > 0 ? (h / ab).toFixed(3) : null,
    onBasePct: obDenom > 0 ? obp.toFixed(3) : null,
    sluggingPct: ab > 0 ? slg.toFixed(3) : null,
    ops: (obp + slg).toFixed(3),
    babip: babipDenom > 0 ? babip.toFixed(3) : null,
  };
};

const sumPitchingRows = (rows: any[]) => {
  if (!rows.length) return null;
  const acc: any = {};
  const keysToSum = [
    'games',
    'gamesStarted',
    'wins',
    'losses',
    'saves',
    'hitsAllowed',
    'runsAllowed',
    'earnedRuns',
    'walksAllowed',
    'strikeouts',
    'homeRunsAllowed',
  ];
  for (const r of rows) {
    for (const k of keysToSum) acc[k] = (acc[k] || 0) + (Number(r[k] ?? 0) || 0);
  }
  const ip = rows.reduce(
    (s, r) => s + parseFloat(String(r.inningsPitched ?? 0)),
    0,
  );
  const er = acc.earnedRuns || 0;
  const h = acc.hitsAllowed || 0;
  const bb = acc.walksAllowed || 0;
  return {
    ...acc,
    inningsPitched: ip.toFixed(1),
    era: ip > 0 ? ((er / ip) * 9).toFixed(2) : null,
    whip: ip > 0 ? ((bb + h) / ip).toFixed(2) : null,
  };
};

const sumFieldingRows = (rows: any[]) => {
  if (!rows.length) return null;
  const acc: any = {};
  const keysToSum = ['games', 'putouts', 'assists', 'errors', 'doublePlays', 'triplePlays', 'pickoffs'];
  for (const r of rows) {
    for (const k of keysToSum) acc[k] = (acc[k] || 0) + (Number(r[k] ?? 0) || 0);
  }
  const po = acc.putouts || 0;
  const a = acc.assists || 0;
  const e = acc.errors || 0;
  const tc = po + a + e;
  const fp = tc > 0 ? ((po + a) / tc).toFixed(3) : null;
  return {
    ...acc,
    fieldingPct: fp,
  };
};

const POS_LABELS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF',
};

export function PlayerProfileClient({ slug, initialBattingStats, seasons }: PlayerProfileClientProps) {
  async function fetchJson(path: string) {
    const proxyPath = path.replace(/^\/api\//, '/api/proxy/');
    const res = await fetch(proxyPath);
    if (!res.ok) return null;
    return res.json();
  }

  const [tab, setTab] = useState<Tab>('batting');
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null); // null = All time
  const [battingStats, setBattingStats] = useState<any[]>(initialBattingStats);
  const [pitchingStats, setPitchingStats] = useState<any[] | null>(null);
  const [fieldingStats, setFieldingStats] = useState<any[] | null>(null);
  const [fieldingByPos, setFieldingByPos] = useState<any[] | null>(null);
  const [gameLog, setGameLog] = useState<{ batting: any[]; pitching: any[] } | null>(null);
  const [sprayData, setSprayData] = useState<any[] | null>(null);

  // Season filter applies only to game log and spray chart; tables show season rows + TOTAL
  const filterParam = selectedSeasonId != null ? `seasonId=${selectedSeasonId}` : '';

  // Batting: use server-provided all-time only (no refetch on season change)
  // Pitching / fielding: fetch all-time once when tab is first viewed
  useEffect(() => {
    if (tab !== 'pitching') return;
    if (pitchingStats !== null) return;
    fetchJson(`/api/public/players/${slug}/pitching-stats`).then(d => setPitchingStats(Array.isArray(d) ? d : []));
  }, [tab, slug, pitchingStats]);

  useEffect(() => {
    if (tab !== 'fielding') return;
    if (fieldingStats !== null) return;
    fetchJson(`/api/public/players/${slug}/fielding-stats`).then(d => setFieldingStats(Array.isArray(d) ? d : []));
    fetchJson(`/api/public/players/${slug}/fielding-by-position`).then(d => setFieldingByPos(Array.isArray(d) ? d : []));
  }, [tab, slug, fieldingStats]);

  // Game log: respects season filter
  useEffect(() => {
    if (tab !== 'gamelog') return;
    const url = filterParam ? `/api/public/players/${slug}/game-log?${filterParam}` : `/api/public/players/${slug}/game-log`;
    fetchJson(url).then(d => setGameLog(d && typeof d === 'object' && !Array.isArray(d) ? d : { batting: [], pitching: [] }));
  }, [tab, slug, filterParam]);

  // Spray chart: respects season filter
  useEffect(() => {
    const url = filterParam ? `/api/public/players/${slug}/spray-chart?${filterParam}` : `/api/public/players/${slug}/spray-chart`;
    fetchJson(url).then(d => setSprayData(Array.isArray(d) ? d : []));
  }, [slug, filterParam]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'batting', label: 'Batting' },
    { key: 'pitching', label: 'Pitching' },
    { key: 'fielding', label: 'Fielding' },
    { key: 'gamelog', label: 'Game Log' },
    { key: 'spraychart', label: 'Spray Chart' },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* BATTING TAB */}
      {tab === 'batting' && (
        <div className="space-y-8">
          {battingStats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
              <p className="text-sm text-text-muted">No batting statistics recorded yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    {['Season', 'Team', 'G', 'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'HBP', 'SO', 'SB', 'CS', 'SF', 'AVG', 'OBP', 'SLG', 'OPS', 'BABIP'].map(col => (
                      <th key={col} className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'}`}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {battingStats.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                      <td className="px-2 py-2 font-semibold text-xs">{s.seasonYear != null ? s.seasonYear : 'All time'}</td>
                      <td className="px-2 py-2 text-xs text-text-muted">{s.teamName ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.games)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.plateAppearances)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.atBats)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.runs)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.hits)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.doubles)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.triples)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.homeRuns)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.rbi)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.walks)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.hitByPitch)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.strikeouts)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.stolenBases)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.caughtStealing)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.sacrificeFlies)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(s.battingAvg)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtRate(s.onBasePct)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtRate(s.sluggingPct)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(s.ops)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtRate(s.babip)}</td>
                    </tr>
                  ))}
                  {sumBattingRows(battingStats) && (() => {
                    const total = sumBattingRows(battingStats)!;
                    return (
                      <tr className="bg-surface-alt border-t border-border/80">
                        <td className="px-2 py-2 font-bold text-xs" colSpan={2}>TOTAL</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.games)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.plateAppearances)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.atBats)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.runs)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.hits)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.doubles)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.triples)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.homeRuns)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.rbi)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.walks)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.hitByPitch)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.strikeouts)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.stolenBases)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.caughtStealing)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.sacrificeFlies)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.battingAvg)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.onBasePct)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.sluggingPct)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.ops)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.babip)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Spray chart */}
          {sprayData && sprayData.length > 0 && (
            <div>
              <h3 className="font-heading text-sm font-bold mb-3 flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-accent" />
                Spray Chart
              </h3>
              <div className="rounded-xl border border-border bg-surface p-4">
                <SprayChart hits={sprayData.map((h: any) => ({
                  hitLocationX: Number(h.hit_location_x),
                  hitLocationY: Number(h.hit_location_y),
                  hitType: h.hit_type,
                  hitHardness: h.hit_hardness,
                  eventType: h.event_type,
                  isOut: (h.outs_recorded ?? 0) > 0,
                }))} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* PITCHING TAB */}
      {tab === 'pitching' && (
        <div>
          {pitchingStats === null ? (
            <p className="text-sm text-text-muted py-4">Loading...</p>
          ) : pitchingStats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
              <p className="text-sm text-text-muted">No pitching statistics recorded.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-alt">
                    {['Season', 'Team', 'G', 'GS', 'W', 'L', 'SV', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'HBP', 'WP', 'ERA', 'WHIP', 'FIP', 'K/9', 'BB/9', 'BABIP'].map(col => (
                      <th key={col} className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'}`}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pitchingStats.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                      <td className="px-2 py-2 font-semibold text-xs">{s.seasonYear != null ? s.seasonYear : 'All time'}</td>
                      <td className="px-2 py-2 text-xs text-text-muted">{s.teamName ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.games)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.gamesStarted)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.wins)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.losses)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.saves)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtIp(s.inningsPitched)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.hitsAllowed)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.runsAllowed)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.earnedRuns)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.walksAllowed)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.strikeouts)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.homeRunsAllowed)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.hitBatters)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{n(s.wildPitches)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(s.era)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtEra(s.whip)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtEra(s.fip)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{s.k9 != null ? Number(s.k9).toFixed(1) : '—'}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{s.bb9 != null ? Number(s.bb9).toFixed(1) : '—'}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmtRate(s.babip)}</td>
                    </tr>
                  ))}
                  {sumPitchingRows(pitchingStats) && (() => {
                    const total = sumPitchingRows(pitchingStats)!;
                    return (
                      <tr className="bg-surface-alt border-t border-border/80">
                        <td className="px-2 py-2 font-bold text-xs" colSpan={2}>TOTAL</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.games)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.gamesStarted)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.wins)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.losses)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.saves)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtIp(total.inningsPitched)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.hitsAllowed)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.runsAllowed)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.earnedRuns)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.walksAllowed)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.strikeouts)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.homeRunsAllowed)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(total.era)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(total.whip)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(total.fip)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">
                          {total.k9 != null ? Number(total.k9).toFixed(1) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">
                          {total.bb9 != null ? Number(total.bb9).toFixed(1) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.babip)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FIELDING TAB */}
      {tab === 'fielding' && (
        <div>
          {fieldingStats === null ? (
            <p className="text-sm text-text-muted py-4">Loading...</p>
          ) : fieldingStats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
              <p className="text-sm text-text-muted">No fielding statistics recorded.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      {['Season', 'Team', 'G', 'PO', 'A', 'E', 'DP', 'TP', 'PB', 'SB', 'CS', 'SBA', 'PK', 'FP%'].map(col => (
                        <th key={col} className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'}`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fieldingStats.map((s: any, i: number) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                        <td className="px-2 py-2 font-semibold text-xs">{s.seasonYear != null ? s.seasonYear : 'All time'}</td>
                        <td className="px-2 py-2 text-xs text-text-muted">{s.teamName ?? '—'}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.games)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.putouts)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.assists)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.errors)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.doublePlays)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.triplePlays)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.passedBalls)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.catcherStolenBases)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.catcherCaughtStealing)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{(s.catcherStolenBases || 0) + (s.catcherCaughtStealing || 0)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs">{n(s.pickoffs)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(s.fieldingPct)}</td>
                      </tr>
                    ))}
                    {sumFieldingRows(fieldingStats) && (() => {
                      const total = sumFieldingRows(fieldingStats)!;
                      return (
                        <tr className="bg-surface-alt border-t border-border/80">
                          <td className="px-2 py-2 font-bold text-xs" colSpan={2}>TOTAL</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.games)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.putouts)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.assists)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.errors)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.doublePlays)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.triplePlays)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">—</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">—</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.pickoffs)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtRate(total.fieldingPct)}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Fielding by Position */}
              {fieldingByPos && fieldingByPos.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-faint mb-2">By Position</h3>
                  <div className="rounded-xl border border-border bg-surface overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          {['Pos', 'G', 'INN', 'PO', 'A', 'E', 'DP', 'FP%'].map(col => (
                            <th key={col} className={`px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Pos' ? 'text-left' : 'text-right'}`}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fieldingByPos.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                            <td className="px-2.5 py-2 font-semibold text-xs">{r.position ? POS_LABELS[r.position] || String(r.position) : '—'}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs">{n(r.games)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs">{r.innings ?? '—'}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs">{n(r.putouts)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs">{n(r.assists)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs">{n(r.errors)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs">{n(r.doublePlays)}</td>
                            <td className="px-2.5 py-2 text-right font-mono text-xs font-bold">{fmtRate(r.fieldingPct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* GAME LOG TAB */}
      {tab === 'gamelog' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <label
              className="text-xs font-medium text-text-muted"
              title="Filters the game log (per-game lines) for a specific season or all time."
            >
              Season (game log):
            </label>
            <select
              value={selectedSeasonId ?? 'all'}
              onChange={(e) => setSelectedSeasonId(e.target.value === 'all' ? null : Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="all">All time</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {gameLog === null ? (
            <p className="text-sm text-text-muted py-4">Loading...</p>
          ) : (
            <>
              {/* Batting game log */}
              {gameLog.batting.length > 0 && (
                <div>
                  <h3 className="font-heading text-sm font-bold mb-2 flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-accent" />
                    Batting Game Log
                  </h3>
                  <div className="rounded-xl border border-border bg-surface overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          {['Date', 'Opp', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'SB'].map(col => (
                            <th key={col} className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gameLog.batting.map((g: any, i: number) => {
                          const isHome = g.team_id === g.home_team_id;
                          const oppName = isHome ? g.away_team : g.home_team;
                          const dateStr = g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                          return (
                            <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                              <td className="px-2 py-1.5 text-xs">{dateStr}</td>
                              <td className="px-2 py-1.5 text-xs text-text-muted">{isHome ? 'vs' : '@'} {oppName}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.at_bats)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.runs)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.hits)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.doubles)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.triples)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.home_runs)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.rbi)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.walks)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.strikeouts)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.stolen_bases)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pitching game log */}
              {gameLog.pitching.length > 0 && (
                <div>
                  <h3 className="font-heading text-sm font-bold mb-2 flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-gold" />
                    Pitching Game Log
                  </h3>
                  <div className="rounded-xl border border-border bg-surface overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          {['Date', 'Opp', 'Dec', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'HBP', 'PIT'].map(col => (
                            <th key={col} className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gameLog.pitching.map((g: any, i: number) => {
                          const isHome = g.team_id === g.home_team_id;
                          const oppName = isHome ? g.away_team : g.home_team;
                          const dateStr = g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                          return (
                            <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                              <td className="px-2 py-1.5 text-xs">{dateStr}</td>
                              <td className="px-2 py-1.5 text-xs text-text-muted">{isHome ? 'vs' : '@'} {oppName}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs font-bold">{g.decision || '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{g.innings_pitched ?? '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.hits_allowed)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.runs_allowed)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.earned_runs)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.walks_allowed)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.strikeouts)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.home_runs_allowed)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(g.hit_batters)}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{g.pitches_thrown ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {gameLog.batting.length === 0 && gameLog.pitching.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
                  <p className="text-sm text-text-muted">No game log data available.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SPRAY CHART TAB */}
      {tab === 'spraychart' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label
              className="text-xs font-medium text-text-muted"
              title="Filters the spray chart for balls in play by season or all time."
            >
              Season (spray chart):
            </label>
            <select
              value={selectedSeasonId ?? 'all'}
              onChange={(e) => setSelectedSeasonId(e.target.value === 'all' ? null : Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="all">All time</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {sprayData && sprayData.length > 0 ? (
            <div className="rounded-xl border border-border bg-surface p-4">
              <SprayChart
                hits={sprayData.map((h: any) => ({
                  hitLocationX: Number(h.hit_location_x),
                  hitLocationY: Number(h.hit_location_y),
                  hitType: h.hit_type,
                  hitHardness: h.hit_hardness,
                  eventType: h.event_type,
                  isOut: (h.outs_recorded ?? 0) > 0,
                }))}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
              <p className="text-sm text-text-muted">No spray chart data available.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
