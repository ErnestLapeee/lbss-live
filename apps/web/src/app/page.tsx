import Link from 'next/link';
import {
  apiFetch,
  API_REVALIDATE_GAMES,
  API_REVALIDATE_SEASONS,
  API_REVALIDATE_STANDINGS,
} from '@/lib/api';
import { RecentGameCard, UpcomingGameCard } from '@/components/home/home-game-cards';
import { HomeLiveScores } from '@/components/home/home-live-scores';
import { SectionHeader } from '@/components/ui/section-header';
import { TeamMark } from '@/components/ui/team-mark';

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data))
    return (v as { data: T[] }).data;
  return [];
}

/** ISR: cache homepage HTML; live scores refresh on next revalidate or via schedule/live pages. */
export const revalidate = 20;

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

  try {
    seasons = toArray(await apiFetch('/api/public/seasons', { revalidate: API_REVALIDATE_SEASONS }));
  } catch {}
  activeSeason = seasons.find((s: any) => s?.isActive) ?? seasons[0] ?? null;

  const gamesUrl = activeSeason?.id
    ? `/api/public/games?seasonId=${activeSeason.id}`
    : '/api/public/games';
  const standingsUrl = activeSeason?.id
    ? `/api/public/standings/by-season/${activeSeason.id}?includeZeroGames=1`
    : null;

  try {
    const [gamesResult, standingsResult] = await Promise.all([
      apiFetch(gamesUrl, { revalidate: API_REVALIDATE_GAMES }).catch(() => []),
      standingsUrl
        ? apiFetch<{ leagues?: Array<{ rows?: any[] }> }>(standingsUrl, {
            revalidate: API_REVALIDATE_STANDINGS,
          }).catch(async () => {
            try {
              const seasonDetail = await apiFetch<{ leagues?: { id: number }[] }>(
                `/api/public/seasons/by-id/${activeSeason!.id}`,
                { revalidate: API_REVALIDATE_STANDINGS },
              );
              const leagues = seasonDetail?.leagues ?? [];
              const rowsByLeague = await Promise.all(
                leagues
                  .filter((lg) => lg?.id)
                  .map((lg) =>
                    apiFetch<any[]>(`/api/public/standings/${lg.id}?includeZeroGames=1`, {
                      revalidate: API_REVALIDATE_STANDINGS,
                    }).then((rows) => ({ rows: Array.isArray(rows) ? rows : [] })),
                  ),
              );
              return { leagues: rowsByLeague };
            } catch {
              return null;
            }
          })
        : Promise.resolve(null),
    ]);
    games = toArray(gamesResult);
    if (standingsResult?.leagues) {
      miniStandings = standingsResult.leagues.flatMap((lg) =>
        (lg.rows ?? []).map((r: any) => ({
          teamId: r.teamId,
          teamName: r.teamName,
          teamShortName: r.teamShortName ?? null,
          teamLogoUrl: r.teamLogoUrl ?? null,
          wins: r.wins ?? 0,
          losses: r.losses ?? 0,
          winPct: r.winPct ?? null,
          gamesBehind: r.gamesBehind ?? null,
        })),
      );
    }
  } catch {}

  const liveGames = games.filter((g: any) => g.status === 'live');
  const finalGames = games.filter((g: any) => g.status === 'final');
  const recentGames = [...liveGames, ...finalGames].slice(0, 6);
  const upcomingGames = games
    .filter((g: any) => g.status === 'scheduled')
    .slice(0, 4);

  const recordByTeamId = new Map(
    miniStandings.map((r) => [r.teamId, `${r.wins}-${r.losses}`]),
  );

  return (
    <div>
      {liveGames.length > 0 && (
        <HomeLiveScores
          initialGames={liveGames.map((g: any) => ({
            id: g.id,
            awayTeamName: g.awayTeamName,
            homeTeamName: g.homeTeamName,
            awayTeamShort: g.awayTeamShort,
            homeTeamShort: g.homeTeamShort,
            awayTeamLogoUrl: g.awayTeamLogoUrl,
            homeTeamLogoUrl: g.homeTeamLogoUrl,
            awayScore: g.awayScore ?? 0,
            homeScore: g.homeScore ?? 0,
          }))}
          seasonId={activeSeason?.id ?? null}
        />
      )}
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
                    <UpcomingGameCard
                      key={game.id}
                      game={game}
                      awayRecord={recordByTeamId.get(game.awayTeamId) ?? null}
                      homeRecord={recordByTeamId.get(game.homeTeamId) ?? null}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── Recent Results ── */}
            {recentGames.length > 0 && (
              <section>
                <SectionHeader title="Recent Results" href="/schedule" linkLabel="Full Schedule" />
                <div className="space-y-2">
                  {recentGames.slice(0, 4).map((game: any) => (
                    <RecentGameCard key={game.id} game={game} />
                  ))}
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
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

// Quick links removed per request.
