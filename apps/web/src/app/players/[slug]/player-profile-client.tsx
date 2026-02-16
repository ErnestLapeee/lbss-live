'use client';

import { useState, useEffect } from 'react';
import { SprayChart } from '@/components/stats/spray-chart';


interface PlayerProfileClientProps {
  slug: string;
  battingStats: any[];
}

type Tab = 'batting' | 'pitching' | 'fielding' | 'gamelog';

const fmtRate = (v: any) => (v != null && v !== '' ? Number(v).toFixed(3).replace(/^0/, '') : '—');
const fmtEra = (v: any) => (v != null && v !== '' ? Number(v).toFixed(2) : '—');
const fmtIp = (v: any) => (v != null ? v : '—');
const n = (v: any) => v ?? 0;

const POS_LABELS: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF',
};

export function PlayerProfileClient({ slug, battingStats }: PlayerProfileClientProps) {
  async function fetchJson(path: string) {
    const proxyPath = path.replace(/^\/api\//, '/api/proxy/');
    const res = await fetch(proxyPath);
    if (!res.ok) return null;
    return res.json();
  }

  const [tab, setTab] = useState<Tab>('batting');
  const [pitchingStats, setPitchingStats] = useState<any[] | null>(null);
  const [fieldingStats, setFieldingStats] = useState<any[] | null>(null);
  const [fieldingByPos, setFieldingByPos] = useState<any[] | null>(null);
  const [gameLog, setGameLog] = useState<{ batting: any[]; pitching: any[] } | null>(null);
  const [sprayData, setSprayData] = useState<any[] | null>(null);

  useEffect(() => {
    if (tab === 'pitching' && !pitchingStats) {
      fetchJson(`/api/public/players/${slug}/pitching-stats`).then(d => setPitchingStats(d || []));
    }
    if (tab === 'fielding' && !fieldingStats) {
      fetchJson(`/api/public/players/${slug}/fielding-stats`).then(d => setFieldingStats(d || []));
      fetchJson(`/api/public/players/${slug}/fielding-by-position`).then(d => setFieldingByPos(d || []));
    }
    if (tab === 'gamelog' && !gameLog) {
      fetchJson(`/api/public/players/${slug}/game-log`).then(d => setGameLog(d || { batting: [], pitching: [] }));
    }
  }, [tab, slug, pitchingStats, fieldingStats, gameLog]);

  useEffect(() => {
    fetchJson(`/api/public/players/${slug}/spray-chart`).then(d => setSprayData(d || []));
  }, [slug]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'batting', label: 'Batting' },
    { key: 'pitching', label: 'Pitching' },
    { key: 'fielding', label: 'Fielding' },
    { key: 'gamelog', label: 'Game Log' },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}>
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
                      <td className="px-2 py-2 font-semibold text-xs">{s.seasonYear ?? '—'}</td>
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
                      <td className="px-2 py-2 font-semibold text-xs">{s.seasonYear ?? '—'}</td>
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
                        <td className="px-2 py-2 font-semibold text-xs">{s.seasonYear ?? '—'}</td>
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
    </div>
  );
}
