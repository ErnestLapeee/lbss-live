import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { StatsClient } from '../stats-client';
import { fetchPublicSeasons, fetchStatsBundle, isYouthSeason } from '../load-stats-page';

export const metadata: Metadata = {
  title: 'Statistika Junioriem - LBSS',
  description: 'Batting and pitching statistics for Jaunieši seasons',
};

export const revalidate = 60;

type Props = { searchParams: Promise<{ season?: string }> };

export default async function JunioriStatsPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasonFromUrl = params.season;
  const allSeasons = await fetchPublicSeasons();
  const seasons = allSeasons.filter((season) => isYouthSeason(season));

  if (seasonFromUrl === 'all') redirect('/stats?season=all');
  if (seasonFromUrl) {
    const requested = parseInt(seasonFromUrl, 10);
    if (!isNaN(requested) && allSeasons.some((season) => season.id === requested && !isYouthSeason(season))) {
      redirect(`/stats?season=${requested}`);
    }
  }

  const requestedId = seasonFromUrl ? parseInt(seasonFromUrl, 10) : NaN;
  const seasonId = seasons.some((season) => season.id === requestedId) ? requestedId : (seasons[0]?.id ?? null);

  if (seasonId == null) {
    return (
      <div>
        <PageHeader title="Statistika Junioriem" />
        <div className="mx-auto max-w-none px-4 py-16 text-center sm:px-6 lg:px-10">
          <p className="text-text-muted">No Juniori seasons yet.</p>
        </div>
      </div>
    );
  }

  const bundle = await fetchStatsBundle(seasonId);

  return (
    <div>
      <PageHeader title="Statistika Junioriem" />
      <Suspense fallback={null}>
        <StatsClient
          audience="juniori"
          initialSeasons={seasons}
          initialSeasonId={seasonId}
          initialBatting={bundle.initialBatting}
          initialPitching={bundle.initialPitching}
          initialFielding={bundle.initialFielding}
          initialBattingLeaders={bundle.initialBattingLeaders}
          initialPitchingLeaders={bundle.initialPitchingLeaders}
        />
      </Suspense>
    </div>
  );
}
