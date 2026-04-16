'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { PlayoffBracket } from '@/components/playoffs/playoff-bracket';

type Season = {
  id: number;
  name?: string;
  year?: number;
  isActive?: boolean;
  hasPlayoffs?: boolean;
  playoffSettings?: any;
  seasonKind?: string;
};
type StandingsRow = {
  id: number;
  teamId?: number;
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
          higherTeamId?: number | null;
          lowerTeamId?: number | null;
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
  const [playoffsFetchError, setPlayoffsFetchError] = useState<string | null>(null);

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
      const kind = seasons.find((s) => s.id === seasonId)?.seasonKind;
      if (kind === 'playoff') {
        setStandings([]);
        return;
      }
      setLoadingStandings(true);
      try {
        const seasonDetail: { leagues?: { id: number; name: string }[] } = await fetch(
          proxy(`/api/public/seasons/by-id/${seasonId}`)
        ).then((r) => (r.ok ? r.json() : { leagues: [] }));
        const leagueList = seasonDetail.leagues || [];
        const results: LeagueStandings[] = await Promise.all(
          leagueList.map(async (league) => {
            const rows: StandingsRow[] = await fetch(proxy(`/api/public/standings/${league.id}`)).then((r) =>
              r.ok ? r.json() : [],
            );
            return { leagueName: league.name, leagueId: league.id, rows };
          }),
        );
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
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (params.get('view') === 'playoffs') {
        params.delete('view');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
      return;
    }
    let cancelled = false;
    setLoadingPlayoffs(true);
    setPlayoffsFetchError(null);
    fetch(proxy(`/api/public/playoffs/season/${selectedSeasonId}`))
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          const msg = typeof j === 'object' && j && 'message' in j ? String((j as { message?: string }).message) : r.statusText;
          throw new Error(msg || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: PlayoffsData | null) => {
        if (cancelled) return;
        const d = data && typeof data === 'object' ? data : null;
        setPlayoffs(d);
        if (!d?.playoffs) {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('view');
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPlayoffs(null);
          setPlayoffsFetchError(err instanceof Error ? err.message : 'Could not load playoffs');
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.delete('view');
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayoffs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId, pathname, router, searchParams]);

  const handleSeasonChange = (value: string) => {
    const id = value === '' || value === 'all' ? null : parseInt(value, 10);
    const newId = id ?? seasons.find((s) => s.isActive)?.id ?? seasons[0]?.id ?? null;
    setSelectedSeasonId(newId);
    // When switching seasons, default to standings view; playoffs will be available if configured.
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (newId != null) {
      params.set('season', String(newId));
    } else {
      params.delete('season');
    }
    params.delete('view');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const currentSeason = selectedSeasonId != null ? seasons.find((s) => s.id === selectedSeasonId) : null;
  const isPlayoffSeason = currentSeason?.seasonKind === 'playoff';
  const hasStandings = standings.some((s) => s.rows.length > 0);
  const hasPlayoffBracketData = !!playoffs && (
    !!playoffs.playoffs ||
    (playoffs.leagues ?? []).some((lg) => (lg.bracket?.rounds ?? []).length > 0)
  );
  const playoffsByLeagueId = new Map((playoffs?.leagues ?? []).map((lg) => [lg.leagueId, lg] as const));
  const leagueCount = (playoffs?.leagues ?? []).length;

  /** Playoff-type seasons: bracket only — drop stale `?view=` from URL. */
  useEffect(() => {
    if (selectedSeasonId == null) return;
    const season = seasons.find((s) => s.id === selectedSeasonId);
    if (season?.seasonKind !== 'playoff') return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (!params.get('view')) return;
    params.delete('view');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [selectedSeasonId, seasons, pathname, router, searchParams]);

  const pageTitle = isPlayoffSeason
    ? (currentSeason?.name?.trim() || 'Playoffs')
    : 'Standings';

  return (
    <div>
      <PageHeader title={pageTitle} description={isPlayoffSeason ? 'Postseason bracket' : 'League standings by season'} />
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
              aria-label="Select season"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.year != null ? `${s.year} – ` : ''}
                  {s.name ?? ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {isPlayoffSeason ? (
          <div className="space-y-6">
            {playoffsFetchError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                {playoffsFetchError}
              </div>
            )}
            {loadingPlayoffs ? (
              <div className="rounded-xl border border-border bg-surface-alt p-12 text-center">
                <p className="text-text-muted">Loading bracket…</p>
              </div>
            ) : !hasPlayoffBracketData ? (
              <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
                <p className="text-lg font-medium text-text-muted">No playoffs configured for this season</p>
              </div>
            ) : (
              <>
                {(playoffs?.leagues ?? []).map((lg) => {
                  const recordFromSeeds = (teamName: string) => {
                    const s = lg.seeds.find((x) => String(x.teamName ?? '').trim() === String(teamName ?? '').trim());
                    if (!s) return '';
                    const t = s.ties ?? 0;
                    const gb =
                      typeof s.gamesBehind === 'number' && Number.isFinite(s.gamesBehind)
                        ? s.gamesBehind.toFixed(1)
                        : '—';
                    return `${s.wins}-${s.losses}${t ? `-${t}` : ''} • GB ${gb}`;
                  };
                  return (
                    <section key={lg.leagueId} className="mx-auto w-full max-w-5xl space-y-3">
                      {leagueCount > 1 ? (
                        <h2 className="text-center font-heading text-sm font-semibold text-text-muted md:text-left">
                          {lg.leagueName}
                        </h2>
                      ) : null}
                      <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-[color:var(--color-surface)] via-[color:var(--color-surface-alt)]/40 to-[color:var(--color-surface-alt)]/80 p-4 shadow-[0_2px_24px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] md:p-8">
                        {leagueCount > 1 ? (
                          <p className="mb-4 text-[11px] leading-relaxed text-text-faint">
                            Seeding matches each league&apos;s regular-season standings.
                          </p>
                        ) : null}
                        <PlayoffBracket rounds={lg.bracket?.rounds ?? []} recordText={recordFromSeeds} />
                      </div>
                    </section>
                  );
                })}
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

                {/* Playoff picture — only real bracket data (no full-league provisional seeding). */}
                {(() => {
                  const lg = playoffsByLeagueId.get(league.leagueId);
                  const bracket = lg?.bracket?.rounds?.length ? lg.bracket : null;
                  const rounds = bracket?.rounds ?? [];
                  if (rounds.length === 0) return null;

                  const rowByTeam = new Map((league.rows ?? []).map(r => [String(r.teamName || '').trim(), r] as const));
                  const recordText = (teamName: string) => {
                    const r = rowByTeam.get(String(teamName || '').trim());
                    if (!r) return '';
                    const t = r.ties ?? 0;
                    const gb = r.gamesBehind === '0' || r.gamesBehind === '0.0' ? '—' : (r.gamesBehind ?? '—');
                    return `${r.wins}-${r.losses}${t ? `-${t}` : ''} • GB ${gb}`;
                  };

                  return (
                    <div className="mt-4 rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="px-4 py-3 border-b border-border bg-surface-alt">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                            Playoff picture
                          </div>
                          <div className="text-[11px] text-text-faint truncate">Configured bracket</div>
                        </div>
                      </div>
                      <div className="p-4 md:p-5">
                        <PlayoffBracket rounds={rounds} recordText={recordText} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
