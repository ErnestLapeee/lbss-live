import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { normalizeGameEvents } from '@/lib/normalize-game-events';
import { LiveGameClient } from './live-client';

export const metadata: Metadata = { title: 'Game Detail' };
/** Always load fresh game + events (avoid prerendering empty PBP). */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  const eventsList = normalizeGameEvents(Array.isArray(initialEvents) ? initialEvents : []);

  return (
    <LiveGameClient
      key={gameId}
      gameId={gameId}
      initialData={initialData}
      initialEvents={eventsList}
      initialLineups={Array.isArray(initialLineups) ? initialLineups : []}
      initialBatting={Array.isArray(initialBatting) ? initialBatting : []}
      initialPitching={Array.isArray(initialPitching) ? initialPitching : []}
      initialSeasonCtx={initialSeasonCtx && typeof initialSeasonCtx === 'object' ? initialSeasonCtx as any : { batting: [], pitching: [] }}
    />
  );
}
