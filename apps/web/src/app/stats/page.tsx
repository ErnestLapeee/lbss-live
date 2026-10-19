import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { StatsClient } from './stats-client';
import { defaultPublicSeason } from '@/lib/season-label';
import { fetchPublicSeasons, fetchStatsBundle, isYouthSeason } from './load-stats-page';

export const metadata: Metadata = {
  title: 'Statistics - LBSS',
  description: 'Batting and pitching statistics for the Latvijas Beisbola Liga',
};

export const revalidate = 60;

type Props = { searchParams: Promise<{ season?: string }> };

export default async function StatsPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasonFromUrl = params.season;
  const allSeasons = await fetchPublicSeasons();
  const seasons = allSeasons.filter((season) => !isYouthSeason(season));

  if (seasonFromUrl && seasonFromUrl !== 'all') {
    const requested = parseInt(seasonFromUrl, 10);
    if (!isNaN(requested) && allSeasons.some((season) => season.id === requested && isYouthSeason(season))) {
      redirect(`/junioriem/${requested}/statistika`);
    }
  }

  const activeSeason = defaultPublicSeason(seasons);
  let seasonId: number | null;
  if (seasonFromUrl === 'all' || seasonFromUrl === '') seasonId = null;
  else if (seasonFromUrl) {
    const n = parseInt(seasonFromUrl, 10);
    seasonId = !isNaN(n) && seasons.some((season) => season.id === n) ? n : (activeSeason?.id ?? null);
  } else seasonId = activeSeason?.id ?? null;

  const bundle = await fetchStatsBundle(seasonId);

  return (
    <div>
      <PageHeader title="Statistics" />
      <Suspense fallback={null}>
        <StatsClient
          audience="lbl"
          initialSeasons={seasons}
          initialSeasonId={seasonId ?? null}
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
