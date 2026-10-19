import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { fetchPublicSeasons, isYouthSeason, type PublicSeason } from '../stats/load-stats-page';

export const metadata: Metadata = {
  title: 'Junioriem - LBSS',
  description: 'Children’s leagues, age groups, and statistics',
};

export const revalidate = 60;

function seasonName(season: PublicSeason): string {
  const name = (season.name ?? '').trim();
  if (name) return name;
  if (season.year != null) return String(season.year);
  return `Season ${season.id}`;
}

export default async function JunioriemPage() {
  const seasons = (await fetchPublicSeasons())
    .filter((season) => isYouthSeason(season) && season.seasonKind !== 'playoff')
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || seasonName(a).localeCompare(seasonName(b)));

  const years = [...new Set(seasons.map((season) => season.year ?? 0))];

  return (
    <div>
      <PageHeader title="Junioriem" />
      <div className="mx-auto max-w-none px-4 py-8 sm:px-6 lg:px-10">
        <p className="mb-8 max-w-2xl text-sm text-text-muted">
          Children’s leagues stay separate from LBL. Each age group or discipline has its own schedule, standings, and statistics.
        </p>
        {seasons.length === 0 ? (
          <p className="text-text-muted">No children’s seasons yet.</p>
        ) : (
          <div className="space-y-10">
            {years.map((year) => (
              <section key={year}>
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-text-faint">
                  {year || 'Season'}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {seasons
                    .filter((season) => (season.year ?? 0) === year)
                    .map((season) => (
                      <article key={season.id} className="rounded-xl border border-border bg-surface p-5">
                        <h3 className="text-lg font-bold">{seasonName(season)}</h3>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={`/stats/juniori?season=${season.id}`}
                            className="rounded-lg bg-[#136cb2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0f5a96]"
                          >
                            Statistika
                          </Link>
                          <Link
                            href={`/schedule?season=${season.id}`}
                            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-alt"
                          >
                            Schedule
                          </Link>
                          <Link
                            href={`/standings?season=${season.id}`}
                            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-alt"
                          >
                            Standings
                          </Link>
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
