import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch } from '@/lib/api';
import { HitLocationsClient } from './hit-locations-client';

export const metadata: Metadata = {
  title: 'Team Hit Locations - LBSS',
  description: 'Hit location spray chart by team and season',
};

export default async function TeamHitLocationsPage() {
  let seasons: { id: number; name: string; year: number }[] = [];
  let teams: { id: number; name: string; shortName: string | null }[] = [];
  try {
    const [s, t] = await Promise.all([
      apiFetch('/api/public/stats/seasons').catch(() => []),
      apiFetch('/api/public/teams').catch(() => []),
    ]);
    seasons = Array.isArray(s) ? (s as { id: number; name: string; year: number }[]) : [];
    teams = Array.isArray(t) ? (t as { id: number; name: string; shortName: string | null }[]) : [];
  } catch {}

  return (
    <div>
      <PageHeader title="Team Hit Locations" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-text-muted text-sm mb-6">
          View aggregate hit locations (spray chart) for a team in a selected season. Per-player spray charts are available on each{' '}
          <Link href="/players" className="text-accent hover:underline">player profile</Link>.
        </p>
        <HitLocationsClient seasons={seasons} teams={teams} />
      </div>
    </div>
  );
}
