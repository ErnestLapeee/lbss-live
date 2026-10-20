import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { StatsClient, type AgeGroupLeaders, type LeadersData } from '../../../stats/stats-client';
import { fetchStatsBundle } from '../../../stats/load-stats-page';
import { JunioriemSection } from '../../section';
import { loadAgeGroups, loadJunioriemGroups, type AgeGroup } from '../../groups';

export const metadata: Metadata = {
  title: 'Statistika Junioriem - LBSS',
};

export const revalidate = 60;

type Props = { params: Promise<{ seasonId: string }>; searchParams: Promise<{ group?: string }> };

function asLeaders(value: unknown): LeadersData | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LeadersData) : null;
}

async function loadAgeGroupLeaders(seasonId: number, ageGroups: AgeGroup[]): Promise<AgeGroupLeaders[]> {
  return Promise.all(
    ageGroups.map(async (group) => {
      const [batting, pitching] = await Promise.all([
        apiFetch(`/api/public/stats/leaders?seasonId=${seasonId}&leagueId=${group.id}`, {
          revalidate: API_REVALIDATE_STANDINGS,
        }).catch(() => null),
        apiFetch(`/api/public/stats/pitching-leaders?seasonId=${seasonId}&leagueId=${group.id}`, {
          revalidate: API_REVALIDATE_STANDINGS,
        }).catch(() => null),
      ]);
      return {
        id: group.id,
        name: group.name,
        batting: asLeaders(batting),
        pitching: asLeaders(pitching),
      };
    }),
  );
}

export default async function JunioriemStatistikaPage({ params, searchParams }: Props) {
  const { seasonId: raw } = await params;
  const { group: groupSlug } = await searchParams;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  const ageGroups = await loadAgeGroups(seasonId);
  const active = ageGroups.find((group) => group.slug === groupSlug) ?? ageGroups[0] ?? null;
  if (ageGroups.length > 0 && groupSlug !== active?.slug) {
    redirect(`/junioriem/${seasonId}/statistika?group=${encodeURIComponent(active!.slug)}`);
  }

  const [bundle, ageGroupLeaders] = await Promise.all([
    active ? fetchStatsBundle(seasonId, active.id) : Promise.resolve(null),
    loadAgeGroupLeaders(seasonId, ageGroups),
  ]);

  return (
    <JunioriemSection groups={groups} seasonId={seasonId} section="statistika" ageGroups={ageGroups}>
      {active && bundle ? (
        <Suspense fallback={null}>
          <StatsClient
            audience="juniori"
            hideSeasonSelect
            leagueId={active.id}
            ageGroups={ageGroups}
            ageGroupLeaders={ageGroupLeaders}
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
