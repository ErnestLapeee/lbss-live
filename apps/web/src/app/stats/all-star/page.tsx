import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch, API_REVALIDATE_SEASONS, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { AllStarClient, type AllStarData } from './all-star-client';

export const metadata: Metadata = {
  title: 'All-Star Team',
  description: 'Best players at each position for the Latvijas Beisbola Liga season',
};

export const revalidate = 60;

type Props = { searchParams: Promise<{ season?: string }> };

export default async function AllStarPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasonFromUrl = params.season;

  let seasons: Array<{ id: number; year: number; name: string; isActive?: boolean; seasonKind?: string }> = [];
  try {
    const data = await apiFetch('/api/public/stats/seasons', { revalidate: API_REVALIDATE_SEASONS });
    seasons = Array.isArray(data) ? data : [];
  } catch {}

  const activeSeason = seasons.find((s) => s.isActive) || seasons[0];
  let seasonId: number | null;
  if (seasonFromUrl === 'all' || seasonFromUrl === '') seasonId = null;
  else if (seasonFromUrl) {
    const n = parseInt(seasonFromUrl, 10);
    seasonId = !isNaN(n) && seasons.some((s) => s.id === n) ? n : (activeSeason?.id ?? null);
  } else seasonId = activeSeason?.id ?? null;

  let initialData: AllStarData | null = null;
  if (seasonId != null) {
    try {
      initialData = await apiFetch<AllStarData>(`/api/public/stats/all-star?seasonId=${seasonId}`, {
        revalidate: API_REVALIDATE_STANDINGS,
      });
    } catch {}
  }

  return (
    <div>
      <PageHeader title="All-Star Team" />
      <Suspense fallback={null}>
        <AllStarClient
          initialSeasons={seasons}
          initialSeasonId={seasonId}
          initialData={initialData}
        />
      </Suspense>
    </div>
  );
}
