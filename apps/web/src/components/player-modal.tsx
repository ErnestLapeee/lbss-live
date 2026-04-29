'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';
import { getStatAbbreviationMeaning } from '@/lib/stat-abbreviations';
import { derivePrimaryPositionLabel, POS_LABELS } from '@/lib/derive-primary-position';

type Tab = 'batting' | 'pitching' | 'fielding' | 'gamelog' | 'spraychart';

const n = (v: any) => v ?? 0;
const fmtRate = (v: any) => (v != null && v !== '' ? Number(v).toFixed(3).replace(/^0/, '') : '—');
const fmtEra = (v: any) => (v != null && v !== '' ? Number(v).toFixed(2) : '—');
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
  const n = Number(ip);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 3)) : 0;
};
const outsToIp = (outs: number): string => {
  const full = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem === 0 ? `${full}` : `${full}.${rem}`;
};

interface PlayerModalProps {
  slug: string;
  firstName: string;
  lastName: string;
  onClose: () => void;
}

export function PlayerModal({ slug, firstName, lastName, onClose }: PlayerModalProps) {
  async function fetchJson(path: string) {
    // Use same-origin proxy to avoid CORS issues with external API
    const proxyPath = path.replace(/^\/api\//, '/api/proxy/');
    const res = await fetch(proxyPath);
    if (!res.ok) return null;
    return res.json();
  }

  const [tab, setTab] = useState<Tab>('batting');
  const [player, setPlayer] = useState<any>(null);
  const [battingStats, setBattingStats] = useState<any[] | null>(null);
  const [pitchingStats, setPitchingStats] = useState<any[] | null>(null);
  const [fieldingStats, setFieldingStats] = useState<any[] | null>(null);
  const [fieldingByPos, setFieldingByPos] = useState<any[] | null>(null);
  const [gameLog, setGameLog] = useState<{ batting: any[]; pitching: any[] } | null>(null);
  const [sprayData, setSprayData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedSlug, setResolvedSlug] = useState<string | null>(slug);
  // Season filter is used only for game log and spray chart views
  const [seasonFilter, setSeasonFilter] = useState<'all' | number>('all');
  const [seasons, setSeasons] = useState<{ id: number; year: number }[]>([]);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!slug.startsWith('player-')) {
        setResolvedSlug(slug);
        return;
      }
      const fallbackId = Number(slug.replace('player-', ''));
      if (!Number.isFinite(fallbackId) || fallbackId <= 0) {
        setResolvedSlug(null);
        return;
      }
      try {
        let page = 1;
        let foundSlug: string | null = null;
        while (!foundSlug) {
          const res = await fetch(`/api/proxy/public/players?page=${page}&limit=100`);
          if (!res.ok) break;
          const payload = await res.json();
          const rows = Array.isArray(payload?.data) ? payload.data : [];
          const matched = rows.find((p: any) => Number(p.id) === fallbackId);
          if (matched?.slug) {
            foundSlug = matched.slug;
            break;
          }
          const total = Number(payload?.pagination?.total ?? rows.length);
          if (!rows.length || page * 100 >= total) break;
          page++;
        }
        if (!cancelled) setResolvedSlug(foundSlug);
      } catch {
        if (!cancelled) setResolvedSlug(null);
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [slug]);

  // Load all data on mount
  useEffect(() => {
    if (!resolvedSlug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchJson(`/api/public/players/${resolvedSlug}`),
      fetchJson(`/api/public/players/${resolvedSlug}/stats`),
      fetchJson(`/api/public/players/${resolvedSlug}/pitching-stats`),
      fetchJson(`/api/public/players/${resolvedSlug}/fielding-stats`),
      fetchJson(`/api/public/players/${resolvedSlug}/game-log`),
      fetchJson(`/api/public/players/${resolvedSlug}/spray-chart`),
      fetchJson(`/api/public/players/${resolvedSlug}/fielding-by-position`),
    ]).then(([p, bat, pitch, field, gl, spray, fbp]) => {
      const batting = Array.isArray(bat) ? bat : [];
      const pitching = Array.isArray(pitch) ? pitch : [];
      const fielding = Array.isArray(field) ? field : [];

      setPlayer(p);
      setBattingStats(batting);
      setPitchingStats(pitching);
      setFieldingStats(fielding);
      setGameLog(gl || { batting: [], pitching: [] });
      setSprayData(Array.isArray(spray) ? spray : []);
      setFieldingByPos(Array.isArray(fbp) ? fbp : []);

      const seasonMap = new Map<number, number>();
      batting.forEach((s: any) => {
        if (s.seasonId && s.seasonYear) seasonMap.set(s.seasonId, s.seasonYear);
      });
      pitching.forEach((s: any) => {
        if (s.seasonId && s.seasonYear && !seasonMap.has(s.seasonId)) {
          seasonMap.set(s.seasonId, s.seasonYear);
        }
      });
      fielding.forEach((s: any) => {
        if (s.seasonId && s.seasonYear && !seasonMap.has(s.seasonId)) {
          seasonMap.set(s.seasonId, s.seasonYear);
        }
      });
      setSeasons(
        Array.from(seasonMap.entries())
          .map(([id, year]) => ({ id, year }))
          .sort((a, b) => a.year - b.year),
      );
    }).finally(() => setLoading(false));
  }, [resolvedSlug]);

  // Re-fetch game log when season filter changes while on Game Log tab
  useEffect(() => {
    if (tab !== 'gamelog') return;
    const query = seasonFilter === 'all' ? '' : `?seasonId=${seasonFilter}`;
    if (!resolvedSlug) return;
    fetchJson(`/api/public/players/${resolvedSlug}/game-log${query}`).then(gl =>
      setGameLog(gl || { batting: [], pitching: [] }),
    );
  }, [tab, seasonFilter, resolvedSlug]);

  // Re-fetch spray chart when season filter changes while on Spray Chart tab
  useEffect(() => {
    if (tab !== 'spraychart') return;
    const query = seasonFilter === 'all' ? '' : `?seasonId=${seasonFilter}`;
    if (!resolvedSlug) return;
    fetchJson(`/api/public/players/${resolvedSlug}/spray-chart${query}`).then(spray =>
      setSprayData(Array.isArray(spray) ? spray : []),
    );
  }, [tab, seasonFilter, resolvedSlug]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  // Aggregate batting totals from season stats
  const batTotals = battingStats && battingStats.length > 0 ? battingStats[0] : null;
  const pitchTotals = pitchingStats && pitchingStats.length > 0 ? pitchingStats[0] : null;

  const sumBattingRows = (rows: any[]) => {
    if (!rows.length) return null;
    const acc: any = {};
    const keysToSum = [
      'games','plateAppearances','atBats','runs','hits','doubles','triples',
      'homeRuns','rbi','walks','strikeouts','stolenBases','caughtStealing',
    ];
    for (const r of rows) {
      for (const k of keysToSum) acc[k] = (acc[k] || 0) + (Number(r[k] ?? 0) || 0);
    }
    const ab = acc.atBats || 0;
    const h = acc.hits || 0;
    const tb = rows.reduce((s, r) => s + Number(r.totalBases ?? 0), 0);
    const hitByPitch = rows.reduce((s, r) => s + Number(r.hitByPitch ?? 0), 0);
    const sacrificeFlies = rows.reduce((s, r) => s + Number(r.sacrificeFlies ?? 0), 0);
    const obDenom = ab + acc.walks + hitByPitch + sacrificeFlies;
    const obp = obDenom > 0 ? (h + acc.walks + hitByPitch) / obDenom : 0;
    const slg = ab > 0 ? tb / ab : 0;
    return {
      ...acc,
      battingAvg: ab > 0 ? (h / ab).toFixed(3) : null,
      onBasePct: obDenom > 0 ? obp.toFixed(3) : null,
      sluggingPct: ab > 0 ? slg.toFixed(3) : null,
      ops: (obp + slg).toFixed(3),
    };
  };

  const sumPitchingRows = (rows: any[]) => {
    if (!rows.length) return null;
    const acc: any = {};
    const keysToSum = [
      'games', 'gamesStarted', 'wins', 'losses', 'saves',
      'hitsAllowed', 'runsAllowed', 'earnedRuns', 'walksAllowed',
      'strikeouts', 'homeRunsAllowed', 'battersFaced', 'intentionalWalks', 'hitBatters',
    ];
    for (const r of rows) {
      for (const k of keysToSum) acc[k] = (acc[k] || 0) + (Number(r[k] ?? 0) || 0);
    }
    const outs = rows.reduce((s, r) => s + ipToOuts(r.inningsPitched), 0);
    const ip = outs / 3;
    const er = acc.earnedRuns || 0;
    const h = acc.hitsAllowed || 0;
    const bb = acc.walksAllowed || 0;
    const bf = acc.battersFaced || 0;
    const ibb = acc.intentionalWalks || 0;
    const hb = acc.hitBatters || 0;
    const oppAb = bf - bb - ibb - hb;
    return {
      ...acc,
      inningsPitched: outsToIp(outs),
      era: ip > 0 ? ((er / ip) * 9).toFixed(2) : null,
      whip: ip > 0 ? ((bb + h) / ip).toFixed(2) : null,
      opponentAvg: oppAb > 0 ? (h / oppAb).toFixed(3).replace(/^0/, '') : null,
    };
  };

  const derivedPosition = derivePrimaryPositionLabel(fieldingByPos ?? []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'batting', label: 'Batting' },
    { key: 'pitching', label: 'Pitching' },
    { key: 'fielding', label: 'Fielding' },
    { key: 'gamelog', label: 'Game Log' },
    { key: 'spraychart', label: 'Spray Chart' },
  ];

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[4vh] bg-black/55 overflow-y-auto"
    >
      <div className="bg-white border border-[#ccc] rounded-xl shadow-xl w-[min(1200px,96vw)] mx-4 mb-8 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header — player identity block */}
        <div className="bg-[#3a3a3a] px-6 py-4 flex items-start justify-between border-b border-black/30">
          <div>
            <h2 className="text-2xl font-heading font-black text-white tracking-tight leading-none">
              {firstName} {lastName}
            </h2>
            {(player || derivedPosition) && (
              <p className="text-[12px] text-white/80 mt-1.5 font-medium">
                {player?.jerseyNumber && <span className="text-white font-bold mr-2">#{player.jerseyNumber}</span>}
                {derivedPosition && <span className="text-white/80 mr-2">{derivedPosition}</span>}
                {derivedPosition && (player?.bats || player?.throws) && <span className="text-white/30 mr-2">·</span>}
                {[player?.bats && `B:${player.bats}`, player?.throws && `T:${player.throws}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1.5 rounded hover:bg-black/10 -mt-1 -mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[#ccc] bg-[#f3f3f3]">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-[#136cb2] text-[#136cb2]'
                  : 'border-transparent text-[#333] hover:text-[#111]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <a
            href={`/players/${resolvedSlug ?? slug}`}
            className="ml-auto px-4 py-2.5 text-[10px] text-[#444] hover:text-[#111] transition-colors flex items-center gap-1"
          >
            Full Profile →
          </a>
        </div>

        {/* Content — modal mid surface */}
        <div className="p-5 max-h-[72vh] overflow-y-auto bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#136cb2] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* BATTING TAB – always show all seasons + TOTAL */}
              {tab === 'batting' && battingStats && battingStats.length > 0 && (() => {
                const rows = battingStats;
                const total = sumBattingRows(rows);
                return (
                  <div className="space-y-3">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-[#e5e7eb] text-[#333] border-b border-[#ccc]">
                          {['Season','Team','G','PA','AB','R','H','2B','3B','HR','RBI','BB','SO','SB','CS','AVG','OBP','SLG','OPS'].map(col => (
                            <th
                              key={col}
                              title={getStatAbbreviationMeaning(col) ?? undefined}
                              className={`px-2 py-1.5 font-semibold ${
                                col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'
                              }`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows
                          .slice()
                          .sort((a: any, b: any) => (a.seasonYear ?? 0) - (b.seasonYear ?? 0))
                          .map((r: any) => (
                            <tr key={`${r.seasonId ?? ''}-${r.teamName ?? ''}`} className="border-b border-white/[0.03]">
                              <td className="px-2 py-1.5 text-left">
                                {r.seasonYear ?? '—'}{r.seasonLabel ? ` ${r.seasonLabel}` : ''}
                              </td>
                              <td className="px-2 py-1.5 text-left">{r.teamName ?? '—'}</td>
                              <td className="px-2 py-1.5 text-right">{r.games}</td>
                              <td className="px-2 py-1.5 text-right">{r.plateAppearances}</td>
                              <td className="px-2 py-1.5 text-right">{r.atBats}</td>
                              <td className="px-2 py-1.5 text-right">{r.runs}</td>
                              <td className="px-2 py-1.5 text-right">{r.hits}</td>
                              <td className="px-2 py-1.5 text-right">{r.doubles}</td>
                              <td className="px-2 py-1.5 text-right">{r.triples}</td>
                              <td className="px-2 py-1.5 text-right">{r.homeRuns}</td>
                              <td className="px-2 py-1.5 text-right">{r.rbi}</td>
                              <td className="px-2 py-1.5 text-right">{r.walks}</td>
                              <td className="px-2 py-1.5 text-right">{r.strikeouts}</td>
                              <td className="px-2 py-1.5 text-right">{r.stolenBases}</td>
                              <td className="px-2 py-1.5 text-right">{r.caughtStealing}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRate(r.battingAvg)}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRate(r.onBasePct)}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRate(r.sluggingPct)}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRate(r.ops)}</td>
                            </tr>
                          ))}
                        {total && (
                          <tr className="bg-[#f3f3f3] border-t border-[#ccc]">
                            <td className="px-2 py-1.5 font-semibold text-left" colSpan={2}>TOTAL</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.games}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.plateAppearances}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.atBats}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.runs}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.hits}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.doubles}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.triples}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.homeRuns}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.rbi}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.walks}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.strikeouts}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.stolenBases}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.caughtStealing}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtRate(total.battingAvg)}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtRate(total.onBasePct)}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtRate(total.sluggingPct)}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtRate(total.ops)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* PITCHING TAB – always show all seasons + TOTAL */}
              {tab === 'pitching' && pitchingStats && pitchingStats.length > 0 && (() => {
                const rows = pitchingStats;
                const total = sumPitchingRows(rows);
                return (
                  <div className="space-y-3">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-[#e5e7eb] text-[#333] border-b border-[#ccc]">
                          {['Season','Team','G','GS','W','L','SV','IP','H','R','ER','BB','SO','HR','ERA','WHIP','OBA'].map(col => (
                            <th
                              key={col}
                              title={getStatAbbreviationMeaning(col) ?? undefined}
                              className={`px-2 py-1.5 font-semibold ${
                                col === 'Season' || col === 'Team' ? 'text-left' : 'text-right'
                              }`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows
                          .slice()
                          .sort((a: any, b: any) => (a.seasonYear ?? 0) - (b.seasonYear ?? 0))
                          .map((r: any) => (
                            <tr key={`${r.seasonId ?? ''}-${r.teamName ?? ''}`} className="border-b border-white/[0.03]">
                              <td className="px-2 py-1.5 text-left">
                                {r.seasonYear ?? '—'}{r.seasonLabel ? ` ${r.seasonLabel}` : ''}
                              </td>
                              <td className="px-2 py-1.5 text-left">{r.teamName ?? '—'}</td>
                              <td className="px-2 py-1.5 text-right">{r.games}</td>
                              <td className="px-2 py-1.5 text-right">{r.gamesStarted}</td>
                              <td className="px-2 py-1.5 text-right">{r.wins}</td>
                              <td className="px-2 py-1.5 text-right">{r.losses}</td>
                              <td className="px-2 py-1.5 text-right">{r.saves}</td>
                              <td className="px-2 py-1.5 text-right">{r.inningsPitched}</td>
                              <td className="px-2 py-1.5 text-right">{r.hitsAllowed}</td>
                              <td className="px-2 py-1.5 text-right">{r.runsAllowed}</td>
                              <td className="px-2 py-1.5 text-right">{r.earnedRuns}</td>
                              <td className="px-2 py-1.5 text-right">{r.walksAllowed}</td>
                              <td className="px-2 py-1.5 text-right">{r.strikeouts}</td>
                              <td className="px-2 py-1.5 text-right">{r.homeRunsAllowed}</td>
                              <td className="px-2 py-1.5 text-right">{fmtEra(r.era)}</td>
                              <td className="px-2 py-1.5 text-right">{fmtEra(r.whip)}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRate(r.opponentAvg)}</td>
                            </tr>
                          ))}
                        {total && (
                          <tr className="bg-[#f3f3f3] border-t border-[#ccc]">
                            <td className="px-2 py-1.5 font-semibold text-left" colSpan={2}>TOTAL</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.games}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.gamesStarted}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.wins}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.losses}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.saves}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.inningsPitched}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.hitsAllowed}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.runsAllowed}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.earnedRuns}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.walksAllowed}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.strikeouts}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{total.homeRunsAllowed}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtEra(total.era)}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtEra(total.whip)}</td>
                            <td className="px-2 py-1.5 font-semibold text-right">{fmtRate(total.opponentAvg)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* FIELDING TAB – always show all seasons + TOTAL */}
              {tab === 'fielding' && fieldingStats && fieldingStats.length > 0 && (() => {
                const rows = fieldingStats;
                const total: any = {};
                const keysToSum = ['games','putouts','assists','errors','doublePlays','triplePlays'];
                for (const r of rows) {
                  for (const k of keysToSum) total[k] = (total[k] || 0) + (Number(r[k] ?? 0) || 0);
                }
                const tc = (total.putouts || 0) + (total.assists || 0) + (total.errors || 0);
                const fpct = tc > 0 ? (((total.putouts || 0) + (total.assists || 0)) / tc).toFixed(3) : null;
                const totalInnOuts = rows.reduce((s: number, r: any) => s + ipToOuts(r.innings), 0);
                const totalInnStr = totalInnOuts > 0 ? outsToIp(totalInnOuts) : '—';

                return (
                  <div className="space-y-3">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-[#e5e7eb] text-[#333] border-b border-[#ccc]">
                          {['Season','Team','Pos','G','Inn','PO','A','E','DP','FP%'].map(col => (
                            <th
                              key={col}
                              title={getStatAbbreviationMeaning(col) ?? undefined}
                              className={`px-2 py-1.5 font-semibold ${
                                col === 'Season' || col === 'Team' || col === 'Pos' ? 'text-left' : 'text-right'
                              }`}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows
                          .slice()
                          .sort((a: any, b: any) => (a.seasonYear ?? 0) - (b.seasonYear ?? 0))
                          .map((r: any) => (
                            <tr key={`${r.seasonId ?? ''}-${r.teamName ?? ''}-${r.position ?? ''}`} className="border-b border-white/[0.03]">
                              <td className="px-2 py-1.5 text-left">
                                {r.seasonYear ?? '—'}{r.seasonLabel ? ` ${r.seasonLabel}` : ''}
                              </td>
                              <td className="px-2 py-1.5 text-left">{r.teamName ?? '—'}</td>
                              <td className="px-2 py-1.5 text-left">
                                {r.positionLabel
                                  || (r.position != null ? (POS_LABELS[r.position] || String(r.position)) : '—')}
                              </td>
                              <td className="px-2 py-1.5 text-right">{r.games}</td>
                              <td className="px-2 py-1.5 text-right">{r.innings ?? '—'}</td>
                              <td className="px-2 py-1.5 text-right">{r.putouts}</td>
                              <td className="px-2 py-1.5 text-right">{r.assists}</td>
                              <td className="px-2 py-1.5 text-right">{r.errors}</td>
                              <td className="px-2 py-1.5 text-right">{r.doublePlays}</td>
                              <td className="px-2 py-1.5 text-right">{fmtRate(r.fieldingPct)}</td>
                            </tr>
                          ))}
                        <tr className="bg-[#f3f3f3] border-t border-[#ccc]">
                          <td className="px-2 py-1.5 font-semibold text-left" colSpan={3}>TOTAL</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{total.games || 0}</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{totalInnStr}</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{total.putouts || 0}</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{total.assists || 0}</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{total.errors || 0}</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{total.doublePlays || 0}</td>
                          <td className="px-2 py-1.5 font-semibold text-right">{fmtRate(fpct)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* GAME LOG TAB – season filter lives here */}
              {tab === 'gamelog' && gameLog && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-[#64748b]">Season (game log):</span>
                    <select
                      value={seasonFilter === 'all' ? 'all' : String(seasonFilter)}
                      onChange={e => {
                        const v = e.target.value;
                        setSeasonFilter(v === 'all' ? 'all' : Number(v));
                      }}
                      className="bg-white border border-[#ccc] rounded px-2 py-1 text-[10px] text-[#111]"
                    >
                      <option value="all">All time</option>
                      {seasons.map(s => (
                        <option key={s.id} value={s.id}>{s.year}</option>
                      ))}
                    </select>
                  </div>
                  {gameLog.batting.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-2">Batting Game Log</h3>
                      <div className="rounded-lg border border-[#ccc] overflow-x-auto bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#ccc] bg-[#f3f3f3]">
                              {['Date', 'Opp', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'SB'].map(col => (
                                <th key={col} title={getStatAbbreviationMeaning(col) ?? undefined} className={`px-1.5 py-1 text-[8px] font-bold tracking-wider text-[#333] whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}>
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
                                <tr key={i} className="border-b border-[#e5e5e5] last:border-0 hover:bg-[#fafafa]">
                                  <td className="px-1.5 py-1.5 text-[#666]">{dateStr}</td>
                                  <td className="px-1.5 py-1.5 text-[#666]">{isHome ? 'vs' : '@'} {oppName}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.at_bats)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.runs)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.hits)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.doubles)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.triples)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.home_runs)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono font-bold text-[#111]">{n(g.rbi)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.walks)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.strikeouts)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#333]">{n(g.stolen_bases)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {gameLog.pitching.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-2">Pitching Game Log</h3>
                      <div className="rounded-lg border border-[#ccc] overflow-x-auto bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#ccc] bg-[#f3f3f3]">
                              {['Date', 'Opp', 'Dec', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR'].map(col => (
                                <th key={col} title={getStatAbbreviationMeaning(col) ?? undefined} className={`px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#333] whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}>
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
                                <tr key={i} className="border-b border-[#e5e5e5] last:border-0 hover:bg-[#fafafa]">
                                  <td className="px-2 py-1.5 text-[#666]">{dateStr}</td>
                                  <td className="px-2 py-1.5 text-[#666]">{isHome ? 'vs' : '@'} {oppName}</td>
                                  <td className="px-2 py-1.5 text-right font-mono font-bold text-[#111]">{g.decision || '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{g.innings_pitched ?? '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{n(g.hits_allowed)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{n(g.runs_allowed)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{n(g.earned_runs)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{n(g.walks_allowed)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{n(g.strikeouts)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#333]">{n(g.home_runs_allowed)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {gameLog.batting.length === 0 && gameLog.pitching.length === 0 && (
                    <p className="text-sm text-[#64748b] text-center py-6">No game log data available.</p>
                  )}
                </div>
              )}

              {/* SPRAY CHART TAB – season filter lives here */}
              {tab === 'spraychart' && (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569]">Spray Chart</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#64748b]">Season:</span>
                      <select
                        value={seasonFilter === 'all' ? 'all' : String(seasonFilter)}
                        onChange={e => {
                          const v = e.target.value;
                          setSeasonFilter(v === 'all' ? 'all' : Number(v));
                        }}
                        className="bg-white border border-[#ccc] rounded px-2 py-1 text-[10px] text-[#111]"
                      >
                        <option value="all">All time</option>
                        {seasons.map(s => (
                          <option key={s.id} value={s.id}>{s.year}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {sprayData && sprayData.length > 0 ? (
                    <div className="-mx-2">
                      <SprayChart hits={sprayData.map((h: any) => ({
                        hitLocationX: Number(h.hit_location_x),
                        hitLocationY: Number(h.hit_location_y),
                        hitType: h.hit_type,
                        hitHardness: h.hit_hardness,
                        eventType: h.event_type,
                        isOut: (h.outs_recorded ?? 0) > 0,
                      }))} />
                    </div>
                  ) : (
                    <p className="text-sm text-[#64748b] text-center py-6">No spray chart data available.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Wrapper hook for easy usage ── */

interface ModalPlayer {
  slug: string;
  firstName: string;
  lastName: string;
}

export function usePlayerModal() {
  const [modalPlayer, setModalPlayer] = useState<ModalPlayer | null>(null);

  const openModal = useCallback((slug: string, firstName: string, lastName: string) => {
    setModalPlayer({ slug, firstName, lastName });
  }, []);

  const closeModal = useCallback(() => {
    setModalPlayer(null);
  }, []);

  const renderModal = useCallback(() => {
    if (!modalPlayer) return null;
    return (
      <PlayerModal
        slug={modalPlayer.slug}
        firstName={modalPlayer.firstName}
        lastName={modalPlayer.lastName}
        onClose={closeModal}
      />
    );
  }, [modalPlayer, closeModal]);

  return { openModal, closeModal, renderModal, isOpen: !!modalPlayer };
}
