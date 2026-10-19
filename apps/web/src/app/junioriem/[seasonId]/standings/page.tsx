import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { StandingsClient, type LeagueStandings } from '../../../standings/standings-client';
import { JunioriemSection } from '../../section';
import { loadAgeGroups, loadJunioriemGroups } from '../../groups';

export const metadata: Metadata = { title: 'Junioriem Standings - LBSS' };

export const revalidate = 30;

type Props = { params: Promise<{ seasonId: string }>; searchParams: Promise<{ group?: string }> };

export default async function JunioriemStandingsPage({ params, searchParams }: Props) {
  const { seasonId: raw } = await params;
  const { group: groupSlug } = await searchParams;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  const ageGroups = await loadAgeGroups(seasonId);
  const active = ageGroups.find((group) => group.slug === groupSlug) ?? null;
  if (ageGroups.length > 0 && !active) {
    redirect(`/junioriem/${seasonId}/standings?group=${encodeURIComponent(ageGroups[0]!.slug)}`);
  }

  let initialStandings: LeagueStandings[] = [];
  if (active) {
    initialStandings = [{ leagueId: active.id, leagueName: active.name, rows: [] }];
    try {
      const rows = await apiFetch<LeagueStandings['rows']>(
        `/api/public/standings/${active.id}?includeZeroGames=1`,
        { revalidate: API_REVALIDATE_STANDINGS },
      );
      if (Array.isArray(rows)) initialStandings = [{ leagueId: active.id, leagueName: active.name, rows }];
    } catch {}
  }

  return (
    <JunioriemSection
      groups={groups}
      seasonId={seasonId}
      section="standings"
      ageGroups={ageGroups}
      activeSlug={active?.slug ?? null}
    >
      {active ? (
        <Suspense fallback={null}>
          <StandingsClient
            key={active.id}
            embedded
            initialSeasons={groups}
            initialSeasonId={seasonId}
            initialStandings={initialStandings}
          />
        </Suspense>
      ) : null}
    </JunioriemSection>
  );
}
