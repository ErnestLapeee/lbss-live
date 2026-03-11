import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { ScheduleClient } from './schedule-client';

export const metadata: Metadata = { title: 'Schedule & Scores' };

export default async function SchedulePage() {
  let seasons: { id: number; name: string; year: number }[] = [];
  let initialGames: any[] = [];
  try {
    seasons = await apiFetch('/api/public/stats/seasons');
    seasons = Array.isArray(seasons) ? seasons : [];
  } catch {}
  const activeSeason = seasons.find((s: { isActive?: boolean }) => s.isActive) || seasons[0];
  const defaultSeasonId = activeSeason?.id ?? null;
  try {
    const url = defaultSeasonId
      ? `/api/public/games?seasonId=${defaultSeasonId}`
      : '/api/public/games';
    const data = await apiFetch(url, { noCache: true });
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
