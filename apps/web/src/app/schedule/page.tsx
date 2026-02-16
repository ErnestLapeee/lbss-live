import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { ScheduleClient } from './schedule-client';

export const metadata: Metadata = { title: 'Schedule & Scores' };

export default async function SchedulePage() {
  let initialGames: any[] = [];
  try {
    const data = await apiFetch('/api/public/games', { noCache: true });
    if (Array.isArray(data)) initialGames = data;
  } catch {}

  return <ScheduleClient initialGames={initialGames} />;
}
