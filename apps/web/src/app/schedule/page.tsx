import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { ScheduleClient } from './schedule-client';

export const metadata: Metadata = { title: 'Schedule & Scores' };

export default async function SchedulePage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  let initialGames: any[] = [];
  try {
    const data = await apiFetch('/api/public/games');
    if (Array.isArray(data)) initialGames = data;
  } catch {}

  return <ScheduleClient apiBase={apiBase} initialGames={initialGames} />;
}
