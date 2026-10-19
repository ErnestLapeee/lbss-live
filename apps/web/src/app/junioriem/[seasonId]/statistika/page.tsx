import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { StatsClient } from '../../../stats/stats-client';
import { fetchStatsBundle } from '../../../stats/load-stats-page';
import { JunioriemSection } from '../../section';
import { loadJunioriemGroups } from '../../groups';

export const metadata: Metadata = {
  title: 'Statistika Junioriem - LBSS',
};

export const revalidate = 60;

type Props = { params: Promise<{ seasonId: string }> };

export default async function JunioriemStatistikaPage({ params }: Props) {
  const { seasonId: raw } = await params;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  const bundle = await fetchStatsBundle(seasonId);

  return (
    <JunioriemSection groups={groups} seasonId={seasonId} section="statistika">
      <Suspense fallback={null}>
        <StatsClient
          audience="juniori"
          hideSeasonSelect
          initialSeasons={groups}
          initialSeasonId={seasonId}
          initialBatting={bundle.initialBatting}
          initialPitching={bundle.initialPitching}
          initialFielding={bundle.initialFielding}
          initialBattingLeaders={bundle.initialBattingLeaders}
          initialPitchingLeaders={bundle.initialPitchingLeaders}
        />
      </Suspense>
    </JunioriemSection>
  );
}
