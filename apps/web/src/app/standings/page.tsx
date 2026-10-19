import type { Metadata } from 'next';
import { Suspense } from 'react';
import { apiFetch, API_REVALIDATE_SEASONS, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { redirect } from 'next/navigation';
import { StandingsClient, type LeagueStandings } from './standings-client';
import { defaultPublicSeason } from '@/lib/season-label';
import { isYouthSeason } from '../stats/load-stats-page';

export const metadata: Metadata = { title: 'Standings' };

/** ISR: standings page shell cached; client refetches on season change. */
export const revalidate = 30;

type Props = { searchParams: Promise<{ season?: string }> };

export default async function StandingsPage({ searchParams }: Props) {
  const params = await searchParams;
  let seasons: { id: number; name?: string; year?: number; isActive?: boolean; seasonKind?: string; leagueLevel?: string }[] = [];
  try {
    const data = await apiFetch<typeof seasons>('/api/public/stats/seasons', {
      revalidate: API_REVALIDATE_SEASONS,
    });
    seasons = Array.isArray(data) ? data : [];
  } catch {}

  const fromUrl = params.season;
  if (fromUrl) {
    const youth = seasons.find((season) => String(season.id) === fromUrl && isYouthSeason(season));
    if (youth) redirect(`/junioriem/${youth.id}/standings`);
  }
  seasons = seasons.filter((season) => !isYouthSeason(season));
  const explicit = fromUrl ? seasons.find((s) => String(s.id) === fromUrl) : null;
  const active = explicit ?? defaultPublicSeason(seasons);
  const initialSeasonId = active?.id ?? null;

  let initialStandings: LeagueStandings[] = [];
  if (initialSeasonId != null && active?.seasonKind !== 'playoff') {
    try {
      const bundle = await apiFetch<{ leagues?: LeagueStandings[] }>(
        `/api/public/standings/by-season/${initialSeasonId}`,
        { revalidate: API_REVALIDATE_STANDINGS },
      );
      initialStandings = bundle.leagues ?? [];
    } catch {}
  }

  return (
    <Suspense fallback={null}>
      <StandingsClient
        initialSeasons={seasons}
        initialSeasonId={initialSeasonId}
        initialStandings={initialStandings}
      />
    </Suspense>
  );
}
