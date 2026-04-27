import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { PlayersTable } from './players-table';

export const metadata: Metadata = { title: 'Players' };

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'data' in v && Array.isArray((v as { data: T[] }).data)) return (v as { data: T[] }).data;
  return [];
}

export default async function PlayersPage() {
  let players: any[] = [];
  try { players = toArray(await apiFetch<{ data?: any[] } | any[]>('/api/public/players')); } catch {}

  return (
    <div>
      <PageHeader title="Players" description="All registered players in the league" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {players.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
            <p className="text-text-muted text-lg font-medium">No players registered yet</p>
            <p className="text-text-faint text-sm mt-2">Players will appear here once added by administrators.</p>
          </div>
        ) : (
          <PlayersTable players={players} />
        )}
      </div>
    </div>
  );
}
