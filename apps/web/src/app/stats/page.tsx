import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch } from '@/lib/api';
import { StatsClient } from './stats-client';

export const metadata: Metadata = {
  title: 'Statistics - LBSS',
  description: 'Batting and pitching statistics for the Latvijas Beisbola Liga',
};

type Props = { searchParams: Promise<{ season?: string; includePlayoffs?: string }> };

export default async function StatsPage({ searchParams }: Props) {
  const params = await searchParams;
  const seasonFromUrl = params.season;
  const includePlayoffsAllTime =
    params.includePlayoffs === '1' || params.includePlayoffs === 'true';

  // Fetch seasons server-side so the page isn't blank
  let seasons: any[] = [];
  try {
    const data = await apiFetch('/api/public/stats/seasons');
    seasons = Array.isArray(data) ? data : [];
  } catch {}

  // Season from URL (?season=all or ?season=123), else active season
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

  const [batting, bLeaders, pitching, pLeaders, fielding] = await Promise.all([
    apiFetch(`/api/public/stats/batting?${initialSeasonParam}`).catch(() => []),
    apiFetch(`/api/public/stats/leaders?${initialSeasonParam}`).catch(() => null),
    apiFetch(`/api/public/stats/pitching?${initialSeasonParam}`).catch(() => []),
    apiFetch(`/api/public/stats/pitching-leaders?${initialSeasonParam}`).catch(() => null),
    apiFetch(`/api/public/stats/fielding?${initialSeasonParam}`).catch(() => []),
  ]);
  initialBatting = Array.isArray(batting) ? batting : [];
  initialPitching = Array.isArray(pitching) ? pitching : [];
  initialFielding = Array.isArray(fielding) ? fielding : [];
  initialBattingLeaders = bLeaders && typeof bLeaders === 'object' && !Array.isArray(bLeaders) ? bLeaders : null;
  initialPitchingLeaders = pLeaders && typeof pLeaders === 'object' && !Array.isArray(pLeaders) ? pLeaders : null;

  return (
    <div>
      <PageHeader title="Statistics" />
      <Suspense fallback={null}>
        <StatsClient
          initialSeasons={seasons}
          initialSeasonId={seasonId ?? null}
          initialIncludePlayoffsAllTime={includePlayoffsAllTime}
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
