import type { Metadata } from 'next';
import { Suspense } from 'react';
import { apiFetch, API_REVALIDATE_SEASONS, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { StandingsClient, type LeagueStandings } from './standings-client';

export const metadata: Metadata = { title: 'Standings' };

/** ISR: standings page shell cached; client refetches on season change. */
export const revalidate = 30;

type Props = { searchParams: Promise<{ season?: string }> };

export default async function StandingsPage({ searchParams }: Props) {
  const params = await searchParams;
  let seasons: { id: number; name?: string; year?: number; isActive?: boolean; seasonKind?: string }[] = [];
  try {
    const data = await apiFetch<typeof seasons>('/api/public/stats/seasons', {
      revalidate: API_REVALIDATE_SEASONS,
    });
    seasons = Array.isArray(data) ? data : [];
  } catch {}

  const fromUrl = params.season;
  const explicit = fromUrl ? seasons.find((s) => String(s.id) === fromUrl) : null;
  const active = explicit ?? seasons.find((s) => s.isActive) ?? seasons[0];
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
