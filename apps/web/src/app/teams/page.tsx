import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { TeamMark } from '@/components/ui/team-mark';
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
    const teamsUrl =
      currentSeasonId != null
        ? `/api/public/teams?seasonId=${currentSeasonId}`
        : '/api/public/teams';
    teams = toArray(await apiFetch(teamsUrl));
  } catch {}

  return (
    <div>
      <PageHeader title="Teams" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {seasons.length > 0 && (
          <div className="mb-4 flex justify-end">
            <SeasonSelect seasons={seasons} currentSeasonId={currentSeasonId} />
          </div>
        )}
        {teams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-10 text-center">
            <p className="text-text-muted text-sm font-medium">No teams in this season yet</p>
            <p className="text-text-faint text-xs mt-2">Choose another season or check back after leagues are set up.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((team: any) => {
              const href =
                currentSeasonId != null
                  ? `/teams/${team.slug}?season=${currentSeasonId}`
                  : `/teams/${team.slug}`;
              return (
                <Link
                  key={team.id}
                  href={href}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 hover:border-accent/30 hover:shadow-sm transition-all"
                >
                  <TeamMark
                    variant="card"
                    name={team.name}
                    shortName={team.shortName}
                    logoUrl={team.logoUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-sm font-semibold group-hover:text-accent transition-colors truncate">
                      {team.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {team.city && <span className="text-[11px] text-text-muted">{team.city}</span>}
                      {team.foundedYear && (
                        <>
                          <span className="text-text-faint">·</span>
                          <span className="text-[11px] text-text-faint">Est. {team.foundedYear}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-text-faint group-hover:text-accent transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
