'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';

type Season = { id: number; name?: string; year?: number; isActive?: boolean };
type StandingsRow = {
  id: number;
  teamName: string;
  wins: number;
  losses: number;
  ties?: number;
  gamesPlayed: number;
  winPct?: string;
  gamesBehind?: string;
  runsScored?: number;
  runsAllowed?: number;
};
type LeagueStandings = { leagueName: string; leagueId: number; rows: StandingsRow[] };
type PlayoffsData = {
  seasonId: number;
  playoffs: { id: number; name: string; isActive: boolean; config: any } | null;
  leagues: Array<{
    leagueId: number;
    leagueName: string;
    seeds: Array<{ seed: number; teamId: number; teamName: string; wins: number; losses: number; ties: number; winPct: number; gamesBehind: number }>;
    bracket: {
      rounds: Array<{
        roundNumber: number;
        name: string;
        series: Array<{
          id: number | null;
          label: string;
          bestOf: number;
          higherSeed: number | null;
          lowerSeed: number | null;
          higherTeamName: string;
          lowerTeamName: string;
          wins: { higher: number; lower: number };
          winnerTeamId: number | null;
        }>;
      }>;
    };
  }>;
};

function proxy(path: string) {
  return path.startsWith('/api/') ? path.replace(/^\/api\//, '/api/proxy/') : `/api/proxy${path}`;
}

export function StandingsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [standings, setStandings] = useState<LeagueStandings[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [playoffs, setPlayoffs] = useState<PlayoffsData | null>(null);
  const [loadingPlayoffs, setLoadingPlayoffs] = useState(false);
  const [view, setView] = useState<'standings' | 'playoffs'>('standings');

  // Load seasons once (client-side so dropdown always appears)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(proxy('/api/public/stats/seasons'))
      .then((r) => r.json())
      .then((data: Season[] | { message?: string }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setSeasons(list);
        if (list.length > 0) {
          const fromUrl = searchParams?.get('season');
          const explicit = fromUrl ? list.find((s) => String(s.id) === fromUrl) : null;
          const active = explicit ?? list.find((s) => s.isActive) ?? list[0];
          setSelectedSeasonId(active.id);
        }
      })
      .catch(() => {
        if (!cancelled) setSeasons([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync selected season from URL on mount and when URL changes
  useEffect(() => {
    const fromUrl = searchParams?.get('season');
    if (!fromUrl || seasons.length === 0) return;
    const id = parseInt(fromUrl, 10);
    if (!isNaN(id) && seasons.some((s) => s.id === id)) {
      setSelectedSeasonId(id);
    }
  }, [searchParams, seasons]);

  // When selected season changes, update URL and fetch standings
  const loadStandings = useCallback(
    async (seasonId: number | null) => {
      if (seasonId == null || seasons.length === 0) {
        setStandings([]);
        return;
      }
      setLoadingStandings(true);
      const season = seasons.find((s) => s.id === seasonId);
      const year = season?.year;
      if (year == null) {
        setStandings([]);
        setLoadingStandings(false);
        return;
      }
      try {
        const seasonDetail: { leagues?: { id: number; name: string }[] } = await fetch(
          proxy(`/api/public/seasons/${year}`)
        ).then((r) => (r.ok ? r.json() : { leagues: [] }));
        const leagueList = seasonDetail.leagues || [];
        const results: LeagueStandings[] = [];
        for (const league of leagueList) {
          const rows: StandingsRow[] = await fetch(
            proxy(`/api/public/standings/${league.id}`)
          ).then((r) => (r.ok ? r.json() : []));
          results.push({ leagueName: league.name, leagueId: league.id, rows });
        }
        setStandings(results);
      } catch {
        setStandings([]);
      } finally {
        setLoadingStandings(false);
      }
    },
    [seasons]
  );

  useEffect(() => {
    loadStandings(selectedSeasonId);
  }, [selectedSeasonId, loadStandings]);

  // Load playoffs picture/bracket for selected season
  useEffect(() => {
    if (selectedSeasonId == null) {
      setPlayoffs(null);
      setView('standings');
      return;
    }
    let cancelled = false;
    setLoadingPlayoffs(true);
    fetch(proxy(`/api/public/playoffs/season/${selectedSeasonId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PlayoffsData | null) => {
        if (cancelled) return;
        const d = data && typeof data === 'object' ? data : null;
        setPlayoffs(d);
        if (!d?.playoffs) setView('standings');
      })
      .catch(() => {
        if (!cancelled) {
          setPlayoffs(null);
          setView('standings');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayoffs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId]);

  const handleSeasonChange = (value: string) => {
    const id = value === '' || value === 'all' ? null : parseInt(value, 10);
    const newId = id ?? seasons.find((s) => s.isActive)?.id ?? seasons[0]?.id ?? null;
    setSelectedSeasonId(newId);
    // When switching seasons, default to standings view; playoffs will be available if configured.
    setView('standings');
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (newId != null) {
      params.set('season', String(newId));
    } else {
      params.delete('season');
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const currentSeason = selectedSeasonId != null ? seasons.find((s) => s.id === selectedSeasonId) : null;
  const hasStandings = standings.some((s) => s.rows.length > 0);
  const hasPlayoffs = !!playoffs?.playoffs;

  return (
    <div>
      <PageHeader title="Standings" description="League standings by season" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Always-visible season selector */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-text-muted">Season (year):</span>
          {loading ? (
            <span className="text-text-faint text-sm">Loading seasons…</span>
          ) : seasons.length === 0 ? (
            <span className="text-text-faint text-sm">No seasons found</span>
          ) : (
            <select
              value={selectedSeasonId ?? ''}
              onChange={(e) => handleSeasonChange(e.target.value)}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
              aria-label="Select season by year"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.name || s.year) ?? s.id}
                </option>
              ))}
            </select>
          )}
          {currentSeason && (
            <span className="text-text-faint text-sm">
              {currentSeason.name ?? currentSeason.year ?? selectedSeasonId}
            </span>
          )}
        </div>

        {hasPlayoffs && (
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setView('standings')}
              className={`px-4 py-2 text-xs font-bold uppercase rounded-lg border transition-colors ${
                view === 'standings'
                  ? 'bg-surface border-border text-text'
                  : 'bg-surface-alt border-border text-text-muted hover:text-text'
              }`}
            >
              Standings
            </button>
            <button
              onClick={() => setView('playoffs')}
              className={`px-4 py-2 text-xs font-bold uppercase rounded-lg border transition-colors ${
                view === 'playoffs'
                  ? 'bg-surface border-border text-text'
                  : 'bg-surface-alt border-border text-text-muted hover:text-text'
              }`}
            >
              Playoffs
            </button>
          </div>
        )}

        {view === 'playoffs' ? (
          <div className="space-y-6">
            {loadingPlayoffs ? (
              <div className="rounded-xl border border-border bg-surface-alt p-12 text-center">
                <p className="text-text-muted">Loading playoff picture…</p>
              </div>
            ) : !hasPlayoffs ? (
              <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
                <p className="text-lg font-medium text-text-muted">No playoffs configured for this season</p>
              </div>
            ) : (
              <>
                <h2 className="text-sm font-bold uppercase tracking-wider text-text-faint">
                  {playoffs?.playoffs?.name ?? 'Playoffs'}
                </h2>
                {(playoffs?.leagues ?? []).map((lg) => (
                  <div key={lg.leagueId} className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-surface-alt">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-heading text-sm font-bold">{lg.leagueName}</div>
                        <div className="text-[11px] text-text-faint truncate">
                          Current seeding from standings
                        </div>
                      </div>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      <div className="flex gap-4 min-w-[720px]">
                        {(lg.bracket?.rounds ?? []).map((r) => (
                          <div key={r.roundNumber} className="w-64 shrink-0">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-text-faint mb-2">
                              {r.name}
                            </div>
                            <div className="space-y-2">
                              {r.series.map((s) => (
                                <div key={s.id ?? s.label} className="border border-border rounded-lg bg-surface-alt p-3">
                                  <div className="text-[10px] text-text-faint font-semibold mb-2 flex justify-between">
                                    <span>{s.label}</span>
                                    <span>Bo{s.bestOf}</span>
                                  </div>
                                  <div className="text-[11px] font-medium flex items-center justify-between">
                                    <span className="truncate">{s.higherSeed ? `${s.higherSeed}. ` : ''}{s.higherTeamName}</span>
                                    <span className="font-mono text-text-faint">{s.wins?.higher ?? 0}</span>
                                  </div>
                                  <div className="text-[11px] font-medium flex items-center justify-between mt-1">
                                    <span className="truncate">{s.lowerSeed ? `${s.lowerSeed}. ` : ''}{s.lowerTeamName}</span>
                                    <span className="font-mono text-text-faint">{s.wins?.lower ?? 0}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : loadingStandings ? (
          <div className="rounded-xl border border-border bg-surface-alt p-12 text-center">
            <p className="text-text-muted">Loading standings…</p>
          </div>
        ) : !hasStandings ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
            <p className="text-lg font-medium text-text-muted">No standings data for this season yet</p>
            <p className="mt-2 text-sm text-text-faint">
              Standings will appear once games are played and finalized. Try selecting another season above.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {standings.map((league) => (
              <div key={league.leagueId}>
                <h2 className="mb-3 text-lg font-bold">{league.leagueName}</h2>
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt">
                        <th className="w-8 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          Team
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          W
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          L
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          T
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          GP
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          PCT
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          GB
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          RS
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-faint">
                          RA
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {league.rows.map((row, i) => (
                        <tr
                          key={row.id}
                          className="border-b border-border last:border-0 transition-colors hover:bg-surface-alt/50"
                        >
                          <td className="px-4 py-3 font-bold text-text-faint">{i + 1}</td>
                          <td className="px-4 py-3 font-semibold">{row.teamName || '—'}</td>
                          <td className="stat-value px-4 py-3 text-right font-mono">{row.wins}</td>
                          <td className="stat-value px-4 py-3 text-right font-mono">{row.losses}</td>
                          <td className="stat-value px-4 py-3 text-right font-mono">{row.ties ?? 0}</td>
                          <td className="stat-value px-4 py-3 text-right font-mono">{row.gamesPlayed}</td>
                          <td className="stat-value px-4 py-3 text-right font-mono font-semibold">
                            {row.winPct ?? '.000'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-text-muted">
                            {row.gamesBehind === '0' || row.gamesBehind === '0.0' ? '—' : row.gamesBehind ?? '—'}
                          </td>
                          <td className="stat-value px-4 py-3 text-right font-mono">{row.runsScored ?? 0}</td>
                          <td className="stat-value px-4 py-3 text-right font-mono">{row.runsAllowed ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
