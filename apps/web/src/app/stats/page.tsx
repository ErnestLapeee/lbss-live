import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch, API_REVALIDATE_SEASONS, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { StatsClient } from './stats-client';

export const metadata: Metadata = {
  title: 'Statistics - LBSS',
  description: 'Batting and pitching statistics for the Latvijas Beisbola Liga',
};

export const revalidate = 60;

type Props = { searchParams: Promise<{ season?: string }> };

type StatsOverview = {
  batting?: unknown[];
  battingLeaders?: unknown;
  pitching?: unknown[];
  pitchingLeaders?: unknown;
  fielding?: unknown[];
};

export default async function StatsPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasonFromUrl = params.season;

  let seasons: any[] = [];
  try {
    const data = await apiFetch('/api/public/stats/seasons', { revalidate: API_REVALIDATE_SEASONS });
    seasons = Array.isArray(data) ? data : [];
  } catch {}

  const activeSeason = seasons.find((s: any) => s.isActive) || seasons[0];
  let seasonId: number | null;
  if (seasonFromUrl === 'all' || seasonFromUrl === '') seasonId = null;
  else if (seasonFromUrl) {
    const n = parseInt(seasonFromUrl, 10);
    seasonId = !isNaN(n) && seasons.some((s: any) => s.id === n) ? n : (activeSeason?.id ?? null);
  } else seasonId = activeSeason?.id ?? null;
  const initialSeasonParam = seasonId != null ? `seasonId=${seasonId}` : 'seasonId=all';

  let initialBatting: any[] = [];
  let initialPitching: any[] = [];
  let initialFielding: any[] = [];
  let initialBattingLeaders: any = null;
  let initialPitchingLeaders: any = null;

  try {
    const overview = await apiFetch<StatsOverview>(
      `/api/public/stats/overview?${initialSeasonParam}`,
      { revalidate: API_REVALIDATE_STANDINGS },
    );
    initialBatting = Array.isArray(overview.batting) ? overview.batting : [];
    initialPitching = Array.isArray(overview.pitching) ? overview.pitching : [];
    initialFielding = Array.isArray(overview.fielding) ? overview.fielding : [];
    initialBattingLeaders =
      overview.battingLeaders && typeof overview.battingLeaders === 'object' && !Array.isArray(overview.battingLeaders)
        ? overview.battingLeaders
        : null;
    initialPitchingLeaders =
      overview.pitchingLeaders &&
      typeof overview.pitchingLeaders === 'object' &&
      !Array.isArray(overview.pitchingLeaders)
        ? overview.pitchingLeaders
        : null;
  } catch {
    const [batting, bLeaders, pitching, pLeaders, fielding] = await Promise.all([
      apiFetch(`/api/public/stats/batting?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => [],
      ),
      apiFetch(`/api/public/stats/leaders?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => null,
      ),
      apiFetch(`/api/public/stats/pitching?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => [],
      ),
      apiFetch(`/api/public/stats/pitching-leaders?${initialSeasonParam}`, {
        revalidate: API_REVALIDATE_STANDINGS,
      }).catch(() => null),
      apiFetch(`/api/public/stats/fielding?${initialSeasonParam}`, { revalidate: API_REVALIDATE_STANDINGS }).catch(
        () => [],
      ),
    ]);
    initialBatting = Array.isArray(batting) ? batting : [];
    initialPitching = Array.isArray(pitching) ? pitching : [];
    initialFielding = Array.isArray(fielding) ? fielding : [];
    initialBattingLeaders = bLeaders && typeof bLeaders === 'object' && !Array.isArray(bLeaders) ? bLeaders : null;
    initialPitchingLeaders =
      pLeaders && typeof pLeaders === 'object' && !Array.isArray(pLeaders) ? pLeaders : null;
  }

  return (
    <div>
      <PageHeader title="Statistics" />
      <Suspense fallback={null}>
        <StatsClient
          initialSeasons={seasons}
          initialSeasonId={seasonId ?? null}
          initialBatting={initialBatting}
          initialPitching={initialPitching}
          initialFielding={initialFielding}
          initialBattingLeaders={initialBattingLeaders}
          initialPitchingLeaders={initialPitchingLeaders}
        />
      </Suspense>
    </div>
  );
}
