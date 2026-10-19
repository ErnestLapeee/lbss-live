import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { StatsClient } from '../../../stats/stats-client';
import { fetchStatsBundle } from '../../../stats/load-stats-page';
import { JunioriemSection } from '../../section';
import { loadAgeGroups, loadJunioriemGroups } from '../../groups';

export const metadata: Metadata = {
  title: 'Statistika Junioriem - LBSS',
};

export const revalidate = 60;

type Props = { params: Promise<{ seasonId: string }>; searchParams: Promise<{ group?: string }> };

export default async function JunioriemStatistikaPage({ params, searchParams }: Props) {
  const { seasonId: raw } = await params;
  const { group: groupSlug } = await searchParams;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  const ageGroups = await loadAgeGroups(seasonId);
  const active = ageGroups.find((group) => group.slug === groupSlug) ?? null;
  if (ageGroups.length > 0 && !active) {
    redirect(`/junioriem/${seasonId}/statistika?group=${encodeURIComponent(ageGroups[0]!.slug)}`);
  }

  const bundle = active ? await fetchStatsBundle(seasonId, active.id) : null;

  return (
    <JunioriemSection
      groups={groups}
      seasonId={seasonId}
      section="statistika"
      ageGroups={ageGroups}
      activeSlug={active?.slug ?? null}
    >
      {active && bundle ? (
        <Suspense fallback={null}>
          <StatsClient
            key={active.id}
            audience="juniori"
            hideSeasonSelect
            leagueId={active.id}
            initialSeasons={groups}
            initialSeasonId={seasonId}
            initialBatting={bundle.initialBatting}
            initialPitching={bundle.initialPitching}
            initialFielding={bundle.initialFielding}
            initialBattingLeaders={bundle.initialBattingLeaders}
            initialPitchingLeaders={bundle.initialPitchingLeaders}
          />
        </Suspense>
      ) : null}
    </JunioriemSection>
  );
}
