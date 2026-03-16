import type { Metadata } from 'next';
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
      <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-10 py-6">
        <HitLocationsClient seasons={seasons} teams={teams} />
      </div>
    </div>
  );
}
