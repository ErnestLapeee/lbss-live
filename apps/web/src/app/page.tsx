import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatGameDateMonthDay, formatGameDateShort, formatGameTime } from '@/lib/game-datetime';
import { SectionHeader } from '@/components/ui/section-header';
import { TeamMark } from '@/components/ui/team-mark';

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data))
    return (v as { data: T[] }).data;
  return [];
}

export default async function HomePage() {
  let games: any[] = [];
  let seasons: any[] = [];
  let activeSeason: any | null = null;
  let miniStandings: Array<{
    teamId: number;
    teamName: string;
    teamShortName: string | null;
    teamLogoUrl: string | null;
    wins: number;
    losses: number;
    winPct: any;
    gamesBehind: any;
  }> = [];

  try { seasons = toArray(await apiFetch('/api/public/seasons', { noCache: true })); } catch {}
  activeSeason = seasons.find((s: any) => s?.isActive) ?? seasons[0] ?? null;
  try {
    games = toArray(await apiFetch(
      activeSeason?.id ? `/api/public/games?seasonId=${activeSeason.id}` : '/api/public/games',
      { noCache: true }
    ));
  } catch {}

  // Mini-standings: active season -> leagues -> standings rows (include 0-game teams)
  try {
    if (activeSeason?.id) {
      const seasonDetail = await apiFetch(`/api/public/seasons/by-id/${activeSeason.id}`, { noCache: true });
      const leagues = (seasonDetail && typeof seasonDetail === 'object' && 'leagues' in seasonDetail)
        ? ((seasonDetail as any).leagues ?? [])
        : [];

      const standingsByLeague = await Promise.all(
        leagues
          .filter((lg: any) => lg?.id)
          .map(async (lg: any) => {
            const lgRows = toArray<any>(
              await apiFetch(`/api/public/standings/${lg.id}?includeZeroGames=1`, { noCache: true }),
            );
            return lgRows.map((r) => ({
              teamId: r.teamId,
              teamName: r.teamName,
              teamShortName: r.teamShortName ?? null,
              teamLogoUrl: r.teamLogoUrl ?? null,
              wins: r.wins ?? 0,
              losses: r.losses ?? 0,
              winPct: r.winPct ?? null,
              gamesBehind: r.gamesBehind ?? null,
            }));
          }),
      );
      miniStandings = standingsByLeague.flat();
    }
  } catch {}

  const liveGames = games.filter((g: any) => g.status === 'live');
  const finalGames = games.filter((g: any) => g.status === 'final');
  const recentGames = [...liveGames, ...finalGames].slice(0, 6);
  const upcomingGames = games
    .filter((g: any) => g.status === 'scheduled')
    .slice(0, 4);

  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-white border-b border-[#ccc]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="max-w-3xl">
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">
              {activeSeason
                ? `${activeSeason.year} Season`
                : 'Season'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#111] leading-tight">
              Latvijas Beisbola Liga
            </h1>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/schedule" className="px-4 py-2 bg-[#111] text-white text-sm font-medium hover:bg-[#333]">
                Schedule & Scores
              </Link>
              <Link href="/standings" className="px-4 py-2 border border-[#ccc] text-[#111] text-sm font-medium hover:bg-[#f0f0f0]">
                Standings
              </Link>
              <Link href="/teams" className="px-4 py-2 border border-[#ccc] text-[#111] text-sm font-medium hover:bg-[#f0f0f0]">
                Teams
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content Grid ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column (2/3) */}
          <div className="lg:col-span-2 space-y-10">
            {/* ── Upcoming Fixtures ── */}
            <section>
              <SectionHeader title="Upcoming Games" href="/schedule" />
              {upcomingGames.length === 0 ? (
                <EmptyCard message="No upcoming games scheduled yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {upcomingGames.map((game: any) => (
                      <div
                        key={game.id}
                        className="rounded-xl border border-border bg-surface p-4 hover:border-accent/30 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                            {formatGameDateShort(game.scheduledAt)}
                          </span>
                          <span className="text-[11px] font-medium text-text-faint tabular-nums">
                            {formatGameTime(game.scheduledAt)}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <TeamBadge name={game.awayTeamName || 'TBD'} shortName={game.awayTeamShort} logoUrl={game.awayTeamLogoUrl} />
                            <span className="font-semibold text-sm">{game.awayTeamName || 'TBD'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TeamBadge name={game.homeTeamName || 'TBD'} shortName={game.homeTeamShort} logoUrl={game.homeTeamLogoUrl} />
                            <span className="font-semibold text-sm">{game.homeTeamName || 'TBD'}</span>
                          </div>
                        </div>
                        {game.venue && (
                          <div className="mt-2.5 text-[11px] text-text-faint">{game.venue}</div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* ── Recent Results ── */}
            {recentGames.length > 0 && (
              <section>
                <SectionHeader title="Recent Results" href="/schedule" linkLabel="Full Schedule" />
                <div className="space-y-2">
                  {recentGames.slice(0, 4).map((game: any) => {
                    const isLive = game.status === 'live';
                    const awayWon = (game.awayScore ?? 0) > (game.homeScore ?? 0);
                    const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);

                    return (
                      <div
                        key={game.id}
                        className={`rounded-xl border p-4 transition-all ${
                          isLive
                            ? 'border-live/30 bg-live/[0.03] shadow-[0_0_20px_rgba(34,197,94,0.06)]'
                            : 'border-border bg-surface hover:bg-surface-alt'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <TeamBadge name={game.awayTeamName || 'TBD'} shortName={game.awayTeamShort} logoUrl={game.awayTeamLogoUrl} />
                              <span className={`text-sm font-semibold ${awayWon ? '' : 'text-text-muted'}`}>
                                {game.awayTeamName || 'TBD'}
                              </span>
                              <span className={`ml-auto font-heading text-lg font-bold stat-value ${awayWon ? '' : 'text-text-muted'}`}>
                                {game.awayScore ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TeamBadge name={game.homeTeamName || 'TBD'} shortName={game.homeTeamShort} logoUrl={game.homeTeamLogoUrl} />
                              <span className={`text-sm font-semibold ${homeWon ? '' : 'text-text-muted'}`}>
                                {game.homeTeamName || 'TBD'}
                              </span>
                              <span className={`ml-auto font-heading text-lg font-bold stat-value ${homeWon ? '' : 'text-text-muted'}`}>
                                {game.homeScore ?? 0}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4 flex flex-col items-center">
                            {isLive ? (
                              <span className="text-[10px] font-bold uppercase text-live tracking-wider live-badge px-2 py-0.5 rounded-full bg-live/10">Live</span>
                            ) : (
                              <>
                                <span className="text-[10px] font-bold uppercase text-text-faint tracking-wider">Final</span>
                                <span className="text-[10px] text-text-faint mt-0.5">
                                  {formatGameDateMonthDay(game.scheduledAt)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── Right sidebar (1/3) ── */}
          <div className="space-y-8">
            {/* Standings snapshot */}
            <section className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface-alt">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-sm font-bold uppercase tracking-wider">Standings</h3>
                  <Link href="/standings" className="text-[11px] font-semibold text-accent hover:text-accent-light transition-colors">
                    Full &rarr;
                  </Link>
                </div>
              </div>
              <div className="p-3">
                {miniStandings.length === 0 ? (
                  <p className="text-sm text-text-muted py-4 text-center">No standings yet</p>
                ) : (
                  <div className="space-y-1">
                    {miniStandings.slice(0, 6).map((row: any, i: number) => (
                      <div key={`${row.teamId}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-alt transition-colors">
                        <span className="text-[11px] font-bold text-text-faint w-4">{i + 1}</span>
                        <TeamBadge name={row.teamName} shortName={row.teamShortName} logoUrl={row.teamLogoUrl} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{row.teamName}</div>
                        </div>
                        <span className="text-[11px] text-text-faint font-mono">
                          {row.wins}-{row.losses}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper Components ── */

function TeamBadge({ name, shortName, logoUrl }: { name: string; shortName?: string | null; logoUrl?: string | null }) {
  return (
    <TeamMark
      name={name}
      shortName={shortName}
      logoUrl={logoUrl}
      variant="tableSm"
      className="border-[#ccc] bg-[#f0f0f0]"
    />
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
      <p className="text-sm text-text-muted">{''}</p>
    </div>
  );
}

// Quick links removed per request.
