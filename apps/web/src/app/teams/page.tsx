import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { SeasonSelect } from '../standings/season-select';

export const metadata: Metadata = { title: 'Teams' };

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data)) return (v as { data: T[] }).data;
  return [];
}

type Props = { searchParams: Promise<{ season?: string }> };

export default async function TeamsPage({ searchParams }: Props) {
  let teams: any[] = [];
  let seasons: any[] = [];
  let currentSeasonId: number | null = null;

  try {
    const params = await searchParams;
    const seasonFromUrl = params.season;

    seasons = await apiFetch('/api/public/stats/seasons');
    seasons = Array.isArray(seasons) ? seasons : [];
    const explicit = seasons.find((s: any) => String(s.id) === seasonFromUrl);
    const activeSeason = explicit || seasons.find((s: any) => s.isActive) || seasons[0];
    currentSeasonId = activeSeason?.id ?? null;
  } catch {}

  try {
    teams = toArray(await apiFetch('/api/public/teams'));
  } catch {}

  return (
    <div>
      <PageHeader title="Teams" description="All teams competing in the Latvijas Beisbola Liga" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {seasons.length > 0 && (
          <div className="mb-4 flex justify-end">
            <SeasonSelect seasons={seasons} currentSeasonId={currentSeasonId} />
          </div>
        )}
        {teams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
            <p className="text-text-muted text-lg font-medium">No teams registered yet</p>
            <p className="text-text-faint text-sm mt-2">Teams will appear here once added by administrators.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team: any) => {
              const abbr = team.shortName || team.name.split(' ').map((w: string) => w[0]).join('').slice(0, 3);
              const href =
                currentSeasonId != null
                  ? `/teams/${team.slug}?season=${currentSeasonId}`
                  : `/teams/${team.slug}`;
              return (
                <Link
                  key={team.id}
                  href={href}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 hover:border-accent/30 hover:shadow-md transition-all"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white font-heading text-lg font-bold shrink-0">
                    {abbr}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-base font-bold group-hover:text-accent transition-colors truncate">
                      {team.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {team.city && <span className="text-xs text-text-muted">{team.city}</span>}
                      {team.foundedYear && (
                        <>
                          <span className="text-text-faint">·</span>
                          <span className="text-xs text-text-faint">Est. {team.foundedYear}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-text-faint group-hover:text-accent transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
