import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ScoreboardStrip } from '@/components/ui/scoreboard-strip';
import { SectionHeader } from '@/components/ui/section-header';

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data))
    return (v as { data: T[] }).data;
  return [];
}

export default async function HomePage() {
  let articles: any[] = [];
  let games: any[] = [];
  let teams: any[] = [];

  try { articles = toArray(await apiFetch('/api/public/articles')); } catch {}
  try { games = toArray(await apiFetch('/api/public/games', { noCache: true })); } catch {}
  try { teams = toArray(await apiFetch('/api/public/teams')); } catch {}

  const liveGames = games.filter((g: any) => g.status === 'live');
  const finalGames = games.filter((g: any) => g.status === 'final');
  const recentGames = [...liveGames, ...finalGames].slice(0, 6);
  const upcomingGames = games
    .filter((g: any) => g.status === 'scheduled')
    .slice(0, 4);
  const scoreboardGames = recentGames.slice(0, 6);
  const recentArticles = articles.slice(0, 4);

  return (
    <div>
      {/* ── Scoreboard Strip ── */}
      <ScoreboardStrip games={scoreboardGames} />

      {/* ── Hero ── */}
      <section className="bg-white border-b border-[#ccc]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="max-w-3xl">
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">2026 Season</p>
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
          <div className="mt-6 grid grid-cols-3 gap-3 max-w-md">
            <StatBox label="Teams" value={teams.length || '—'} />
            <StatBox label="Games" value={games.length || '—'} />
            <StatBox label="Season" value="2026" />
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
                  {upcomingGames.map((game: any) => {
                    const date = new Date(game.scheduledAt);
                    return (
                      <div
                        key={game.id}
                        className="rounded-xl border border-border bg-surface p-4 hover:border-accent/30 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                            {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-[11px] font-medium text-text-faint">
                            {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <TeamBadge name={game.awayTeamName || 'TBD'} />
                            <span className="font-semibold text-sm">{game.awayTeamName || 'TBD'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TeamBadge name={game.homeTeamName || 'TBD'} />
                            <span className="font-semibold text-sm">{game.homeTeamName || 'TBD'}</span>
                          </div>
                        </div>
                        {game.venue && (
                          <div className="mt-2.5 text-[11px] text-text-faint">{game.venue}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Recent Results ── */}
            {recentGames.length > 0 && (
              <section>
                <SectionHeader title="Recent Results" href="/schedule" linkLabel="Full Schedule" />
                <div className="space-y-2">
                  {recentGames.slice(0, 4).map((game: any) => {
                    const date = new Date(game.scheduledAt);
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
                              <TeamBadge name={game.awayTeamName || 'TBD'} />
                              <span className={`text-sm font-semibold ${awayWon ? '' : 'text-text-muted'}`}>
                                {game.awayTeamName || 'TBD'}
                              </span>
                              <span className={`ml-auto font-heading text-lg font-bold stat-value ${awayWon ? '' : 'text-text-muted'}`}>
                                {game.awayScore ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TeamBadge name={game.homeTeamName || 'TBD'} />
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
                                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

            {/* ── News ── */}
            <section>
              <SectionHeader title="Latest News" href="/news" />
              {recentArticles.length === 0 ? (
                <EmptyCard message="No news articles published yet." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {recentArticles.map((article: any, i: number) => (
                    <Link
                      key={article.id}
                      href={`/news/${article.slug}`}
                      className={`group block rounded-xl border border-border bg-surface overflow-hidden hover:border-accent/30 hover:shadow-md transition-all ${
                        i === 0 ? 'sm:col-span-2' : ''
                      }`}
                    >
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent">
                            News
                          </span>
                          <span className="text-[11px] text-text-faint">
                            {article.publishedAt
                              ? new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : ''}
                          </span>
                        </div>
                        <h3 className={`font-heading font-bold group-hover:text-accent transition-colors leading-snug ${
                          i === 0 ? 'text-lg' : 'text-base'
                        }`}>
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="mt-2 text-sm text-text-muted line-clamp-2 leading-relaxed">
                            {article.excerpt}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
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
                {teams.length === 0 ? (
                  <p className="text-sm text-text-muted py-4 text-center">No teams yet</p>
                ) : (
                  <div className="space-y-1">
                    {teams.slice(0, 6).map((team: any, i: number) => (
                      <div key={team.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-alt transition-colors">
                        <span className="text-[11px] font-bold text-text-faint w-4">{i + 1}</span>
                        <TeamBadge name={team.name} />
                        <span className="text-sm font-medium flex-1 truncate">{team.name}</span>
                        <span className="text-[11px] text-text-faint font-mono">—</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Quick Links */}
            <section className="space-y-2">
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-text-muted px-1">Quick Links</h3>
              <QuickLinkCard title="League Schedule" description="" href="/schedule" />
              <QuickLinkCard title="Player Directory" description="" href="/players" />
              <QuickLinkCard title="Statistics" description="" href="/stats" />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper Components ── */

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-[#ccc] bg-[#fafafa] px-4 py-3">
      <div className="text-lg font-bold text-[#111] stat-value">{value}</div>
      <div className="text-[11px] text-[#666] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function TeamBadge({ name }: { name: string }) {
  const abbr = name.length <= 3
    ? name.toUpperCase()
    : name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-6 h-6 rounded border border-[#ccc] bg-[#f0f0f0] flex items-center justify-center shrink-0">
      <span className="text-[9px] font-bold text-[#333]">{abbr}</span>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
      <p className="text-sm text-text-muted">{''}</p>
    </div>
  );
}

function QuickLinkCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 hover:border-accent/30 hover:shadow-sm transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold group-hover:text-accent transition-colors">{title}</div>
        <div className="text-[11px] text-text-faint truncate">{description}</div>
      </div>
      <svg className="w-4 h-4 text-text-faint group-hover:text-accent transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
