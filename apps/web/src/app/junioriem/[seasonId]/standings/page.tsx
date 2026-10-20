import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { StandingsClient, type LeagueStandings } from '../../../standings/standings-client';
import { JunioriemSection } from '../../section';
import { loadAgeGroups, loadJunioriemGroups } from '../../groups';

export const metadata: Metadata = { title: 'Junioriem Standings - LBSS' };

export const revalidate = 30;

type Props = { params: Promise<{ seasonId: string }> };

export default async function JunioriemStandingsPage({ params }: Props) {
  const { seasonId: raw } = await params;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  const ageGroups = await loadAgeGroups(seasonId);
  let initialStandings: LeagueStandings[] = [];
  try {
    const bundle = await apiFetch<{ leagues?: LeagueStandings[] }>(
      `/api/public/standings/by-season/${seasonId}?includeZeroGames=1`,
      { revalidate: API_REVALIDATE_STANDINGS },
    );
    initialStandings = bundle.leagues ?? [];
  } catch {}

  return (
    <JunioriemSection groups={groups} seasonId={seasonId} section="standings" ageGroups={ageGroups}>
      <Suspense fallback={null}>
        <StandingsClient
          embedded
          initialSeasons={groups}
          initialSeasonId={seasonId}
          initialStandings={initialStandings}
        />
      </Suspense>
    </JunioriemSection>
  );
}
