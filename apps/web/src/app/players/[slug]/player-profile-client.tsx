'use client';

import { useState, useEffect } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';
import { TeamMark } from '@/components/ui/team-mark';
import { getStatAbbreviationMeaning } from '@/lib/stat-abbreviations';


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
const ipToOuts = (ip: any): number => {
  if (ip == null || ip === '') return 0;
  const s = String(ip).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (m) {
    const inn = parseInt(m[1] || '0', 10);
    const fracRaw = m[2] ?? '';
    if (fracRaw.length === 0) return inn * 3;
    const outsDigit = parseInt(fracRaw[0] || '0', 10);
    if (!Number.isNaN(outsDigit) && outsDigit >= 0 && outsDigit <= 2) return inn * 3 + outsDigit;
  }
  const nVal = Number(ip);
  return Number.isFinite(nVal) ? Math.max(0, Math.round(nVal * 3)) : 0;
};
const outsToIp = (outs: number): string => {
  const full = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem === 0 ? `${full}` : `${full}.${rem}`;
};

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
    'hitBatters',
    'wildPitches',
    'battersFaced',
  ];
  for (const r of rows) {
    for (const k of keysToSum) acc[k] = (acc[k] || 0) + (Number(r[k] ?? 0) || 0);
  }
  const outs = rows.reduce((s, r) => s + ipToOuts(r.inningsPitched), 0);
  const ip = outs / 3;
  const er = acc.earnedRuns || 0;
  const h = acc.hitsAllowed || 0;
  const bb = acc.walksAllowed || 0;
  const k = acc.strikeouts || 0;
  const hr = acc.homeRunsAllowed || 0;
  const hb = acc.hitBatters || 0;
  const bf = acc.battersFaced || 0;
  const babipDenom = bf - k - hr - bb - hb;
  return {
    ...acc,
    inningsPitched: outsToIp(outs),
    era: ip > 0 ? ((er / ip) * 9).toFixed(2) : null,
    whip: ip > 0 ? ((bb + h) / ip).toFixed(2) : null,
    fip: ip > 0 ? (3.1 + (13 * hr + 3 * bb - 2 * k) / ip).toFixed(2) : null,
    k9: ip > 0 ? ((k / ip) * 9).toFixed(1) : null,
    bb9: ip > 0 ? ((bb / ip) * 9).toFixed(1) : null,
    babip: babipDenom > 0 ? ((h - hr) / babipDenom).toFixed(3) : null,
  };
};

const gv = (g: Record<string, unknown>, snake: string, camel: string): unknown => {
  const a = g[snake];
  const b = g[camel];
  if (a != null && a !== '') return a;
  if (b != null && b !== '') return b;
  return undefined;
};

/** Per-game batting slash line from a batting log row (snake_case or camelCase). */
function gameBattingSlashLine(g: Record<string, unknown>) {
  const ab = Number(gv(g, 'at_bats', 'atBats') ?? 0);
  const h = Number(gv(g, 'hits', 'hits') ?? 0);
  const bb = Number(gv(g, 'walks', 'walks') ?? 0);
  const hbp = Number(gv(g, 'hit_by_pitch', 'hitByPitch') ?? 0);
  const sf = Number(gv(g, 'sacrifice_flies', 'sacrificeFlies') ?? 0);
  const d2 = Number(gv(g, 'doubles', 'doubles') ?? 0);
  const d3 = Number(gv(g, 'triples', 'triples') ?? 0);
  const hr = Number(gv(g, 'home_runs', 'homeRuns') ?? 0);
  let tb = Number(gv(g, 'total_bases', 'totalBases') ?? NaN);
  if (!Number.isFinite(tb) || tb < 0) {
    const singles = Math.max(0, h - d2 - d3 - hr);
    tb = singles + 2 * d2 + 3 * d3 + 4 * hr;
  }
  const obDenom = ab + bb + hbp + sf;
  const obp = obDenom > 0 ? (h + bb + hbp) / obDenom : null;
  const slg = ab > 0 ? tb / ab : null;
  const avg = ab > 0 ? h / ab : null;
  const ops = obp != null && slg != null ? obp + slg : null;
  return { avg, obp, slg, ops, tb };
}

/** Per-game pitching rate stats (matches platform FIP constant 3.1). */
function gamePitchingRates(g: Record<string, unknown>) {
  const ipOuts = ipToOuts(gv(g, 'innings_pitched', 'inningsPitched'));
  const ip = ipOuts / 3;
  if (ip <= 0) {
    return { era: '—', whip: '—', fip: '—', k9: '—', bb9: '—', babip: '—' };
  }
  const h = Number(gv(g, 'hits_allowed', 'hitsAllowed') ?? 0);
  const er = Number(gv(g, 'earned_runs', 'earnedRuns') ?? 0);
  const bb = Number(gv(g, 'walks_allowed', 'walksAllowed') ?? 0);
  const k = Number(gv(g, 'strikeouts', 'strikeouts') ?? 0);
  const hr = Number(gv(g, 'home_runs_allowed', 'homeRunsAllowed') ?? 0);
  const hb = Number(gv(g, 'hit_batters', 'hitBatters') ?? 0);
  const bf = Number(gv(g, 'batters_faced', 'battersFaced') ?? 0);
  const era = ((er / ip) * 9).toFixed(2);
  const whip = ((bb + h) / ip).toFixed(2);
  const fip = (3.1 + (13 * hr + 3 * bb - 2 * k) / ip).toFixed(2);
  const k9 = ((k / ip) * 9).toFixed(1);
  const bb9 = ((bb / ip) * 9).toFixed(1);
  const babipDenom = bf - k - hr - bb - hb;
  const babip = babipDenom > 0 ? ((h - hr) / babipDenom).toFixed(3) : '—';
  return { era, whip, fip, k9, bb9, babip };
}

const sumFieldingRows = (rows: any[]) => {
  if (!rows.length) return null;
  const acc: any = {};
  const keysToSum = ['games', 'putouts', 'assists', 'errors', 'doublePlays', 'triplePlays', 'pickoffs', 'passedBalls', 'catcherStolenBases', 'catcherCaughtStealing'];
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
    if (tab !== 'spraychart') return;
    const url = filterParam ? `/api/public/players/${slug}/spray-chart?${filterParam}` : `/api/public/players/${slug}/spray-chart`;
    fetchJson(url).then(d => setSprayData(Array.isArray(d) ? d : []));
  }, [tab, slug, filterParam]);

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
                      <th title={getStatAbbreviationMeaning(col) ?? undefined} key={col} className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'}`}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {battingStats.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                      <td className="px-2 py-2 font-semibold text-xs">
                        {s.seasonYear != null ? `${s.seasonYear}${s.seasonLabel ? ` ${s.seasonLabel}` : ''}` : 'All time'}
                      </td>
                      <td className="px-2 py-2 text-xs text-text-muted">
                        <div className="flex items-center gap-2 min-w-0 max-w-[200px]">
                          <TeamMark variant="tableSm" name={s.teamName ?? '—'} logoUrl={s.teamLogoUrl} />
                          <span className="truncate">{s.teamName ?? '—'}</span>
                        </div>
                      </td>
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
                      <th title={getStatAbbreviationMeaning(col) ?? undefined} key={col} className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'}`}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pitchingStats.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                      <td className="px-2 py-2 font-semibold text-xs">
                        {s.seasonYear != null ? `${s.seasonYear}${s.seasonLabel ? ` ${s.seasonLabel}` : ''}` : 'All time'}
                      </td>
                      <td className="px-2 py-2 text-xs text-text-muted">
                        <div className="flex items-center gap-2 min-w-0 max-w-[200px]">
                          <TeamMark variant="tableSm" name={s.teamName ?? '—'} logoUrl={s.teamLogoUrl} />
                          <span className="truncate">{s.teamName ?? '—'}</span>
                        </div>
                      </td>
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
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.hitBatters)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.wildPitches)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(total.era)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(total.whip)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">{fmtEra(total.fip)}</td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">
                          {total.k9 != null ? String(total.k9) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-xs font-bold">
                          {total.bb9 != null ? String(total.bb9) : '—'}
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
                        <th title={getStatAbbreviationMeaning(col) ?? undefined} key={col} className={`px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'}`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fieldingStats.map((s: any, i: number) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                        <td className="px-2 py-2 font-semibold text-xs">
                          {s.seasonYear != null ? `${s.seasonYear}${s.seasonLabel ? ` ${s.seasonLabel}` : ''}` : 'All time'}
                        </td>
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
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.passedBalls)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.catcherStolenBases)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.catcherCaughtStealing)}</td>
                          <td className="px-2 py-2 text-right font-mono text-xs font-bold">{n(total.catcherStolenBases) + n(total.catcherCaughtStealing)}</td>
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
                    <table className="w-full text-sm min-w-[1100px]">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          {[
                            'Date', 'Opp', 'PA', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'SB', 'CS', 'HBP', 'SF', 'TB',
                            'AVG', 'OBP', 'SLG', 'OPS',
                          ].map(col => (
                            <th
                              key={col}
                              title={getStatAbbreviationMeaning(col) ?? undefined}
                              className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gameLog.batting.map((row: any, i: number) => {
                          const g = row as Record<string, unknown>;
                          const isHome = Number(gv(g, 'team_id', 'teamId')) === Number(gv(g, 'home_team_id', 'homeTeamId'));
                          const oppName = String(isHome ? gv(g, 'away_team', 'awayTeam') : gv(g, 'home_team', 'homeTeam') ?? '');
                          const oppLogo = (isHome ? gv(g, 'away_team_logo', 'awayTeamLogo') : gv(g, 'home_team_logo', 'homeTeamLogo')) as string | null | undefined;
                          const dateStr = g.date ? new Date(String(g.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                          const slash = gameBattingSlashLine(g);
                          return (
                            <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                              <td className="px-2 py-1.5 text-xs whitespace-nowrap">{dateStr}</td>
                              <td className="px-2 py-1.5 text-xs text-text-muted min-w-[160px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <TeamMark variant="tableSm" name={oppName || 'Opp'} logoUrl={oppLogo} />
                                  <span className="truncate">{isHome ? 'vs' : '@'} {oppName}</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'plate_appearances', 'plateAppearances'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'at_bats', 'atBats'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'runs', 'runs'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'hits', 'hits'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'doubles', 'doubles'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'triples', 'triples'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'home_runs', 'homeRuns'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'rbi', 'rbi'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'walks', 'walks'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'strikeouts', 'strikeouts'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'stolen_bases', 'stolenBases'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'caught_stealing', 'caughtStealing'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'hit_by_pitch', 'hitByPitch'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'sacrifice_flies', 'sacrificeFlies'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{slash.tb}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{slash.avg != null ? fmtRate(slash.avg) : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{slash.obp != null ? fmtRate(slash.obp) : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{slash.slg != null ? fmtRate(slash.slg) : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{slash.ops != null ? fmtRate(slash.ops) : '—'}</td>
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
                    <table className="w-full text-sm min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-border bg-surface-alt">
                          {[
                            'Date', 'Opp', 'Dec', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'HBP', 'WP', 'PIT',
                            'ERA', 'WHIP', 'FIP', 'K/9', 'BB/9', 'BABIP',
                          ].map(col => (
                            <th
                              key={col}
                              title={getStatAbbreviationMeaning(col) ?? undefined}
                              className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-text-faint whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gameLog.pitching.map((row: any, i: number) => {
                          const g = row as Record<string, unknown>;
                          const isHome = Number(gv(g, 'team_id', 'teamId')) === Number(gv(g, 'home_team_id', 'homeTeamId'));
                          const oppName = String(isHome ? gv(g, 'away_team', 'awayTeam') : gv(g, 'home_team', 'homeTeam') ?? '');
                          const oppLogo = (isHome ? gv(g, 'away_team_logo', 'awayTeamLogo') : gv(g, 'home_team_logo', 'homeTeamLogo')) as string | null | undefined;
                          const dateStr = g.date ? new Date(String(g.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                          const pr = gamePitchingRates(g);
                          const pit = gv(g, 'pitches_thrown', 'pitchesThrown');
                          return (
                            <tr key={i} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                              <td className="px-2 py-1.5 text-xs whitespace-nowrap">{dateStr}</td>
                              <td className="px-2 py-1.5 text-xs text-text-muted min-w-[160px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <TeamMark variant="tableSm" name={oppName || 'Opp'} logoUrl={oppLogo} />
                                  <span className="truncate">{isHome ? 'vs' : '@'} {oppName}</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs font-bold">
                                {(gv(g, 'decision', 'decision') as string | null | undefined) || '—'}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{String(gv(g, 'innings_pitched', 'inningsPitched') ?? '—')}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'hits_allowed', 'hitsAllowed'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'runs_allowed', 'runsAllowed'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'earned_runs', 'earnedRuns'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'walks_allowed', 'walksAllowed'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'strikeouts', 'strikeouts'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'home_runs_allowed', 'homeRunsAllowed'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'hit_batters', 'hitBatters'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{n(gv(g, 'wild_pitches', 'wildPitches'))}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pit != null && pit !== '' ? String(pit) : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pr.era}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pr.whip}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pr.fip}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pr.k9}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pr.bb9}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-xs">{pr.babip}</td>
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
