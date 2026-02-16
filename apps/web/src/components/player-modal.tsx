'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type Tab = 'overview' | 'gamelog' | 'spraychart';

async function fetchJson(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) return null;
  return res.json();
}

const n = (v: any) => v ?? 0;
const fmtRate = (v: any) => (v != null && v !== '' ? Number(v).toFixed(3).replace(/^0/, '') : '—');
const fmtEra = (v: any) => (v != null && v !== '' ? Number(v).toFixed(2) : '—');

const POS_LABELS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF',
};

interface PlayerModalProps {
  slug: string;
  firstName: string;
  lastName: string;
  onClose: () => void;
}

export function PlayerModal({ slug, firstName, lastName, onClose }: PlayerModalProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [player, setPlayer] = useState<any>(null);
  const [battingStats, setBattingStats] = useState<any[] | null>(null);
  const [pitchingStats, setPitchingStats] = useState<any[] | null>(null);
  const [fieldingStats, setFieldingStats] = useState<any[] | null>(null);
  const [fieldingByPos, setFieldingByPos] = useState<any[] | null>(null);
  const [gameLog, setGameLog] = useState<{ batting: any[]; pitching: any[] } | null>(null);
  const [sprayData, setSprayData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Load all data on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchJson(`/api/public/players/${slug}`),
      fetchJson(`/api/public/players/${slug}/stats`),
      fetchJson(`/api/public/players/${slug}/pitching-stats`),
      fetchJson(`/api/public/players/${slug}/fielding-stats`),
      fetchJson(`/api/public/players/${slug}/game-log`),
      fetchJson(`/api/public/players/${slug}/spray-chart`),
      fetchJson(`/api/public/players/${slug}/fielding-by-position`),
    ]).then(([p, bat, pitch, field, gl, spray, fbp]) => {
      setPlayer(p);
      setBattingStats(Array.isArray(bat) ? bat : []);
      setPitchingStats(Array.isArray(pitch) ? pitch : []);
      setFieldingStats(Array.isArray(field) ? field : []);
      setGameLog(gl || { batting: [], pitching: [] });
      setSprayData(Array.isArray(spray) ? spray : []);
      setFieldingByPos(Array.isArray(fbp) ? fbp : []);
    }).finally(() => setLoading(false));
  }, [slug]);

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
  const fieldTotals = fieldingStats && fieldingStats.length > 0 ? fieldingStats[0] : null;

  // Derive primary position from fielding-by-position data
  const derivedPosition = (() => {
    if (!fieldingByPos || fieldingByPos.length === 0) return null;
    const sorted = [...fieldingByPos].sort((a, b) => (b.games || 0) - (a.games || 0));
    const top = sorted[0];
    const second = sorted[1];
    const topLabel = POS_LABELS[top.position] || String(top.position);
    if (second && second.games >= top.games * 0.6) {
      const secLabel = POS_LABELS[second.position] || String(second.position);
      return `${topLabel}/${secLabel}`;
    }
    return topLabel;
  })();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'gamelog', label: 'Game Log' },
    { key: 'spraychart', label: 'Spray Chart' },
  ];

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] bg-black/75 backdrop-blur-sm overflow-y-auto"
    >
      <div className="bg-[#131c2e] border border-white/[0.06] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-8 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header — player identity block */}
        <div className="bg-[#0f1626] px-6 py-5 flex items-start justify-between border-b border-white/[0.06]">
          <div>
            <h2 className="text-xl font-heading font-black text-[#f1f5f9] tracking-tight leading-none">
              {firstName} {lastName}
            </h2>
            {(player || derivedPosition) && (
              <p className="text-[11px] text-[#94a3b8] mt-1.5 font-medium">
                {player?.jerseyNumber && <span className="text-[#cbd5e1] font-bold mr-1.5">#{player.jerseyNumber}</span>}
                {derivedPosition && <span className="text-[#94a3b8] mr-1.5">{derivedPosition}</span>}
                {derivedPosition && (player?.bats || player?.throws) && <span className="text-white/20 mr-1.5">·</span>}
                {[player?.bats && `Bats: ${player.bats}`, player?.throws && `Throws: ${player.throws}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[#64748b] hover:text-[#f1f5f9] transition-colors p-1.5 rounded-lg hover:bg-white/[0.06] -mt-1 -mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-white/[0.06] bg-[#131c2e]">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-[#64748b] hover:text-[#94a3b8]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <a
            href={`/players/${slug}`}
            className="ml-auto px-4 py-2.5 text-[10px] text-[#475569] hover:text-[#64748b] transition-colors flex items-center gap-1"
          >
            Full Profile →
          </a>
        </div>

        {/* Content — modal mid surface */}
        <div className="p-5 max-h-[65vh] overflow-y-auto bg-[#131c2e]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {tab === 'overview' && (
                <div className="space-y-5">
                  {/* Key batting stats */}
                  {batTotals && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-2">Batting</h3>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                        {[
                          { label: 'G', value: n(batTotals.games), primary: false },
                          { label: 'AVG', value: fmtRate(batTotals.battingAvg), primary: true },
                          { label: 'HR', value: n(batTotals.homeRuns), primary: false },
                          { label: 'RBI', value: n(batTotals.rbi), primary: false },
                          { label: 'H', value: n(batTotals.hits), primary: false },
                          { label: 'OBP', value: fmtRate(batTotals.onBasePct), primary: true },
                          { label: 'OPS', value: fmtRate(batTotals.ops), primary: true },
                        ].map(s => (
                          <div key={s.label} className="rounded-lg px-2 py-2 text-center bg-[#1a2642] ring-1 ring-inset ring-white/[0.06]">
                            <div className="text-[9px] font-medium text-[#64748b]">{s.label}</div>
                            <div className={`font-mono font-bold mt-0.5 ${s.primary ? 'text-[15px] text-accent' : 'text-sm text-[#e2e8f0]'}`}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key pitching stats */}
                  {pitchTotals && n(pitchTotals.games) > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-2">Pitching</h3>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                        {[
                          { label: 'W-L', value: `${n(pitchTotals.wins)}-${n(pitchTotals.losses)}`, primary: false },
                          { label: 'ERA', value: fmtEra(pitchTotals.era), primary: true },
                          { label: 'G', value: n(pitchTotals.games), primary: false },
                          { label: 'IP', value: pitchTotals.inningsPitched ?? '—', primary: false },
                          { label: 'SO', value: n(pitchTotals.strikeouts), primary: false },
                          { label: 'WHIP', value: fmtEra(pitchTotals.whip), primary: true },
                          { label: 'K/9', value: pitchTotals.k9 ? fmtEra(pitchTotals.k9) : '—', primary: false },
                        ].map(s => (
                          <div key={s.label} className="rounded-lg px-2 py-2 text-center bg-[#1a2642] ring-1 ring-inset ring-white/[0.06]">
                            <div className="text-[9px] font-medium text-[#64748b]">{s.label}</div>
                            <div className={`font-mono font-bold mt-0.5 ${s.primary ? 'text-[15px] text-accent' : 'text-sm text-[#e2e8f0]'}`}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key fielding stats — lower visual weight */}
                  {fieldTotals && n(fieldTotals.games) > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-1.5">Fielding</h3>
                      <div className="grid grid-cols-6 gap-1.5">
                        {[
                          { label: 'G', value: n(fieldTotals.games) },
                          { label: 'PO', value: n(fieldTotals.putouts) },
                          { label: 'A', value: n(fieldTotals.assists) },
                          { label: 'E', value: n(fieldTotals.errors) },
                          { label: 'DP', value: n(fieldTotals.doublePlays) },
                          { label: 'FP%', value: fmtRate(fieldTotals.fieldingPct) },
                        ].map(s => (
                          <div key={s.label} className="rounded bg-[#172033] ring-1 ring-inset ring-white/[0.05] px-2 py-1.5 text-center">
                            <div className="text-[8px] font-medium text-[#64748b]">{s.label}</div>
                            <div className="text-xs font-mono font-bold text-[#94a3b8] mt-0.5">{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!batTotals && !pitchTotals && !fieldTotals && (
                    <p className="text-sm text-[#64748b] text-center py-6">No statistics recorded yet.</p>
                  )}
                </div>
              )}

              {/* GAME LOG TAB */}
              {tab === 'gamelog' && gameLog && (
                <div className="space-y-5">
                  {gameLog.batting.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569] mb-2">Batting Game Log</h3>
                      <div className="rounded-lg border border-white/[0.06] overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-[#1a2642]">
                              {['Date', 'Opp', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO', 'SB'].map(col => (
                                <th key={col} className={`px-1.5 py-1 text-[8px] font-bold tracking-wider text-[#64748b] whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}>
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
                                <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
                                  <td className="px-1.5 py-1.5 text-[#94a3b8]">{dateStr}</td>
                                  <td className="px-1.5 py-1.5 text-[#94a3b8]">{isHome ? 'vs' : '@'} {oppName}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.at_bats)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.runs)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.hits)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.doubles)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.triples)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.home_runs)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono font-bold text-[#f1f5f9]">{n(g.rbi)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.walks)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.strikeouts)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.stolen_bases)}</td>
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
                      <div className="rounded-lg border border-white/[0.06] overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-[#1a2642]">
                              {['Date', 'Opp', 'Dec', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR'].map(col => (
                                <th key={col} className={`px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#64748b] whitespace-nowrap ${col === 'Date' || col === 'Opp' ? 'text-left' : 'text-right'}`}>
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
                                <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]">
                                  <td className="px-2 py-1.5 text-[#e2e8f0]">{dateStr}</td>
                                  <td className="px-2 py-1.5 text-[#94a3b8]">{isHome ? 'vs' : '@'} {oppName}</td>
                                  <td className="px-2 py-1.5 text-right font-mono font-bold text-[#f1f5f9]">{g.decision || '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#e2e8f0]">{g.innings_pitched ?? '—'}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.hits_allowed)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.runs_allowed)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.earned_runs)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.walks_allowed)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.strikeouts)}</td>
                                  <td className="px-2 py-1.5 text-right font-mono text-[#94a3b8]">{n(g.home_runs_allowed)}</td>
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

              {/* SPRAY CHART TAB */}
              {tab === 'spraychart' && (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#475569]">Spray Chart</h3>
                    <span className="text-[10px] text-[#475569]">Balls in play</span>
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
