import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { LiveGameClient } from './live-client';

export const metadata: Metadata = { title: 'Game Detail' };

export default async function LiveGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);

  // Fetch ALL initial data server-side (no cache for live data)
  const opts = { noCache: true };
  const [initialData, initialEvents, initialLineups, initialBatting, initialPitching, initialSeasonCtx] =
    await Promise.all([
      apiFetch(`/api/public/games/${gameId}`, opts).catch(() => null),
      apiFetch(`/api/public/games/${gameId}/events`, opts).catch(() => []),
      apiFetch(`/api/public/games/${gameId}/lineups`, opts).catch(() => []),
      apiFetch(`/api/public/games/${gameId}/boxscore`, opts).catch(() => []),
      apiFetch(`/api/public/games/${gameId}/pitching-boxscore`, opts).catch(() => []),
      apiFetch(`/api/public/games/${gameId}/season-context`, opts).catch(() => ({ batting: [], pitching: [] })),
    ]);

  return (
    <LiveGameClient
      gameId={gameId}
      initialData={initialData}
      initialEvents={Array.isArray(initialEvents) ? initialEvents : []}
      initialLineups={Array.isArray(initialLineups) ? initialLineups : []}
      initialBatting={Array.isArray(initialBatting) ? initialBatting : []}
      initialPitching={Array.isArray(initialPitching) ? initialPitching : []}
      initialSeasonCtx={initialSeasonCtx && typeof initialSeasonCtx === 'object' ? initialSeasonCtx as any : { batting: [], pitching: [] }}
    />
  );
}
