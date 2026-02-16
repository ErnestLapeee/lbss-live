import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { LiveGameClient } from './live-client';

export const metadata: Metadata = { title: 'Game Detail' };

export default async function LiveGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);

  // Fetch initial state server-side
  let initialData: any = null;
  try {
    initialData = await apiFetch(`/api/public/games/${gameId}`);
  } catch {}

  return <LiveGameClient gameId={gameId} initialData={initialData} />;
}
