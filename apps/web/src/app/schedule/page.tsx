import type { Metadata } from 'next';
import { apiFetch, API_REVALIDATE_GAMES, API_REVALIDATE_SEASONS } from '@/lib/api';
import { ScheduleClient } from './schedule-client';

export const metadata: Metadata = { title: 'Schedule & Scores' };

/** ISR for initial schedule; client polls with no-store when live games exist. */
export const revalidate = 20;

type SchedulePageProps = { searchParams: Promise<{ season?: string }> };

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const params = await searchParams;
  let seasons: { id: number; name: string; year: number; isActive?: boolean; seasonKind?: string }[] = [];
  let initialGames: any[] = [];
  try {
    seasons = await apiFetch('/api/public/stats/seasons', { revalidate: API_REVALIDATE_SEASONS });
    seasons = Array.isArray(seasons) ? seasons : [];
  } catch {}
  const activeSeason = seasons.find((s) => s.isActive) || seasons[0];
  const rawSeason = params.season;
  let defaultSeasonId: number | null = activeSeason?.id ?? null;
  if (rawSeason === 'all') {
    defaultSeasonId = null;
  } else if (rawSeason) {
    const sid = parseInt(rawSeason, 10);
    if (!isNaN(sid) && seasons.some((s) => s.id === sid)) {
      defaultSeasonId = sid;
    }
  }
  try {
    const url = defaultSeasonId
      ? `/api/public/games?seasonId=${defaultSeasonId}`
      : '/api/public/games';
    const data = await apiFetch(url, { revalidate: API_REVALIDATE_GAMES });
    if (Array.isArray(data)) initialGames = data;
  } catch {}

  return (
    <ScheduleClient
      initialGames={initialGames}
      seasons={seasons}
      defaultSeasonId={defaultSeasonId}
    />
  );
}
